import type { MatcherSignal, MatcherRule, MatchResult, MatchReason } from './types';

/**
 * BusinessMatcher (SPRINT 008) — PURE and DETERMINISTIC.
 *
 * Input: a Signal (+ a business's active matching rules). Output: a Decision
 * (MATCH | NO_MATCH) and Reasons. NO AI, NO ML, NO embeddings, NO vector or
 * semantic search, NO score, NO confidence. No database access.
 *
 * A rule matches when its (trimmed, case-folded) value occurs in the Signal
 * message. This deterministic containment check applies uniformly to every
 * rule type (province, district, keyword, guest_count, budget, facility,
 * custom) — the value is authored by the business owner.
 *
 * Decision: MATCH when AT LEAST ONE active rule matches; otherwise NO_MATCH.
 * A business with no active rules yields NO_MATCH with an empty reasons array.
 */

/** The version of the deterministic matching rule set (stored on each match). */
export const MATCHER_VERSION = 'rules-v1';

function ruleMatches(haystack: string, ruleValue: string): boolean {
  const needle = ruleValue.trim().toLowerCase();
  if (needle.length === 0) return false;
  return haystack.includes(needle);
}

export function matchBusiness(signal: MatcherSignal, rules: MatcherRule[]): MatchResult {
  const haystack = (signal.message ?? '').toLowerCase();

  const reasons: MatchReason[] = rules.map((rule) => ({
    ruleType: rule.ruleType,
    ruleValue: rule.ruleValue,
    matched: ruleMatches(haystack, rule.ruleValue),
  }));

  const decision = reasons.some((r) => r.matched) ? 'MATCH' : 'NO_MATCH';
  return { decision, reasons };
}
