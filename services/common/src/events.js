// Redis Streams: the three event streams from the proposal (pet.created, application.decided,
// email.queue). Side effects go through here so a slow email never slows down a request.
//
// Guarantees:
// - Each consuming service has its own consumer group, so every service gets every event.
// - Delivery is at least once. Events carry an id, and consumers record handled ids in
//   Postgres (processed_events) in the SAME transaction as their work, so a repeat does nothing.
// - An event is acknowledged (XACK) only after the handler succeeds; failures are retried.
import { randomUUID } from 'node:crypto';

export async function createEvents(config, { log, metrics, db }) {
  if (!config.redisUrl) return null;
  const { default: Redis } = await import('ioredis');
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  redis.on('error', (err) => log.warn({ err: err.message }, 'redis connection error'));
  const consumers = [];
  let stopping = false;

  return {
    redis,

    /** Publish an event. Returns its id. Example: await events.publish('pet.created', { petId }) */
    async publish(stream, payload) {
      const event = { id: randomUUID(), stream, source: config.serviceName, at: new Date().toISOString(), ...payload };
      // MAXLEN ~ keeps the stream from growing forever on a laptop.
      await redis.xadd(stream, 'MAXLEN', '~', '10000', '*', 'event', JSON.stringify(event));
      metrics.events.inc({ stream, direction: 'out', result: 'ok' });
      return event.id;
    },

    /**
     * Consume a stream with this service's consumer group.
     * handler(event, tx) runs inside a Postgres transaction `tx` when the service has a database.
     */
    consume(stream, handler, { batch = 10, blockMs = 5000 } = {}) {
      const group = config.serviceName;
      const consumer = config.instanceId;
      // A dedicated connection, because XREADGROUP BLOCK holds it while waiting.
      const conn = redis.duplicate();
      const loop = (async () => {
        try {
          // '0' = a brand-new group starts from the oldest event still in the stream, so nothing published before
          // this service's first deploy is lost.
          await conn.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
        } catch (err) {
          if (!String(err.message).includes('BUSYGROUP')) throw err;
        }
        // First re-read our own unacknowledged events (from a crash), then new ones ('>').
        let cursor = '0';
        while (!stopping) {
          let res;
          try {
            res = await conn.xreadgroup('GROUP', group, consumer, 'COUNT', batch, 'BLOCK', blockMs, 'STREAMS', stream, cursor);
          } catch (err) {
            if (stopping) break;
            log.warn({ err: err.message, stream }, 'stream read failed, retrying');
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          const entries = res?.[0]?.[1] ?? [];
          if (cursor === '0' && entries.length === 0) { cursor = '>'; continue; }
          for (const [entryId, fields] of entries) {
            const event = JSON.parse(fields[fields.indexOf('event') + 1]);
            try {
              await handleOnce(db, stream, event, handler);
              await conn.xack(stream, group, entryId);
              metrics.events.inc({ stream, direction: 'in', result: 'ok' });
            } catch (err) {
              metrics.events.inc({ stream, direction: 'in', result: 'error' });
              log.error({ err: err.message, stream, eventId: event.id }, 'event handler failed; it will be retried');
            }
          }
        }
        conn.disconnect();
      })();
      consumers.push(loop);
      log.info({ stream, group }, 'consuming stream');
    },

    /** Readiness check */
    async ping() {
      await redis.ping();
    },

    async close() {
      stopping = true;
      await Promise.race([Promise.allSettled(consumers), new Promise((r) => setTimeout(r, 6000))]);
      redis.disconnect();
    },
  };
}

async function handleOnce(db, stream, event, handler) {
  if (!db) return handler(event, null);
  await db.transaction(async (tx) => {
    const fresh = await tx.query('INSERT INTO processed_events (event_id, stream) VALUES ($1, $2) ON CONFLICT DO NOTHING', [event.id, stream]);
    if (fresh.rowCount === 0) return; // duplicate delivery: already handled
    await handler(event, tx);
  });
}
