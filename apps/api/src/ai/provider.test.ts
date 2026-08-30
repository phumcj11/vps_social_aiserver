import { describe, expect, it } from 'vitest';
import { MockAiDraftProvider, ExternalAiDraftProvider, selectAiDraftProvider } from './provider';
import { buildDraftPrompt } from './prompt-builder';
import { checkDraft } from './policy-checker';
import { AiDraftError } from './errors';
import type { DraftContext } from './types';

function context(overrides: Partial<DraftContext['business']> = {}): DraftContext {
  return {
    business: {
      name: 'ร้านช่างประปา',
      category: 'ประปา',
      description: null,
      sellingPoints: [],
      serviceArea: 'กรุงเทพ',
      contactInformation: null,
      responseTone: 'friendly',
      ...overrides,
    },
    prohibitedClaims: [],
    knowledge: [],
    matchingRules: [],
    matchingReasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    opportunity: { decision: 'ACCEPT', reasons: [] },
    signal: {
      message: 'หาช่างประปา',
      sourceUrl: 'https://www.facebook.com/groups/1/posts/abc',
      group: { name: 'กลุ่มบ้าน', url: 'https://www.facebook.com/groups/1' },
    },
    property: null,
    policies: null,
    approvedContacts: [],
    mustNotClaim: [],
    noPropertyMatch: false,
  };
}

function input(ctx: DraftContext, maxLength = 500) {
  return { context: ctx, prompt: buildDraftPrompt(ctx, maxLength), maxLength };
}

describe('MockAiDraftProvider', () => {
  it('produces deterministic output for identical input', async () => {
    const p = new MockAiDraftProvider();
    const ctx = context();
    const a = await p.generateDraft(input(ctx));
    const b = await p.generateDraft(input(ctx));
    expect(a.content).toBe(b.content);
    expect(a.provider).toBe('mock');
    expect(a.model).toBe('mock-draft-v1');
    expect(a.promptVersion).toBe('rules-v2-property');
  });

  it('uses only supplied business context and preserves Thai', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context()));
    expect(out.content).toContain('ร้านช่างประปา');
    expect(out.content).toContain('ประปา');
  });

  it('never claims guaranteed availability or price', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context()));
    expect(out.content).not.toMatch(/รับประกัน|การันตี|ถูกที่สุด|guarantee/i);
  });

  it('never invents contact information (omits when none supplied)', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context({ contactInformation: null })));
    expect(out.content).not.toMatch(/\d{6,}|@|https?:\/\//);
  });

  it('includes business-provided contact verbatim when present', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context({ contactInformation: 'LINE @plumber' })));
    expect(out.content).toContain('LINE @plumber');
  });

  it('respects the max length', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context(), 40));
    expect(out.content.length).toBeLessThanOrEqual(40);
  });
});

describe('ExternalAiDraftProvider (disabled boundary)', () => {
  it('refuses to run when AI is disabled', async () => {
    const p = new ExternalAiDraftProvider({ aiEnabled: false, provider: 'anthropic', model: 'x' });
    await expect(p.generateDraft(input(context()))).rejects.toBeInstanceOf(AiDraftError);
  });

  it('refuses even when enabled (no real provider connected this sprint)', async () => {
    const p = new ExternalAiDraftProvider({ aiEnabled: true, provider: 'anthropic', model: 'x' });
    await expect(p.generateDraft(input(context()))).rejects.toBeInstanceOf(AiDraftError);
  });
});

describe('selectAiDraftProvider', () => {
  it('returns the Mock provider by default', () => {
    const p = selectAiDraftProvider({
      AI_ENABLED: false,
      AI_PROVIDER: 'mock',
      AI_MODEL: 'mock-draft-v1',
    });
    expect(p.name).toBe('mock');
  });

  it('returns the disabled external boundary for a non-mock provider', () => {
    const p = selectAiDraftProvider({ AI_ENABLED: false, AI_PROVIDER: 'anthropic', AI_MODEL: 'm' });
    expect(p).toBeInstanceOf(ExternalAiDraftProvider);
  });
});

// ── Contextual drafts for Matching Semantics v2 (M9E) ────────────────────────
function propertyContext(
  over: {
    property?: Partial<NonNullable<DraftContext['property']>>;
    policies?: Partial<NonNullable<DraftContext['policies']>>;
    mustNotClaim?: string[];
    noPropertyMatch?: boolean;
    propertyNeedsConfirmation?: boolean;
    unconfirmedRequirements?: string[];
  } = {},
): DraftContext {
  const base = context();
  return {
    ...base,
    business: { ...base.business, name: 'บางแสนวิลล่า', category: 'ที่พัก' },
    property: {
      name: 'Villa B',
      area: 'บางแสน',
      propertyType: 'pool_villa',
      maxGuests: 15,
      bedrooms: null,
      amenities: ['private pool'], // only CONFIRMED (YES) facts reach here
      priceFact: null,
      sellingPoints: [],
      ...over.property,
    },
    policies: {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'DO_NOT_MENTION',
      promotionPolicy: 'NONE',
      bookingPolicy: 'CONTACT_ONLY',
      ...over.policies,
    },
    mustNotClaim: over.mustNotClaim ?? ['availability', 'price', 'promotion'],
    noPropertyMatch: over.noPropertyMatch ?? false,
    propertyNeedsConfirmation: over.propertyNeedsConfirmation ?? false,
    unconfirmedRequirements: over.unconfirmedRequirements ?? [],
  };
}

describe('M7 NEEDS_CONFIRMATION draft (M9E)', () => {
  const ctx = propertyContext({
    propertyNeedsConfirmation: true,
    unconfirmedRequirements: ['BEACH_UNKNOWN'],
  });

  it('states the confirmed facts (name, type, area, capacity, private pool)', async () => {
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).toContain('Villa B');
    expect(out.content).toContain('พูลวิลล่า'); // the STORED type, not "บ้านพัก"
    expect(out.content).toContain('บางแสน');
    expect(out.content).toContain('15 ท่าน');
    expect(out.content).toContain('สระส่วนตัว');
  });

  it('asks to verify the UNKNOWN near-beach fact — never claims it', async () => {
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).toContain('ระยะห่างจากทะเล');
    expect(out.content).toContain('ตรวจสอบรายละเอียดเพิ่มเติม');
    // Must NOT assert the property is near/at the beach.
    expect(out.content).not.toContain('ใกล้ทะเล');
    expect(out.content).not.toContain('ติดทะเล');
  });

  it('states no price, no availability, no promotion (policies respected)', async () => {
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).not.toMatch(/\d[\d,]*\s*บาท/);
    expect(out.content).not.toMatch(/ว่าง|มีห้อง|จองได้|พร้อมเข้าพัก/);
    expect(out.content).not.toMatch(/โปรโมชั่น|ส่วนลด|แจกฟรี/);
  });

  it('passes the policy checker cleanly except the NEEDS_CONFIRMATION review flag', async () => {
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    const result = checkDraft(out.content, ctx, 500);
    // No BLOCK, and the only expected reason is the human-review flag.
    expect(result.decision).toBe('NEEDS_REVIEW');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('PROPERTY_NEEDS_CONFIRMATION');
    expect(codes).not.toContain('MUSTNOTCLAIM_PRICE');
    expect(codes).not.toContain('MUSTNOTCLAIM_AVAILABILITY');
    expect(codes).not.toContain('MUSTNOTCLAIM_PROMOTION');
    expect(codes).not.toContain('NO_PROPERTY_MATCH');
  });

  it('does not use technical terms in the customer-facing text', async () => {
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).not.toMatch(/UNKNOWN|NEEDS_CONFIRMATION|_MATCH|matcher/i);
  });
});

describe('draft fact safety + grouping (M9E)', () => {
  it('MATCH: all-confirmed draft needs no verification sentence', async () => {
    const ctx = propertyContext(); // not needs-confirmation
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).toContain('Villa B');
    expect(out.content).not.toContain('ตรวจสอบรายละเอียดเพิ่มเติม');
  });

  it('NO_MATCH: business-level draft names no property', async () => {
    const ctx = propertyContext({ noPropertyMatch: true });
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).not.toContain('Villa B');
    expect(out.content).toContain('บางแสนวิลล่า');
  });

  it('groups multiple unknowns into ONE natural sentence', async () => {
    const ctx = propertyContext({
      propertyNeedsConfirmation: true,
      unconfirmedRequirements: ['BEACH_UNKNOWN', 'BEDROOMS_UNKNOWN'],
    });
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).toContain('ระยะห่างจากทะเลและจำนวนห้องนอน');
    // Exactly one verification clause (not repeated per fact).
    expect(out.content.match(/ตรวจสอบรายละเอียดเพิ่มเติม/g)?.length).toBe(1);
  });

  it('a confirmed amenity YES may be stated; UNKNOWN/NO never reach the label list', async () => {
    // The context only ever contains CONFIRMED (YES) amenity labels (built by
    // draft-context via factIsPresentV1); the provider states exactly those.
    const ctx = propertyContext({ property: { amenities: ['private pool'] } });
    const out = await new MockAiDraftProvider().generateDraft(input(ctx));
    expect(out.content).toContain('สระส่วนตัว');
    expect(out.content).not.toContain('ใกล้ทะเล'); // nearBeach was not a YES label
  });
});
