import { buildServer } from './server';
import { loadApiEnv } from './lib/env';
import { createLogger } from './lib/logger';
import { createDb, checkDbHealth } from './db/client';
import { DrizzleStore } from './store/drizzle-store';

/**
 * Entry point for the API process.
 *
 * Binds to an internal host by default (localhost in dev; 0.0.0.0 only inside
 * the private Docker network). Uses the MySQL-backed store. No product features
 * beyond authentication and workspace management exist yet.
 */
async function main(): Promise<void> {
  const env = loadApiEnv();
  const logger = createLogger(env.APP_ENV === 'production' ? 'info' : 'debug');

  const { db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);

  const app = await buildServer({
    store,
    env,
    logger,
    dbHealth: () => checkDbHealth(db),
  });

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    logger.info('api.started', { host: env.API_HOST, port: env.API_PORT });
  } catch (error) {
    logger.error('api.start_failed', { msg: (error as Error).message });
    process.exit(1);
  }
}

void main();
