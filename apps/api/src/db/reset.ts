import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';

/**
 * DEVELOPMENT-ONLY database reset. Drops all application tables and re-applies
 * migrations. Run via `pnpm db:reset:development`.
 *
 * Guards (all must pass):
 *   - APP_ENV must NOT be `production`.
 *   - Explicit confirmation via CONFIRM_DB_RESET=YES (or `--yes` argument).
 *
 * This command must NEVER run in production.
 */
async function main(): Promise<void> {
  loadDotenv();
  const env = loadApiEnv();

  if (env.APP_ENV === 'production') {
    console.error('Refusing to reset: APP_ENV=production. This command is development-only.');
    process.exit(1);
  }

  const confirmed = process.env.CONFIRM_DB_RESET === 'YES' || process.argv.includes('--yes');
  if (!confirmed) {
    console.error(
      'Refusing to reset: confirmation required. Re-run with CONFIRM_DB_RESET=YES or pass --yes.',
    );
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    uri: env.DATABASE_URL,
    multipleStatements: true,
  });

  console.log(JSON.stringify({ event: 'db.reset.start', appEnv: env.APP_ENV }));

  // Drop known tables (order respects foreign keys); disable FK checks to be safe.
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['sessions', 'workspaces', 'users', '__drizzle_migrations']) {
    await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  // Re-apply migrations from scratch.
  const db = drizzle(connection);
  await migrate(db, { migrationsFolder: `${__dirname}/../../drizzle` });

  console.log(JSON.stringify({ event: 'db.reset.done' }));
  await connection.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'db.reset.error', message: (error as Error).message }));
  process.exit(1);
});
