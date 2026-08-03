// Pure operational helpers (SPRINT 013). Node builtins only — no app imports, no
// network, no secrets. Shared by the backup / restore / monitor / logs scripts
// and unit-tested directly (vitest can import this .mjs). Every function here is
// deterministic given its inputs (pass `now` explicitly for time-based logic).

import { createHash } from 'node:crypto';
import { resolve, isAbsolute, sep } from 'node:path';

// ── Path safety ──────────────────────────────────────────────────────────────

/** Absolute, normalized form of `root`. */
export function normalizeRoot(root) {
  return isAbsolute(root) ? resolve(root) : resolve(process.cwd(), root);
}

/** True when `candidate` resolves to a path inside `root` (no traversal escape). */
export function isPathWithinRoot(root, candidate) {
  const r = normalizeRoot(root);
  const c = isAbsolute(candidate) ? resolve(candidate) : resolve(r, candidate);
  return c === r || c.startsWith(r + sep);
}

/** Resolve `candidate` within `root` or throw — the single safe-path gate. */
export function resolveWithinRoot(root, candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error('Refusing: empty path');
  }
  if (candidate.includes('\0')) throw new Error('Refusing: null byte in path');
  if (!isPathWithinRoot(root, candidate)) {
    throw new Error(`Refusing: path is outside the controlled backup root`);
  }
  const r = normalizeRoot(root);
  return isAbsolute(candidate) ? resolve(candidate) : resolve(r, candidate);
}

// ── Checksums ────────────────────────────────────────────────────────────────

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ── Timestamped names ────────────────────────────────────────────────────────

/** `prefix-YYYYMMDD-HHMMSS` in UTC (deterministic given `date`). */
export function timestampName(prefix, date) {
  const p = (n) => String(n).padStart(2, '0');
  const s =
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
  return `${prefix}-${s}`;
}

// ── Manifest ─────────────────────────────────────────────────────────────────

/** Build a SAFE backup manifest (no secrets, no absolute paths, no content). */
export function buildManifest(input) {
  return {
    kind: input.kind,
    createdAt: input.createdAt,
    file: input.file, // basename only
    bytes: input.bytes,
    sha256: input.sha256,
    appVersion: input.appVersion ?? null,
    gitCommit: input.gitCommit ?? null,
    gitTag: input.gitTag ?? null,
    schemaMigration: input.schemaMigration ?? null,
  };
}

/** Validate a manifest for restore compatibility. Returns {ok, reason}. */
export function verifyManifestCompatible(manifest, current) {
  if (!manifest || typeof manifest !== 'object') return { ok: false, reason: 'missing manifest' };
  if (!manifest.file || !manifest.sha256 || !manifest.createdAt) {
    return { ok: false, reason: 'incomplete manifest' };
  }
  if (manifest.kind !== 'database') {
    return { ok: false, reason: `not a database backup (kind=${manifest.kind})` };
  }
  // Schema compatibility: refuse restoring a backup whose migration is NEWER than
  // the code knows about (unknown/incompatible version).
  if (
    current?.knownMigrations &&
    manifest.schemaMigration &&
    !current.knownMigrations.includes(manifest.schemaMigration)
  ) {
    return { ok: false, reason: `unsupported schema version ${manifest.schemaMigration}` };
  }
  return { ok: true, reason: 'compatible' };
}

// ── Staleness ────────────────────────────────────────────────────────────────

export function ageHours(createdAtISO, now) {
  return (now.getTime() - new Date(createdAtISO).getTime()) / 3_600_000;
}

export function isStale(createdAtISO, staleHours, now) {
  return ageHours(createdAtISO, now) > staleHours;
}

// ── Retention ────────────────────────────────────────────────────────────────

function bucketKeys(date) {
  const d = new Date(date);
  const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  const month = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  // ISO week number.
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = tmp.getTime();
  tmp.setUTCMonth(0, 1);
  const week =
    tmp.getUTCDay() !== 4 ? Math.ceil((firstThursday - tmp.getTime()) / 604800000 + 1) : 1;
  return { day, week: `${d.getUTCFullYear()}-W${week}`, month };
}

/**
 * Classify backups for retention. Keeps the newest `daily` distinct days,
 * `weekly` distinct weeks, and `monthly` distinct months. Anything not kept by
 * any tier is removed. Pure: input is [{file, createdAt}], returns {keep, remove}.
 */
export function classifyRetention(backups, retention, _now) {
  const sorted = [...backups].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const keep = new Set();
  const seen = { day: new Set(), week: new Set(), month: new Set() };
  for (const b of sorted) {
    const k = bucketKeys(b.createdAt);
    if (seen.day.size < retention.daily && !seen.day.has(k.day)) {
      seen.day.add(k.day);
      keep.add(b.file);
    }
    if (seen.week.size < retention.weekly && !seen.week.has(k.week)) {
      seen.week.add(k.week);
      keep.add(b.file);
    }
    if (seen.month.size < retention.monthly && !seen.month.has(k.month)) {
      seen.month.add(k.month);
      keep.add(b.file);
    }
  }
  const remove = sorted.filter((b) => !keep.has(b.file)).map((b) => b.file);
  return { keep: [...keep], remove };
}

// ── Monitoring thresholds ────────────────────────────────────────────────────

export const LEVELS = { OK: 0, WARNING: 1, CRITICAL: 2 };

export function worstOf(levels) {
  return levels.reduce((acc, l) => (LEVELS[l] >= LEVELS[acc] ? l : acc), 'OK');
}

export function exitCodeFor(level) {
  return level === 'OK' ? 0 : level === 'WARNING' ? 1 : 2;
}

/** Higher value is worse (disk %, swap %, load). */
export function evalHigherWorse(name, value, warn, crit) {
  let level = 'OK';
  if (value >= crit) level = 'CRITICAL';
  else if (value >= warn) level = 'WARNING';
  return { name, level, value };
}

/** Lower value is worse (free RAM). */
export function evalLowerWorse(name, value, warn, crit) {
  let level = 'OK';
  if (value <= crit) level = 'CRITICAL';
  else if (value <= warn) level = 'WARNING';
  return { name, level, value };
}

// ── Log rotation planning ────────────────────────────────────────────────────

/**
 * Plan log rotation. Given [{file, bytes, mtime, compressed}], decide which to
 * compress (over maxSize and not yet compressed) and which to delete (older than
 * retentionDays). Pure — no filesystem writes.
 */
export function planLogRotation(files, opts, now) {
  const maxBytes = opts.maxSizeMb * 1024 * 1024;
  const cutoff = now.getTime() - opts.retentionDays * 86_400_000;
  const compress = [];
  const remove = [];
  for (const f of files) {
    if (new Date(f.mtime).getTime() < cutoff) {
      remove.push(f.file);
      continue;
    }
    if (!f.compressed && f.bytes > maxBytes) compress.push(f.file);
  }
  return { compress, remove };
}
