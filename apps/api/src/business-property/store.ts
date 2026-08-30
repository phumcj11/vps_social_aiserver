import type {
  Property,
  ContactChannel,
  BusinessPolicies,
  PropertyPolicyOverrides,
  ContactChannelType,
  EntityStatus,
} from './types';
import type { MediaAsset, CreateMediaAssetInput, UpdateMediaAssetPatch } from '../media/types';
export type { MediaAsset, CreateMediaAssetInput, UpdateMediaAssetPatch };

/**
 * Persistence boundary for the Business+Property domain (SPRINT 015).
 *
 * A small, self-contained store interface (InMemory for tests, Drizzle at
 * runtime) so the new production-data foundation does not have to thread every
 * method through the large core Store. Ownership is always by workspace.
 */

export interface CreatePropertyInput {
  id: string;
  workspaceId: string;
  businessId: string;
  name: string;
  code?: string | null;
  propertyType?: string | null;
  description?: string | null;
}

export type UpdatePropertyPatch = Partial<
  Pick<Property, 'name' | 'code' | 'propertyType' | 'status' | 'description'>
> & {
  location?: Partial<Property['location']>;
  capacity?: Partial<Property['capacity']>;
  amenities?: Partial<Property['amenities']>;
  pricing?: Partial<Property['pricing']>;
  content?: Partial<Property['content']>;
  media?: Partial<Property['media']>;
};

export interface CreateContactInput {
  id: string;
  workspaceId: string;
  businessId: string;
  type: ContactChannelType;
  value: string;
  label?: string | null;
}

export type UpdateContactPatch = Partial<
  Pick<
    ContactChannel,
    'value' | 'label' | 'enabled' | 'approvedForDrafts' | 'approvedForPublicResponse'
  >
> & { ownerVerified?: boolean };

export interface AuditEventInput {
  id: string;
  workspaceId: string;
  businessId?: string | null;
  propertyId?: string | null;
  eventType: string;
  actorEmail?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface BusinessAuditEventRecord {
  id: string;
  workspaceId: string;
  businessId: string | null;
  propertyId: string | null;
  eventType: string;
  actorEmail: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BusinessPropertyStore {
  // Properties
  createProperty(input: CreatePropertyInput): Promise<Property>;
  getPropertyById(id: string): Promise<Property | null>;
  listPropertiesByBusiness(businessId: string): Promise<Property[]>;
  isPropertyCodeTaken(businessId: string, code: string, exceptId?: string): Promise<boolean>;
  updateProperty(id: string, patch: UpdatePropertyPatch): Promise<Property | null>;
  setPropertyStatus(id: string, status: EntityStatus): Promise<Property | null>;
  setPropertyPolicyOverrides(
    id: string,
    overrides: PropertyPolicyOverrides,
  ): Promise<Property | null>;
  countActivePropertiesByBusiness(businessId: string): Promise<number>;

  // Contacts
  createContact(input: CreateContactInput): Promise<ContactChannel>;
  getContactById(id: string): Promise<ContactChannel | null>;
  listContactsByBusiness(businessId: string): Promise<ContactChannel[]>;
  updateContact(id: string, patch: UpdateContactPatch): Promise<ContactChannel | null>;
  setContactEnabled(id: string, enabled: boolean): Promise<ContactChannel | null>;

  // Business policies (one row per business)
  getBusinessPolicies(businessId: string): Promise<BusinessPolicies | null>;
  upsertBusinessPolicies(businessId: string, policies: BusinessPolicies): Promise<BusinessPolicies>;

  // Business environment (test/production)
  setBusinessEnvironment(businessId: string, environment: 'test' | 'production'): Promise<void>;
  getBusinessEnvironment(businessId: string): Promise<'test' | 'production' | null>;

  // Audit
  recordAudit(input: AuditEventInput): Promise<BusinessAuditEventRecord>;
  listAuditByBusiness(businessId: string, limit?: number): Promise<BusinessAuditEventRecord[]>;

  // Media assets (images) — see media/*
  createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset>;
  getMediaAssetById(id: string): Promise<MediaAsset | null>;
  listMediaByBusiness(businessId: string): Promise<MediaAsset[]>;
  listMediaByProperty(propertyId: string): Promise<MediaAsset[]>;
  /** Selection pool: ACTIVE + ownerVerified + approvedForDrafts, business + its properties. */
  listSelectableMediaByBusiness(businessId: string): Promise<MediaAsset[]>;
  updateMediaAsset(id: string, patch: UpdateMediaAssetPatch): Promise<MediaAsset | null>;
}

// ── Defaults / builders ───────────────────────────────────────────────────────

export function emptyAmenities(): Property['amenities'] {
  return {
    // Tri-state facts default to UNKNOWN — a brand-new property has told us
    // nothing yet; never assume a confirmed absence.
    privatePool: 'UNKNOWN',
    beachfront: 'UNKNOWN',
    nearBeach: 'UNKNOWN',
    riverfront: 'UNKNOWN',
    sharedPool: false,
    mountainView: false,
    parking: false,
    kitchen: false,
    bbq: false,
    karaoke: false,
    poolTable: false,
    petFriendly: false,
    wifi: false,
    airConditioning: false,
    other: [],
  };
}

export function emptyPricing(): Property['pricing'] {
  return {
    startingPrice: null,
    priceDisplayMode: 'DO_NOT_SHOW',
    weekdayPrice: null,
    weekendPrice: null,
    holidayPolicy: null,
    securityDeposit: null,
    extraGuestPrice: null,
  };
}

export function emptyPropertyDefaults(): Omit<
  Property,
  'id' | 'workspaceId' | 'businessId' | 'name' | 'createdAt' | 'updatedAt'
> {
  return {
    code: null,
    propertyType: null,
    status: 'active',
    description: null,
    location: {
      province: null,
      district: null,
      subdistrict: null,
      area: null,
      address: null,
      latitude: null,
      longitude: null,
    },
    capacity: {
      bedrooms: null,
      bathrooms: null,
      beds: null,
      maxGuests: null,
      extraGuestPolicy: null,
    },
    amenities: emptyAmenities(),
    pricing: emptyPricing(),
    content: { sellingPoints: [], importantNotes: null, prohibitedClaims: [], responseNotes: null },
    media: { coverImage: null, gallery: [], videoUrl: null, mapUrl: null },
    policyOverrides: {
      availabilityPolicy: null,
      pricingPolicy: null,
      promotionPolicy: null,
      bookingPolicy: null,
      prohibitedClaims: null,
    },
  };
}

/** Deep-merge a patch into a property (used by both stores). */
export function applyPropertyPatch(p: Property, patch: UpdatePropertyPatch): Property {
  return {
    ...p,
    name: patch.name ?? p.name,
    code: patch.code !== undefined ? patch.code : p.code,
    propertyType: patch.propertyType !== undefined ? patch.propertyType : p.propertyType,
    status: patch.status ?? p.status,
    description: patch.description !== undefined ? patch.description : p.description,
    location: { ...p.location, ...(patch.location ?? {}) },
    capacity: { ...p.capacity, ...(patch.capacity ?? {}) },
    amenities: { ...p.amenities, ...(patch.amenities ?? {}) },
    pricing: { ...p.pricing, ...(patch.pricing ?? {}) },
    content: { ...p.content, ...(patch.content ?? {}) },
    media: { ...p.media, ...(patch.media ?? {}) },
    updatedAt: new Date(),
  };
}
