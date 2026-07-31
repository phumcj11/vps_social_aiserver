import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store, BusinessRecord, FacebookGroupRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { newId } from '../lib/tokens';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { AuditService, AuditEventTypes } from '../lib/audit';
import { GroupValidationService, toSafeGroup } from './group-validation';
import { normaliseGroupUrl } from './group-url';
import { FacebookError, FacebookErrorCode } from './errors';

export interface GroupRouteDeps {
  store: Store;
  env: ApiEnv;
  groupValidation: GroupValidationService;
  audit: AuditService;
}

function publicBusiness(b: BusinessRecord) {
  return { id: b.id, name: b.name, slug: b.slug, status: b.status };
}

/** Map a FacebookError to a safe HTTP AppError. */
function toHttp(err: unknown): never {
  if (err instanceof FacebookError) {
    switch (err.code) {
      case FacebookErrorCode.INVALID_GROUP_URL:
        throw errors.validation(err.message);
      case FacebookErrorCode.GROUP_NOT_FOUND:
        throw errors.notFound('group_not_found', 'Group not found');
      case FacebookErrorCode.CONNECTION_ALREADY_RUNNING:
      case FacebookErrorCode.PROFILE_LOCKED:
        throw errors.conflict(
          'connection_busy',
          'A connection or validation process is already running',
        );
      case FacebookErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(
          400,
          'facebook_error',
          'The Facebook group request could not be completed',
        );
    }
  }
  throw err;
}

const createGroupSchema = z.object({ url: z.string().trim().min(5).max(1000) });
const patchGroupSchema = z.object({ status: z.enum(['active', 'disabled', 'archived']) });
const assignSchema = z.object({ businessId: z.string().uuid() });

export function registerGroupRoutes(app: FastifyInstance, deps: GroupRouteDeps): void {
  const { store, env, groupValidation, audit } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // 404 (not 403) for missing/not-owned — existence is never leaked.
  async function loadOwnedGroup(
    workspaceId: string,
    groupId: string,
  ): Promise<FacebookGroupRecord> {
    const group = await store.getFacebookGroupById(groupId);
    if (!group || group.workspaceId !== workspaceId) {
      throw errors.notFound('group_not_found', 'Group not found');
    }
    return group;
  }

  async function loadOwnedBusiness(
    workspaceId: string,
    businessId: string,
  ): Promise<BusinessRecord> {
    const business = await store.getBusinessById(businessId);
    if (!business || business.workspaceId !== workspaceId) {
      throw errors.notFound('business_not_found', 'Business not found');
    }
    return business;
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  app.get('/facebook/groups', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const groups = await store.listFacebookGroupsByWorkspace(workspaceId);
    return { groups: groups.map(toSafeGroup) };
  });

  app.post('/facebook/groups', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A group URL is required');

    const normalised = ((): { canonicalUrl: string; groupIdentifier: string | null } => {
      try {
        return normaliseGroupUrl(parsed.data.url);
      } catch (err) {
        toHttp(err);
      }
    })();
    const canonicalUrl = normalised.canonicalUrl;
    const identifier = normalised.groupIdentifier;

    if (await store.isGroupCanonicalUrlTaken(workspaceId, canonicalUrl)) {
      throw errors.conflict('group_exists', 'This Facebook Group is already added');
    }

    const group = await store.createFacebookGroup({
      id: newId(),
      workspaceId,
      // Store the numeric Facebook id when known; a slug stays unknown until validation.
      facebookGroupId: identifier && /^\d+$/.test(identifier) ? identifier : null,
      canonicalUrl,
      originalUrl: parsed.data.url,
    });
    await audit.record(AuditEventTypes.FacebookGroupCreated, {
      workspaceId,
      userId: req.authUser!.id,
      payload: { groupId: group.id, canonicalUrl },
    });
    reply.code(201);
    return { group: toSafeGroup(group) };
  });

  app.get('/facebook/groups/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    const group = await loadOwnedGroup(workspaceId, id);
    return { group: toSafeGroup(group) };
  });

  app.patch(
    '/facebook/groups/:id',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      await loadOwnedGroup(workspaceId, id);
      const parsed = patchGroupSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('A valid status is required');
      const updated = await store.updateFacebookGroup(id, { status: parsed.data.status });
      await audit.record(AuditEventTypes.FacebookGroupUpdated, {
        workspaceId,
        userId: req.authUser!.id,
        payload: { groupId: id, status: parsed.data.status },
      });
      return { group: toSafeGroup(updated!) };
    },
  );

  app.post(
    '/facebook/groups/:id/validate',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      await loadOwnedGroup(workspaceId, id);
      try {
        const group = await groupValidation.validateGroupAccess(workspaceId, id);
        return { group };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // ── Assignments ──────────────────────────────────────────────────────────

  app.get('/facebook/groups/:id/businesses', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    await loadOwnedGroup(workspaceId, id);
    const businesses = await store.listBusinessesForGroup(id);
    return { businesses: businesses.map(publicBusiness) };
  });

  app.post(
    '/facebook/groups/:id/businesses',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      const group = await loadOwnedGroup(workspaceId, id);
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('A businessId is required');
      const business = await loadOwnedBusiness(workspaceId, parsed.data.businessId);

      const existing = await store.getGroupAssignment(business.id, group.id);
      if (existing)
        throw errors.conflict(
          'assignment_exists',
          'This group is already assigned to the business',
        );

      await store.assignGroupToBusiness({
        id: newId(),
        workspaceId,
        businessId: business.id,
        facebookGroupId: group.id,
      });
      await audit.record(AuditEventTypes.FacebookGroupAssignedToBusiness, {
        workspaceId,
        userId: req.authUser!.id,
        payload: { groupId: group.id, businessId: business.id },
      });
      reply.code(201);
      return { ok: true };
    },
  );

  app.delete(
    '/facebook/groups/:id/businesses/:businessId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id, businessId } = req.params as { id: string; businessId: string };
      const group = await loadOwnedGroup(workspaceId, id);
      const business = await loadOwnedBusiness(workspaceId, businessId);
      await store.unassignGroupFromBusiness(business.id, group.id);
      await audit.record(AuditEventTypes.FacebookGroupUnassignedFromBusiness, {
        workspaceId,
        userId: req.authUser!.id,
        payload: { groupId: group.id, businessId: business.id },
      });
      return { ok: true };
    },
  );

  // Groups assigned to a business.
  app.get('/businesses/:id/facebook-groups', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(workspaceId, id);
    const groups = await store.listGroupsForBusiness(id);
    return { groups: groups.map(toSafeGroup) };
  });
}
