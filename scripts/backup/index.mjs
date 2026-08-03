#!/usr/bin/env node
// Backup CLI (SPRINT 013).
//   node scripts/backup/index.mjs <database|config|audit|all|verify|list|cleanup> [--apply]
// Fails closed, never overwrites, never prints credentials. Stores compressed,
// checksummed, manifested backups under BACKUP_ROOT (outside the repo).

import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  loadEnvFile,
  envVal,
  parseDatabaseUrl,
  gitInfo,
  latestMigration,
  ensureDir,
  pathExists,
  dumpDatabaseGz,
} from '../lib/runtime.mjs';
import {
  normalizeRoot,
  timestampName,
  buildManifest,
  sha256Hex,
  classifyRetention,
  isStale,
} from '../lib/ops-lib.mjs';

const AUDIT_TABLES = [
  'action_events',
  'action_execution_sessions',
  'action_execution_evidence',
  'review_events',
  'ai_draft_events',
  'business_matches',
  'opportunity_events',
  'collector_runs',
];

async function writeArtifacts(root, baseName, kind, dump, env) {
  const git = gitInfo();
  const manifest = buildManifest({
    kind,
    createdAt: new Date().toISOString(),
    file: `${baseName}.sql.gz`,
    bytes: dump.bytes,
    sha256: dump.sha256,
    appVersion: envVal(env, 'APP_VERSION', null),
    gitCommit: git.commit,
    gitTag: git.tag,
    schemaMigration: await latestMigration(),
  });
  const shaPath = join(root, `${baseName}.sha256`);
  const manPath = join(root, `${baseName}.manifest.json`);
  await fs.writeFile(shaPath, `${dump.sha256}  ${baseName}.sql.gz\n`, { mode: 0o600 });
  await fs.writeFile(manPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

async function backupDatabase(root, env, prefix = 'db') {
  const db = parseDatabaseUrl(env.DATABASE_URL);
  const baseName = timestampName(prefix, new Date());
  const gzPath = join(root, `${baseName}.sql.gz`);
  if (await pathExists(gzPath)) throw new Error(`Refusing: backup already exists (${baseName})`);
  const dump = await dumpDatabaseGz(db, gzPath);
  const manifest = await writeArtifacts(
    root,
    baseName,
    prefix === 'audit' ? 'audit' : 'database',
    dump,
    env,
  );
  console.log(
    `Backup created: ${baseName}.sql.gz (${dump.bytes} bytes, sha256 ${dump.sha256.slice(0, 12)}…)`,
  );
  return manifest;
}

async function backupAudit(root, env) {
  const db = parseDatabaseUrl(env.DATABASE_URL);
  const baseName = timestampName('audit', new Date());
  const gzPath = join(root, `${baseName}.sql.gz`);
  if (await pathExists(gzPath)) throw new Error(`Refusing: backup already exists (${baseName})`);
  // Dump ONLY the audit-relevant tables (data only). No secrets in these tables.
  const args = [
    'compose',
    '-f',
    'docker/compose/docker-compose.yml',
    'exec',
    '-T',
    '-e',
    'MYSQL_PWD',
    'mysql',
    'mysqldump',
    '--no-create-info',
    '--single-transaction',
    '--skip-triggers',
    `-u${db.user}`,
    db.database,
    ...AUDIT_TABLES,
  ];
  const res = spawnSync('docker', args, {
    cwd: process.cwd(),
    env: { ...process.env, MYSQL_PWD: db.password },
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`audit dump failed: ${String(res.stderr).slice(0, 200)}`);
  const { gzipSync } = await import('node:zlib');
  const gz = gzipSync(res.stdout, { level: 9 });
  await fs.writeFile(gzPath, gz, { mode: 0o600 });
  await writeArtifacts(root, baseName, 'audit', { bytes: gz.length, sha256: sha256Hex(gz) }, env);
  console.log(`Audit backup created: ${baseName}.sql.gz (${gz.length} bytes)`);
}

async function backupConfig(root, env) {
  const baseName = timestampName('config', new Date());
  const tgz = join(root, `${baseName}.sql.gz`); // keep .sql.gz suffix for uniform tooling
  if (await pathExists(tgz)) throw new Error(`Refusing: backup already exists (${baseName})`);
  // SAFE allowlist only — never .env, secrets, cookies, or profiles.
  const include = [
    '.env.example',
    'package.json',
    'pnpm-workspace.yaml',
    'docker/compose/docker-compose.yml',
    'apps/api/drizzle',
    'apps/api/package.json',
    'docs',
  ].filter((p) => p);
  const res = spawnSync('tar', ['-czf', tgz, '--numeric-owner', ...include], {
    cwd: process.cwd(),
  });
  if (res.status !== 0) throw new Error(`config tar failed: ${String(res.stderr).slice(0, 200)}`);
  await fs.chmod(tgz, 0o600);
  const bytes = (await fs.stat(tgz)).size;
  const sha = sha256Hex(await fs.readFile(tgz));
  await writeArtifacts(root, baseName, 'config', { bytes, sha256: sha }, env);
  console.log(`Config backup created: ${baseName}.sql.gz (${bytes} bytes)`);
}

async function listManifests(root) {
  let entries = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.filter((x) => x.endsWith('.manifest.json'))) {
    try {
      out.push(JSON.parse(await fs.readFile(join(root, e), 'utf8')));
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function verifyBackups(root) {
  const manifests = await listManifests(root);
  if (!manifests.length) {
    console.log('No backups to verify.');
    return 0;
  }
  let failures = 0;
  for (const m of manifests) {
    const gz = join(root, m.file);
    if (!(await pathExists(gz))) {
      console.log(`FAIL ${m.file}: archive missing`);
      failures++;
      continue;
    }
    const sha = sha256Hex(await fs.readFile(gz));
    const ok = sha === m.sha256;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${m.file}: checksum ${ok ? 'matches' : 'MISMATCH'}`);
    if (!ok) failures++;
  }
  return failures;
}

async function cleanup(root, env, apply) {
  const manifests = await listManifests(root);
  const retention = {
    daily: Number(envVal(env, 'BACKUP_RETENTION_DAILY', 7)),
    weekly: Number(envVal(env, 'BACKUP_RETENTION_WEEKLY', 4)),
    monthly: Number(envVal(env, 'BACKUP_RETENTION_MONTHLY', 3)),
  };
  const { keep, remove } = classifyRetention(
    manifests.map((m) => ({ file: m.file, createdAt: m.createdAt })),
    retention,
    new Date(),
  );
  console.log(
    `Retention: keep ${keep.length}, remove ${remove.length} (${apply ? 'APPLY' : 'dry-run'})`,
  );
  for (const file of remove) {
    const base = file.replace(/\.sql\.gz$/, '');
    console.log(`  remove ${file}`);
    if (apply) {
      for (const suffix of ['.sql.gz', '.sha256', '.manifest.json']) {
        await fs.rm(join(root, `${base}${suffix}`), { force: true });
      }
    }
  }
}

async function main() {
  const cmd = process.argv[2];
  const apply = process.argv.includes('--apply');
  const env = await loadEnvFile();
  const root = normalizeRoot(envVal(env, 'BACKUP_ROOT', '/opt/kmkt/backups/social-ai'));
  await ensureDir(root, 0o700);

  try {
    switch (cmd) {
      case 'database':
        await backupDatabase(root, env);
        break;
      case 'audit':
        await backupAudit(root, env);
        break;
      case 'config':
        await backupConfig(root, env);
        break;
      case 'all':
        await backupDatabase(root, env);
        await backupConfig(root, env);
        await backupAudit(root, env);
        break;
      case 'verify': {
        const failures = await verifyBackups(root);
        process.exit(failures === 0 ? 0 : 1);
        return;
      }
      case 'list': {
        const manifests = await listManifests(root);
        const stale = Number(envVal(env, 'BACKUP_STALE_HOURS', 26));
        console.log(`${manifests.length} backup(s) under ${root}:`);
        for (const m of manifests) {
          const s = isStale(m.createdAt, stale, new Date()) ? ' [STALE]' : '';
          console.log(`  ${m.file} kind=${m.kind} created=${m.createdAt}${s}`);
        }
        break;
      }
      case 'cleanup':
        await cleanup(root, env, apply);
        break;
      default:
        console.error('Usage: backup <database|config|audit|all|verify|list|cleanup> [--apply]');
        process.exit(2);
    }
  } catch (err) {
    console.error(`Backup error: ${err.message}`);
    process.exit(1);
  }
}

main();
