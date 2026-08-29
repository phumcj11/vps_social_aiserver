import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

/**
 * REAL-MYSQL migration integration test (Model C fix).
 *
 * Applies EVERY migration (0000…0017) to a DISPOSABLE mysql:8.0 container via the
 * SAME runner production uses (drizzle `migrate`), then verifies 0016/0017 landed
 * — foreign keys actually exist, identifier names are <=64 chars, constraints
 * behave. This exists because the in-memory store never exercises MySQL DDL, so a
 * 66-char FK name in 0016 (> MySQL's 64 limit, ERROR 1059) reached production
 * undetected. Excluded from the fast suite (needs Docker); run with RUN_DB_IT=1.
 */

const RUN = process.env.RUN_DB_IT === '1';
const IMAGE = 'mysql:8.0'; // matches production (8.0.x)
const CONTAINER = 'kmkt-mig-it';
const PORT = 33199; // isolated from the real DB on 3306
const ROOT_PW = 'it_root_pw';
const DBNAME = 'kmkt_it';
const MIGRATIONS = join(__dirname, '../../drizzle');

let pool: mysql.Pool;

async function waitForMysql(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const c = await mysql.createConnection(url);
      await c.query('SELECT 1');
      await c.end();
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`MySQL not ready: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}
async function expectFails(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await pool.query(sql, params);
    throw new Error('EXPECTED_FAILURE_BUT_SUCCEEDED');
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.message === 'EXPECTED_FAILURE_BUT_SUCCEEDED') throw e;
    return err.code ?? err.message ?? 'error';
  }
}

// Minimal valid parent rows (only NOT NULL / no-default columns).
async function mkUser(): Promise<string> {
  const id = randomUUID();
  await q('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)', [
    id,
    `${id}@it.local`,
    'x',
  ]);
  return id;
}
async function mkWorkspace(): Promise<string> {
  const id = randomUUID();
  const owner = await mkUser();
  await q('INSERT INTO workspaces (id, owner_user_id, name, slug) VALUES (?,?,?,?)', [
    id,
    owner,
    'ws',
    id,
  ]);
  return id;
}
async function mkGroup(ws: string): Promise<string> {
  const id = randomUUID();
  await q(
    'INSERT INTO facebook_groups (id, workspace_id, canonical_url, original_url) VALUES (?,?,?,?)',
    [id, ws, `https://fb/g/${id}`, `https://fb/g/${id}`],
  );
  return id;
}
async function mkBusiness(ws: string): Promise<string> {
  const id = randomUUID();
  await q('INSERT INTO businesses (id, workspace_id, name, slug) VALUES (?,?,?,?)', [
    id,
    ws,
    'biz',
    id,
  ]);
  return id;
}
async function mkSignal(ws: string, group: string): Promise<string> {
  const id = randomUUID();
  await q(
    'INSERT INTO facebook_signals (id, workspace_id, group_id, post_url, normalized_hash) VALUES (?,?,?,?,?)',
    [id, ws, group, `https://fb/p/${id}`, id],
  );
  return id;
}
async function mkOpportunity(
  ws: string,
  signal: string,
  sourceOppId: string | null,
): Promise<void> {
  await q(
    'INSERT INTO opportunities (id, workspace_id, signal_id, decision, classifier_version, source_opportunity_id) VALUES (?,?,?,?,?,?)',
    [randomUUID(), ws, signal, 'ACCEPT', 'rules-v2', sourceOppId],
  );
}

describe.skipIf(!RUN)('real MySQL migration apply (Model C 0016/0017)', () => {
  beforeAll(async () => {
    execSync(`docker rm -f ${CONTAINER} 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(
      `docker run -d --name ${CONTAINER} -e MYSQL_ROOT_PASSWORD=${ROOT_PW} -e MYSQL_DATABASE=${DBNAME} -p ${PORT}:3306 ${IMAGE}`,
      { stdio: 'ignore' },
    );
    const url = `mysql://root:${ROOT_PW}@127.0.0.1:${PORT}/${DBNAME}?multipleStatements=true`;
    await waitForMysql(url);
    pool = mysql.createPool(url);
    // (2)+(3)+(5) Apply ALL migrations via the SAME runner production uses.
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: MIGRATIONS });
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    execSync(`docker rm -f ${CONTAINER} 2>/dev/null || true`, { stdio: 'ignore' });
  });

  it('4+7. final migration count is 18 (0016 + 0017 applied via the runner)', async () => {
    const [row] = await q<{ n: number }>('SELECT COUNT(*) AS n FROM __drizzle_migrations');
    expect(Number(row!.n)).toBe(18);
  });

  it('8. business_group_subscriptions table exists', async () => {
    const rows = await q(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name='business_group_subscriptions'",
      [DBNAME],
    );
    expect(rows).toHaveLength(1);
  });

  it('9+10. both FKs exist in INFORMATION_SCHEMA and their names are <= 64 chars', async () => {
    const fks = await q<{ CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string }>(
      `SELECT constraint_name AS CONSTRAINT_NAME, referenced_table_name AS REFERENCED_TABLE_NAME
       FROM information_schema.key_column_usage
       WHERE table_schema=? AND table_name='business_group_subscriptions' AND referenced_table_name IS NOT NULL`,
      [DBNAME],
    );
    const byRef = Object.fromEntries(fks.map((f) => [f.REFERENCED_TABLE_NAME, f.CONSTRAINT_NAME]));
    expect(byRef['facebook_groups']).toBe('bgs_source_group_fk');
    expect(byRef['businesses']).toBe('bgs_business_fk');
    for (const f of fks) expect(f.CONSTRAINT_NAME.length).toBeLessThanOrEqual(64);
  });

  it('11. unique + secondary indexes exist', async () => {
    const idx = await q<{ INDEX_NAME: string }>(
      `SELECT DISTINCT index_name AS INDEX_NAME FROM information_schema.statistics
       WHERE table_schema=? AND table_name='business_group_subscriptions'`,
      [DBNAME],
    );
    const names = idx.map((i) => i.INDEX_NAME);
    expect(names).toContain('business_group_subscriptions_unique');
    expect(names).toContain('business_group_subscriptions_source_group_idx');
    expect(names).toContain('business_group_subscriptions_business_idx');
  });

  it('12. opportunities.source_opportunity_id exists and is nullable', async () => {
    const [col] = await q<{ IS_NULLABLE: string; DATA_TYPE: string }>(
      `SELECT is_nullable AS IS_NULLABLE, data_type AS DATA_TYPE FROM information_schema.columns
       WHERE table_schema=? AND table_name='opportunities' AND column_name='source_opportunity_id'`,
      [DBNAME],
    );
    expect(col?.IS_NULLABLE).toBe('YES');
    expect(col?.DATA_TYPE).toBe('varchar');
  });

  it('13. UNIQUE(source_opportunity_id, workspace_id) exists on opportunities', async () => {
    const cols = await q<{ COLUMN_NAME: string; SEQ_IN_INDEX: number }>(
      `SELECT column_name AS COLUMN_NAME, seq_in_index AS SEQ_IN_INDEX FROM information_schema.statistics
       WHERE table_schema=? AND table_name='opportunities'
         AND index_name='opportunities_source_projection_unique' AND non_unique=0
       ORDER BY seq_in_index`,
      [DBNAME],
    );
    expect(cols.map((c) => c.COLUMN_NAME)).toEqual(['source_opportunity_id', 'workspace_id']);
  });

  it('15+16. a valid subscription inserts; a duplicate (source_group,business) is rejected', async () => {
    const ws = await mkWorkspace();
    const g = await mkGroup(ws);
    const b = await mkBusiness(ws);
    await q(
      'INSERT INTO business_group_subscriptions (id, source_group_id, business_id, enabled) VALUES (?,?,?,1)',
      [randomUUID(), g, b],
    );
    const code = await expectFails(
      'INSERT INTO business_group_subscriptions (id, source_group_id, business_id, enabled) VALUES (?,?,?,1)',
      [randomUUID(), g, b],
    );
    expect(code).toBe('ER_DUP_ENTRY');
  });

  it('17+18. invalid source_group_id and invalid business_id are FK-rejected', async () => {
    const ws = await mkWorkspace();
    const g = await mkGroup(ws);
    const b = await mkBusiness(ws);
    const c1 = await expectFails(
      'INSERT INTO business_group_subscriptions (id, source_group_id, business_id, enabled) VALUES (?,?,?,1)',
      [randomUUID(), randomUUID(), b],
    );
    expect(c1).toBe('ER_NO_REFERENCED_ROW_2');
    const c2 = await expectFails(
      'INSERT INTO business_group_subscriptions (id, source_group_id, business_id, enabled) VALUES (?,?,?,1)',
      [randomUUID(), g, randomUUID()],
    );
    expect(c2).toBe('ER_NO_REFERENCED_ROW_2');
  });

  it('19+20. multiple native Opportunities (source_opportunity_id NULL) coexist', async () => {
    const ws = await mkWorkspace();
    const g = await mkGroup(ws);
    await mkOpportunity(ws, await mkSignal(ws, g), null);
    await mkOpportunity(ws, await mkSignal(ws, g), null); // second NULL in same ws → allowed
    const [row] = await q<{ n: number }>(
      'SELECT COUNT(*) AS n FROM opportunities WHERE workspace_id=? AND source_opportunity_id IS NULL',
      [ws],
    );
    expect(Number(row!.n)).toBe(2);
  });

  it('21. same non-null source_opportunity_id in the SAME workspace is rejected', async () => {
    const ws = await mkWorkspace();
    const g = await mkGroup(ws);
    const src = randomUUID();
    await mkOpportunity(ws, await mkSignal(ws, g), src);
    const sig2 = await mkSignal(ws, g);
    const code = await expectFails(
      'INSERT INTO opportunities (id, workspace_id, signal_id, decision, classifier_version, source_opportunity_id) VALUES (?,?,?,?,?,?)',
      [randomUUID(), ws, sig2, 'ACCEPT', 'rules-v2', src],
    );
    expect(code).toBe('ER_DUP_ENTRY');
  });

  it('22. the same source_opportunity_id across DIFFERENT workspaces is allowed', async () => {
    const wsA = await mkWorkspace();
    const wsB = await mkWorkspace();
    const src = randomUUID();
    await mkOpportunity(wsA, await mkSignal(wsA, await mkGroup(wsA)), src);
    await mkOpportunity(wsB, await mkSignal(wsB, await mkGroup(wsB)), src); // different ws → allowed
    const [row] = await q<{ n: number }>(
      'SELECT COUNT(*) AS n FROM opportunities WHERE source_opportunity_id=?',
      [src],
    );
    expect(Number(row!.n)).toBe(2);
  });
});
