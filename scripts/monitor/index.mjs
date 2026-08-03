#!/usr/bin/env node
// Monitoring CLI (SPRINT 013).
//   node scripts/monitor/index.mjs <status|check|report>
// Lightweight, dependency-free. Reports OK / WARNING / CRITICAL with meaningful
// exit codes (0/1/2). No Telegram alerts this sprint. Never prints secrets.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { loadEnvFile, envVal } from '../lib/runtime.mjs';
import {
  normalizeRoot,
  evalHigherWorse,
  evalLowerWorse,
  worstOf,
  exitCodeFor,
  ageHours,
} from '../lib/ops-lib.mjs';

async function collect() {
  let diskUsedPercent = 0;
  let diskFreeGb = 0;
  try {
    const s = await fs.statfs(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    diskFreeGb = Math.round((free / 1024 ** 3) * 10) / 10;
    diskUsedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
  } catch {
    /* ignore */
  }
  const ramAvailableMb = Math.round(os.freemem() / 1024 / 1024);
  let swapUsedPercent = 0;
  try {
    const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
    const t = Number(/SwapTotal:\s+(\d+)/.exec(meminfo)?.[1] ?? 0);
    const f = Number(/SwapFree:\s+(\d+)/.exec(meminfo)?.[1] ?? 0);
    swapUsedPercent = t > 0 ? Math.round(((t - f) / t) * 100) : 0;
  } catch {
    /* ignore */
  }
  const loadAvg1 = Math.round((os.loadavg()[0] ?? 0) * 100) / 100;
  return { diskUsedPercent, diskFreeGb, ramAvailableMb, swapUsedPercent, loadAvg1 };
}

async function newestBackupAge(root) {
  let entries = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null;
  }
  let newest = null;
  for (const e of entries.filter((x) => x.endsWith('.manifest.json'))) {
    try {
      const m = JSON.parse(await fs.readFile(join(root, e), 'utf8'));
      const age = ageHours(m.createdAt, new Date());
      if (newest === null || age < newest) newest = age;
    } catch {
      /* skip */
    }
  }
  return newest;
}

async function run() {
  const env = await loadEnvFile();
  const num = (k, d) => Number(envVal(env, k, d));
  const root = normalizeRoot(envVal(env, 'BACKUP_ROOT', '/opt/kmkt/backups/social-ai'));
  const m = await collect();

  const checks = [
    evalHigherWorse(
      'disk',
      m.diskUsedPercent,
      num('MONITOR_DISK_WARNING_PERCENT', 80),
      num('MONITOR_DISK_CRITICAL_PERCENT', 90),
    ),
    evalLowerWorse(
      'ram_available_mb',
      m.ramAvailableMb,
      num('MONITOR_RAM_WARNING_MB', 700),
      num('MONITOR_RAM_CRITICAL_MB', 350),
    ),
    evalHigherWorse(
      'swap',
      m.swapUsedPercent,
      num('MONITOR_SWAP_WARNING_PERCENT', 25),
      num('MONITOR_SWAP_CRITICAL_PERCENT', 60),
    ),
    evalHigherWorse(
      'load',
      m.loadAvg1,
      num('MONITOR_LOAD_WARNING', 1.5),
      num('MONITOR_LOAD_CRITICAL', 2.5),
    ),
  ];

  const backupAge = await newestBackupAge(root);
  const staleHours = num('BACKUP_STALE_HOURS', 26);
  checks.push({
    name: 'backup_age',
    level: backupAge === null ? 'WARNING' : backupAge > staleHours ? 'WARNING' : 'OK',
    value: backupAge === null ? null : Math.round(backupAge * 10) / 10,
  });

  const overall = worstOf(checks.map((c) => c.level));
  return { overall, checks, metrics: m, backupAgeHours: backupAge };
}

async function main() {
  const cmd = process.argv[2] ?? 'check';
  const result = await run();
  if (cmd === 'report') {
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'status') {
    console.log(`monitor: ${result.overall}`);
    for (const c of result.checks) console.log(`  ${c.level.padEnd(8)} ${c.name}=${c.value}`);
  } else if (cmd === 'check') {
    console.log(`monitor: ${result.overall}`);
  } else {
    console.error('Usage: monitor <status|check|report>');
    process.exit(2);
  }
  process.exit(exitCodeFor(result.overall));
}

main();
