import type { ApiEnv } from '../lib/env';
import type { EvidenceType } from '../store/types';
import type {
  FacebookCommentAdapter,
  ExecutionContext,
  TargetVerification,
  PreparedComment,
  TypedContentObservation,
  SubmitOutcome,
  SubmittedCommentObservation,
  EvidenceCapture,
} from './types';
import { ExecutionError, ExecutionErrorCode } from './errors';

/**
 * The five independent enablement flags a real Facebook comment write would
 * require, ALL of which must be intentionally set. Any one in its safe state
 * means execution is refused. These are checked here as the boundary's own gate,
 * in addition to the executor's kill-switch check.
 */
export function playwrightGateBlockers(env: ApiEnv): string[] {
  const blockers: string[] = [];
  if (!env.ACTION_ENGINE_ENABLED) blockers.push('ACTION_ENGINE_ENABLED must be true');
  if (!env.FACEBOOK_WRITE_ACTION_ENABLED)
    blockers.push('FACEBOOK_WRITE_ACTION_ENABLED must be true');
  if (!env.FACEBOOK_COMMENT_ENABLED) blockers.push('FACEBOOK_COMMENT_ENABLED must be true');
  if (env.GLOBAL_KILL_SWITCH) blockers.push('GLOBAL_KILL_SWITCH must be false');
  if (env.FACEBOOK_COMMENT_ADAPTER !== 'playwright') {
    blockers.push('FACEBOOK_COMMENT_ADAPTER must be playwright');
  }
  return blockers;
}

/**
 * PlaywrightFacebookCommentAdapter (SPRINT 012) — DISABLED BOUNDARY.
 *
 * This is the STRUCTURAL seam where a real Playwright-driven Facebook comment
 * write would eventually live. It is intentionally NON-FUNCTIONAL this sprint:
 * every method refuses. Two layers of refusal:
 *
 *   1. If the five enablement flags are not ALL set, it refuses with
 *      ADAPTER_DISABLED (the normal, expected state).
 *   2. Even if every flag were set, it STILL refuses with REAL_WRITE_FORBIDDEN —
 *      no real Facebook write is permitted to ship in this sprint. Enabling real
 *      execution is a separate, deliberate future change, not a config flip.
 *
 * It opens no browser, launches no Chromium, and makes no network call.
 */
export class PlaywrightFacebookCommentAdapter implements FacebookCommentAdapter {
  readonly name = 'playwright' as const;

  constructor(private readonly env: ApiEnv) {}

  private refuse(): never {
    const blockers = playwrightGateBlockers(this.env);
    if (blockers.length > 0) {
      throw new ExecutionError(
        ExecutionErrorCode.ADAPTER_DISABLED,
        `Playwright comment adapter is disabled: ${blockers.join('; ')}`,
        { blockers },
      );
    }
    // Hard stop: real execution is not shipped this sprint even when fully flagged.
    throw new ExecutionError(
      ExecutionErrorCode.REAL_WRITE_FORBIDDEN,
      'Real Facebook comment execution is not enabled in this build',
    );
  }

  async verifyTarget(_ctx: ExecutionContext): Promise<TargetVerification> {
    this.refuse();
  }
  async prepareComment(_ctx: ExecutionContext): Promise<PreparedComment> {
    this.refuse();
  }
  async verifyTypedContent(_ctx: ExecutionContext): Promise<TypedContentObservation> {
    this.refuse();
  }
  async submitComment(_ctx: ExecutionContext): Promise<SubmitOutcome> {
    this.refuse();
  }
  async verifySubmittedComment(_ctx: ExecutionContext): Promise<SubmittedCommentObservation> {
    this.refuse();
  }
  async captureEvidence(
    _ctx: ExecutionContext,
    _evidenceType: EvidenceType,
  ): Promise<EvidenceCapture> {
    this.refuse();
  }
  async close(): Promise<void> {
    // No resources are ever acquired.
  }
}
