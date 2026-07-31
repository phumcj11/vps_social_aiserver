import { describe, expect, it } from 'vitest';
import { matchBusiness, MATCHER_VERSION } from './matcher';
import type { MatcherRule } from './types';

describe('BusinessMatcher (pure, deterministic)', () => {
  const rules: MatcherRule[] = [
    { ruleType: 'keyword', ruleValue: 'plumber' },
    { ruleType: 'province', ruleValue: 'Bangkok' },
  ];

  it('MATCHes when at least one rule value occurs in the message (case-insensitive)', () => {
    const res = matchBusiness({ message: 'Looking for a PLUMBER near me' }, rules);
    expect(res.decision).toBe('MATCH');
    expect(res.reasons).toEqual([
      { ruleType: 'keyword', ruleValue: 'plumber', matched: true },
      { ruleType: 'province', ruleValue: 'Bangkok', matched: false },
    ]);
  });

  it('NO_MATCH when no rule value occurs', () => {
    const res = matchBusiness({ message: 'Selling a bicycle in Chiang Mai' }, rules);
    expect(res.decision).toBe('NO_MATCH');
    expect(res.reasons.every((r) => r.matched === false)).toBe(true);
  });

  it('NO_MATCH with empty reasons when the business has no active rules', () => {
    const res = matchBusiness({ message: 'anything at all' }, []);
    expect(res.decision).toBe('NO_MATCH');
    expect(res.reasons).toEqual([]);
  });

  it('treats a null message as no content (NO_MATCH)', () => {
    expect(matchBusiness({ message: null }, rules).decision).toBe('NO_MATCH');
  });

  it('an empty/whitespace rule value never matches', () => {
    const res = matchBusiness({ message: 'plenty of text here' }, [
      { ruleType: 'custom', ruleValue: '   ' },
    ]);
    expect(res.decision).toBe('NO_MATCH');
    expect(res.reasons[0]?.matched).toBe(false);
  });

  it('is deterministic (same inputs → identical output) and versioned', () => {
    const a = matchBusiness({ message: 'need a plumber' }, rules);
    const b = matchBusiness({ message: 'need a plumber' }, rules);
    expect(a).toEqual(b);
    expect(MATCHER_VERSION).toBe('rules-v1');
  });
});
