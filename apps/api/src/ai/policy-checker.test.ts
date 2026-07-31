import { describe, expect, it } from 'vitest';
import { checkDraft } from './policy-checker';
import type { DraftContext } from './types';

function context(
  overrides: Partial<DraftContext['business']> = {},
  prohibited: string[] = [],
): DraftContext {
  return {
    business: {
      name: 'ร้านช่างประปา',
      category: 'ประปา',
      description: null,
      sellingPoints: [],
      serviceArea: null,
      contactInformation: null,
      responseTone: null,
      ...overrides,
    },
    prohibitedClaims: prohibited,
    knowledge: [],
    matchingRules: [],
    matchingReasons: [],
    opportunity: { decision: 'ACCEPT', reasons: [] },
    signal: { message: 'x', sourceUrl: 'u', group: { name: null, url: '' } },
  };
}

describe('DraftPolicyChecker', () => {
  it('PASS for safe content that mentions the business name', () => {
    const r = checkDraft('สวัสดีค่ะ ทางร้านช่างประปายินดีให้บริการค่ะ', context(), 500);
    expect(r.decision).toBe('PASS');
    expect(r.reasons).toEqual([]);
  });

  it('BLOCK on empty output', () => {
    const r = checkDraft('   ', context(), 500);
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('EMPTY_OUTPUT');
  });

  it('BLOCK on excessive length', () => {
    const r = checkDraft('ร้านช่างประปา ' + 'ก'.repeat(600), context(), 500);
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('EXCESSIVE_LENGTH');
  });

  it('BLOCK on a prohibited claim', () => {
    const r = checkDraft(
      'ร้านช่างประปา รับประกันงาน 100% แน่นอน',
      context({}, ['รับประกันงาน 100%']),
      500,
    );
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('PROHIBITED_CLAIM');
  });

  it('BLOCK on guaranteed availability', () => {
    const r = checkDraft('ร้านช่างประปา ว่างแน่นอนทุกวัน', context(), 500);
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('GUARANTEED_AVAILABILITY');
  });

  it('BLOCK on guaranteed price', () => {
    const r = checkDraft('ร้านช่างประปา ราคาถูกที่สุดรับประกัน', context(), 500);
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('GUARANTEED_PRICE');
  });

  it('NEEDS_REVIEW on contact not present in context', () => {
    const r = checkDraft(
      'ร้านช่างประปา โทร 0812345678 ได้เลย',
      context({ contactInformation: null }),
      500,
    );
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.reasons.map((x) => x.code)).toContain('UNSUPPORTED_CONTACT');
  });

  it('does NOT flag contact that matches the business context', () => {
    const r = checkDraft(
      'ร้านช่างประปา โทร 0812345678 ได้เลย',
      context({ contactInformation: 'โทร 0812345678' }),
      500,
    );
    expect(r.reasons.map((x) => x.code)).not.toContain('UNSUPPORTED_CONTACT');
  });

  it('NEEDS_REVIEW when the business name is missing', () => {
    const r = checkDraft('สวัสดีค่ะ ยินดีให้บริการค่ะ', context(), 500);
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.reasons.map((x) => x.code)).toContain('MISSING_BUSINESS_NAME');
  });
});
