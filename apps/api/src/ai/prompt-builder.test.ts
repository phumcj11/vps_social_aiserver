import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, PROMPT_VERSION } from './prompt-builder';
import type { DraftContext } from './types';

function context(): DraftContext {
  return {
    business: {
      name: 'ร้านช่างประปา',
      category: 'ประปา',
      description: 'บริการซ่อมประปา',
      sellingPoints: ['มาไว'],
      serviceArea: 'กรุงเทพ',
      contactInformation: 'LINE @plumber',
      responseTone: 'สุภาพ',
    },
    prohibitedClaims: ['รับประกันงาน 100%'],
    knowledge: [{ title: 'เวลาทำการ', content: '9-18 น.' }],
    matchingRules: [{ ruleType: 'keyword', ruleValue: 'ประปา' }],
    matchingReasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    opportunity: { decision: 'ACCEPT', reasons: [{ code: 'HAS_TEXT', passed: true }] },
    signal: {
      message: 'หาช่างประปาด่วน',
      sourceUrl: 'https://www.facebook.com/groups/1/posts/abc',
      group: { name: 'กลุ่มบ้าน', url: 'https://www.facebook.com/groups/1' },
    },
    property: {
      name: 'Sea Villa 02',
      area: 'บางแสน',
      propertyType: 'pool_villa',
      maxGuests: 15,
      bedrooms: 4,
      amenities: ['private pool', 'karaoke'],
      priceFact: null,
      sellingPoints: ['วิวทะเล'],
    },
    policies: {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'DO_NOT_MENTION',
      promotionPolicy: 'NONE',
      bookingPolicy: 'CONTACT_ONLY',
    },
    approvedContacts: [{ type: 'PHONE', value: '0812345678', label: null }],
    mustNotClaim: ['price', 'promotion'],
    noPropertyMatch: false,
  };
}

describe('AiDraftPromptBuilder', () => {
  it('produces a deterministic, layered structure', () => {
    const a = buildDraftPrompt(context(), 500);
    const b = buildDraftPrompt(context(), 500);
    expect(a.text).toBe(b.text);
    expect(a.promptVersion).toBe(PROMPT_VERSION);
    expect(a.layers.map((l) => l.label)).toEqual([
      'System Rules',
      'Business Context',
      'Property Facts',
      'Opportunity Context',
      'Matching Reasons',
      'Prohibited Claims',
      'Must Not Claim',
      'Approved Contacts',
      'Tone Instructions',
      'Output Contract',
    ]);
  });

  it('includes prohibited claims and the output contract', () => {
    const p = buildDraftPrompt(context(), 500);
    expect(p.text).toContain('รับประกันงาน 100%');
    expect(p.text).toContain('Maximum length: 500');
    expect(p.text).toContain('Natural Thai by default');
  });

  it('does not request hidden reasoning or chain-of-thought', () => {
    const p = buildDraftPrompt(context(), 500);
    expect(p.text.toLowerCase()).not.toMatch(
      /chain[- ]of[- ]thought|step by step|show your reasoning|think out loud/,
    );
    expect(p.text).toContain('Return ONLY the comment text');
  });

  it('embeds no secrets or file paths', () => {
    const p = buildDraftPrompt(context(), 500);
    expect(p.text).not.toMatch(/api[_-]?key|password|cookie|\/root\/|storage\//i);
  });
});
