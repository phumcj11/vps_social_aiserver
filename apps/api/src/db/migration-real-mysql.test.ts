import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  it('4+7. final migration count is 20 (through 0019 applied via the runner)', async () => {
    const [row] = await q<{ n: number }>('SELECT COUNT(*) AS n FROM __drizzle_migrations');
    expect(Number(row!.n)).toBe(20);
  });

  it('M9C. property_matches.decision holds NEEDS_CONFIRMATION (widened to 20)', async () => {
    const [col] = await q<{ CHARACTER_MAXIMUM_LENGTH: number }>(
      `SELECT character_maximum_length AS CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns
       WHERE table_schema=? AND table_name='property_matches' AND column_name='decision'`,
      [DBNAME],
    );
    expect(Number(col?.CHARACTER_MAXIMUM_LENGTH)).toBeGreaterThanOrEqual(18);

    // A NEEDS_CONFIRMATION row persists in full (not truncated).
    const ws = await mkWorkspace();
    const g = await mkGroup(ws);
    const b = await mkBusiness(ws);
    const sig = await mkSignal(ws, g);
    await q(
      'INSERT INTO opportunities (id, workspace_id, signal_id, decision, classifier_version) VALUES (?,?,?,?,?)',
      [randomUUID(), ws, sig, 'ACCEPT', 'rules-v2'],
    );
    const [opp] = await q<{ id: string }>(
      'SELECT id FROM opportunities WHERE signal_id=? LIMIT 1',
      [sig],
    );
    const bmId = randomUUID();
    await q(
      'INSERT INTO business_matches (id, workspace_id, business_id, opportunity_id, decision, matcher_version) VALUES (?,?,?,?,?,?)',
      [bmId, ws, b, opp!.id, 'MATCH', 'rules-v2'],
    );
    const pmId = randomUUID();
    await q(
      'INSERT INTO property_matches (id, workspace_id, opportunity_id, business_match_id, business_id, property_id, decision, reasons, matcher_version, candidates_evaluated) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [pmId, ws, opp!.id, bmId, b, null, 'NEEDS_CONFIRMATION', '{}', 'property-rules-v2', 1],
    );
    const [pm] = await q<{ decision: string }>('SELECT decision FROM property_matches WHERE id=?', [
      pmId,
    ]);
    expect(pm?.decision).toBe('NEEDS_CONFIRMATION');
  });

  it('M9B. the four tri-state fact columns are nullable after 0018', async () => {
    const cols = await q<{ COLUMN_NAME: string; IS_NULLABLE: string; DATA_TYPE: string }>(
      `SELECT column_name AS COLUMN_NAME, is_nullable AS IS_NULLABLE, data_type AS DATA_TYPE
       FROM information_schema.columns
       WHERE table_schema=? AND table_name='properties'
         AND column_name IN ('private_pool','near_beach','beachfront','riverfront')`,
      [DBNAME],
    );
    expect(cols).toHaveLength(4);
    for (const c of cols) {
      expect(c.IS_NULLABLE).toBe('YES'); // NULL now represents UNKNOWN
      expect(c.DATA_TYPE).toBe('tinyint'); // MySQL boolean
    }
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

/**
 * M9B tri-state migration on REAL MySQL WITH LEGACY DATA.
 *
 * The block above applies every migration to an empty DB, so it can't exercise
 * the 0018 data backfill. This one applies migrations through 0017 (a temp
 * folder with 0018 removed), inserts legacy property rows exactly as v1 stored
 * them (private_pool 1/0), then applies the real 0018 SQL and verifies the
 * CRITICAL rule: legacy true(1) → YES(1), legacy false(0) → UNKNOWN(NULL), never
 * a confirmed NO. Disposable container on its own port; separate from production.
 */
const M9B_CONTAINER = 'kmkt-mig-it-m9b';
const M9B_PORT = 33198;
const M9B_DB = 'kmkt_it_m9b';

describe.skipIf(!RUN)('real MySQL 0018 tri-state backfill (legacy data)', () => {
  let m9bPool: mysql.Pool;
  let tmpMigrations: string;

  beforeAll(async () => {
    // A migrations folder trimmed to 0000..0017 (0018 removed from the journal).
    tmpMigrations = mkdtempSync(join(tmpdir(), 'kmkt-mig-'));
    cpSync(MIGRATIONS, tmpMigrations, { recursive: true });
    const journalPath = join(tmpMigrations, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ tag: string }>;
    };
    journal.entries = journal.entries.filter((e) => !e.tag.startsWith('0018_'));
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));

    execSync(`docker rm -f ${M9B_CONTAINER} 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(
      `docker run -d --name ${M9B_CONTAINER} -e MYSQL_ROOT_PASSWORD=${ROOT_PW} -e MYSQL_DATABASE=${M9B_DB} -p ${M9B_PORT}:3306 ${IMAGE}`,
      { stdio: 'ignore' },
    );
    const url = `mysql://root:${ROOT_PW}@127.0.0.1:${M9B_PORT}/${M9B_DB}?multipleStatements=true`;
    await waitForMysql(url);
    m9bPool = mysql.createPool(url);
    await migrate(drizzle(m9bPool), { migrationsFolder: tmpMigrations }); // through 0017
  }, 180_000);

  afterAll(async () => {
    if (m9bPool) await m9bPool.end();
    execSync(`docker rm -f ${M9B_CONTAINER} 2>/dev/null || true`, { stdio: 'ignore' });
    if (tmpMigrations) rmSync(tmpMigrations, { recursive: true, force: true });
  });

  it('legacy false(0) → NULL(UNKNOWN); legacy true(1) → 1(YES); never a confirmed NO', async () => {
    // Minimal parents.
    const ws = randomUUID();
    const owner = randomUUID();
    await m9bPool.query('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)', [
      owner,
      `${owner}@it.local`,
      'x',
    ]);
    await m9bPool.query('INSERT INTO workspaces (id, owner_user_id, name, slug) VALUES (?,?,?,?)', [
      ws,
      owner,
      'ws',
      ws,
    ]);
    const biz = randomUUID();
    await m9bPool.query('INSERT INTO businesses (id, workspace_id, name, slug) VALUES (?,?,?,?)', [
      biz,
      ws,
      'biz',
      biz,
    ]);

    // Two legacy properties exactly as v1 stored them (columns NOT NULL here).
    const hasPool = randomUUID(); // private_pool = 1 (legacy true / confirmed)
    const noPoolFlag = randomUUID(); // private_pool = 0 (legacy ambiguous false)
    await m9bPool.query(
      'INSERT INTO properties (id, workspace_id, business_id, name, private_pool, near_beach, beachfront, riverfront) VALUES (?,?,?,?,1,1,0,0)',
      [hasPool, ws, biz, 'Has Pool'],
    );
    await m9bPool.query(
      'INSERT INTO properties (id, workspace_id, business_id, name, private_pool, near_beach, beachfront, riverfront) VALUES (?,?,?,?,0,0,0,0)',
      [noPoolFlag, ws, biz, 'No Flags'],
    );

    // Apply the REAL 0018 migration SQL (DDL + backfill), statement by statement.
    const sql = readFileSync(join(MIGRATIONS, '0018_jittery_rumiko_fujikawa.sql'), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const clean = stmt
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (clean) await m9bPool.query(clean);
    }

    const [rows] = await m9bPool.query(
      'SELECT id, private_pool, near_beach, beachfront FROM properties WHERE id IN (?,?)',
      [hasPool, noPoolFlag],
    );
    const byId = Object.fromEntries(
      (rows as Array<{ id: string; private_pool: number | null; near_beach: number | null }>).map(
        (r) => [r.id, r],
      ),
    );
    // Legacy true stays 1 (YES).
    expect(byId[hasPool]!.private_pool).toBe(1);
    expect(byId[hasPool]!.near_beach).toBe(1);
    // Legacy false becomes NULL (UNKNOWN) — NOT 0/NO.
    expect(byId[noPoolFlag]!.private_pool).toBeNull();
    expect(byId[noPoolFlag]!.near_beach).toBeNull();
    // A confirmed NO (0) does not appear anywhere from the migration.
    const [zeros] = await m9bPool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM properties WHERE private_pool = 0 OR near_beach = 0 OR beachfront = 0 OR riverfront = 0',
    );
    expect(Number(zeros[0]!.n)).toBe(0);
  });
});
