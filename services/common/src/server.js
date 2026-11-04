// createService(): the one place that builds a service. Every one of the 13 backend services
// calls this, so they all get the same health checks, metrics, logs, error format,
// graceful shutdown, database, events and registry without writing any of it again.
import { randomBytes } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import { loadConfig, redact } from './config.js';
import { createDb, migrate } from './db.js';
import { createEvents } from './events.js';
import { createMetrics } from './metrics.js';
import { createRegistry } from './registry.js';

const QUIET = new Set(['/health', '/ready', '/metrics']); // probes and scrapes are not user traffic

/**
 * @param {object} opts
 * @param {string} opts.name             service name, e.g. "pet"
 * @param {string} [opts.migrationsDir]  folder of NNN_name.sql files
 * @param {(app, ctx) => Promise<void>} opts.routes      register HTTP routes
 * @param {(ctx) => void} [opts.consumers]               start stream consumers: ctx.events.consume(...)
 * @param {object} [opts.overrides]      config overrides (used by tests)
 */
export async function createService({ name, migrationsDir, routes, consumers, overrides = {} }) {
  const config = { ...loadConfig(name), ...overrides };
  let shuttingDown = false;

  const app = Fastify({
    logger: {
      level: config.logLevel,
      base: { service: config.serviceName, version: config.version, instance: config.instanceId },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      formatters: { level: (label) => ({ level: label }) },
    },
    // Reuse the W3C trace id from the gateway's traceparent header so every log line of one
    // request, in every service, shares the same trace_id (Loki -> Tempo correlation later).
    genReqId: (req) => traceIdFrom(req.headers.traceparent) ?? randomBytes(16).toString('hex'),
    logController: new LogController({ requestIdLogLabel: 'trace_id', disableRequestLogging: true }),
    bodyLimit: 256 * 1024,
  });

  const log = app.log;
  const metrics = createMetrics(config.serviceName);
  const db = await createDb(config, log);
  const events = await createEvents(config, { log, metrics, db });
  const registry = createRegistry(config, log);
  const ctx = { config, log, metrics, db, events, registry };

  /* ---------- cross-cutting behaviour ---------- */
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Served-By', config.serviceName);
    reply.header('X-Trace-Id', req.id);
  });
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'unmatched'; // template like /pets/:id, never the raw URL (keeps label cardinality low)
    if (QUIET.has(route)) return;
    const labels = { method: req.method, route, status: String(reply.statusCode) };
    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(labels, reply.elapsedTime / 1000);
    req.log[reply.statusCode >= 500 ? 'error' : 'info'](
      { method: req.method, route, url: req.url, status: reply.statusCode, ms: Math.round(reply.elapsedTime) },
      'request',
    );
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return reply.code(400).send({ error: validationMessage(err), code: 'VALIDATION' });
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error({ err }, 'unhandled error');
    reply.code(status).send(status === 500 ? { error: 'The service failed. Try again.' } : { error: err.message, ...(err.code ? { code: err.code } : {}) });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: `No route for ${req.method} ${req.url.split('?')[0]}` }));

  /* ---------- probes and metrics ---------- */
  // Liveness: is the process alive? Never checks dependencies, or a database blip would restart every pod.
  app.get('/health', async () => ({ status: 'ok', service: config.serviceName, version: config.version }));
  // Readiness: can this pod serve traffic now? Failing removes it from the Service until it recovers.
  app.get('/ready', async (req, reply) => {
    if (shuttingDown) return reply.code(503).send({ status: 'shutting-down' });
    const checks = {};
    for (const [dep, client] of [['postgres', db], ['redis', events]]) {
      if (!client) continue;
      try { await client.ping(); checks[dep] = 'ok'; } catch (err) { checks[dep] = err.message; }
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'not-ready', checks });
  });
  app.get('/metrics', async (req, reply) => {
    reply.header('Content-Type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  await routes(app, ctx);

  /* ---------- lifecycle ---------- */
  async function start() {
    log.info({ config: redact(config) }, 'starting');
    if (db && config.runMigrations && migrationsDir) await migrate(db, migrationsDir, log);
    await app.listen({ port: config.port, host: '0.0.0.0' });
    // The registry must never stop a service from serving (it only adds discovery + live config).
    if (registry) registry.register().catch((err) => log.error({ err: err.message }, 'etcd registration failed; serving anyway'));
    consumers?.(ctx);
  }

  async function stop(signal) {
    if (shuttingDown) return;
    shuttingDown = true; // /ready now answers 503
    log.info({ signal }, 'shutting down');
    const force = setTimeout(() => { log.error('shutdown timed out, exiting'); process.exit(1); }, config.shutdownTimeoutMs);
    force.unref();
    if (config.shutdownDelayMs) await new Promise((r) => setTimeout(r, config.shutdownDelayMs));
    await app.close();          // stop accepting, finish in-flight requests
    await registry?.close();    // disappear from the registry now, not after the TTL
    await events?.close();      // stop consumers after their current event
    await db?.close();
    clearTimeout(force);
  }

  /** start() plus SIGTERM/SIGINT handling: what a container's main process should call. */
  async function run() {
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => stop(sig).then(() => process.exit(0)));
    try {
      await start();
    } catch (err) {
      log.fatal({ err }, 'failed to start');
      process.exit(1);
    }
  }

  return { app, ctx, start, stop, run };
}

function traceIdFrom(traceparent) {
  const m = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/.exec(String(traceparent || ''));
  return m ? m[1] : undefined;
}

function validationMessage(err) {
  const v = err.validation[0];
  const field = (v.instancePath || '').replace(/^\//, '') || v.params?.missingProperty || 'request';
  return `Check ${field}: it ${v.message}.`;
}
