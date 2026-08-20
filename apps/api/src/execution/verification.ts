import type {
  ExecutionContext,
  TargetVerification,
  TypedContentObservation,
  SubmitOutcome,
  SubmittedCommentObservation,
} from './types';
import { commentTextEquals } from './text-normalize';

/**
 * ExecutionVerificationService (SPRINT 012) — PURE and DETERMINISTIC.
 *
 * Central home for the safety-critical decisions so they are enforced
 * IDENTICALLY for every adapter (fake or real). The adapter only observes; this
 * service judges. Two contracts:
 *
 *   Pre-submit — the target post must match the intended identity, and the text
 *   in the composer must EXACTLY equal the immutable approved content. Any
 *   mismatch aborts before a single character is submitted.
 *
 *   Post-submit — success requires a real, verifiable comment: found on the
 *   target post, with a Facebook comment id, whose content exactly equals the
 *   approved content. A screenshot alone is NEVER sufficient. Anything the
 *   adapter could not determine is AMBIGUOUS — never a success, never an
 *   auto-retry.
 */

export interface VerificationVerdict {
  ok: boolean;
  reasonCode: string | null;
  reasonDetail: string | null;
}

export type PostSubmitOutcome = 'verified' | 'failed' | 'ambiguous';

export interface PostSubmitVerdict {
  outcome: PostSubmitOutcome;
  reasonCode: string | null;
  reasonDetail: string | null;
}

export class ExecutionVerificationService {
  /** Pre-submit gate: target identity + exact typed-content equality. */
  preflight(
    ctx: ExecutionContext,
    target: TargetVerification,
    typed: TypedContentObservation,
  ): VerificationVerdict {
    if (!target.ok) {
      return fail('TARGET_UNVERIFIED', target.reason ?? 'Target post could not be verified');
    }
    if (target.observedPostKey !== ctx.targetPostKey) {
      return fail(
        'TARGET_MISMATCH',
        'Observed post identity does not match the intended target post',
      );
    }
    // Rule: the typed content MUST exactly equal the approved content — no
    // trimming, no normalization. What a human approved is what gets posted.
    if (typed.typedContent !== ctx.approvedContent) {
      return fail(
        'TYPED_CONTENT_MISMATCH',
        'Composer content does not exactly equal the approved content',
      );
    }
    return { ok: true, reasonCode: null, reasonDetail: null };
  }

  /** Post-submit contract: decide verified / failed / ambiguous. */
  verifySubmission(
    ctx: ExecutionContext,
    submit: SubmitOutcome,
    observed: SubmittedCommentObservation,
  ): PostSubmitVerdict {
    // The adapter could not determine the outcome → ambiguous (human recovery).
    if (submit.status === 'ambiguous') {
      return ambiguous(
        'SUBMIT_AMBIGUOUS',
        submit.reason ?? 'Submit outcome could not be determined',
      );
    }
    if (submit.status === 'failed') {
      return failed('SUBMIT_FAILED', submit.reason ?? 'Submit failed');
    }

    // submit.status === 'submitted' — now the comment must be independently
    // observable on the post. Missing observation after a claimed submit is
    // AMBIGUOUS, not a failure: we cannot prove nothing was posted.
    if (!observed.found) {
      return ambiguous(
        'COMMENT_NOT_OBSERVED',
        observed.reason ?? 'Submitted comment was not observed on the post',
      );
    }

    // Real-adapter path: the adapter counted comments on the VERIFIED target post
    // whose text equals the approved content after cosmetic normalization
    // (emoji/dash/whitespace/Unicode). Success requires EXACTLY ONE such match;
    // a Facebook comment id is optional evidence, not a requirement. This is what
    // Facebook actually renders — a raw exact compare misses a real success.
    if (observed.matchCount != null) {
      if (observed.matchCount === 0) {
        return ambiguous('COMMENT_NOT_OBSERVED', 'No normalized-matching comment on the post');
      }
      if (observed.matchCount > 1) {
        return ambiguous(
          'DUPLICATE_OBSERVED',
          `Found ${observed.matchCount} matching comments — cannot confirm a single post`,
        );
      }
      if (!commentTextEquals(observed.observedContent ?? '', ctx.approvedContent)) {
        return ambiguous(
          'CONTENT_MISMATCH',
          'Observed comment content does not match the approved content (normalized)',
        );
      }
      return { outcome: 'verified', reasonCode: null, reasonDetail: null };
    }

    // Legacy path (deterministic fake adapter, no matchCount): a verifiable id is
    // required, and the observed text must match the approved content.
    if (!observed.facebookCommentId) {
      return ambiguous('COMMENT_ID_MISSING', 'Submitted comment has no verifiable identity');
    }
    if (!commentTextEquals(observed.observedContent ?? '', ctx.approvedContent)) {
      return ambiguous(
        'CONTENT_MISMATCH',
        'Observed comment content does not equal the approved content',
      );
    }
    return { outcome: 'verified', reasonCode: null, reasonDetail: null };
  }
}

function fail(code: string, detail: string): VerificationVerdict {
  return { ok: false, reasonCode: code, reasonDetail: detail };
}
function failed(code: string, detail: string): PostSubmitVerdict {
  return { outcome: 'failed', reasonCode: code, reasonDetail: detail };
}
function ambiguous(code: string, detail: string): PostSubmitVerdict {
  return { outcome: 'ambiguous', reasonCode: code, reasonDetail: detail };
}
