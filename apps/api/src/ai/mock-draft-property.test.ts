import { describe, expect, it } from 'vitest';
import { MockAiDraftProvider } from './provider';
import { buildDraftPrompt } from './prompt-builder';
import { checkDraft } from './policy-checker';
import type { DraftContext } from './types';

function ctx(over: Partial<DraftContext> = {}): DraftContext {
  return {
    business: {
      name: 'Demo Bangsaen Pool Villa',
      category: 'พูลวิลล่า',
      description: null,
      sellingPoints: [],
      serviceArea: 'บางแสน',
      contactInformation: null,
      responseTone: 'สุภาพ',
    },
    prohibitedClaims: [],
    knowledge: [],
    matchingRules: [],
    matchingReasons: [],
    opportunity: { decision: 'ACCEPT', reasons: [] },
    signal: {
      message: 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ',
      sourceUrl: 'u',
      group: { name: null, url: '' },
    },
    property: {
      name: 'Villa B',
      area: 'บางแสน',
      propertyType: 'pool_villa',
      maxGuests: 15,
      bedrooms: 5,
      amenities: ['private pool', 'karaoke'],
      priceFact: 'starting from 9500',
      sellingPoints: [],
    },
    policies: {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'STARTING_FROM',
      promotionPolicy: 'APPROVED_ONLY',
      bookingPolicy: 'LINE',
    },
    approvedContacts: [{ type: 'LINE_OA', value: '@demo-bangsaen', label: 'LINE OA หลัก' }],
    mustNotClaim: [],
    noPropertyMatch: false,
    ...over,
  };
}

async function draft(context: DraftContext, maxLength = 500) {
  const provider = new MockAiDraftProvider();
  return provider.generateDraft({
    context,
    prompt: buildDraftPrompt(context, maxLength),
    maxLength,
  });
}

describe('property-aware Mock draft (SPRINT 017)', () => {
  it('uses the selected Property facts + approved contact deterministically', async () => {
    const c = ctx();
    const a = await draft(c);
    const b = await draft(c);
    expect(a.content).toBe(b.content); // deterministic
    expect(a.content).toContain('Villa B');
    expect(a.content).toContain('Demo Bangsaen Pool Villa');
    expect(a.content).toContain('15'); // stored capacity
    expect(a.content).toContain('สระส่วนตัว'); // Thai amenity from persisted fact
    expect(a.content).toContain('คาราโอเกะ');
    expect(a.content).toContain('9500'); // stored starting price
    expect(a.content).toContain('@demo-bangsaen'); // approved contact
  });

  it('fixes the "ทาง<Name>" spacing (Phase J) when business-level', async () => {
    const c = ctx({ property: null, noPropertyMatch: false });
    const a = await draft(c);
    expect(a.content).toContain('ทาง Demo Bangsaen Pool Villa');
    expect(a.content).not.toContain('ทางDemo');
  });

  it('passes the policy checker (no fabricated availability/price/promotion)', async () => {
    const c = ctx();
    const a = await draft(c);
    const r = checkDraft(a.content, c, 500);
    expect(r.decision).toBe('PASS');
  });

  it('makes NO property claim on NO_PROPERTY_MATCH', async () => {
    const c = ctx({ property: null, noPropertyMatch: true });
    const a = await draft(c);
    expect(a.content).not.toContain('Villa B');
    expect(a.content).not.toContain('15');
    expect(a.content).not.toContain('สระส่วนตัว');
    expect(a.content).toContain('Demo Bangsaen Pool Villa');
  });

  it('never mentions a price when the pricing policy forbids it', async () => {
    const c = ctx({
      property: { ...ctx().property!, priceFact: null },
      policies: { ...ctx().policies!, pricingPolicy: 'DO_NOT_MENTION' },
      mustNotClaim: ['price'],
    });
    const a = await draft(c);
    expect(a.content).not.toMatch(/\d[\d,]*\s*บาท/);
  });

  it('does not invent a contact when none is approved', async () => {
    const c = ctx({ approvedContacts: [] });
    const a = await draft(c);
    expect(a.content).not.toContain('@demo-bangsaen');
    expect(a.content).not.toContain('LINE');
  });
});
