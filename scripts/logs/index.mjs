#!/usr/bin/env node
// Log management CLI (SPRINT 013).
//   node scripts/logs/index.mjs <status|rotate:dry-run|verify>
// Inspects project-local log files under storage/logs/. Never modifies host log
// rotation. `rotate:dry-run` reports the plan without changing anything.
// `verify` scans for secret-shaped lines and reports leaks WITHOUT printing them.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile, envVal } from '../lib/runtime.mjs';
import { planLogRotation } from '../lib/ops-lib.mjs';

const LOG_DIR = 'storage/logs';

// Patterns that must NEVER appear in logs. We report the count only, never the line.
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /xox[baprs]-[a-zA-Z0-9-]{10,}/,
  /ghp_[a-zA-Z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"?(password|cookie|session_token|authorization)"?\s*[:=]\s*["']?[^\s"']{6,}/i,
  /\/(?:home|root|opt)\/[^\s"']*\/(?:Cookies|profile|browser-profiles)/,
];

async function listLogFiles(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e === '.gitkeep') continue;
    try {
      const st = await fs.stat(join(dir, e));
      if (st.isFile()) {
        out.push({
          file: e,
          bytes: st.size,
          mtime: st.mtime.toISOString(),
          compressed: e.endsWith('.gz'),
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const env = await loadEnvFile();
  const maxSizeMb = Number(envVal(env, 'LOG_MAX_SIZE_MB', 50));
  const retentionDays = Number(envVal(env, 'LOG_RETENTION_DAYS', 7));
  const files = await listLogFiles(LOG_DIR);

  if (cmd === 'status') {
    console.log(`logs: ${files.length} file(s) under ${LOG_DIR}`);
    for (const f of files)
      console.log(`  ${f.file} ${Math.round(f.bytes / 1024)}KB ${f.compressed ? '(gz)' : ''}`);
    process.exit(0);
  }
  if (cmd === 'rotate:dry-run') {
    const plan = planLogRotation(files, { maxSizeMb, retentionDays }, new Date());
    console.log(
      `logs rotate (dry-run): compress ${plan.compress.length}, delete ${plan.remove.length}`,
    );
    for (const f of plan.compress) console.log(`  compress ${f}`);
    for (const f of plan.remove) console.log(`  delete   ${f}`);
    console.log('No changes made (dry-run).');
    process.exit(0);
  }
  if (cmd === 'verify') {
    let leaks = 0;
    for (const f of files) {
      if (f.compressed) continue;
      const content = await fs.readFile(join(LOG_DIR, f.file), 'utf8').catch(() => '');
      for (const line of content.split('\n')) {
        if (SECRET_PATTERNS.some((re) => re.test(line))) leaks++;
      }
    }
    console.log(
      `logs verify: ${leaks === 0 ? 'OK — no secret-shaped content found' : `FAIL — ${leaks} suspicious line(s)`}`,
    );
    process.exit(leaks === 0 ? 0 : 1);
  }
  console.error('Usage: logs <status|rotate:dry-run|verify>');
  process.exit(2);
}

main();
