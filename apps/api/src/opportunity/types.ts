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
  // Structural validity (a post must be real, textual, and actionable).
  HAS_TEXT: 'HAS_TEXT',
  HAS_URL: 'HAS_URL',
  NOT_DELETED: 'NOT_DELETED',
  SUPPORTED_LANGUAGE: 'SUPPORTED_LANGUAGE',
  NOT_DUPLICATE: 'NOT_DUPLICATE',
  // Kept for backward compatibility with rules-v1 events (no longer gate ACCEPT).
  TEXT_MIN_LENGTH: 'TEXT_MIN_LENGTH',
  HAS_AUTHOR: 'HAS_AUTHOR',
  // Customer-demand intent (rules-v2) — drive ACCEPT.
  CUSTOMER_SEARCH_INTENT: 'CUSTOMER_SEARCH_INTENT',
  CUSTOMER_REQUIREMENT_PRESENT: 'CUSTOMER_REQUIREMENT_PRESENT',
  CUSTOMER_DATE_PRESENT: 'CUSTOMER_DATE_PRESENT',
  CUSTOMER_GUEST_COUNT_PRESENT: 'CUSTOMER_GUEST_COUNT_PRESENT',
  CUSTOMER_LOCATION_PRESENT: 'CUSTOMER_LOCATION_PRESENT',
  // Advertiser / listing signals (rules-v2) — drive REJECT.
  PROPERTY_CODE_ONLY: 'PROPERTY_CODE_ONLY',
  ADVERTISER_LANGUAGE: 'ADVERTISER_LANGUAGE',
  BOOKING_PROMOTION: 'BOOKING_PROMOTION',
  OWNER_OR_AGENT_LISTING: 'OWNER_OR_AGENT_LISTING',
  NO_CUSTOMER_INTENT: 'NO_CUSTOMER_INTENT',
  INTENT_AD_CONFLICT: 'INTENT_AD_CONFLICT',
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
