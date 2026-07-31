import type { CandidateBusiness } from './types';

/**
 * CandidateGenerator (SPRINT 008) — PURE and DETERMINISTIC.
 *
 * Selects the candidate businesses for an Opportunity. The businesses passed in
 * are those assigned to the Opportunity's Signal's group (BR-15) — the caller
 * (Coordinator/Repository) fetches them; this module applies the deterministic
 * selection so it stays pure and testable (no DB, no AI).
 *
 * Selection rule (v1): a business is a candidate only when it is `active`.
 * Disabled/archived businesses are excluded. Order is preserved.
 */
export function selectCandidates(businesses: CandidateBusiness[]): CandidateBusiness[] {
  return businesses.filter((b) => b.status === 'active');
}
