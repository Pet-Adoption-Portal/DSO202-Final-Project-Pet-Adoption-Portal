// `npm run migrate`: apply migrations and exit (the Kubernetes PreSync Job runs this).
import { runMigrations } from '@pet-portal/common';
import { SERVICE_NAME, migrationsDir } from './app.js';

await runMigrations(SERVICE_NAME, migrationsDir);
