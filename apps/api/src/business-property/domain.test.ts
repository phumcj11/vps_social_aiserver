import { describe, expect, it } from 'vitest';
import { evaluateBusinessReadiness, evaluatePropertyReadiness } from './readiness';
import { resolvePropertyPolicies } from './policies';
import { approvedDraftChannels, publicResponseChannels, isValidContactValue } from './contacts';
import { matchProperty } from './property-matcher';
import { buildPropertyDraftContext } from './draft-context';
import { emptyPropertyDefaults } from './store';
import type {
  BusinessPolicies,
  BusinessReadinessSnapshot,
  ContactChannel,
  Property,
} from './types';

const businessPolicies: BusinessPolicies = {
  availabilityPolicy: 'MANUAL_CONFIRMATION',
  pricingPolicy: 'STARTING_FROM',
  promotionPolicy: 'NONE',
  bookingPolicy: 'CONTACT_ONLY',
  cancellationInfoPolicy: null,
  prohibitedClaims: ['no fake availability'],
  escalationPolicy: 'owner',
  responsibleOwner: 'Owner A',
  operatingHours: '09:00-18:00',
  responseSlaMinutes: 120,
};

function contact(over: Partial<ContactChannel>): ContactChannel {
  return {
    id: 'c' + Math.random().toString(36).slice(2),
    workspaceId: 'w',
    businessId: 'b',
    type: 'PHONE',
    value: '0812345678',
    label: null,
    enabled: true,
    approvedForDrafts: true,
    approvedForPublicResponse: false,
    ownerVerifiedAt: new Date(),
    ...over,
  };
}

function property(over: Partial<Property> = {}): Property {
  const base: Property = {
    id: 'p1',
    workspaceId: 'w',
    businessId: 'b',
    name: 'Sea Villa 01',
    ...emptyPropertyDefaults(),
    propertyType: 'pool villa',
    description: 'A lovely sea-view villa near the beach with a private pool.',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    ...base,
    ...over,
    location: { ...base.location, ...(over.location ?? {}) },
    capacity: { ...base.capacity, ...(over.capacity ?? {}) },
    amenities: { ...base.amenities, ...(over.amenities ?? {}) },
    content: { ...base.content, ...(over.content ?? {}) },
  };
}

describe('business readiness', () => {
  const snapshot: BusinessReadinessSnapshot = {
    business: {
      id: 'b',
      workspaceId: 'w',
      name: 'Sea Villa Bangsaen',
      environment: 'production',
      status: 'active',
    },
    displayName: 'Sea Villa Bangsaen',
    serviceArea: 'บางแสน',
    responseTone: 'polite',
    contacts: [contact({})],
    policies: businessPolicies,
    activeProductionPropertyCount: 1,
    activeMatchingRuleCount: 1,
  };

  it('READY when all requirements + an active Property are present', () => {
    expect(evaluateBusinessReadiness(snapshot).status).toBe('READY');
  });

  it('NOT_READY without a customer matching configuration', () => {
    const v = evaluateBusinessReadiness({ ...snapshot, activeMatchingRuleCount: 0 });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing).toContain('customer matching configuration');
  });

  it('the matching requirement is satisfied by at least one active rule', () => {
    expect(
      evaluateBusinessReadiness({ ...snapshot, activeMatchingRuleCount: 2 }).missing,
    ).not.toContain('customer matching configuration');
  });

  it('a test-environment Business can NEVER be READY', () => {
    const v = evaluateBusinessReadiness({
      ...snapshot,
      business: { ...snapshot.business, environment: 'test' },
    });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing).toContain('production environment');
  });

  it('NOT_READY without an active Property', () => {
    const v = evaluateBusinessReadiness({ ...snapshot, activeProductionPropertyCount: 0 });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing).toContain('at least one active Property');
  });

  it('NOT_READY without an approved contact channel', () => {
    const v = evaluateBusinessReadiness({
      ...snapshot,
      contacts: [contact({ approvedForDrafts: false })],
    });
    expect(v.missing).toContain('at least one approved contact channel');
  });

  it('NOT_READY without owner-verified contact', () => {
    const v = evaluateBusinessReadiness({
      ...snapshot,
      contacts: [contact({ ownerVerifiedAt: null })],
    });
    expect(v.missing).toContain('contact channel owner approval');
  });

  it('NOT_READY with no policies', () => {
    const v = evaluateBusinessReadiness({ ...snapshot, policies: null });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing).toContain('pricing policy');
  });
});

describe('policy inheritance', () => {
  it('inherits business policies when no override', () => {
    const eff = resolvePropertyPolicies(businessPolicies, null);
    expect(eff.availabilityPolicy).toBe('MANUAL_CONFIRMATION');
    expect(eff.inheritedFields).toContain('availabilityPolicy');
    expect(eff.overriddenFields).toHaveLength(0);
  });
  it('applies a property override', () => {
    const eff = resolvePropertyPolicies(businessPolicies, {
      availabilityPolicy: 'DO_NOT_MENTION',
      pricingPolicy: null,
      promotionPolicy: null,
      bookingPolicy: null,
      prohibitedClaims: null,
    });
    expect(eff.availabilityPolicy).toBe('DO_NOT_MENTION');
    expect(eff.overriddenFields).toContain('availabilityPolicy');
    expect(eff.pricingPolicy).toBe('STARTING_FROM'); // still inherited
  });
});

describe('property readiness with inheritance', () => {
  it('READY when fields present + policies inherited', () => {
    const eff = resolvePropertyPolicies(businessPolicies, null);
    const v = evaluatePropertyReadiness(
      property({
        capacity: { bedrooms: 3, bathrooms: 2, beds: 4, maxGuests: 12, extraGuestPolicy: null },
        location: { area: 'บางแสน' } as never,
      }),
      eff,
    );
    expect(v.status).toBe('READY');
  });
  it('NOT_READY without max guests', () => {
    const eff = resolvePropertyPolicies(businessPolicies, null);
    const v = evaluatePropertyReadiness(property({ location: { area: 'บางแสน' } as never }), eff);
    expect(v.missing).toContain('maximum guests');
  });
});

describe('contact filtering + validation', () => {
  it('approvedDraftChannels excludes disabled/unapproved', () => {
    const list = [
      contact({ approvedForDrafts: true }),
      contact({ enabled: false }),
      contact({ approvedForDrafts: false }),
    ];
    expect(approvedDraftChannels(list)).toHaveLength(1);
  });
  it('publicResponseChannels needs the stricter approval', () => {
    expect(publicResponseChannels([contact({ approvedForPublicResponse: false })])).toHaveLength(0);
    expect(publicResponseChannels([contact({ approvedForPublicResponse: true })])).toHaveLength(1);
  });
  it('validates contact values by type', () => {
    expect(isValidContactValue('EMAIL', 'a@b.com')).toBe(true);
    expect(isValidContactValue('EMAIL', 'nope')).toBe(false);
    expect(isValidContactValue('WEBSITE', 'https://x.com')).toBe(true);
    expect(isValidContactValue('WEBSITE', 'x.com')).toBe(false);
  });
});

describe('deterministic property matcher', () => {
  const p = property({
    location: { area: 'บางแสน' } as never,
    capacity: { maxGuests: 15, bedrooms: 4 } as never,
    amenities: { privatePool: true, nearBeach: true } as never,
  });
  it('MATCH on area + capacity + private pool with reasons', () => {
    const r = matchProperty(p, {
      area: 'บางแสน',
      accommodationType: null,
      guests: 12,
      bedrooms: null,
      needsPrivatePool: true,
      needsBeach: false,
      needsRiver: false,
    });
    expect(r.decision).toBe('MATCH');
    expect(r.reasons.join(' ')).toMatch(/AREA_MATCH.*บางแสน/);
    expect(r.reasons).toContain('CAPACITY_MATCH: 12 <= 15');
    expect(r.reasons).toContain('PRIVATE_POOL_MATCH');
  });
  it('NO_MATCH on wrong area', () => {
    const r = matchProperty(p, {
      area: 'พัทยา',
      accommodationType: null,
      guests: null,
      bedrooms: null,
      needsPrivatePool: false,
      needsBeach: false,
      needsRiver: false,
    });
    expect(r.decision).toBe('NO_MATCH');
  });
  it('NO_MATCH when capacity exceeded', () => {
    const r = matchProperty(p, {
      area: 'บางแสน',
      accommodationType: null,
      guests: 20,
      bedrooms: null,
      needsPrivatePool: false,
      needsBeach: false,
      needsRiver: false,
    });
    expect(r.decision).toBe('NO_MATCH');
  });
});

describe('draft context — no fabrication', () => {
  it('omits price when policy says DO_NOT_MENTION', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'B',
      serviceArea: 'บางแสน',
      responseTone: 'polite',
      businessPolicies: { ...businessPolicies, pricingPolicy: 'DO_NOT_MENTION' },
      contacts: [contact({})],
      property: property({ pricing: { startingPrice: 5000 } as never }),
    });
    expect(ctx.property?.priceFact).toBeNull();
    expect(ctx.mustNotClaim).toContain('price');
  });
  it('forbids a price claim when policy allows but no price is stored', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'B',
      serviceArea: 'บางแสน',
      responseTone: 'polite',
      businessPolicies: { ...businessPolicies, pricingPolicy: 'STARTING_FROM' },
      contacts: [contact({})],
      property: property({ pricing: { startingPrice: null } as never }),
    });
    expect(ctx.property?.priceFact).toBeNull();
    expect(ctx.mustNotClaim).toContain('price');
  });
  it('includes a price only when policy allows AND price is stored', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'B',
      serviceArea: 'บางแสน',
      responseTone: 'polite',
      businessPolicies: { ...businessPolicies, pricingPolicy: 'STARTING_FROM' },
      contacts: [contact({})],
      property: property({
        pricing: { startingPrice: 5000, priceDisplayMode: 'STARTING_FROM' } as never,
      }),
    });
    expect(ctx.property?.priceFact).toBe('starting from 5000');
  });
  it('only exposes approved contacts', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'B',
      serviceArea: 'บางแสน',
      responseTone: 'polite',
      businessPolicies,
      contacts: [contact({ approvedForDrafts: true }), contact({ approvedForDrafts: false })],
    });
    expect(ctx.approvedContacts).toHaveLength(1);
  });
  it('forbids a capacity claim when max guests is unknown', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'B',
      serviceArea: 'บางแสน',
      responseTone: 'polite',
      businessPolicies,
      contacts: [contact({})],
      property: property({ capacity: { maxGuests: null } as never }),
    });
    expect(ctx.mustNotClaim).toContain('capacity');
  });
});
