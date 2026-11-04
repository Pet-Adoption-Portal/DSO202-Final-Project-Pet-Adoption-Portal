// etcd service registry (proposal decision D4, module Practical 7).
//
// On start the service puts /services/<name>/<instance> = {addr, version, startedAt}
// attached to a lease with a short TTL, and renews the lease in the background.
// If the pod dies, the lease expires and the key disappears by itself, so the registry
// heals without any cleanup job. The gateway watches /services/ to route, and every service
// can watch /config/<name>/ for live settings (e.g. pause new applications).
//
// It talks to etcd's built-in HTTP/JSON gateway (/v3/...) with Node's fetch. The usual etcd3
// npm client pulls in gRPC and costs ~35 MB of memory per pod; this costs nothing extra.
// etcd's JSON API wants keys and values base64-encoded.

const b64 = (s) => Buffer.from(s).toString('base64');
const unb64 = (s) => Buffer.from(s ?? '', 'base64').toString();
/** Range end for a prefix query: the prefix with its last byte + 1 ("/a/" -> "/a0"). */
const prefixEnd = (p) => b64(p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1));

export function createRegistry(config, log) {
  if (!config.etcdEndpoints.length) return null;
  const endpoints = config.etcdEndpoints.map((e) => e.replace(/\/$/, ''));
  const key = `/services/${config.serviceName}/${config.instanceId}`;
  const value = JSON.stringify({ addr: config.advertiseAddress, version: config.version, startedAt: new Date().toISOString() });
  let leaseId = null;
  let timer = null;
  let closed = false;
  const watchers = [];

  /** POST to the first etcd member that answers (3 members: any one is fine). */
  async function call(path, body, { signal } = {}) {
    let lastErr;
    for (const base of endpoints) {
      try {
        const res = await fetch(base + path, { method: 'POST', body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`etcd ${path} -> HTTP ${res.status}`);
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
  const json = async (path, body) => (await call(path, body)).json();

  async function register() {
    const grant = await json('/v3/lease/grant', { TTL: config.registryTtlSeconds });
    leaseId = grant.ID;
    await json('/v3/kv/put', { key: b64(key), value: b64(value), lease: leaseId });
    log.info({ key, ttl: config.registryTtlSeconds }, 'registered in etcd');
    // Renew at a third of the TTL so one missed beat does not drop us.
    clearInterval(timer);
    timer = setInterval(keepAlive, (config.registryTtlSeconds * 1000) / 3);
    timer.unref();
  }

  async function keepAlive() {
    if (closed) return;
    try {
      const res = await json('/v3/lease/keepalive', { ID: leaseId });
      // TTL missing or 0 means etcd forgot the lease (e.g. it expired during a network blip): register again.
      if (!Number(res.result?.TTL)) throw new Error('lease expired');
    } catch (err) {
      log.warn({ err: err.message }, 'registry keep-alive failed, registering again');
      register().catch((e) => log.error({ err: e.message }, 'registry re-register failed; will retry'));
    }
  }

  async function getPrefix(prefix) {
    const res = await json('/v3/kv/range', { key: b64(prefix), range_end: prefixEnd(prefix) });
    const items = (res.kvs ?? []).map((kv) => [unb64(kv.key), unb64(kv.value)]);
    return Object.assign(items, { revision: Number(res.header.revision) });
  }

  return {
    key,
    register,

    /** Instances of a service, e.g. await registry.lookup('pet') -> [{ addr, version, startedAt }] */
    async lookup(serviceName) {
      return (await getPrefix(`/services/${serviceName}/`)).map(([, v]) => JSON.parse(v));
    },

    /** Live config: calls onChange(name, value) now for every /config/<service>/<name>, and again on each change. */
    async watchConfig(onChange) {
      const prefix = `/config/${config.serviceName}/`;
      const current = await getPrefix(prefix);
      for (const [k, v] of current) onChange(k.slice(prefix.length), v);
      // Watch from the revision right after the one we just read, so a change made in between is not lost.
      let nextRevision = current.revision + 1;
      const controller = new AbortController();
      let ready;
      const created = new Promise((r) => (ready = r));
      watchers.push(controller);
      (async () => {
        while (!closed) {
          try {
            const res = await call(
              '/v3/watch',
              { create_request: { key: b64(prefix), range_end: prefixEnd(prefix), start_revision: nextRevision } },
              { signal: controller.signal },
            );
            // The response is a never-ending stream of JSON objects, one per line.
            let buf = '';
            for await (const chunk of res.body) {
              buf += Buffer.from(chunk).toString();
              let nl;
              while ((nl = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line) continue;
                const msg = JSON.parse(line).result ?? {};
                if (msg.created) ready();
                for (const ev of msg.events ?? []) {
                  nextRevision = Number(ev.kv.mod_revision) + 1; // resume point if the stream drops
                  onChange(unb64(ev.kv.key).slice(prefix.length), ev.type === 'DELETE' ? null : unb64(ev.kv.value));
                }
              }
            }
          } catch (err) {
            if (closed) return;
            log.warn({ err: err.message }, 'config watch dropped, reconnecting');
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      })();
      await Promise.race([created, new Promise((r) => setTimeout(r, 3000))]);
    },

    /** Readiness-style check (not used by /ready: a registry outage must not stop serving). */
    async ping() {
      await json('/v3/kv/range', { key: b64('/health-check') });
    },

    /** Remove ourselves immediately on shutdown instead of waiting for the TTL. */
    async close() {
      closed = true;
      clearInterval(timer);
      watchers.forEach((w) => w.abort());
      if (leaseId) await json('/v3/lease/revoke', { ID: leaseId }).catch(() => {});
    },
  };
}
