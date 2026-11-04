// Run only the migrations, then exit. Used by the Kubernetes PreSync Job so the schema is
// updated once, before new pods of a release start (proposal section 7).
import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';

export async function runMigrations(name, migrationsDir) {
  const config = loadConfig(name);
  const log = { info: (o, m) => console.log(JSON.stringify({ level: 'info', service: config.serviceName, msg: m, ...o })) };
  const db = await createDb(config, log);
  if (!db) throw new Error('DATABASE_URL is not set');
  try {
    await migrate(db, migrationsDir, log);
    log.info({}, 'migrations complete');
  } finally {
    await db.close();
  }
}
