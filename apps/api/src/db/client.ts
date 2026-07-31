import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

/**
 * MySQL connection + Drizzle client for KMKT Social AI.
 *
 * A small connection pool sized for the 2-core / 3.8 GiB VPS. MySQL is reached
 * only over the private Docker network (or localhost during migrations); it is
 * never publicly exposed.
 */

export type Database = MySql2Database<typeof schema>;

export interface DbHandle {
  pool: mysql.Pool;
  db: Database;
}

export function createDb(databaseUrl: string, connectionLimit = 5): DbHandle {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit,
    waitForConnections: true,
    // Keep the footprint conservative on a small host.
    maxIdle: connectionLimit,
    enableKeepAlive: true,
  });
  const db = drizzle(pool, { schema, mode: 'default' });
  return { pool, db };
}

/**
 * Database health check — verifies connectivity with a trivial query.
 * Returns true when the database answers, false otherwise. Never throws.
 */
export async function checkDbHealth(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
