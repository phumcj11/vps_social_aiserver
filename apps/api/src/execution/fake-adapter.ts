import { createHash } from 'node:crypto';
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
import { buildEvidenceStorageKey } from './evidence-storage';

/**
 * Deterministic scenarios the fake adapter can reproduce. These map 1:1 to the
 * execution outcomes the engine must handle safely — success, every pre-submit
 * abort, and every unknown/interrupt path. NO network, NO Playwright, NO real
 * Facebook — this is the ONLY adapter used by tests and runtime verification.
 */
export type FakeScenario =
  | 'verified_success'
  | 'target_unverified'
  | 'target_mismatch'
  | 'typed_content_mismatch'
  | 'submit_failed'
  | 'submit_ambiguous'
  | 'comment_not_found'
  | 'verification_content_mismatch'
  | 'comment_id_missing'
  | 'checkpoint_required'
  | 'session_expired'
  | 'account_restricted'
  | 'captcha';

/** Prefix a caller can embed to pick a scenario (dry-run/testing only). */
const SCENARIO_PREFIX = '[[scenario:';

/** Extract an inline scenario override from approved content, if present. */
export function parseInlineScenario(content: string): FakeScenario | null {
  if (!content.startsWith(SCENARIO_PREFIX)) return null;
  const end = content.indexOf(']]');
  if (end < 0) return null;
  const name = content.slice(SCENARIO_PREFIX.length, end).trim();
  return isFakeScenario(name) ? name : null;
}

function isFakeScenario(v: string): v is FakeScenario {
  return [
    'verified_success',
    'target_unverified',
    'target_mismatch',
    'typed_content_mismatch',
    'submit_failed',
    'submit_ambiguous',
    'comment_not_found',
    'verification_content_mismatch',
    'comment_id_missing',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
    'captcha',
  ].includes(v);
}

function fakeCommentId(ctx: ExecutionContext): string {
  return createHash('sha256')
    .update(`${ctx.targetPostKey}:${ctx.sessionId}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * FakeFacebookCommentAdapter (SPRINT 012).
 *
 * A fully deterministic stand-in for the real adapter. It never opens a browser,
 * never makes a network call, and never touches Facebook. Given a scenario, it
 * returns the exact observations that scenario implies, so the executor,
 * verification service, and recovery policy can be exercised end-to-end with
 * zero risk of a real write. The default scenario is a verified success.
 */
export class FakeFacebookCommentAdapter implements FacebookCommentAdapter {
  readonly name = 'fake' as const;
  private readonly scenario: FakeScenario;

  constructor(scenario: FakeScenario = 'verified_success') {
    this.scenario = scenario;
  }

  private effectiveScenario(ctx: ExecutionContext): FakeScenario {
    return parseInlineScenario(ctx.approvedContent) ?? this.scenario;
  }

  /** The content minus any inline scenario marker (what would really be typed). */
  private realContent(ctx: ExecutionContext): string {
    const s = ctx.approvedContent;
    if (!s.startsWith(SCENARIO_PREFIX)) return s;
    const end = s.indexOf(']]');
    return end < 0 ? s : s.slice(end + 2);
  }

  async verifyTarget(ctx: ExecutionContext): Promise<TargetVerification> {
    const scenario = this.effectiveScenario(ctx);
    if (scenario === 'target_unverified') {
      return { ok: false, observedPostUrl: null, observedPostKey: null, reason: 'Post not found' };
    }
    if (scenario === 'target_mismatch') {
      return {
        ok: true,
        observedPostUrl: ctx.targetUrl,
        observedPostKey: `${ctx.targetPostKey}-different`,
        reason: 'Observed a different post than intended',
      };
    }
    return { ok: true, observedPostUrl: ctx.targetUrl, observedPostKey: ctx.targetPostKey };
  }

  async prepareComment(ctx: ExecutionContext): Promise<PreparedComment> {
    const scenario = this.effectiveScenario(ctx);
    if (scenario === 'typed_content_mismatch') {
      return { ok: true, typedContent: `${this.realContent(ctx)} (corrupted)` };
    }
    return { ok: true, typedContent: this.realContent(ctx) };
  }

  async verifyTypedContent(ctx: ExecutionContext): Promise<TypedContentObservation> {
    const scenario = this.effectiveScenario(ctx);
    if (scenario === 'typed_content_mismatch') {
      return { typedContent: `${this.realContent(ctx)} (corrupted)` };
    }
    // Read-back exactly equals the approved content on every safe path.
    return { typedContent: this.realContent(ctx) };
  }

  async submitComment(ctx: ExecutionContext): Promise<SubmitOutcome> {
    const scenario = this.effectiveScenario(ctx);
    switch (scenario) {
      case 'submit_failed':
        return { status: 'failed', reason: 'Composer rejected the submit' };
      case 'submit_ambiguous':
        return { status: 'ambiguous', reason: 'Navigation lost after clicking submit' };
      case 'checkpoint_required':
        return {
          status: 'ambiguous',
          reason: 'Checkpoint interstitial',
          interrupt: 'checkpoint_required',
        };
      case 'session_expired':
        return { status: 'ambiguous', reason: 'Session expired', interrupt: 'session_expired' };
      case 'account_restricted':
        return {
          status: 'ambiguous',
          reason: 'Account restricted',
          interrupt: 'account_restricted',
        };
      case 'captcha':
        return { status: 'ambiguous', reason: 'CAPTCHA presented', interrupt: 'captcha' };
      default:
        return { status: 'submitted' };
    }
  }

  async verifySubmittedComment(ctx: ExecutionContext): Promise<SubmittedCommentObservation> {
    const scenario = this.effectiveScenario(ctx);
    if (scenario === 'comment_not_found') {
      return {
        found: false,
        facebookCommentId: null,
        observedContent: null,
        observedAuthor: null,
        observedPostUrl: ctx.targetUrl,
        reason: 'Comment not present on the post after submit',
      };
    }
    if (scenario === 'comment_id_missing') {
      return {
        found: true,
        facebookCommentId: null,
        observedContent: this.realContent(ctx),
        observedAuthor: 'Test Page',
        observedPostUrl: ctx.targetUrl,
      };
    }
    if (scenario === 'verification_content_mismatch') {
      return {
        found: true,
        facebookCommentId: fakeCommentId(ctx),
        observedContent: `${this.realContent(ctx)} (altered)`,
        observedAuthor: 'Test Page',
        observedPostUrl: ctx.targetUrl,
      };
    }
    return {
      found: true,
      facebookCommentId: fakeCommentId(ctx),
      observedContent: this.realContent(ctx),
      observedAuthor: 'Test Page',
      observedPostUrl: ctx.targetUrl,
    };
  }

  async captureEvidence(
    ctx: ExecutionContext,
    evidenceType: EvidenceType,
  ): Promise<EvidenceCapture> {
    // Synthetic evidence only — no real screenshot bytes are produced.
    const { storageKey, evidenceHash } = buildEvidenceStorageKey({
      workspaceId: ctx.workspaceId,
      actionJobId: ctx.actionJobId,
      sessionId: ctx.sessionId,
      label: evidenceType,
    });
    return {
      evidenceType,
      storageKey,
      evidenceHash,
      metadata: { synthetic: true, adapter: 'fake' },
    };
  }

  async close(): Promise<void> {
    // Nothing to clean up — no browser, no network.
  }
}
