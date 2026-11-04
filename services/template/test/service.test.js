// Tests use Fastify's inject(): real HTTP handling, no open port.
// Without DATABASE_URL only the infrastructure tests run; with it (docker compose up) everything runs.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildService, SERVICE_NAME } from '../src/app.js';

const STAFF = { 'x-user-id': 'u-staff', 'x-user-role': 'staff', 'x-shelter-id': 'sh-1' };
const ADOPTER = { 'x-user-id': 'u-adopter', 'x-user-role': 'adopter' };

describe('built-in endpoints (no infrastructure needed)', () => {
  let service;
  before(async () => {
    service = await buildService({ databaseUrl: '', redisUrl: '', etcdEndpoints: [], logLevel: 'silent' });
  });
  after(() => service.app.close());

  it('GET /health answers without any dependency', async () => {
    const res = await service.app.inject('/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'ok');
    assert.equal(res.headers['x-served-by'], SERVICE_NAME);
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await service.app.inject('/metrics');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, new RegExp(`process_resident_memory_bytes\\{service="${SERVICE_NAME}"\\}`));
    assert.match(res.body, /http_requests_total/);
  });

  it('unknown routes return the contract error shape', async () => {
    const res = await service.app.inject('/nope');
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'No route for GET /nope' });
  });

  it('reuses the trace id from a traceparent header', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const res = await service.app.inject({ url: '/health', headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` } });
    assert.equal(res.headers['x-trace-id'], traceId);
  });
});

describe('example routes with Postgres + Redis', { skip: !process.env.DATABASE_URL && 'set DATABASE_URL to run' }, () => {
  let service;
  before(async () => {
    service = await buildService({ logLevel: 'silent', etcdEndpoints: [], dbSchema: `${SERVICE_NAME.replace(/-/g, '_')}_test_${process.pid}` });
    await service.start();
  });
  after(async () => {
    await service.ctx.db.query(`DROP SCHEMA IF EXISTS ${service.ctx.db.schema} CASCADE`);
    await service.stop();
  });

  it('/ready checks Postgres and Redis', async () => {
    const res = await service.app.inject('/ready');
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().checks, { postgres: 'ok', redis: 'ok' });
  });

  it('rejects writes without a login (401) or with the wrong role (403)', async () => {
    assert.equal((await service.app.inject({ method: 'POST', url: '/examples', payload: { name: 'a' } })).statusCode, 401);
    assert.equal((await service.app.inject({ method: 'POST', url: '/examples', headers: ADOPTER, payload: { name: 'a' } })).statusCode, 403);
  });

  it('validates the body (400)', async () => {
    const res = await service.app.inject({ method: 'POST', url: '/examples', headers: STAFF, payload: { name: '' } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /name/);
  });

  it('creates, reads, rejects duplicates, and the event reaches the consumer once', async () => {
    const res = await service.app.inject({ method: 'POST', url: '/examples', headers: STAFF, payload: { name: 'Tashi', note: 'first' } });
    assert.equal(res.statusCode, 201, res.body);
    const { id } = res.json();
    assert.equal((await service.app.inject(`/examples/${id}`)).json().name, 'Tashi');
    assert.equal((await service.app.inject({ method: 'POST', url: '/examples', headers: STAFF, payload: { name: 'Tashi' } })).statusCode, 409);

    // The consumer runs asynchronously; wait for it. Count only this item's event: the stream is
    // shared, and a new consumer group also reads older events left by earlier runs.
    let seen = 0;
    for (let i = 0; i < 40 && seen === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const { rows } = await service.ctx.db.query('SELECT count(*)::int AS n FROM example_events WHERE example_id = $1', [id]);
      seen = rows[0].n;
    }
    assert.equal(seen, 1);
  });
});
