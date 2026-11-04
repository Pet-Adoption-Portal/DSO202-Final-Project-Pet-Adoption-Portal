// Builds the service. Kept separate from index.js so tests can create it without starting a server.
import { fileURLToPath } from 'node:url';
import { createService } from '@pet-portal/common';
import { routes } from './routes.js';
import { consumers } from './consumers.js';

export const SERVICE_NAME = 'template';
export const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildService(overrides) {
  return createService({ name: SERVICE_NAME, migrationsDir, routes, consumers, overrides });
}
