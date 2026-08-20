import type { WriteWindowState } from './types';

/**
 * Bounded Write Window (SPRINT 014, Phase H) — pure state + validators.
 *
 * A production submit may only be attempted while a Write Window is OPEN. The
 * default is CLOSED. Opening requires a full, explicit checklist. A window
 * auto-closes at expiry; expiry NEVER auto-retries or submits anything, and
 * opening a window NEVER turns the global kill switch off (that is a separate,
 * explicit safety control). LOCKDOWN halts all Facebook operations.
 */

export interface OpenWindowRequest {
  operatorEmail: string;
  reason: string;
  actionJobId: string;
  targetPostKey: string;
  /** Requested window length in seconds (clamped to the Level-1 maximum). */
  requestedSeconds: number;
  killSwitchAcknowledged: boolean;
}

/** Live pre-conditions the caller must supply (all must hold to open). */
export interface OpenWindowContext {
  isOperator: boolean;
  freshBackupPresent: boolean;
  backupAgeSeconds: number | null;
  healthOk: boolean;
  prepareOnlyPass: boolean;
  duplicateCommentExists: boolean;
  ambiguousExecutionPending: boolean;
  maxWindowSeconds: number;
  /** Freshest acceptable backup age (seconds) for opening a window. */
  maxBackupAgeSeconds: number;
}

export interface WriteWindow {
  state: WriteWindowState;
  operatorEmail: string;
  reason: string;
  actionJobId: string;
  targetPostKey: string;
  openedAtMs: number;
  expiresAtMs: number;
}

export interface OpenWindowResult {
  ok: boolean;
  window: WriteWindow | null;
  blockers: string[];
}

/** Validate + build an OPEN window, or refuse with blockers. Never enables flags. */
export function openWriteWindow(
  req: OpenWindowRequest,
  ctx: OpenWindowContext,
  nowMs: number,
): OpenWindowResult {
  const blockers: string[] = [];
  if (!ctx.isOperator) blockers.push('caller is not a recognized operator');
  if (!req.operatorEmail?.trim()) blockers.push('operator identity required');
  if (!req.reason?.trim()) blockers.push('reason required');
  if (!isUuid(req.actionJobId)) blockers.push('exact Action Job ID required');
  if (!req.targetPostKey?.trim()) blockers.push('exact target_post_key required');
  if (!(req.requestedSeconds > 0)) blockers.push('expiration (window length) required');
  if (!req.killSwitchAcknowledged) blockers.push('kill-switch acknowledgement required');
  if (!ctx.freshBackupPresent) blockers.push('a fresh verified backup is required');
  else if (ctx.backupAgeSeconds == null || ctx.backupAgeSeconds > ctx.maxBackupAgeSeconds)
    blockers.push('backup is not fresh enough');
  if (!ctx.healthOk) blockers.push('health must be OK');
  if (!ctx.prepareOnlyPass) blockers.push('prepare_only must PASS immediately before opening');
  if (ctx.duplicateCommentExists) blockers.push('a duplicate matching comment already exists');
  if (ctx.ambiguousExecutionPending) blockers.push('an ambiguous execution is pending recovery');

  if (blockers.length > 0) return { ok: false, window: null, blockers };

  const seconds = Math.min(req.requestedSeconds, ctx.maxWindowSeconds);
  return {
    ok: true,
    blockers: [],
    window: {
      state: 'OPEN',
      operatorEmail: req.operatorEmail,
      reason: req.reason,
      actionJobId: req.actionJobId,
      targetPostKey: req.targetPostKey,
      openedAtMs: nowMs,
      expiresAtMs: nowMs + seconds * 1000,
    },
  };
}

/** True once the window has passed its expiry. */
export function isWindowExpired(w: WriteWindow, nowMs: number): boolean {
  return nowMs >= w.expiresAtMs;
}

/**
 * The EFFECTIVE state right now. An OPEN window past expiry is CLOSED. Expiry
 * only DISABLES execution — it never triggers a retry or a submit. LOCKDOWN is
 * sticky and is never auto-cleared.
 */
export function effectiveWindowState(w: WriteWindow | null, nowMs: number): WriteWindowState {
  if (!w) return 'CLOSED';
  if (w.state === 'LOCKDOWN') return 'LOCKDOWN';
  if (w.state === 'OPEN' && !isWindowExpired(w, nowMs)) return 'OPEN';
  return 'CLOSED';
}

/** Explicit operator close (idempotent). */
export function closeWriteWindow(w: WriteWindow): WriteWindow {
  return { ...w, state: 'CLOSED' };
}

/** Enter LOCKDOWN (checkpoint/CAPTCHA/restriction). Halts Facebook ops. */
export function enterLockdown(w: WriteWindow | null): WriteWindow {
  const base: WriteWindow = w ?? {
    state: 'LOCKDOWN',
    operatorEmail: '',
    reason: 'lockdown',
    actionJobId: '',
    targetPostKey: '',
    openedAtMs: 0,
    expiresAtMs: 0,
  };
  return { ...base, state: 'LOCKDOWN' };
}

function isUuid(s: string | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
