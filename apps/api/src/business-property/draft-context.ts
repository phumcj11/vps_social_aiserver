import type {
  BusinessPolicies,
  ContactChannel,
  Property,
  EffectivePropertyPolicies,
} from './types';
import { approvedDraftChannels, publicContactChannel } from './contacts';

/**
 * Property-aware Draft context (SPRINT 015, Phase R).
 *
 * Precedence: Property-specific facts → Business policy → Business profile →
 * generic safe fallback. The Draft must NEVER infer availability, price,
 * promotion, amenity, or capacity unless STORED data explicitly supports it —
 * so this builder emits those facts only when present, and flags what may NOT be
 * claimed. AI_PROVIDER stays mock this sprint.
 */
export interface DraftContext {
  businessName: string;
  serviceArea: string | null;
  responseTone: string | null;
  /** Only contacts approved for drafts (never disabled/unapproved). */
  approvedContacts: ReturnType<typeof publicContactChannel>[];
  property: {
    name: string;
    area: string | null;
    propertyType: string | null;
    /** Present only if explicitly stored — never invented. */
    maxGuests: number | null;
    bedrooms: number | null;
    amenities: string[];
    /** Price facts included ONLY when the pricing policy permits AND data exists. */
    priceFact: string | null;
    sellingPoints: string[];
  } | null;
  policies: {
    availabilityPolicy: string;
    pricingPolicy: string;
    promotionPolicy: string;
    bookingPolicy: string;
    prohibitedClaims: string[];
  };
  /** Claims the Draft must NOT make (derived from policy + missing data). */
  mustNotClaim: string[];
}

export interface BuildDraftContextInput {
  businessName: string;
  serviceArea: string | null;
  responseTone: string | null;
  businessPolicies: BusinessPolicies;
  contacts: ContactChannel[];
  property?: Property | null;
  effectivePolicies?: EffectivePropertyPolicies | null;
}

export function buildPropertyDraftContext(input: BuildDraftContextInput): DraftContext {
  const eff = input.effectivePolicies;
  const pol = eff ?? {
    availabilityPolicy: input.businessPolicies.availabilityPolicy,
    pricingPolicy: input.businessPolicies.pricingPolicy,
    promotionPolicy: input.businessPolicies.promotionPolicy,
    bookingPolicy: input.businessPolicies.bookingPolicy,
    prohibitedClaims: input.businessPolicies.prohibitedClaims,
    inheritedFields: [],
    overriddenFields: [],
  };

  const mustNotClaim: string[] = [...pol.prohibitedClaims];
  if (pol.availabilityPolicy === 'DO_NOT_MENTION') mustNotClaim.push('availability');
  if (pol.pricingPolicy === 'DO_NOT_MENTION') mustNotClaim.push('price');
  if (pol.promotionPolicy === 'NONE') mustNotClaim.push('promotion');

  let property: DraftContext['property'] = null;
  if (input.property) {
    const p = input.property;
    // Price fact only when policy allows AND a real number was entered.
    let priceFact: string | null = null;
    if (pol.pricingPolicy === 'STARTING_FROM' && p.pricing.startingPrice != null) {
      priceFact = `starting from ${p.pricing.startingPrice}`;
    } else if (pol.pricingPolicy === 'FIXED_REFERENCE' && p.pricing.weekdayPrice != null) {
      priceFact = `reference ${p.pricing.weekdayPrice}`;
    }
    // If the policy would allow a price but none is stored, forbid claiming one.
    if (
      (pol.pricingPolicy === 'STARTING_FROM' || pol.pricingPolicy === 'FIXED_REFERENCE') &&
      priceFact == null
    ) {
      mustNotClaim.push('price');
    }
    property = {
      name: p.name,
      area: p.location.area ?? p.location.province,
      propertyType: p.propertyType,
      maxGuests: p.capacity.maxGuests,
      bedrooms: p.capacity.bedrooms,
      amenities: amenityLabels(p),
      priceFact,
      sellingPoints: p.content.sellingPoints,
    };
    if (p.capacity.maxGuests == null) mustNotClaim.push('capacity');
  }

  return {
    businessName: input.businessName,
    serviceArea: input.serviceArea,
    responseTone: input.responseTone,
    approvedContacts: approvedDraftChannels(input.contacts).map(publicContactChannel),
    property,
    policies: {
      availabilityPolicy: pol.availabilityPolicy,
      pricingPolicy: pol.pricingPolicy,
      promotionPolicy: pol.promotionPolicy,
      bookingPolicy: pol.bookingPolicy,
      prohibitedClaims: pol.prohibitedClaims,
    },
    mustNotClaim: Array.from(new Set(mustNotClaim)),
  };
}

function amenityLabels(p: Property): string[] {
  const a = p.amenities;
  const out: string[] = [];
  if (a.privatePool) out.push('private pool');
  if (a.beachfront) out.push('beachfront');
  if (a.nearBeach) out.push('near beach');
  if (a.riverfront) out.push('riverfront');
  if (a.mountainView) out.push('mountain view');
  if (a.karaoke) out.push('karaoke');
  if (a.bbq) out.push('bbq');
  if (a.kitchen) out.push('kitchen');
  if (a.wifi) out.push('wifi');
  if (a.parking) out.push('parking');
  out.push(...a.other);
  return out;
}
