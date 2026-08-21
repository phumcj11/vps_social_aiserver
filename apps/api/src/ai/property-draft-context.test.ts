import { describe, expect, it } from 'vitest';
import { buildDraftContext, type ContextBuilderInput } from './context-builder';
import { checkDraft } from './policy-checker';
import { AiDraftError } from './errors';
import { emptyPropertyDefaults } from '../business-property/store';
import type { Property, ContactChannel, BusinessPolicies } from '../business-property/types';
import type {
  BusinessMatchRecord,
  OpportunityRecord,
  SignalRecord,
  BusinessRecord,
  BusinessProfileRecord,
} from '../store/types';

const WS = 'ws-1';
const BID = 'biz-1';
const d = (ms: number) => new Date(1_700_000_000_000 + ms);

const businessPolicies: BusinessPolicies = {
  availabilityPolicy: 'MANUAL_CONFIRMATION',
  pricingPolicy: 'DO_NOT_MENTION',
  promotionPolicy: 'NONE',
  bookingPolicy: 'CONTACT_ONLY',
  cancellationInfoPolicy: null,
  prohibitedClaims: ['ห้ามรับประกัน'],
  escalationPolicy: null,
  responsibleOwner: null,
  operatingHours: null,
  responseSlaMinutes: null,
};

function contact(over: Partial<ContactChannel> = {}): ContactChannel {
  return {
    id: 'c1',
    workspaceId: WS,
    businessId: BID,
    type: 'PHONE',
    value: '0812345678',
    label: null,
    enabled: true,
    approvedForDrafts: true,
    approvedForPublicResponse: false,
    ownerVerifiedAt: d(0),
    ...over,
  };
}

function property(over: Partial<Property> = {}): Property {
  return {
    ...emptyPropertyDefaults(),
    id: 'prop-1',
    workspaceId: WS,
    businessId: BID,
    name: 'Sea Villa 02',
    propertyType: 'pool_villa',
    createdAt: d(0),
    updatedAt: d(0),
    location: { ...emptyPropertyDefaults().location, area: 'บางแสน' },
    capacity: { ...emptyPropertyDefaults().capacity, maxGuests: 12, bedrooms: 4 },
    amenities: { ...emptyPropertyDefaults().amenities, privatePool: true },
    ...over,
  } as Property;
}

function input(over: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  const match: BusinessMatchRecord = {
    id: 'm1',
    workspaceId: WS,
    businessId: BID,
    opportunityId: 'o1',
    decision: 'MATCH',
    reasons: [],
    matcherVersion: 'rules-v1',
    matchedAt: d(0),
  };
  const opportunity: OpportunityRecord = {
    id: 'o1',
    workspaceId: WS,
    signalId: 's1',
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
    createdAt: d(0),
    updatedAt: d(0),
  };
  const signal: SignalRecord = {
    id: 's1',
    workspaceId: WS,
    groupId: 'g1',
    facebookPostId: null,
    postUrl: 'https://www.facebook.com/groups/1/posts/abc',
    authorName: 'A',
    authorProfile: null,
    message: 'หาพูลวิลล่าบางแสน 12 คน',
    mediaUrls: [],
    createdTime: null,
    normalizedHash: 'h',
    normalizedAt: d(0),
  };
  const business: BusinessRecord = {
    id: BID,
    workspaceId: WS,
    name: 'Sea Villa Bangsaen',
    slug: 'sea-villa',
    status: 'active',
    createdAt: d(0),
    updatedAt: d(0),
  };
  const profile: BusinessProfileRecord = {
    businessId: BID,
    category: 'ที่พัก',
    description: null,
    sellingPoints: [],
    serviceArea: 'บางแสน',
    contactInformation: null,
    responseTone: 'สุภาพ',
    prohibitedClaims: [],
    createdAt: d(0),
    updatedAt: d(0),
  };
  return {
    workspaceId: WS,
    match,
    opportunity,
    opportunityReasons: [],
    signal,
    group: null,
    business,
    profile,
    knowledge: [],
    rules: [],
    selectedProperty: property(),
    businessPolicies,
    contacts: [contact()],
    noPropertyMatch: false,
    ...over,
  };
}

const cfg = { maxKnowledgeItems: 5, maxCharacters: 2000 };

describe('property-aware draft context', () => {
  it('includes only stored Property facts', () => {
    const ctx = buildDraftContext(input(), cfg);
    expect(ctx.property?.name).toBe('Sea Villa 02');
    expect(ctx.property?.area).toBe('บางแสน');
    expect(ctx.property?.maxGuests).toBe(12);
    expect(ctx.property?.amenities).toContain('private pool');
  });

  it('resolves a Property policy override above the Business policy', () => {
    const p = property({
      policyOverrides: {
        availabilityPolicy: null,
        pricingPolicy: 'STARTING_FROM',
        promotionPolicy: null,
        bookingPolicy: null,
        prohibitedClaims: null,
      },
      pricing: { ...emptyPropertyDefaults().pricing, startingPrice: 3500 },
    });
    const ctx = buildDraftContext(input({ selectedProperty: p }), cfg);
    expect(ctx.policies?.pricingPolicy).toBe('STARTING_FROM');
    expect(ctx.property?.priceFact).toBe('starting from 3500');
    expect(ctx.mustNotClaim).not.toContain('price');
  });

  it('inherits the Business policy when the Property does not override it', () => {
    const ctx = buildDraftContext(input(), cfg);
    // Business pricing is DO_NOT_MENTION → price must never be claimed.
    expect(ctx.policies?.pricingPolicy).toBe('DO_NOT_MENTION');
    expect(ctx.mustNotClaim).toContain('price');
    expect(ctx.property?.priceFact).toBeNull();
  });

  it('exposes ONLY draft-approved contacts', () => {
    const ctx = buildDraftContext(
      input({
        contacts: [
          contact({ id: 'c1', value: '0811111111', approvedForDrafts: true }),
          contact({ id: 'c2', value: '0822222222', approvedForDrafts: false }),
          contact({ id: 'c3', value: '0833333333', enabled: false, approvedForDrafts: true }),
        ],
      }),
      cfg,
    );
    expect(ctx.approvedContacts.map((c) => c.value)).toEqual(['0811111111']);
  });

  it('never claims a price not stored (policy would allow but no data)', () => {
    const p = property({
      policyOverrides: {
        availabilityPolicy: null,
        pricingPolicy: 'STARTING_FROM',
        promotionPolicy: null,
        bookingPolicy: null,
        prohibitedClaims: null,
      },
      pricing: { ...emptyPropertyDefaults().pricing, startingPrice: null },
    });
    const ctx = buildDraftContext(input({ selectedProperty: p }), cfg);
    expect(ctx.property?.priceFact).toBeNull();
    expect(ctx.mustNotClaim).toContain('price');
  });

  it('flags availability/price claims that violate the effective policy', () => {
    const ctx = buildDraftContext(input(), cfg);
    const r = checkDraft('Sea Villa Bangsaen ยังมีห้องว่าง ราคา 3500 บาท/คืน ครับ', ctx, 500);
    expect(r.decision).toBe('NEEDS_REVIEW');
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain('MUSTNOTCLAIM_PRICE');
    expect(codes).toContain('MUSTNOTCLAIM_AVAILABILITY');
  });

  it('flags a contact not among the approved channels', () => {
    const ctx = buildDraftContext(input(), cfg);
    const r = checkDraft('Sea Villa Bangsaen ติดต่อ 0899999999 ได้เลยครับ', ctx, 500);
    expect(r.reasons.map((x) => x.code)).toContain('UNSUPPORTED_CONTACT');
  });

  it('marks a NO_PROPERTY_MATCH draft as needs-review and makes no property claim', () => {
    const ctx = buildDraftContext(input({ selectedProperty: null, noPropertyMatch: true }), cfg);
    expect(ctx.property).toBeNull();
    expect(ctx.noPropertyMatch).toBe(true);
    const r = checkDraft('Sea Villa Bangsaen ยินดีให้บริการครับ', ctx, 500);
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.reasons.map((x) => x.code)).toContain('NO_PROPERTY_MATCH');
  });

  it('rejects a Property from another business/workspace', () => {
    const foreign = property({ businessId: 'other-biz' });
    expect(() => buildDraftContext(input({ selectedProperty: foreign }), cfg)).toThrow(
      AiDraftError,
    );
  });
});
