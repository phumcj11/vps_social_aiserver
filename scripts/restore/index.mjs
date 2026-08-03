#!/usr/bin/env node
// Restore CLI (SPRINT 013).
//   node scripts/restore/index.mjs <verify|dry-run|database> --backup <path> [--yes]
// Restore is NEVER automatic. It verifies checksum + manifest + version, refuses
// paths outside the controlled backup root, refuses traversal, refuses weak
// credentials, and (in production) requires maintenance mode + explicit --yes.
// dry-run never alters the database.

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import {
  loadEnvFile,
  envVal,
  parseDatabaseUrl,
  latestMigration,
  pathExists,
} from '../lib/runtime.mjs';
import {
  normalizeRoot,
  resolveWithinRoot,
  sha256Hex,
  verifyManifestCompatible,
} from '../lib/ops-lib.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function loadManifestFor(root, gzPath) {
  const base = basename(gzPath).replace(/\.sql\.gz$/, '');
  const manPath = join(root, `${base}.manifest.json`);
  if (!(await pathExists(manPath))) throw new Error('manifest not found for backup');
  return JSON.parse(await fs.readFile(manPath, 'utf8'));
}

async function verify(root, gzPath, env) {
  const report = { steps: [], ok: true };
  const step = (name, ok, detail) => {
    report.steps.push({ name, ok, detail });
    if (!ok) report.ok = false;
  };

  // 1. Path safety.
  let resolved;
  try {
    resolved = resolveWithinRoot(root, gzPath);
    step('path_within_root', true, 'inside controlled backup root');
  } catch (e) {
    step('path_within_root', false, e.message);
    return report;
  }
  if (!(await pathExists(resolved))) {
    step('archive_exists', false, 'archive missing');
    return report;
  }
  step('archive_exists', true, 'present');

  // 2. Manifest.
  let manifest;
  try {
    manifest = await loadManifestFor(root, resolved);
    step('manifest_present', true, `kind=${manifest.kind}`);
  } catch (e) {
    step('manifest_present', false, e.message);
    return report;
  }

  // 3. Checksum.
  const sha = sha256Hex(await fs.readFile(resolved));
  step('checksum', sha === manifest.sha256, sha === manifest.sha256 ? 'matches' : 'MISMATCH');

  // 4. Version compatibility.
  const known = [await latestMigration()].filter(Boolean);
  const compat = verifyManifestCompatible(manifest, { knownMigrations: known });
  step('version_compatible', compat.ok, compat.reason);

  // 5. Credentials present + not weak.
  const url = envVal(env, 'DATABASE_URL', '');
  const weak = /:(?:change_me|change_me_root|password|root|mysql)@/i.test(url);
  step('credentials', Boolean(url) && !weak, weak ? 'weak/default credential' : 'ok');

  report.manifest = { kind: manifest.kind, createdAt: manifest.createdAt, file: manifest.file };
  return report;
}

async function restoreDatabase(root, gzPath, env) {
  const db = parseDatabaseUrl(env.DATABASE_URL);
  const resolved = resolveWithinRoot(root, gzPath);
  return new Promise((resolvePromise, reject) => {
    const args = [
      'compose',
      '-f',
      'docker/compose/docker-compose.yml',
      'exec',
      '-T',
      '-e',
      'MYSQL_PWD',
      'mysql',
      'mysql',
      `-u${db.user}`,
      db.database,
    ];
    const child = spawn('docker', args, {
      cwd: process.cwd(),
      env: { ...process.env, MYSQL_PWD: db.password },
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    createReadStream(resolved).pipe(createGunzip()).pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`restore failed: ${stderr.slice(0, 200)}`)),
    );
  });
}

async function main() {
  const cmd = process.argv[2];
  const backup = arg('backup');
  const yes = process.argv.includes('--yes');
  const env = await loadEnvFile();
  const root = normalizeRoot(envVal(env, 'BACKUP_ROOT', '/opt/kmkt/backups/social-ai'));

  if (!['verify', 'dry-run', 'database'].includes(cmd)) {
    console.error('Usage: restore <verify|dry-run|database> --backup <path> [--yes]');
    process.exit(2);
  }
  if (!backup) {
    console.error('Refusing: --backup <path> is required.');
    process.exit(2);
  }

  const report = await verify(root, backup, env);
  console.log('Restore verification report:');
  for (const s of report.steps) console.log(`  ${s.ok ? 'OK  ' : 'FAIL'} ${s.name}: ${s.detail}`);

  if (cmd === 'verify') {
    process.exit(report.ok ? 0 : 1);
  }
  if (cmd === 'dry-run') {
    console.log(
      report.ok
        ? 'DRY-RUN: verification passed. No database change performed.'
        : 'DRY-RUN: verification FAILED.',
    );
    process.exit(report.ok ? 0 : 1);
  }

  // cmd === 'database' — the only destructive path.
  if (!report.ok) {
    console.error('Refusing: verification failed. Not restoring.');
    process.exit(1);
  }
  const isProd = envVal(env, 'APP_ENV', 'development') === 'production';
  if (isProd) {
    const maintenance = await maintenanceEngaged(env);
    if (!maintenance) {
      console.error('Refusing: production restore requires MAINTENANCE mode. Enable it first.');
      process.exit(1);
    }
  }
  if (!yes) {
    console.error('Refusing: restore is destructive. Re-run with --yes to confirm.');
    process.exit(1);
  }
  await restoreDatabase(root, backup, env);
  console.log('Restore complete. Verify application state and run doctor.');
}

async function maintenanceEngaged(env) {
  try {
    const stateFile = envVal(env, 'OPERATIONS_STATE_FILE', 'storage/runtime/ops-state.json');
    const raw = await fs.readFile(stateFile, 'utf8');
    return JSON.parse(raw)?.maintenance?.enabled === true;
  } catch {
    return false;
  }
}

main();
