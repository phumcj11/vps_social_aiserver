import { describe, expect, it } from 'vitest';
import {
  openWriteWindow,
  effectiveWindowState,
  isWindowExpired,
  closeWriteWindow,
  enterLockdown,
  type OpenWindowRequest,
  type OpenWindowContext,
} from './write-window';

const JOB = '2a85a0dd-0681-4009-8328-e0a40f084cb8';
const NOW = 1_000_000_000_000;

const req: OpenWindowRequest = {
  operatorEmail: 'op@example.com',
  reason: 'supervised level-1 pilot write',
  actionJobId: JOB,
  targetPostKey: '0cc27c45',
  requestedSeconds: 300,
  killSwitchAcknowledged: true,
};
const ctx: OpenWindowContext = {
  isOperator: true,
  freshBackupPresent: true,
  backupAgeSeconds: 60,
  healthOk: true,
  prepareOnlyPass: true,
  duplicateCommentExists: false,
  ambiguousExecutionPending: false,
  maxWindowSeconds: 300,
  maxBackupAgeSeconds: 3600,
};

describe('write window default + open checklist', () => {
  it('effective state is CLOSED by default (no window)', () => {
    expect(effectiveWindowState(null, NOW)).toBe('CLOSED');
  });

  it('opens when the full checklist is satisfied', () => {
    const r = openWriteWindow(req, ctx, NOW);
    expect(r.ok).toBe(true);
    expect(r.window?.state).toBe('OPEN');
    expect(effectiveWindowState(r.window, NOW)).toBe('OPEN');
  });

  it('clamps the window to the Level-1 maximum', () => {
    const r = openWriteWindow({ ...req, requestedSeconds: 9999 }, ctx, NOW);
    expect(r.window!.expiresAtMs).toBe(NOW + 300 * 1000);
  });

  const refusals: Array<[string, Partial<OpenWindowRequest>, Partial<OpenWindowContext>, RegExp]> =
    [
      ['non-operator', {}, { isOperator: false }, /not a recognized operator/i],
      ['no reason', { reason: '' }, {}, /reason required/i],
      ['bad job id', { actionJobId: 'nope' }, {}, /Action Job ID/i],
      ['no target key', { targetPostKey: '' }, {}, /target_post_key/i],
      ['no kill-switch ack', { killSwitchAcknowledged: false }, {}, /kill-switch/i],
      ['no fresh backup', {}, { freshBackupPresent: false }, /fresh verified backup/i],
      ['stale backup', {}, { backupAgeSeconds: 999999 }, /fresh enough/i],
      ['health not ok', {}, { healthOk: false }, /health/i],
      ['prepare_only not pass', {}, { prepareOnlyPass: false }, /prepare_only/i],
      ['duplicate exists', {}, { duplicateCommentExists: true }, /duplicate/i],
      ['ambiguous pending', {}, { ambiguousExecutionPending: true }, /ambiguous/i],
    ];
  for (const [label, ro, co, rx] of refusals) {
    it(`refuses to open: ${label}`, () => {
      const r = openWriteWindow({ ...req, ...ro }, { ...ctx, ...co }, NOW);
      expect(r.ok).toBe(false);
      expect(r.window).toBeNull();
      expect(r.blockers.join(' ')).toMatch(rx);
    });
  }
});

describe('write window expiry + lockdown', () => {
  it('auto-closes at expiry (CLOSED), never retries/submits', () => {
    const w = openWriteWindow(req, ctx, NOW).window!;
    expect(isWindowExpired(w, NOW + 299_000)).toBe(false);
    expect(effectiveWindowState(w, NOW + 299_000)).toBe('OPEN');
    expect(isWindowExpired(w, NOW + 300_000)).toBe(true);
    expect(effectiveWindowState(w, NOW + 300_000)).toBe('CLOSED');
  });

  it('explicit close yields CLOSED', () => {
    const w = openWriteWindow(req, ctx, NOW).window!;
    expect(closeWriteWindow(w).state).toBe('CLOSED');
  });

  it('lockdown is sticky and overrides OPEN', () => {
    const w = openWriteWindow(req, ctx, NOW).window!;
    const locked = enterLockdown(w);
    expect(locked.state).toBe('LOCKDOWN');
    expect(effectiveWindowState(locked, NOW)).toBe('LOCKDOWN');
  });
});
