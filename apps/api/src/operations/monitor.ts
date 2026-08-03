import { promises as fs } from 'node:fs';
import os from 'node:os';

/**
 * Monitoring thresholds and evaluation (SPRINT 013) — PURE where it matters.
 *
 * A lightweight, dependency-free monitoring foundation for a single VPS. No
 * heavy stack. The evaluators are pure functions over metrics + thresholds so
 * both the `monitor` CLI and the `/health/*` endpoints reach identical verdicts.
 */

export type Level = 'OK' | 'WARNING' | 'CRITICAL';

/** Worst-of two levels. */
export function worst(a: Level, b: Level): Level {
  const rank: Record<Level, number> = { OK: 0, WARNING: 1, CRITICAL: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function worstOf(levels: Level[]): Level {
  return levels.reduce<Level>((acc, l) => worst(acc, l), 'OK');
}

/** Process exit code for a level (0 OK, 1 WARNING, 2 CRITICAL). */
export function exitCodeFor(level: Level): number {
  return level === 'OK' ? 0 : level === 'WARNING' ? 1 : 2;
}

export interface MonitorThresholds {
  diskWarningPercent: number;
  diskCriticalPercent: number;
  ramWarningMb: number;
  ramCriticalMb: number;
  swapWarningPercent: number;
  swapCriticalPercent: number;
  loadWarning: number;
  loadCritical: number;
  backupStaleHours: number;
}

export interface CheckResult {
  name: string;
  level: Level;
  detail: string;
  /** Safe numeric value (never content, paths, or secrets). */
  value?: number;
}

/** WARNING when value ≥ warn, CRITICAL when ≥ crit (higher is worse). */
export function evalHigherWorse(
  name: string,
  value: number,
  warn: number,
  crit: number,
  unit = '',
): CheckResult {
  let level: Level = 'OK';
  if (value >= crit) level = 'CRITICAL';
  else if (value >= warn) level = 'WARNING';
  return {
    name,
    level,
    value,
    detail: `${value}${unit} (warn ${warn}${unit}, crit ${crit}${unit})`,
  };
}

/** WARNING when value ≤ warn, CRITICAL when ≤ crit (lower is worse). */
export function evalLowerWorse(
  name: string,
  value: number,
  warn: number,
  crit: number,
  unit = '',
): CheckResult {
  let level: Level = 'OK';
  if (value <= crit) level = 'CRITICAL';
  else if (value <= warn) level = 'WARNING';
  return {
    name,
    level,
    value,
    detail: `${value}${unit} (warn ≤${warn}${unit}, crit ≤${crit}${unit})`,
  };
}

export interface SystemMetrics {
  diskUsedPercent: number;
  diskFreeGb: number;
  ramAvailableMb: number;
  swapUsedPercent: number;
  loadAvg1: number;
}

/** Collect host metrics with no external tools. */
export async function collectSystemMetrics(path = process.cwd()): Promise<SystemMetrics> {
  let diskUsedPercent = 0;
  let diskFreeGb = 0;
  try {
    const s = await fs.statfs(path);
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    diskFreeGb = Math.round((free / 1024 ** 3) * 10) / 10;
    diskUsedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
  } catch {
    // statfs unavailable — leave zeros; the check reports OK rather than crash.
  }
  const ramAvailableMb = Math.round(os.freemem() / 1024 / 1024);
  // Swap is not exposed by `os`; read /proc/meminfo when present (Linux).
  let swapUsedPercent = 0;
  try {
    const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
    const totalKb = Number(/SwapTotal:\s+(\d+)/.exec(meminfo)?.[1] ?? 0);
    const freeKb = Number(/SwapFree:\s+(\d+)/.exec(meminfo)?.[1] ?? 0);
    swapUsedPercent = totalKb > 0 ? Math.round(((totalKb - freeKb) / totalKb) * 100) : 0;
  } catch {
    swapUsedPercent = 0;
  }
  const loadAvg1 = Math.round((os.loadavg()[0] ?? 0) * 100) / 100;
  return { diskUsedPercent, diskFreeGb, ramAvailableMb, swapUsedPercent, loadAvg1 };
}

/** Evaluate host resources into per-check results. */
export function evaluateSystem(m: SystemMetrics, t: MonitorThresholds): CheckResult[] {
  return [
    evalHigherWorse('disk', m.diskUsedPercent, t.diskWarningPercent, t.diskCriticalPercent, '%'),
    evalLowerWorse('ram_available', m.ramAvailableMb, t.ramWarningMb, t.ramCriticalMb, 'MB'),
    evalHigherWorse('swap', m.swapUsedPercent, t.swapWarningPercent, t.swapCriticalPercent, '%'),
    evalHigherWorse('load', m.loadAvg1, t.loadWarning, t.loadCritical, ''),
  ];
}

/** Evaluate backup freshness given the age of the newest backup in hours. */
export function evaluateBackupAge(ageHours: number | null, staleHours: number): CheckResult {
  if (ageHours === null) {
    return { name: 'backup', level: 'WARNING', detail: 'no backup found' };
  }
  const level: Level = ageHours > staleHours ? 'WARNING' : 'OK';
  return {
    name: 'backup',
    level,
    value: ageHours,
    detail: `${ageHours}h old (stale > ${staleHours}h)`,
  };
}
