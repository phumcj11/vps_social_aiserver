/**
 * Business Candidate & Matching types (SPRINT 008).
 *
 * Deterministic business matching. NO AI, NO ML, NO embeddings, NO vector or
 * semantic search, NO score, NO confidence. Matching uses ONLY a business's
 * human-authored Business Matching Rules (docs/25-business-matching-rules.md).
 */

export type MatchDecision = 'MATCH' | 'NO_MATCH';

/** A candidate business the generator considers for an Opportunity. */
export interface CandidateBusiness {
  id: string;
  name: string;
  status: string;
}

/** The minimal Signal shape the (pure) matcher needs. */
export interface MatcherSignal {
  message: string | null;
}

/** The minimal rule shape the (pure) matcher evaluates (already active). */
export interface MatcherRule {
  ruleType: string;
  ruleValue: string;
}

/** A single evaluated rule and whether it matched the Signal. */
export interface MatchReason {
  ruleType: string;
  ruleValue: string;
  matched: boolean;
}

export interface MatchResult {
  decision: MatchDecision;
  reasons: MatchReason[];
}
