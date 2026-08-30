/**
 * Business + Property domain types (SPRINT 015 — Production Business & Property).
 *
 * Business and Property are DISTINCT entities. A Business (brand/owner) has
 * 0..N Properties (accommodations); a Property belongs to exactly one Business
 * and one Workspace. These are pure types + value objects; nothing here performs
 * a Facebook write, connects external AI, or enables any flag.
 */

import type { ImageResponseMode } from '../media/types';
import type { PropertyFact } from './property-facts';
export type { ImageResponseMode };
export type { PropertyFact };

export type Environment = 'test' | 'production';
export type EntityStatus = 'active' | 'inactive' | 'archived';

// ── Structured contact channels (never an arbitrary description string) ───────
export type ContactChannelType =
  'PHONE' | 'LINE_ID' | 'LINE_OA' | 'FACEBOOK_PAGE' | 'WEBSITE' | 'EMAIL' | 'OTHER';

export interface ContactChannel {
  id: string;
  workspaceId: string;
  businessId: string;
  type: ContactChannelType;
  value: string;
  label: string | null;
  enabled: boolean;
  approvedForDrafts: boolean;
  approvedForPublicResponse: boolean;
  ownerVerifiedAt: Date | null;
}

// ── Structured policy enums ───────────────────────────────────────────────────
export type AvailabilityPolicy =
  'MANUAL_CONFIRMATION' | 'OWNER_SYSTEM' | 'EXTERNAL_CALENDAR' | 'DO_NOT_MENTION';
export type PricingPolicy =
  'DO_NOT_MENTION' | 'STARTING_FROM' | 'FIXED_REFERENCE' | 'MANUAL_CONFIRMATION';
export type PromotionPolicy = 'NONE' | 'APPROVED_ONLY' | 'MANUAL_CONFIRMATION';
export type BookingPolicy = 'CONTACT_ONLY' | 'LINE' | 'PHONE' | 'WEBSITE' | 'MANUAL';

/** Business-level policy set. */
/**
 * What the system does when the Business MATCHes a Lead but NO Property fully
 * matches. A RESPONSE POLICY — it decides WHETHER/HOW to prepare a response; it
 * NEVER turns a mismatched Property into a MATCH and never fabricates facts.
 *   DO_NOT_RESPOND    — stop after NO_PROPERTY_MATCH; no Draft.
 *   DRAFT_BUSINESS_ONLY — Business-level Draft from Business facts only; no Property.
 *   HUMAN_REVIEW      — safe Business-only Draft, forced into Human Review (default).
 */
export type NoPropertyMatchStrategy = 'DO_NOT_RESPOND' | 'DRAFT_BUSINESS_ONLY' | 'HUMAN_REVIEW';

export const DEFAULT_NO_PROPERTY_MATCH_STRATEGY: NoPropertyMatchStrategy = 'HUMAN_REVIEW';

export interface BusinessPolicies {
  availabilityPolicy: AvailabilityPolicy;
  pricingPolicy: PricingPolicy;
  promotionPolicy: PromotionPolicy;
  bookingPolicy: BookingPolicy;
  cancellationInfoPolicy: string | null;
  prohibitedClaims: string[];
  escalationPolicy: string | null;
  responsibleOwner: string | null;
  operatingHours: string | null;
  responseSlaMinutes: number | null;
  /** Response Strategy (additive): what to do on Business MATCH + NO_PROPERTY_MATCH. */
  noPropertyMatchStrategy: NoPropertyMatchStrategy;
  /** Future capability — near-match suggestions. Persisted but off by default. */
  allowNearMatchSuggestions: boolean;
  /** Media Library (additive): whether/how an approved image may accompany a response. */
  imageResponseMode: ImageResponseMode;
}

/** Property policy OVERRIDES — null means "inherit from the Business". */
export interface PropertyPolicyOverrides {
  availabilityPolicy: AvailabilityPolicy | null;
  pricingPolicy: PricingPolicy | null;
  promotionPolicy: PromotionPolicy | null;
  bookingPolicy: BookingPolicy | null;
  prohibitedClaims: string[] | null;
}

/** The effective policies for a Property after inheritance is resolved. */
export interface EffectivePropertyPolicies {
  availabilityPolicy: AvailabilityPolicy;
  pricingPolicy: PricingPolicy;
  promotionPolicy: PromotionPolicy;
  bookingPolicy: BookingPolicy;
  prohibitedClaims: string[];
  /** Which fields came from the Property override vs. inherited from Business. */
  inheritedFields: string[];
  overriddenFields: string[];
}

// ── Business ─────────────────────────────────────────────────────────────────
export interface BusinessCore {
  id: string;
  workspaceId: string;
  name: string;
  environment: Environment;
  status: EntityStatus;
}

/** Everything the Business readiness evaluator needs (loaded from persistence). */
export interface BusinessReadinessSnapshot {
  business: BusinessCore;
  displayName: string | null;
  serviceArea: string | null;
  responseTone: string | null;
  contacts: ContactChannel[];
  policies: BusinessPolicies | null;
  activeProductionPropertyCount: number;
  /**
   * Count of ACTIVE business matching rules. The deterministic pipeline can only
   * select this Business from a Lead when at least one active rule exists, so a
   * Business with zero active rules is NOT_READY (owner self-service matching).
   */
  activeMatchingRuleCount: number;
}

// ── Property ─────────────────────────────────────────────────────────────────
export type PriceDisplayMode = 'DO_NOT_SHOW' | 'STARTING_FROM' | 'RANGE' | 'ON_REQUEST';

/** Prices are stored ONLY when explicitly entered — all nullable, never invented. */
export interface PropertyPricing {
  startingPrice: number | null;
  priceDisplayMode: PriceDisplayMode;
  weekdayPrice: number | null;
  weekendPrice: number | null;
  holidayPolicy: string | null;
  securityDeposit: number | null;
  extraGuestPrice: number | null;
}

export interface PropertyAmenities {
  // Tri-state facts (M9B): YES = confirmed present, NO = confirmed absent,
  // UNKNOWN = owner has not provided / system cannot verify. NOT booleans —
  // never test with JS truthiness (use the predicates in property-facts.ts).
  privatePool: PropertyFact;
  beachfront: PropertyFact;
  nearBeach: PropertyFact;
  riverfront: PropertyFact;
  sharedPool: boolean;
  mountainView: boolean;
  parking: boolean;
  kitchen: boolean;
  bbq: boolean;
  karaoke: boolean;
  poolTable: boolean;
  petFriendly: boolean;
  wifi: boolean;
  airConditioning: boolean;
  other: string[];
}

export interface PropertyLocation {
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PropertyCapacity {
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  maxGuests: number | null;
  extraGuestPolicy: string | null;
}

export interface PropertyContent {
  sellingPoints: string[];
  importantNotes: string | null;
  prohibitedClaims: string[];
  responseNotes: string | null;
}

export interface PropertyMedia {
  coverImage: string | null;
  gallery: string[];
  videoUrl: string | null;
  mapUrl: string | null;
}

export interface Property {
  id: string;
  workspaceId: string;
  businessId: string;
  name: string;
  code: string | null;
  propertyType: string | null;
  status: EntityStatus;
  description: string | null;
  location: PropertyLocation;
  capacity: PropertyCapacity;
  amenities: PropertyAmenities;
  pricing: PropertyPricing;
  content: PropertyContent;
  media: PropertyMedia;
  policyOverrides: PropertyPolicyOverrides;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadinessVerdict {
  ready: boolean;
  status: 'READY' | 'NOT_READY';
  missing: string[];
}
