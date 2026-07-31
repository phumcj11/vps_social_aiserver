#!/usr/bin/env node
// @ts-check
/**
 * KMKT Social AI — `pnpm doctor`
 *
 * Verifies the development environment and, critically, that the project's
 * SAFETY DEFAULTS are intact:
 *   - Node / pnpm / Docker availability and versions
 *   - Disk, memory and swap headroom for the 2-core / 3.8 GiB VPS
 *   - Required project files exist
 *   - .env.example ships in its SAFE state
 *   - Facebook WRITE actions remain DISABLED and the kill switch remains ON
 *
 * Exit code 0 = all hard checks passed (warnings allowed).
 * Exit code 1 = at least one hard check failed.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

let hardFailures = 0;
let warnings = 0;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** @param {string} name @param {string} detail */
function pass(name, detail = '') {
  console.log(`  ${GREEN}PASS${RESET} ${name}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`);
}
/** @param {string} name @param {string} detail */
function fail(name, detail = '') {
  hardFailures += 1;
  console.log(`  ${RED}FAIL${RESET} ${name}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`);
}
/** @param {string} name @param {string} detail */
function warn(name, detail = '') {
  warnings += 1;
  console.log(`  ${YELLOW}WARN${RESET} ${name}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`);
}

/** @param {string} cmd */
function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// --- Toolchain --------------------------------------------------------------
section('Toolchain');

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor === 22) pass('Node.js 22 LTS', `v${process.versions.node}`);
else if (nodeMajor >= 22) warn('Node.js newer than 22', `v${process.versions.node}`);
else fail('Node.js 22 LTS required', `found v${process.versions.node}`);

const pnpmVersion = tryExec('pnpm --version');
if (pnpmVersion) pass('pnpm', `v${pnpmVersion}`);
else fail('pnpm not found');

const dockerVersion = tryExec('docker --version');
if (dockerVersion) pass('Docker', dockerVersion);
else warn('Docker not found', 'required to run the Compose stack later');

const composeVersion = tryExec('docker compose version');
if (composeVersion) pass('Docker Compose plugin', composeVersion.split('\n')[0]);
else warn('Docker Compose plugin not found');

// --- Resources --------------------------------------------------------------
section('Resources (target VPS: 2 cores / 3.8 GiB RAM)');

const totalMemGiB = os.totalmem() / 1024 ** 3;
const freeMemGiB = os.freemem() / 1024 ** 3;
if (freeMemGiB >= 0.5)
  pass('Available memory', `${freeMemGiB.toFixed(2)} GiB free of ${totalMemGiB.toFixed(2)} GiB`);
else warn('Low available memory', `${freeMemGiB.toFixed(2)} GiB free`);

// Swap from /proc/meminfo (Linux).
let swapTotalGiB = 0;
try {
  const meminfo = readFileSync('/proc/meminfo', 'utf8');
  const match = meminfo.match(/SwapTotal:\s+(\d+)\s+kB/);
  if (match) swapTotalGiB = Number.parseInt(match[1], 10) / 1024 ** 2;
} catch {
  /* non-Linux or unreadable */
}
// ~2 GiB counts as meeting the 2 GiB target (allow for filesystem overhead).
if (swapTotalGiB >= 1.95) pass('Swap', `${swapTotalGiB.toFixed(2)} GiB`);
else if (swapTotalGiB > 0)
  warn(
    'Swap smaller than 2 GiB',
    `${swapTotalGiB.toFixed(2)} GiB (do not resize without approval)`,
  );
else warn('No swap configured', 'do not create without approval');

// Disk on root filesystem.
const df = tryExec('df -Pk / | tail -1');
if (df) {
  const cols = df.split(/\s+/);
  const availKb = Number.parseInt(cols[3], 10);
  const availGiB = availKb / 1024 ** 2;
  if (availGiB >= 5) pass('Disk space (/)', `${availGiB.toFixed(1)} GiB free`);
  else warn('Low disk space (/)', `${availGiB.toFixed(1)} GiB free`);
} else {
  warn('Disk space check skipped', 'df unavailable');
}

// --- Required files ---------------------------------------------------------
section('Required files');

const requiredFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'eslint.config.js',
  'prettier.config.js',
  '.gitignore',
  '.editorconfig',
  '.env.example',
  'docker/compose/docker-compose.yml',
  'apps/web/package.json',
  'apps/api/package.json',
  'workers/facebook-scanner/package.json',
  'workers/facebook-comment/package.json',
];
for (const file of requiredFiles) {
  if (existsSync(resolve(repoRoot, file))) pass(file);
  else fail(`missing ${file}`);
}

// A real .env must never be committed; a local one is fine but warn if absent.
if (existsSync(resolve(repoRoot, '.env'))) {
  warn('.env present locally', 'ensure it is gitignored and never committed');
}

// --- Environment safety defaults --------------------------------------------
section('Environment safety defaults (.env.example)');

/** @param {string} contents */
function parseEnv(contents) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

try {
  const env = parseEnv(readFileSync(resolve(repoRoot, '.env.example'), 'utf8'));

  /** @param {string} key @param {string} expected */
  const mustEqual = (key, expected) => {
    if (env[key] === expected) pass(`${key}=${expected}`);
    else fail(`${key} must be ${expected}`, `found ${env[key] ?? '(unset)'}`);
  };

  // Facebook write actions MUST remain disabled.
  mustEqual('FACEBOOK_WRITE_ACTION_ENABLED', 'false');
  mustEqual('FACEBOOK_COMMENT_ENABLED', 'false');
  mustEqual('FACEBOOK_READER_ENABLED', 'false');
  mustEqual('FACEBOOK_LOGIN_ENABLED', 'false');

  // Safety guarantees.
  mustEqual('GLOBAL_KILL_SWITCH', 'true');
  mustEqual('COMMENT_APPROVAL_REQUIRED', 'true');

  // Conservative concurrency.
  mustEqual('PLAYWRIGHT_CONCURRENCY', '1');
  mustEqual('SCANNER_CONCURRENCY', '1');
  mustEqual('COMMENT_CONCURRENCY', '1');

  // External integrations disabled.
  mustEqual('AI_ENABLED', 'false');
  mustEqual('TELEGRAM_ENABLED', 'false');
  mustEqual('N8N_ENABLED', 'false');
} catch (error) {
  fail('.env.example unreadable', String(error));
}

// --- Summary ----------------------------------------------------------------
section('Summary');
console.log(`  ${warnings} warning(s), ${hardFailures} failure(s)`);

if (hardFailures > 0) {
  console.log(`\n${RED}doctor: FAILED${RESET} — resolve the failures above.`);
  process.exit(1);
}
console.log(`\n${GREEN}doctor: OK${RESET} — environment and safety defaults verified.`);
process.exit(0);
