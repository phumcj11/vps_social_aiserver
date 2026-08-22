import type {
  Property,
  ContactChannel,
  BusinessPolicies,
  PropertyPolicyOverrides,
  EntityStatus,
} from './types';
import {
  type BusinessPropertyStore,
  type CreatePropertyInput,
  type UpdatePropertyPatch,
  type CreateContactInput,
  type UpdateContactPatch,
  type AuditEventInput,
  type BusinessAuditEventRecord,
  type MediaAsset,
  type CreateMediaAssetInput,
  type UpdateMediaAssetPatch,
  emptyPropertyDefaults,
  applyPropertyPatch,
} from './store';

/** In-memory BusinessPropertyStore — used by tests and as the reference impl. */
export class InMemoryBusinessPropertyStore implements BusinessPropertyStore {
  private properties = new Map<string, Property>();
  private contacts = new Map<string, ContactChannel>();
  private businessPolicies = new Map<string, BusinessPolicies>();
  private businessEnv = new Map<string, 'test' | 'production'>();
  private audit: BusinessAuditEventRecord[] = [];

  async createProperty(input: CreatePropertyInput): Promise<Property> {
    const now = new Date();
    const p: Property = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      name: input.name,
      ...emptyPropertyDefaults(),
      code: input.code ?? null,
      propertyType: input.propertyType ?? null,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.properties.set(p.id, p);
    return clone(p);
  }

  async getPropertyById(id: string): Promise<Property | null> {
    const p = this.properties.get(id);
    return p ? clone(p) : null;
  }

  async listPropertiesByBusiness(businessId: string): Promise<Property[]> {
    return [...this.properties.values()]
      .filter((p) => p.businessId === businessId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(clone);
  }

  async isPropertyCodeTaken(businessId: string, code: string, exceptId?: string): Promise<boolean> {
    return [...this.properties.values()].some(
      (p) => p.businessId === businessId && p.code === code && p.id !== exceptId,
    );
  }

  async updateProperty(id: string, patch: UpdatePropertyPatch): Promise<Property | null> {
    const p = this.properties.get(id);
    if (!p) return null;
    const updated = applyPropertyPatch(p, patch);
    this.properties.set(id, updated);
    return clone(updated);
  }

  async setPropertyStatus(id: string, status: EntityStatus): Promise<Property | null> {
    return this.updateProperty(id, { status });
  }

  async setPropertyPolicyOverrides(
    id: string,
    overrides: PropertyPolicyOverrides,
  ): Promise<Property | null> {
    const p = this.properties.get(id);
    if (!p) return null;
    const updated: Property = { ...p, policyOverrides: overrides, updatedAt: new Date() };
    this.properties.set(id, updated);
    return clone(updated);
  }

  async countActivePropertiesByBusiness(businessId: string): Promise<number> {
    return [...this.properties.values()].filter(
      (p) => p.businessId === businessId && p.status === 'active',
    ).length;
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
    this.contacts.set(c.id, c);
    return { ...c };
  }

  async getContactById(id: string): Promise<ContactChannel | null> {
    const c = this.contacts.get(id);
    return c ? { ...c } : null;
  }

  async listContactsByBusiness(businessId: string): Promise<ContactChannel[]> {
    return [...this.contacts.values()]
      .filter((c) => c.businessId === businessId)
      .map((c) => ({ ...c }));
  }

  async updateContact(id: string, patch: UpdateContactPatch): Promise<ContactChannel | null> {
    const c = this.contacts.get(id);
    if (!c) return null;
    const updated: ContactChannel = {
      ...c,
      value: patch.value ?? c.value,
      label: patch.label !== undefined ? patch.label : c.label,
      enabled: patch.enabled ?? c.enabled,
      approvedForDrafts: patch.approvedForDrafts ?? c.approvedForDrafts,
      approvedForPublicResponse: patch.approvedForPublicResponse ?? c.approvedForPublicResponse,
      ownerVerifiedAt:
        patch.ownerVerified === true
          ? (c.ownerVerifiedAt ?? new Date())
          : patch.ownerVerified === false
            ? null
            : c.ownerVerifiedAt,
    };
    this.contacts.set(id, updated);
    return { ...updated };
  }

  async setContactEnabled(id: string, enabled: boolean): Promise<ContactChannel | null> {
    return this.updateContact(id, { enabled });
  }

  async getBusinessPolicies(businessId: string): Promise<BusinessPolicies | null> {
    const p = this.businessPolicies.get(businessId);
    return p ? { ...p, prohibitedClaims: [...p.prohibitedClaims] } : null;
  }

  async upsertBusinessPolicies(
    businessId: string,
    policies: BusinessPolicies,
  ): Promise<BusinessPolicies> {
    const stored = { ...policies, prohibitedClaims: [...policies.prohibitedClaims] };
    this.businessPolicies.set(businessId, stored);
    return { ...stored };
  }

  async setBusinessEnvironment(
    businessId: string,
    environment: 'test' | 'production',
  ): Promise<void> {
    this.businessEnv.set(businessId, environment);
  }

  async getBusinessEnvironment(businessId: string): Promise<'test' | 'production' | null> {
    return this.businessEnv.get(businessId) ?? null;
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
    this.audit.push(rec);
    return { ...rec };
  }

  async listAuditByBusiness(businessId: string, limit = 100): Promise<BusinessAuditEventRecord[]> {
    return this.audit
      .filter((a) => a.businessId === businessId)
      .slice(-limit)
      .reverse()
      .map((a) => ({ ...a }));
  }

  // ── Media assets ──────────────────────────────────────────────────────────
  private media = new Map<string, MediaAsset>();

  async createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset> {
    const now = new Date();
    const asset: MediaAsset = {
      ...input,
      mediaType: 'IMAGE',
      status: 'ACTIVE',
      approvedForDrafts: false,
      approvedForPublicResponse: false,
      ownerVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    this.media.set(asset.id, asset);
    return { ...asset };
  }
  async getMediaAssetById(id: string): Promise<MediaAsset | null> {
    const a = this.media.get(id);
    return a ? { ...a } : null;
  }
  async listMediaByBusiness(businessId: string): Promise<MediaAsset[]> {
    return [...this.media.values()]
      .filter((a) => a.businessId === businessId)
      .map((a) => ({ ...a }));
  }
  async listMediaByProperty(propertyId: string): Promise<MediaAsset[]> {
    return [...this.media.values()]
      .filter((a) => a.propertyId === propertyId)
      .map((a) => ({ ...a }));
  }
  async listSelectableMediaByBusiness(businessId: string): Promise<MediaAsset[]> {
    return [...this.media.values()]
      .filter(
        (a) =>
          a.businessId === businessId &&
          a.status === 'ACTIVE' &&
          a.ownerVerified &&
          a.approvedForDrafts,
      )
      .map((a) => ({ ...a }));
  }
  async updateMediaAsset(id: string, patch: UpdateMediaAssetPatch): Promise<MediaAsset | null> {
    const a = this.media.get(id);
    if (!a) return null;
    const next: MediaAsset = { ...a, ...patch, updatedAt: new Date() };
    this.media.set(id, next);
    return { ...next };
  }
}

function clone(p: Property): Property {
  return {
    ...p,
    location: { ...p.location },
    capacity: { ...p.capacity },
    amenities: { ...p.amenities, other: [...p.amenities.other] },
    pricing: { ...p.pricing },
    content: {
      ...p.content,
      sellingPoints: [...p.content.sellingPoints],
      prohibitedClaims: [...p.content.prohibitedClaims],
    },
    media: { ...p.media, gallery: [...p.media.gallery] },
    policyOverrides: {
      ...p.policyOverrides,
      prohibitedClaims: p.policyOverrides.prohibitedClaims
        ? [...p.policyOverrides.prohibitedClaims]
        : null,
    },
  };
}
