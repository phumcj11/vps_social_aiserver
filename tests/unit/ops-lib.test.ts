import { describe, expect, it } from 'vitest';
import {
  isPathWithinRoot,
  resolveWithinRoot,
  sha256Hex,
  timestampName,
  buildManifest,
  verifyManifestCompatible,
  isStale,
  ageHours,
  classifyRetention,
  worstOf,
  exitCodeFor,
  evalHigherWorse,
  evalLowerWorse,
  planLogRotation,
} from '../../scripts/lib/ops-lib.mjs';

const ROOT = '/opt/kmkt/backups/social-ai';

describe('path safety', () => {
  it('accepts paths inside the controlled root', () => {
    expect(isPathWithinRoot(ROOT, `${ROOT}/db-20260101-000000.sql.gz`)).toBe(true);
    expect(resolveWithinRoot(ROOT, 'db-x.sql.gz')).toBe(`${ROOT}/db-x.sql.gz`);
  });
  it('rejects traversal and outside paths', () => {
    expect(isPathWithinRoot(ROOT, `${ROOT}/../etc/passwd`)).toBe(false);
    expect(() => resolveWithinRoot(ROOT, '../../etc/passwd')).toThrow(/outside/);
    expect(() => resolveWithinRoot(ROOT, '/etc/passwd')).toThrow(/outside/);
    expect(() => resolveWithinRoot(ROOT, 'x\0y')).toThrow(/null byte/);
    expect(() => resolveWithinRoot(ROOT, '')).toThrow();
  });
});

describe('checksum + names', () => {
  it('sha256 is stable', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
  it('timestamp name is deterministic UTC', () => {
    expect(timestampName('db', new Date('2026-08-03T04:05:06Z'))).toBe('db-20260803-040506');
  });
});

describe('manifest compatibility', () => {
  const base = buildManifest({
    kind: 'database',
    createdAt: '2026-08-03T00:00:00Z',
    file: 'db-x.sql.gz',
    bytes: 100,
    sha256: 'abc',
    schemaMigration: '0010_furry',
  });
  it('accepts a known schema version', () => {
    expect(verifyManifestCompatible(base, { knownMigrations: ['0010_furry'] }).ok).toBe(true);
  });
  it('rejects an unknown (newer) schema version', () => {
    const r = verifyManifestCompatible(base, { knownMigrations: ['0009_old'] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported schema/);
  });
  it('rejects a non-database backup', () => {
    expect(verifyManifestCompatible({ ...base, kind: 'config' }, {}).ok).toBe(false);
  });
  it('rejects an incomplete manifest', () => {
    expect(verifyManifestCompatible({ kind: 'database' }, {}).ok).toBe(false);
  });
});

describe('staleness', () => {
  const now = new Date('2026-08-03T00:00:00Z');
  it('detects a stale backup', () => {
    expect(isStale('2026-08-01T00:00:00Z', 26, now)).toBe(true);
    expect(isStale('2026-08-02T20:00:00Z', 26, now)).toBe(false);
    expect(Math.round(ageHours('2026-08-02T00:00:00Z', now))).toBe(24);
  });
});

describe('retention', () => {
  it('keeps newest per daily/weekly/monthly bucket and removes the rest', () => {
    const backups = [
      { file: 'a', createdAt: '2026-08-03T00:00:00Z' },
      { file: 'b', createdAt: '2026-08-02T00:00:00Z' },
      { file: 'c', createdAt: '2026-07-20T00:00:00Z' },
      { file: 'd', createdAt: '2026-06-10T00:00:00Z' },
      { file: 'e', createdAt: '2026-05-01T00:00:00Z' },
      { file: 'f', createdAt: '2026-04-01T00:00:00Z' },
    ];
    const { keep, remove } = classifyRetention(
      backups,
      { daily: 2, weekly: 1, monthly: 3 },
      new Date(),
    );
    // Newest 2 days kept (a,b); monthly buckets keep newest of distinct months.
    expect(keep).toContain('a');
    expect(keep).toContain('b');
    // The oldest beyond all tiers is removed.
    expect(remove).toContain('f');
    expect(keep.length + remove.length).toBe(backups.length);
  });
  it('keeps everything when tiers exceed the backup count', () => {
    const backups = [{ file: 'a', createdAt: '2026-08-03T00:00:00Z' }];
    const { remove } = classifyRetention(backups, { daily: 7, weekly: 4, monthly: 3 }, new Date());
    expect(remove).toHaveLength(0);
  });
});

describe('monitor thresholds', () => {
  it('higher-worse: disk %', () => {
    expect(evalHigherWorse('disk', 50, 80, 90).level).toBe('OK');
    expect(evalHigherWorse('disk', 85, 80, 90).level).toBe('WARNING');
    expect(evalHigherWorse('disk', 95, 80, 90).level).toBe('CRITICAL');
  });
  it('lower-worse: free RAM', () => {
    expect(evalLowerWorse('ram', 800, 700, 350).level).toBe('OK');
    expect(evalLowerWorse('ram', 500, 700, 350).level).toBe('WARNING');
    expect(evalLowerWorse('ram', 300, 700, 350).level).toBe('CRITICAL');
  });
  it('worstOf + exit codes', () => {
    expect(worstOf(['OK', 'WARNING', 'OK'])).toBe('WARNING');
    expect(worstOf(['WARNING', 'CRITICAL'])).toBe('CRITICAL');
    expect(exitCodeFor('OK')).toBe(0);
    expect(exitCodeFor('WARNING')).toBe(1);
    expect(exitCodeFor('CRITICAL')).toBe(2);
  });
});

describe('log rotation planning', () => {
  const now = new Date('2026-08-03T00:00:00Z');
  it('compresses oversized uncompressed files and deletes old ones', () => {
    const files = [
      {
        file: 'api.log',
        bytes: 60 * 1024 * 1024,
        mtime: '2026-08-03T00:00:00Z',
        compressed: false,
      },
      { file: 'small.log', bytes: 1024, mtime: '2026-08-03T00:00:00Z', compressed: false },
      { file: 'old.log.gz', bytes: 1024, mtime: '2026-07-01T00:00:00Z', compressed: true },
    ];
    const plan = planLogRotation(files, { maxSizeMb: 50, retentionDays: 7 }, now);
    expect(plan.compress).toContain('api.log');
    expect(plan.compress).not.toContain('small.log');
    expect(plan.remove).toContain('old.log.gz');
  });
});
