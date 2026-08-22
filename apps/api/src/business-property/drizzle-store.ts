import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  properties as propertiesTable,
  businessContacts as contactsTable,
  businessPolicies as businessPoliciesTable,
  businesses as businessesTable,
  businessAuditEvents as auditTable,
  type PropertyRow,
  type BusinessContactRow,
  type BusinessPolicyRow,
} from '../db/schema';
import { newId } from '../lib/tokens';
import type {
  Property,
  ContactChannel,
  BusinessPolicies,
  PropertyPolicyOverrides,
  EntityStatus,
} from './types';
import { DEFAULT_NO_PROPERTY_MATCH_STRATEGY } from './types';
import {
  type BusinessPropertyStore,
  type CreatePropertyInput,
  type UpdatePropertyPatch,
  type CreateContactInput,
  type UpdateContactPatch,
  type AuditEventInput,
  type BusinessAuditEventRecord,
  emptyPropertyDefaults,
  applyPropertyPatch,
} from './store';

/**
 * Drizzle-backed BusinessPropertyStore (SPRINT 015). Normalized queryable
 * columns for matching/filtering; a JSON `details` blob for variable structured
 * attributes (amenities, pricing, content, media, location extras, policy
 * overrides). Prices live in `details` and are stored ONLY when entered.
 */
export class DrizzleBusinessPropertyStore implements BusinessPropertyStore {
  constructor(private readonly db: Database) {}

  async createProperty(input: CreatePropertyInput): Promise<Property> {
    const p: Property = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      name: input.name,
      ...emptyPropertyDefaults(),
      code: input.code ?? null,
      propertyType: input.propertyType ?? null,
      description: input.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.db.insert(propertiesTable).values(toPropertyRow(p));
    return (await this.getPropertyById(p.id))!;
  }

  async getPropertyById(id: string): Promise<Property | null> {
    const [row] = await this.db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.id, id))
      .limit(1);
    return row ? fromPropertyRow(row) : null;
  }

  async listPropertiesByBusiness(businessId: string): Promise<Property[]> {
    const rows = await this.db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.businessId, businessId))
      .orderBy(propertiesTable.createdAt);
    return rows.map(fromPropertyRow);
  }

  async isPropertyCodeTaken(businessId: string, code: string, exceptId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(and(eq(propertiesTable.businessId, businessId), eq(propertiesTable.code, code)));
    return rows.some((r) => r.id !== exceptId);
  }

  async updateProperty(id: string, patch: UpdatePropertyPatch): Promise<Property | null> {
    const existing = await this.getPropertyById(id);
    if (!existing) return null;
    const updated = applyPropertyPatch(existing, patch);
    await this.db
      .update(propertiesTable)
      .set(toPropertyRow(updated))
      .where(eq(propertiesTable.id, id));
    return this.getPropertyById(id);
  }

  async setPropertyStatus(id: string, status: EntityStatus): Promise<Property | null> {
    return this.updateProperty(id, { status });
  }

  async setPropertyPolicyOverrides(
    id: string,
    overrides: PropertyPolicyOverrides,
  ): Promise<Property | null> {
    const existing = await this.getPropertyById(id);
    if (!existing) return null;
    const updated: Property = { ...existing, policyOverrides: overrides, updatedAt: new Date() };
    await this.db
      .update(propertiesTable)
      .set(toPropertyRow(updated))
      .where(eq(propertiesTable.id, id));
    return this.getPropertyById(id);
  }

  async countActivePropertiesByBusiness(businessId: string): Promise<number> {
    const rows = await this.db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(and(eq(propertiesTable.businessId, businessId), eq(propertiesTable.status, 'active')));
    return rows.length;
  }

  async createContact(input: CreateContactInput): Promise<ContactChannel> {
    const c: ContactChannel = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      type: input.type,
      value: input.value,
      label: input.label ?? null,
      enabled: true,
      approvedForDrafts: false,
      approvedForPublicResponse: false,
      ownerVerifiedAt: null,
    };
    await this.db.insert(contactsTable).values({
      id: c.id,
      workspaceId: c.workspaceId,
      businessId: c.businessId,
      type: c.type,
      value: c.value,
      label: c.label,
      enabled: c.enabled,
      approvedForDrafts: c.approvedForDrafts,
      approvedForPublicResponse: c.approvedForPublicResponse,
      ownerVerifiedAt: c.ownerVerifiedAt,
    });
    return c;
  }

  async getContactById(id: string): Promise<ContactChannel | null> {
    const [row] = await this.db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.id, id))
      .limit(1);
    return row ? fromContactRow(row) : null;
  }

  async listContactsByBusiness(businessId: string): Promise<ContactChannel[]> {
    const rows = await this.db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.businessId, businessId));
    return rows.map(fromContactRow);
  }

  async updateContact(id: string, patch: UpdateContactPatch): Promise<ContactChannel | null> {
    const c = await this.getContactById(id);
    if (!c) return null;
    const ownerVerifiedAt =
      patch.ownerVerified === true
        ? (c.ownerVerifiedAt ?? new Date())
        : patch.ownerVerified === false
          ? null
          : c.ownerVerifiedAt;
    await this.db
      .update(contactsTable)
      .set({
        value: patch.value ?? c.value,
        label: patch.label !== undefined ? patch.label : c.label,
        enabled: patch.enabled ?? c.enabled,
        approvedForDrafts: patch.approvedForDrafts ?? c.approvedForDrafts,
        approvedForPublicResponse: patch.approvedForPublicResponse ?? c.approvedForPublicResponse,
        ownerVerifiedAt,
      })
      .where(eq(contactsTable.id, id));
    return this.getContactById(id);
  }

  async setContactEnabled(id: string, enabled: boolean): Promise<ContactChannel | null> {
    return this.updateContact(id, { enabled });
  }

  async getBusinessPolicies(businessId: string): Promise<BusinessPolicies | null> {
    const [row] = await this.db
      .select()
      .from(businessPoliciesTable)
      .where(eq(businessPoliciesTable.businessId, businessId))
      .limit(1);
    return row ? fromPolicyRow(row) : null;
  }

  async upsertBusinessPolicies(
    businessId: string,
    policies: BusinessPolicies,
  ): Promise<BusinessPolicies> {
    const existing = await this.getBusinessPolicies(businessId);
    const values = {
      availabilityPolicy: policies.availabilityPolicy,
      pricingPolicy: policies.pricingPolicy,
      promotionPolicy: policies.promotionPolicy,
      bookingPolicy: policies.bookingPolicy,
      cancellationInfoPolicy: policies.cancellationInfoPolicy,
      prohibitedClaims: JSON.stringify(policies.prohibitedClaims),
      escalationPolicy: policies.escalationPolicy,
      responsibleOwner: policies.responsibleOwner,
      operatingHours: policies.operatingHours,
      responseSlaMinutes: policies.responseSlaMinutes,
      noPropertyMatchStrategy: policies.noPropertyMatchStrategy,
      allowNearMatchSuggestions: policies.allowNearMatchSuggestions,
    };
    if (existing) {
      await this.db
        .update(businessPoliciesTable)
        .set(values)
        .where(eq(businessPoliciesTable.businessId, businessId));
    } else {
      await this.db.insert(businessPoliciesTable).values({ id: newId(), businessId, ...values });
    }
    return policies;
  }

  async setBusinessEnvironment(
    businessId: string,
    environment: 'test' | 'production',
  ): Promise<void> {
    await this.db
      .update(businessesTable)
      .set({ environment })
      .where(eq(businessesTable.id, businessId));
  }

  async getBusinessEnvironment(businessId: string): Promise<'test' | 'production' | null> {
    const [row] = await this.db
      .select({ environment: businessesTable.environment })
      .from(businessesTable)
      .where(eq(businessesTable.id, businessId))
      .limit(1);
    return row ? ((row.environment as 'test' | 'production') ?? null) : null;
  }

  async recordAudit(input: AuditEventInput): Promise<BusinessAuditEventRecord> {
    const rec: BusinessAuditEventRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      propertyId: input.propertyId ?? null,
      eventType: input.eventType,
      actorEmail: input.actorEmail ?? null,
      payload: input.payload ?? null,
      createdAt: new Date(),
    };
    await this.db.insert(auditTable).values({
      id: rec.id,
      workspaceId: rec.workspaceId,
      businessId: rec.businessId,
      propertyId: rec.propertyId,
      eventType: rec.eventType,
      actorEmail: rec.actorEmail,
      payload: rec.payload ? JSON.stringify(rec.payload) : null,
    });
    return rec;
  }

  async listAuditByBusiness(businessId: string, limit = 100): Promise<BusinessAuditEventRecord[]> {
    const rows = await this.db
      .select()
      .from(auditTable)
      .where(eq(auditTable.businessId, businessId))
      .orderBy(desc(auditTable.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      businessId: r.businessId,
      propertyId: r.propertyId,
      eventType: r.eventType,
      actorEmail: r.actorEmail,
      payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
      createdAt: r.createdAt,
    }));
  }
}

// ── Row ↔ domain mappers ──────────────────────────────────────────────────────

interface PropertyDetails {
  subdistrict: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  extraGuestPolicy: string | null;
  amenities: Property['amenities'];
  pricing: Property['pricing'];
  content: Property['content'];
  media: Property['media'];
  policyOverrides: PropertyPolicyOverrides;
}

function toPropertyRow(p: Property): typeof propertiesTable.$inferInsert {
  const details: PropertyDetails = {
    subdistrict: p.location.subdistrict,
    address: p.location.address,
    latitude: p.location.latitude,
    longitude: p.location.longitude,
    extraGuestPolicy: p.capacity.extraGuestPolicy,
    amenities: p.amenities,
    pricing: p.pricing,
    content: p.content,
    media: p.media,
    policyOverrides: p.policyOverrides,
  };
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    businessId: p.businessId,
    name: p.name,
    code: p.code,
    propertyType: p.propertyType,
    status: p.status,
    description: p.description,
    province: p.location.province,
    district: p.location.district,
    area: p.location.area,
    maxGuests: p.capacity.maxGuests,
    bedrooms: p.capacity.bedrooms,
    bathrooms: p.capacity.bathrooms,
    beds: p.capacity.beds,
    privatePool: p.amenities.privatePool,
    nearBeach: p.amenities.nearBeach,
    beachfront: p.amenities.beachfront,
    riverfront: p.amenities.riverfront,
    details: JSON.stringify(details),
  };
}

function fromPropertyRow(row: PropertyRow): Property {
  const d = (row.details ? JSON.parse(row.details) : {}) as Partial<PropertyDetails>;
  const defaults = emptyPropertyDefaults();
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    name: row.name,
    code: row.code,
    propertyType: row.propertyType,
    status: row.status as EntityStatus,
    description: row.description,
    location: {
      province: row.province,
      district: row.district,
      subdistrict: d.subdistrict ?? null,
      area: row.area,
      address: d.address ?? null,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
    },
    capacity: {
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      beds: row.beds,
      maxGuests: row.maxGuests,
      extraGuestPolicy: d.extraGuestPolicy ?? null,
    },
    amenities: d.amenities ?? defaults.amenities,
    pricing: d.pricing ?? defaults.pricing,
    content: d.content ?? defaults.content,
    media: d.media ?? defaults.media,
    policyOverrides: d.policyOverrides ?? defaults.policyOverrides,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromContactRow(row: BusinessContactRow): ContactChannel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    type: row.type as ContactChannel['type'],
    value: row.value,
    label: row.label,
    enabled: row.enabled,
    approvedForDrafts: row.approvedForDrafts,
    approvedForPublicResponse: row.approvedForPublicResponse,
    ownerVerifiedAt: row.ownerVerifiedAt,
  };
}

function fromPolicyRow(row: BusinessPolicyRow): BusinessPolicies {
  return {
    availabilityPolicy:
      (row.availabilityPolicy as BusinessPolicies['availabilityPolicy']) ?? 'DO_NOT_MENTION',
    pricingPolicy: (row.pricingPolicy as BusinessPolicies['pricingPolicy']) ?? 'DO_NOT_MENTION',
    promotionPolicy: (row.promotionPolicy as BusinessPolicies['promotionPolicy']) ?? 'NONE',
    bookingPolicy: (row.bookingPolicy as BusinessPolicies['bookingPolicy']) ?? 'CONTACT_ONLY',
    cancellationInfoPolicy: row.cancellationInfoPolicy,
    prohibitedClaims: row.prohibitedClaims ? (JSON.parse(row.prohibitedClaims) as string[]) : [],
    escalationPolicy: row.escalationPolicy,
    responsibleOwner: row.responsibleOwner,
    operatingHours: row.operatingHours,
    responseSlaMinutes: row.responseSlaMinutes,
    noPropertyMatchStrategy:
      (row.noPropertyMatchStrategy as BusinessPolicies['noPropertyMatchStrategy']) ??
      DEFAULT_NO_PROPERTY_MATCH_STRATEGY,
    allowNearMatchSuggestions: Boolean(row.allowNearMatchSuggestions),
  };
}
