/**
 * Opportunity Classification types (SPRINT 007).
 *
 * The Classifier decides deterministically whether a Signal should become an
 * Opportunity. NO AI, NO ML, NO embeddings, NO vector search, NO confidence,
 * NO score. It knows nothing about Business, Telegram, comments, or matching.
 */

export type OpportunityDecision = 'ACCEPT' | 'REJECT';

/** Reason codes emitted by the classifier for each evaluated rule. */
export const ReasonCode = {
  HAS_TEXT: 'HAS_TEXT',
  TEXT_MIN_LENGTH: 'TEXT_MIN_LENGTH',
  HAS_AUTHOR: 'HAS_AUTHOR',
  HAS_URL: 'HAS_URL',
  NOT_DELETED: 'NOT_DELETED',
  SUPPORTED_LANGUAGE: 'SUPPORTED_LANGUAGE',
  NOT_DUPLICATE: 'NOT_DUPLICATE',
} as const;

export type ReasonCodeType = (typeof ReasonCode)[keyof typeof ReasonCode];

/** A single evaluated rule and whether it passed. */
export interface Reason {
  code: ReasonCodeType;
  passed: boolean;
}

export interface ClassificationResult {
  decision: OpportunityDecision;
  reasons: Reason[];
}

/** The minimal Signal shape the (pure) classifier needs. */
export interface ClassifierSignal {
  message: string | null;
  authorName: string | null;
  postUrl: string | null;
}

/** Context computed outside the classifier (kept pure — no DB inside). */
export interface ClassifierContext {
  minTextLength: number;
  isDuplicate: boolean;
}
