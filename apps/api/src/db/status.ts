import mysql from 'mysql2/promise';
import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';

/**
 * Report database status: connectivity, applied migrations, and known tables.
 * Run via `pnpm db:status`. Exits non-zero if the database is unreachable.
 */
async function main(): Promise<void> {
  loadDotenv();
  const env = loadApiEnv();
  let connection: mysql.Connection | undefined;
  try {
    connection = await mysql.createConnection({ uri: env.DATABASE_URL });
    await connection.query('SELECT 1');
    console.log('Database: reachable');

    // Applied migrations (drizzle bookkeeping table).
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at',
      );
      console.log(`Applied migrations: ${rows.length}`);
      for (const row of rows) {
        console.log(
          `  - ${new Date(Number(row.created_at)).toISOString()} ${String(row.hash).slice(0, 12)}`,
        );
      }
    } catch {
      console.log(
        'Applied migrations: 0 (no __drizzle_migrations table yet — run pnpm db:migrate)',
      );
    }

    // Known application tables in the current database.
    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
    );
    const names = tables.map((t) => String(t.name)).filter((n) => !n.startsWith('__'));
    console.log(`Tables: ${names.length ? names.join(', ') : '(none)'}`);
    process.exit(0);
  } catch (error) {
    console.error(`Database: UNREACHABLE (${(error as Error).message})`);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

void main();
