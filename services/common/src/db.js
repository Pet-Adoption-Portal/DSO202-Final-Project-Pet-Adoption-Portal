// PostgreSQL access. Each service only sees its own schema: the pool sets search_path,
// and in Kubernetes each service also logs in as its own role that has rights on that
// schema only (proposal section 5, "no service can read another's tables").
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function createDb(config, log) {
  if (!config.databaseUrl) return null;
  // Loaded only when the service has a database (email-worker does not), to save memory.
  const { default: pg } = await import('pg');
  const schema = config.dbSchema;
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid DB_SCHEMA "${schema}"`);

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: `-c search_path=${schema}`,
    application_name: config.instanceId,
  });
  pool.on('error', (err) => log.error({ err }, 'idle postgres client error'));

  return {
    pool,
    schema,
    /** Run one query: await db.query('SELECT * FROM pets WHERE id = $1', [id]) */
    query: (text, params) => pool.query(text, params),
    /** Run fn inside BEGIN/COMMIT; rolls back if fn throws. fn gets a client: client.query(...) */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    /** Readiness check: can we talk to Postgres right now? */
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}

/**
 * Applies migrations/NNN_name.sql files in order, once each, recorded in schema_migrations.
 * A Postgres advisory lock stops two replicas migrating at the same time.
 * In Kubernetes this runs as the ArgoCD PreSync Job (`npm run migrate`) before new pods start.
 */
export async function migrate(db, migrationsDir, log) {
  const files = (await readdir(migrationsDir).catch(() => [])).filter((f) => f.endsWith('.sql')).sort();
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [db.schema]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${db.schema}`);
    await client.query(`SET search_path TO ${db.schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Shared by events.js: ids of stream events this service already processed (idempotent consumers).
    await client.query(`CREATE TABLE IF NOT EXISTS processed_events (event_id text PRIMARY KEY, stream text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log.info({ migration: file }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [db.schema]).catch(() => {});
    client.release();
  }
}
