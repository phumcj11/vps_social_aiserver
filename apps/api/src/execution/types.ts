/**
 * Facebook Comment execution types (SPRINT 012).
 *
 * A NARROW boundary between an approved Action Job and a single Facebook comment
 * write. This is deliberately NOT a generic Platform Adapter Framework — it
 * models exactly one platform (Facebook) and exactly one action (comment). A
 * second real platform is the trigger to generalize, per the Architecture
 * Review, and not before.
 *
 * NOTHING here performs a real Facebook write this sprint. The default adapter
 * is the deterministic FakeFacebookCommentAdapter; the real Playwright adapter
 * is a disabled boundary that refuses to run.
 */

import type { EvidenceType, ExecutionAdapterName } from '../store/types';

export type { ExecutionAdapterName };

/**
 * The immutable, credential-free inputs one execution attempt operates on.
 * Built by the executor from the Action Job — the adapter receives ONLY this.
 * It carries NO Facebook credentials, NO cookies, NO browser profile secrets.
 */
export interface ExecutionContext {
  workspaceId: string;
  actionJobId: string;
  sessionId: string;
  attemptNumber: number;
  /** Canonical Facebook post URL (already strictly parsed). */
  targetUrl: string;
  /** Deterministic identity of the target post. */
  targetPostKey: string;
  /** The exact, immutable approved content that must be posted verbatim. */
  approvedContent: string;
  /** Adapter in use for this attempt. */
  adapter: ExecutionAdapterName;
}

/** Result of confirming the target post exists and matches the intended identity. */
export interface TargetVerification {
  ok: boolean;
  observedPostUrl: string | null;
  /** Deterministic identity observed on-page, compared to targetPostKey. */
  observedPostKey: string | null;
  reason?: string;
}

/** Result of focusing the composer and typing (NOT submitting) the content. */
export interface PreparedComment {
  ok: boolean;
  /** What the adapter actually typed into the composer. */
  typedContent: string;
  reason?: string;
}

/** Read-back of the composer contents, for the exact-equality safety check. */
export interface TypedContentObservation {
  /** Exactly what is currently in the composer, read back from the page. */
  typedContent: string;
}

/**
 * Outcome of clicking submit. `ambiguous` means the adapter could NOT determine
 * whether the comment was posted (timeout, navigation lost, crash) — it is
 * NEVER retried blindly; it routes to human recovery.
 */
export type SubmitStatus = 'submitted' | 'ambiguous' | 'failed';

export interface SubmitOutcome {
  status: SubmitStatus;
  reason?: string;
  /**
   * Interrupt classification when the platform blocked us mid-flow. These pause
   * for human recovery and NEVER auto-retry.
   */
  interrupt?: ExecutionInterrupt;
}

export type ExecutionInterrupt =
  'checkpoint_required' | 'session_expired' | 'account_restricted' | 'captcha';

/**
 * Observation of the posted comment after submit. The verification service —
 * not the adapter — decides whether this counts as a verified success.
 */
export interface SubmittedCommentObservation {
  found: boolean;
  facebookCommentId: string | null;
  observedContent: string | null;
  observedAuthor: string | null;
  observedPostUrl: string | null;
  /**
   * Number of comments on the verified target post whose text equals the
   * approved content AFTER cosmetic normalization. Exactly one → a verified
   * match; more than one → ambiguous (duplicate); zero → not observed. When a
   * real adapter provides this, the verifier uses normalized matching and does
   * NOT require a Facebook comment id. Optional so the deterministic fake
   * adapter keeps its id-required legacy semantics.
   */
  matchCount?: number;
  /** SHA-256 of the normalized observed content, for evidence. */
  normalizedHash?: string | null;
  reason?: string;
}

/** A captured piece of evidence (screenshot/snapshot). Storage key, never a path. */
export interface EvidenceCapture {
  evidenceType: EvidenceType;
  /** Opaque storage key (relative), NOT an absolute filesystem path. */
  storageKey: string | null;
  /** SHA-256 of the evidence bytes, when applicable. */
  evidenceHash: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * The narrow Facebook Comment adapter contract. Implementations:
 *   - FakeFacebookCommentAdapter (default; deterministic; no network)
 *   - PlaywrightFacebookCommentAdapter (disabled boundary; refuses to run)
 *
 * The adapter only OBSERVES and ACTS on the page; it never decides success.
 * All safety decisions (exact-equality, verified-success) live in the
 * verification service so they are enforced identically for every adapter.
 */
export interface FacebookCommentAdapter {
  readonly name: ExecutionAdapterName;
  verifyTarget(ctx: ExecutionContext): Promise<TargetVerification>;
  prepareComment(ctx: ExecutionContext): Promise<PreparedComment>;
  verifyTypedContent(ctx: ExecutionContext): Promise<TypedContentObservation>;
  submitComment(ctx: ExecutionContext): Promise<SubmitOutcome>;
  verifySubmittedComment(ctx: ExecutionContext): Promise<SubmittedCommentObservation>;
  captureEvidence(ctx: ExecutionContext, evidenceType: EvidenceType): Promise<EvidenceCapture>;
  close(): Promise<void>;
}

/** Final classification of one execution attempt. */
export type ExecutionResultStatus =
  | 'verified' // post-submit verification passed — the ONLY success
  | 'failed' // deterministic failure before/at submit
  | 'ambiguous' // outcome unknown — human recovery, never auto-retry
  | 'blocked'; // safety gate refused execution (kill switch / flags)

export interface ExecutionResult {
  status: ExecutionResultStatus;
  sessionId: string;
  actionJobId: string;
  facebookCommentId: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
}
