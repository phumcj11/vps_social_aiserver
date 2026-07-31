import type { ActionIntent, ActionPolicyResult, ActionSafetyState, PolicyReason } from './types';

/**
 * ActionPolicyGuard (SPRINT 011) — PURE and DETERMINISTIC.
 *
 * Decides whether an Action intent may become a job and in which safe state:
 *   - **REJECT** — a hard failure; NO job may be created (unsupported type,
 *     empty/over-long content, unsafe URL, duplicate active job).
 *   - **BLOCK** — a safety gate is closed; the job is created `blocked` and
 *     NEVER executes (engine disabled, Facebook writes off, or kill switch on).
 *   - **ALLOW** — all clear; the job may be `queued`.
 *
 * Because execution is disabled by default (engine off, writes off, kill switch
 * on), the guard returns BLOCK under current defaults — a job is never queued
 * for execution this sprint. The guard performs no I/O and never executes.
 */
const FACEBOOK_POST_URL_RE = /^https:\/\/(?:www\.|m\.|web\.|mbasic\.)?facebook\.com\/[^\s]+$/i;

export function evaluateActionPolicy(
  intent: ActionIntent,
  safety: ActionSafetyState,
  ctx: { isDuplicate: boolean },
): ActionPolicyResult {
  const reject: PolicyReason[] = [];
  const block: PolicyReason[] = [];

  // ── REJECT-level (no job created) ────────────────────────────────────────
  if (!safety.allowedTypes.includes(intent.actionType)) {
    reject.push({
      code: 'UNSUPPORTED_TYPE',
      detail: `Action type "${intent.actionType}" is not allowed`,
    });
  }
  const content = intent.approvedContent.trim();
  if (content.length === 0) {
    reject.push({ code: 'MISSING_CONTENT', detail: 'Approved content is empty' });
  }
  if (content.length > safety.maxContentLength) {
    reject.push({
      code: 'CONTENT_TOO_LONG',
      detail: `Content is ${content.length} chars (max ${safety.maxContentLength})`,
    });
  }
  if (!FACEBOOK_POST_URL_RE.test(intent.targetUrl)) {
    reject.push({
      code: 'UNSAFE_TARGET_URL',
      detail: 'Target URL is not a supported Facebook post URL',
    });
  }
  if (ctx.isDuplicate) {
    reject.push({
      code: 'DUPLICATE_ACTIVE_JOB',
      detail: 'An active Action Job already exists for this review and type',
    });
  }

  // ── BLOCK-level (job created, but blocked and never executed) ────────────
  if (!safety.actionEngineEnabled) {
    block.push({
      code: 'ENGINE_DISABLED',
      detail: 'Action engine is disabled (ACTION_ENGINE_ENABLED=false)',
    });
  }
  if (!safety.facebookWriteEnabled) {
    block.push({ code: 'WRITE_DISABLED', detail: 'Facebook write actions are disabled' });
  }
  if (safety.killSwitchOn) {
    block.push({ code: 'KILL_SWITCH_ON', detail: 'Global kill switch is on' });
  }

  if (reject.length > 0) return { outcome: 'REJECT', reasons: reject };
  if (block.length > 0) return { outcome: 'BLOCK', reasons: block };
  return { outcome: 'ALLOW', reasons: [] };
}
