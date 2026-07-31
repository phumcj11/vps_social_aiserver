import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail tests for the technical-bootstrap sprint.
 *
 * These assert that the example environment ships in its SAFE state: every
 * Facebook action disabled, human approval required, the global kill switch on,
 * concurrency pinned to 1, and external integrations off. If a future change
 * weakens a default, these tests fail loudly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

function parseEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

const env = parseEnv(readFileSync(resolve(repoRoot, '.env.example'), 'utf8'));

describe('.env.example safety defaults', () => {
  it('disables every Facebook action by default', () => {
    expect(env.FACEBOOK_READER_ENABLED).toBe('false');
    expect(env.FACEBOOK_COMMENT_ENABLED).toBe('false');
    expect(env.FACEBOOK_WRITE_ACTION_ENABLED).toBe('false');
    expect(env.FACEBOOK_LOGIN_ENABLED).toBe('false');
  });

  it('requires human approval and keeps the global kill switch on', () => {
    expect(env.COMMENT_APPROVAL_REQUIRED).toBe('true');
    expect(env.GLOBAL_KILL_SWITCH).toBe('true');
  });

  it('pins all concurrency to 1 for the small VPS', () => {
    expect(env.PLAYWRIGHT_CONCURRENCY).toBe('1');
    expect(env.SCANNER_CONCURRENCY).toBe('1');
    expect(env.COMMENT_CONCURRENCY).toBe('1');
  });

  it('keeps external integrations disabled', () => {
    expect(env.AI_ENABLED).toBe('false');
    expect(env.TELEGRAM_ENABLED).toBe('false');
    expect(env.N8N_ENABLED).toBe('false');
  });
});
