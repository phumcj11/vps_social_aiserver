import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';

/**
 * Apply pending Drizzle migrations to MySQL.
 * Run via `pnpm db:migrate`. Requires MySQL to be reachable at DATABASE_URL.
 */
async function main(): Promise<void> {
  loadDotenv();
  const env = loadApiEnv();
  const connection = await mysql.createConnection({
    uri: env.DATABASE_URL,
    multipleStatements: true,
  });
  const db = drizzle(connection);
  console.log(JSON.stringify({ event: 'db.migrate.start' }));
  await migrate(db, { migrationsFolder: `${__dirname}/../../drizzle` });
  console.log(JSON.stringify({ event: 'db.migrate.done' }));
  await connection.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'db.migrate.error', message: (error as Error).message }));
  process.exit(1);
});
