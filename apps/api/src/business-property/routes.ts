import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store, BusinessRecord, WorkspaceRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { errors } from '../lib/errors';
import { newId } from '../lib/tokens';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { BusinessPropertyStore } from './store';
import type { Property, BusinessPolicies, BusinessReadinessSnapshot } from './types';
import { evaluateBusinessReadiness, evaluatePropertyReadiness } from './readiness';
import { resolvePropertyPolicies } from './policies';
import { isValidContactValue, publicContactChannel } from './contacts';

export interface BusinessPropertyDeps {
  store: Store;
  bpStore: BusinessPropertyStore;
  env: ApiEnv;
  logger: Logger;
}

const contactType = z.enum([
  'PHONE',
  'LINE_ID',
  'LINE_OA',
  'FACEBOOK_PAGE',
  'WEBSITE',
  'EMAIL',
  'OTHER',
]);
const availabilityPolicy = z.enum([
  'MANUAL_CONFIRMATION',
  'OWNER_SYSTEM',
  'EXTERNAL_CALENDAR',
  'DO_NOT_MENTION',
]);
const pricingPolicy = z.enum([
  'DO_NOT_MENTION',
  'STARTING_FROM',
  'FIXED_REFERENCE',
  'MANUAL_CONFIRMATION',
]);
const promotionPolicy = z.enum(['NONE', 'APPROVED_ONLY', 'MANUAL_CONFIRMATION']);
const bookingPolicy = z.enum(['CONTACT_ONLY', 'LINE', 'PHONE', 'WEBSITE', 'MANUAL']);

const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(80).optional(),
  propertyType: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
});
const updatePropertySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(80).nullable().optional(),
  propertyType: z.string().max(80).nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  description: z.string().max(4000).nullable().optional(),
  location: z
    .object({
      province: z.string().max(120).nullable().optional(),
      district: z.string().max(120).nullable().optional(),
      subdistrict: z.string().max(120).nullable().optional(),
      area: z.string().max(120).nullable().optional(),
      address: z.string().max(400).nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    })
    .optional(),
  capacity: z
    .object({
      bedrooms: z.number().int().nonnegative().nullable().optional(),
      bathrooms: z.number().int().nonnegative().nullable().optional(),
      beds: z.number().int().nonnegative().nullable().optional(),
      maxGuests: z.number().int().positive().nullable().optional(),
      extraGuestPolicy: z.string().max(400).nullable().optional(),
    })
    .optional(),
  amenities: z.record(z.union([z.boolean(), z.array(z.string())])).optional(),
  pricing: z
    .object({
      startingPrice: z.number().nonnegative().nullable().optional(),
      priceDisplayMode: z.enum(['DO_NOT_SHOW', 'STARTING_FROM', 'RANGE', 'ON_REQUEST']).optional(),
      weekdayPrice: z.number().nonnegative().nullable().optional(),
      weekendPrice: z.number().nonnegative().nullable().optional(),
      holidayPolicy: z.string().max(400).nullable().optional(),
      securityDeposit: z.number().nonnegative().nullable().optional(),
      extraGuestPrice: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
  content: z
    .object({
      sellingPoints: z.array(z.string()).optional(),
      importantNotes: z.string().max(4000).nullable().optional(),
      prohibitedClaims: z.array(z.string()).optional(),
      responseNotes: z.string().max(4000).nullable().optional(),
    })
    .optional(),
});

const createContactSchema = z.object({
  type: contactType,
  value: z.string().min(1).max(255),
  label: z.string().max(120).optional(),
});
const updateContactSchema = z.object({
  value: z.string().min(1).max(255).optional(),
  label: z.string().max(120).nullable().optional(),
  enabled: z.boolean().optional(),
  approvedForDrafts: z.boolean().optional(),
  approvedForPublicResponse: z.boolean().optional(),
  ownerVerified: z.boolean().optional(),
});

const policiesSchema = z.object({
  availabilityPolicy,
  pricingPolicy,
  promotionPolicy,
  bookingPolicy,
  cancellationInfoPolicy: z.string().max(2000).nullable().optional(),
  prohibitedClaims: z.array(z.string()),
  escalationPolicy: z.string().max(2000).nullable().optional(),
  responsibleOwner: z.string().max(200).nullable().optional(),
  operatingHours: z.string().max(200).nullable().optional(),
  responseSlaMinutes: z.number().int().positive().nullable().optional(),
});

function publicProperty(p: Property) {
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    code: p.code,
    propertyType: p.propertyType,
    status: p.status,
    description: p.description,
    location: p.location,
    capacity: p.capacity,
    amenities: p.amenities,
    pricing: p.pricing,
    content: p.content,
    media: p.media,
    policyOverrides: p.policyOverrides,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function registerBusinessPropertyRoutes(
  app: FastifyInstance,
  deps: BusinessPropertyDeps,
): void {
  const { store, bpStore, env, logger } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspace(req: FastifyRequest): Promise<WorkspaceRecord> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws;
  }
  async function loadOwnedBusiness(
    req: FastifyRequest,
    businessId: string,
  ): Promise<BusinessRecord> {
    const ws = await requireWorkspace(req);
    const business = await store.getBusinessById(businessId);
    if (!business || business.workspaceId !== ws.id) {
      throw errors.notFound('business_not_found', 'Business not found');
    }
    return business;
  }
  async function loadOwnedProperty(
    req: FastifyRequest,
    businessId: string,
    propertyId: string,
  ): Promise<Property> {
    const business = await loadOwnedBusiness(req, businessId);
    const p = await bpStore.getPropertyById(propertyId);
    if (!p || p.businessId !== business.id || p.workspaceId !== business.workspaceId) {
      throw errors.notFound('property_not_found', 'Property not found');
    }
    return p;
  }
  async function audit(
    ws: string,
    eventType: string,
    actorEmail: string | null,
    ids: { businessId?: string; propertyId?: string },
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await bpStore.recordAudit({
      id: newId(),
      workspaceId: ws,
      businessId: ids.businessId ?? null,
      propertyId: ids.propertyId ?? null,
      eventType,
      actorEmail,
      payload: payload ?? null,
    });
  }

  // ── Business environment ─────────────────────────────────────────────────────
  app.patch(
    '/businesses/:id/environment',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      const business = await loadOwnedBusiness(req, id);
      const parsed = z.object({ environment: z.enum(['test', 'production']) }).safeParse(req.body);
      if (!parsed.success) throw errors.validation('environment must be test or production');
      await bpStore.setBusinessEnvironment(id, parsed.data.environment);
      await audit(
        business.workspaceId,
        'BusinessUpdated',
        req.authUser!.email,
        { businessId: id },
        { environment: parsed.data.environment },
      );
      return { environment: parsed.data.environment };
    },
  );

  // ── Business policies ────────────────────────────────────────────────────────
  app.get('/businesses/:id/policies', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const policies = await bpStore.getBusinessPolicies(id);
    return { policies };
  });
  app.put(
    '/businesses/:id/policies',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      const business = await loadOwnedBusiness(req, id);
      const parsed = policiesSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid policies');
      const policies: BusinessPolicies = {
        availabilityPolicy: parsed.data.availabilityPolicy,
        pricingPolicy: parsed.data.pricingPolicy,
        promotionPolicy: parsed.data.promotionPolicy,
        bookingPolicy: parsed.data.bookingPolicy,
        cancellationInfoPolicy: parsed.data.cancellationInfoPolicy ?? null,
        prohibitedClaims: parsed.data.prohibitedClaims,
        escalationPolicy: parsed.data.escalationPolicy ?? null,
        responsibleOwner: parsed.data.responsibleOwner ?? null,
        operatingHours: parsed.data.operatingHours ?? null,
        responseSlaMinutes: parsed.data.responseSlaMinutes ?? null,
      };
      const saved = await bpStore.upsertBusinessPolicies(id, policies);
      await audit(business.workspaceId, 'PolicyChanged', req.authUser!.email, { businessId: id });
      return { policies: saved };
    },
  );

  // ── Contacts ─────────────────────────────────────────────────────────────────
  app.get('/businesses/:id/contacts', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const contacts = await bpStore.listContactsByBusiness(id);
    return { contacts: contacts.map(publicContactChannel) };
  });
  app.post(
    '/businesses/:id/contacts',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      const business = await loadOwnedBusiness(req, id);
      const parsed = createContactSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Contact type and value are required');
      if (!isValidContactValue(parsed.data.type, parsed.data.value)) {
        throw errors.validation(`Invalid value for ${parsed.data.type}`);
      }
      const contact = await bpStore.createContact({
        id: newId(),
        workspaceId: business.workspaceId,
        businessId: id,
        type: parsed.data.type,
        value: parsed.data.value,
        label: parsed.data.label ?? null,
      });
      await audit(
        business.workspaceId,
        'ContactChanged',
        req.authUser!.email,
        { businessId: id },
        { action: 'created', type: contact.type },
      );
      reply.code(201);
      return { contact: publicContactChannel(contact) };
    },
  );
  app.patch(
    '/businesses/:id/contacts/:cid',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, cid } = req.params as { id: string; cid: string };
      const business = await loadOwnedBusiness(req, id);
      const existing = await bpStore.getContactById(cid);
      if (
        !existing ||
        existing.businessId !== id ||
        existing.workspaceId !== business.workspaceId
      ) {
        throw errors.notFound('contact_not_found', 'Contact not found');
      }
      const parsed = updateContactSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Nothing valid to update');
      if (
        parsed.data.value !== undefined &&
        !isValidContactValue(existing.type, parsed.data.value)
      ) {
        throw errors.validation(`Invalid value for ${existing.type}`);
      }
      const updated = await bpStore.updateContact(cid, parsed.data);
      await audit(
        business.workspaceId,
        'ContactChanged',
        req.authUser!.email,
        { businessId: id },
        { action: 'updated' },
      );
      return { contact: publicContactChannel(updated!) };
    },
  );

  // ── Properties ───────────────────────────────────────────────────────────────
  app.get('/businesses/:id/properties', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const list = await bpStore.listPropertiesByBusiness(id);
    return { properties: list.map(publicProperty) };
  });
  app.post(
    '/businesses/:id/properties',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      const business = await loadOwnedBusiness(req, id);
      const parsed = createPropertySchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Property name is required');
      if (parsed.data.code && (await bpStore.isPropertyCodeTaken(id, parsed.data.code))) {
        throw errors.conflict('property_code_taken', 'A property with this code already exists');
      }
      const property = await bpStore.createProperty({
        id: newId(),
        workspaceId: business.workspaceId,
        businessId: id,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        propertyType: parsed.data.propertyType ?? null,
        description: parsed.data.description ?? null,
      });
      await audit(business.workspaceId, 'PropertyCreated', req.authUser!.email, {
        businessId: id,
        propertyId: property.id,
      });
      reply.code(201);
      return { property: publicProperty(property) };
    },
  );
  app.get('/businesses/:id/properties/:pid', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id, pid } = req.params as { id: string; pid: string };
    const p = await loadOwnedProperty(req, id, pid);
    return { property: publicProperty(p) };
  });
  app.patch(
    '/businesses/:id/properties/:pid',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, pid } = req.params as { id: string; pid: string };
      const p = await loadOwnedProperty(req, id, pid);
      const parsed = updatePropertySchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Nothing valid to update');
      if (parsed.data.code && (await bpStore.isPropertyCodeTaken(id, parsed.data.code, pid))) {
        throw errors.conflict('property_code_taken', 'A property with this code already exists');
      }
      const updated = await bpStore.updateProperty(pid, parsed.data as never);
      await audit(p.workspaceId, 'PropertyUpdated', req.authUser!.email, {
        businessId: id,
        propertyId: pid,
      });
      return { property: publicProperty(updated!) };
    },
  );
  app.post(
    '/businesses/:id/properties/:pid/archive',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, pid } = req.params as { id: string; pid: string };
      const p = await loadOwnedProperty(req, id, pid);
      const updated = await bpStore.setPropertyStatus(pid, 'archived');
      await audit(p.workspaceId, 'PropertyArchived', req.authUser!.email, {
        businessId: id,
        propertyId: pid,
      });
      return { property: publicProperty(updated!) };
    },
  );
  app.put(
    '/businesses/:id/properties/:pid/policies',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, pid } = req.params as { id: string; pid: string };
      const p = await loadOwnedProperty(req, id, pid);
      const schema = z.object({
        availabilityPolicy: availabilityPolicy.nullable(),
        pricingPolicy: pricingPolicy.nullable(),
        promotionPolicy: promotionPolicy.nullable(),
        bookingPolicy: bookingPolicy.nullable(),
        prohibitedClaims: z.array(z.string()).nullable(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid property policy overrides');
      const updated = await bpStore.setPropertyPolicyOverrides(pid, parsed.data);
      await audit(p.workspaceId, 'PolicyChanged', req.authUser!.email, {
        businessId: id,
        propertyId: pid,
      });
      return { property: publicProperty(updated!) };
    },
  );

  // ── Readiness ────────────────────────────────────────────────────────────────
  app.get('/businesses/:id/readiness', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    const business = await loadOwnedBusiness(req, id);
    const [environment, profile, contacts, policies, activeProps] = await Promise.all([
      bpStore.getBusinessEnvironment(id),
      store.getProfileByBusiness(id),
      bpStore.listContactsByBusiness(id),
      bpStore.getBusinessPolicies(id),
      bpStore.countActivePropertiesByBusiness(id),
    ]);
    const snapshot: BusinessReadinessSnapshot = {
      business: {
        id: business.id,
        workspaceId: business.workspaceId,
        name: business.name,
        environment: environment ?? 'test',
        status: business.status as never,
      },
      displayName: business.name,
      serviceArea: profile?.serviceArea ?? null,
      responseTone: profile?.responseTone ?? null,
      contacts,
      policies,
      activeProductionPropertyCount: activeProps,
    };
    return { readiness: evaluateBusinessReadiness(snapshot) };
  });
  app.get(
    '/businesses/:id/properties/:pid/readiness',
    { preHandler: authenticate },
    async (req, reply) => {
      noStore(reply);
      const { id, pid } = req.params as { id: string; pid: string };
      const p = await loadOwnedProperty(req, id, pid);
      const businessPolicies = await bpStore.getBusinessPolicies(id);
      if (!businessPolicies) {
        return {
          readiness: {
            ready: false,
            status: 'NOT_READY',
            missing: ['business policies (set business policies first)'],
          },
        };
      }
      const effective = resolvePropertyPolicies(businessPolicies, p.policyOverrides);
      return { readiness: evaluatePropertyReadiness(p, effective), effectivePolicies: effective };
    },
  );

  logger.info('business_property.routes_registered', {});
}
