import type { ExecutionSessionRecord, ExecutionSessionStatus } from '../store/types';

/**
 * ExecutionRecoveryPolicy (SPRINT 012) — PURE and DETERMINISTIC.
 *
 * Classifies a NON-successful terminal session into a recovery disposition. The
 * cardinal rule: an AMBIGUOUS outcome is NEVER a safe retry — we cannot prove a
 * comment was not already posted, so retrying risks a duplicate. Platform
 * interrupts (checkpoint, expired session, account restriction, captcha) always
 * require a human; they are never bypassed or auto-retried.
 *
 * SAFE_RETRY is reserved for deterministic failures that provably occurred
 * BEFORE any submit (target/typed-content mismatch, preflight failure), where no
 * write could have happened. Even then this policy only CLASSIFIES — it never
 * executes a retry itself, and auto-retry stays disabled by configuration.
 */
export type RecoveryDisposition = 'SAFE_RETRY' | 'NO_RETRY' | 'MANUAL_INVESTIGATION';

export interface RecoveryClassification {
  disposition: RecoveryDisposition;
  reasonCode: string;
  reasonDetail: string;
  /** True only when a human MUST act before anything else can happen. */
  requiresHuman: boolean;
}

/** Reason codes produced before any submit — no write could have occurred. */
const PRE_SUBMIT_FAILURE_CODES = new Set([
  'TARGET_UNVERIFIED',
  'TARGET_MISMATCH',
  'TYPED_CONTENT_MISMATCH',
  'PREFLIGHT_FAILED',
  'SUBMIT_FAILED', // adapter is certain the submit click did not go through
]);

export class ExecutionRecoveryPolicy {
  classify(session: ExecutionSessionRecord): RecoveryClassification {
    const status: ExecutionSessionStatus = session.status;
    const code = session.errorCode ?? '';

    switch (status) {
      case 'verified':
        return no('ALREADY_VERIFIED', 'Session already succeeded; nothing to recover');

      case 'cancelled':
        return no('CANCELLED', 'Session was cancelled');

      case 'ambiguous':
        // The defining case: outcome unknown → a human must confirm on Facebook
        // whether the comment exists before anything else. NEVER auto-retry.
        return manual(
          'AMBIGUOUS_OUTCOME',
          'Outcome could not be determined; a human must verify on Facebook before any retry',
        );

      case 'checkpoint_required':
        return manual('CHECKPOINT_REQUIRED', 'Facebook checkpoint requires manual resolution');
      case 'session_expired':
        return manual('SESSION_EXPIRED', 'Login session expired; manual re-connection required');
      case 'account_restricted':
        return manual('ACCOUNT_RESTRICTED', 'Account is restricted; manual review required');

      case 'failed':
        if (PRE_SUBMIT_FAILURE_CODES.has(code)) {
          return {
            disposition: 'SAFE_RETRY',
            reasonCode: code || 'PRE_SUBMIT_FAILURE',
            reasonDetail: 'Deterministic failure before submit; no write occurred',
            requiresHuman: false,
          };
        }
        // Any failure we cannot prove happened before a write is treated as
        // needing human eyes — we do not risk a blind retry.
        return manual(
          code || 'UNCLASSIFIED_FAILURE',
          'Failure could not be proven pre-submit; manual investigation required',
        );

      default:
        // Non-terminal states are not recoverable — the session is still live.
        return {
          disposition: 'NO_RETRY',
          reasonCode: 'SESSION_ACTIVE',
          reasonDetail: `Session is still ${status}; not eligible for recovery`,
          requiresHuman: false,
        };
    }
  }
}

function no(code: string, detail: string): RecoveryClassification {
  return { disposition: 'NO_RETRY', reasonCode: code, reasonDetail: detail, requiresHuman: false };
}
function manual(code: string, detail: string): RecoveryClassification {
  return {
    disposition: 'MANUAL_INVESTIGATION',
    reasonCode: code,
    reasonDetail: detail,
    requiresHuman: true,
  };
}
