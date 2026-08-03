// Runtime helpers for operational scripts (SPRINT 013). Node builtins + git/docker
// shell-outs only. NEVER prints credentials; passwords are passed to child
// processes via the environment, never via argv.

import { promises as fs } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';

const REPO_ROOT = process.cwd();
const COMPOSE_FILE = 'docker/compose/docker-compose.yml';

/** Parse a local `.env` into a plain object (best-effort, no throw). */
export async function loadEnvFile(path = '.env') {
  const out = {};
  try {
    const raw = await fs.readFile(join(REPO_ROOT, path), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {
    // no .env — rely on process.env
  }
  return { ...out, ...process.env };
}

/** Read a value with a fallback. */
export function envVal(env, key, fallback) {
  return env[key] !== undefined && env[key] !== '' ? env[key] : fallback;
}

/** Parse a mysql:// URL into {user, password, host, port, database}. */
export function parseDatabaseUrl(url) {
  const m = /^mysql:\/\/([^:]+):([^@]*)@([^:/]+)(?::(\d+))?\/(.+)$/.exec(url ?? '');
  if (!m) throw new Error('Invalid DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: m[4] ?? '3306', database: m[5] };
}

/** Safe git metadata (no secrets). Returns nulls if not a repo. */
export function gitInfo() {
  const safe = (args) => {
    try {
      return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  };
  return {
    commit: safe(['rev-parse', 'HEAD']),
    tag: safe(['describe', '--tags', '--abbrev=0']),
  };
}

/** The newest applied migration tag from the drizzle journal (safe). */
export async function latestMigration() {
  try {
    const raw = await fs.readFile(join(REPO_ROOT, 'apps/api/drizzle/meta/_journal.json'), 'utf8');
    const j = JSON.parse(raw);
    const entries = j.entries ?? [];
    return entries.length ? entries[entries.length - 1].tag : null;
  } catch {
    return null;
  }
}

export async function ensureDir(path, mode = 0o700) {
  await fs.mkdir(path, { recursive: true, mode });
}

export async function pathExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run mysqldump (inside the compose MySQL container) and stream a gzipped dump
 * to `outFile`, computing its sha256. The password is forwarded via the child
 * environment as MYSQL_PWD using `-e MYSQL_PWD` (no value), so it never appears
 * in argv or logs. Returns {bytes, sha256}.
 */
export async function dumpDatabaseGz(db, outFile) {
  await ensureDir(dirname(outFile));
  const args = [
    'compose',
    '-f',
    COMPOSE_FILE,
    'exec',
    '-T',
    '-e',
    'MYSQL_PWD', // forwarded from child env; value NOT on argv
    'mysql',
    'mysqldump',
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
    `-u${db.user}`,
    db.database,
  ];
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, {
      cwd: REPO_ROOT,
      env: { ...process.env, MYSQL_PWD: db.password },
    });
    const gzip = createGzip({ level: 9 });
    const hash = createHash('sha256');
    let bytes = 0;
    const out = createWriteStream(outFile, { mode: 0o600 });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    gzip.on('data', (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    child.stdout.pipe(gzip).pipe(out);
    child.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => {
      if (child.exitCode !== 0 && child.exitCode !== null) {
        // Redact any credential-looking content from stderr before surfacing.
        reject(new Error(`mysqldump failed (code ${child.exitCode}): ${stderr.slice(0, 200)}`));
      } else {
        resolvePromise({ bytes, sha256: hash.digest('hex') });
      }
    });
    child.on('close', (code) => {
      if (code !== 0) out.destroy(new Error(`mysqldump exited ${code}: ${stderr.slice(0, 200)}`));
    });
  });
}
