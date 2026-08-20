import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../lib/env';
import { pilotLimitsFromEnv, evaluateCommentLimit, requiresLockdown } from './limits';
import type { DailyUsage } from './types';

const limits = pilotLimitsFromEnv(loadApiEnv({}));
const zero: DailyUsage = {
  commentsToday: 0,
  commentsForGroupToday: 0,
  commentsForBusinessToday: 0,
  ambiguousToday: 0,
  activeGroups: 3,
};

describe('Level-1 pilot limits (defaults 3/day, 1/group, 1/business, 1 ambiguous)', () => {
  it('allows one comment when under all limits', () => {
    expect(evaluateCommentLimit(limits, zero).allowed).toBe(true);
  });

  it('blocks at the daily comment limit', () => {
    const d = evaluateCommentLimit(limits, { ...zero, commentsToday: 3 });
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(' ')).toMatch(/daily comment limit/i);
  });

  it('blocks at the per-group daily limit', () => {
    const d = evaluateCommentLimit(limits, { ...zero, commentsForGroupToday: 1 });
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(' ')).toMatch(/per-group/i);
  });

  it('blocks at the per-business daily limit', () => {
    const d = evaluateCommentLimit(limits, { ...zero, commentsForBusinessToday: 1 });
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(' ')).toMatch(/per-business/i);
  });

  it('an ambiguous execution stops writing for the day', () => {
    const d = evaluateCommentLimit(limits, { ...zero, ambiguousToday: 1 });
    expect(d.allowed).toBe(false);
    expect(d.stopForDay).toBe(true);
    expect(d.blockers.join(' ')).toMatch(/ambiguous/i);
  });

  it('blocks when too many active groups', () => {
    const d = evaluateCommentLimit(limits, { ...zero, activeGroups: 4 });
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(' ')).toMatch(/active pilot groups/i);
  });
});

describe('lockdown triggers', () => {
  it('checkpoint/CAPTCHA/restriction require lockdown', () => {
    expect(requiresLockdown('checkpoint')).toBe(true);
    expect(requiresLockdown('captcha')).toBe(true);
    expect(requiresLockdown('account_restricted')).toBe(true);
    expect(requiresLockdown(null)).toBe(false);
  });
});
