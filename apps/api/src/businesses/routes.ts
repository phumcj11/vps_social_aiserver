import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  Store,
  BusinessRecord,
  BusinessProfileRecord,
  BusinessKnowledgeRecord,
  BusinessMatchingRuleRecord,
  WorkspaceRecord,
} from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { errors } from '../lib/errors';
import { newId } from '../lib/tokens';
import { generateUniqueSlug } from '../lib/slug';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import {
  createBusinessSchema,
  updateBusinessSchema,
  updateProfileSchema,
  createKnowledgeSchema,
  updateKnowledgeSchema,
  createRuleSchema,
  updateRuleSchema,
} from './validation';

export interface BusinessDeps {
  store: Store;
  env: ApiEnv;
  logger: Logger;
}

// ── Serialisers ──────────────────────────────────────────────────────────────

function publicBusiness(b: BusinessRecord) {
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    name: b.name,
    slug: b.slug,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function publicProfile(p: BusinessProfileRecord) {
  return {
    businessId: p.businessId,
    category: p.category,
    description: p.description,
    sellingPoints: p.sellingPoints,
    serviceArea: p.serviceArea,
    contactInformation: p.contactInformation,
    responseTone: p.responseTone,
    prohibitedClaims: p.prohibitedClaims,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function publicKnowledge(k: BusinessKnowledgeRecord) {
  return {
    id: k.id,
    businessId: k.businessId,
    title: k.title,
    content: k.content,
    status: k.status,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

function publicRule(r: BusinessMatchingRuleRecord) {
  return {
    id: r.id,
    businessId: r.businessId,
    ruleType: r.ruleType,
    ruleValue: r.ruleValue,
    priority: r.priority,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function registerBusinessRoutes(app: FastifyInstance, deps: BusinessDeps): void {
  const { store, env, logger } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  // Ownership chain: user → workspace (by owner) → business (workspace_id).
  async function requireWorkspace(req: FastifyRequest): Promise<WorkspaceRecord> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws;
  }

  // Loads a business ONLY if it belongs to the authenticated user's workspace.
  // Returns 404 (not 403) for both missing and not-owned, so existence is never
  // leaked across users.
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

  // ── Businesses ─────────────────────────────────────────────────────────────

  app.post('/businesses', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const parsed = createBusinessSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('Business name and category are required');

    const ws = await requireWorkspace(req);
    if (await store.isBusinessNameTakenInWorkspace(ws.id, parsed.data.name)) {
      throw errors.conflict('business_name_taken', 'A business with this name already exists');
    }

    const slug = await generateUniqueSlug(parsed.data.name, (s) => store.isBusinessSlugTaken(s));
    const business = await store.createBusiness(
      { id: newId(), workspaceId: ws.id, name: parsed.data.name, slug },
      { id: newId(), category: parsed.data.category, description: parsed.data.description ?? null },
    );

    logger.info('business.create', { userId: req.authUser!.id, businessId: business.id });
    reply.code(201);
    return { business: publicBusiness(business) };
  });

  app.get('/businesses', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const ws = await requireWorkspace(req);
    const list = await store.listBusinessesByWorkspace(ws.id);
    return { businesses: list.map(publicBusiness) };
  });

  app.get('/businesses/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    const business = await loadOwnedBusiness(req, id);
    return { business: publicBusiness(business) };
  });

  app.patch('/businesses/:id', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    const business = await loadOwnedBusiness(req, id);

    const parsed = updateBusinessSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('Nothing valid to update');

    if (parsed.data.name !== undefined && parsed.data.name !== business.name) {
      if (await store.isBusinessNameTakenInWorkspace(business.workspaceId, parsed.data.name)) {
        throw errors.conflict('business_name_taken', 'A business with this name already exists');
      }
    }

    const updated = await store.updateBusiness(id, {
      name: parsed.data.name,
      status: parsed.data.status,
    });
    logger.info('business.update', { userId: req.authUser!.id, businessId: id });
    return { business: publicBusiness(updated!) };
  });

  // ── Profile ────────────────────────────────────────────────────────────────

  app.get('/businesses/:id/profile', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const profile = await store.getProfileByBusiness(id);
    if (!profile) throw errors.notFound('profile_not_found', 'Profile not found');
    return { profile: publicProfile(profile) };
  });

  app.patch(
    '/businesses/:id/profile',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      await loadOwnedBusiness(req, id);

      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid profile fields');

      const updated = await store.updateProfile(id, parsed.data);
      if (!updated) throw errors.notFound('profile_not_found', 'Profile not found');
      logger.info('business.profile.update', { userId: req.authUser!.id, businessId: id });
      return { profile: publicProfile(updated) };
    },
  );

  // ── Knowledge ────────────────────────────────────────────────────────────

  app.get('/businesses/:id/knowledge', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const items = await store.listKnowledge(id);
    return { knowledge: items.map(publicKnowledge) };
  });

  app.post(
    '/businesses/:id/knowledge',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      await loadOwnedBusiness(req, id);

      const parsed = createKnowledgeSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('A knowledge title (min 2 chars) is required');

      const item = await store.createKnowledge({
        id: newId(),
        businessId: id,
        title: parsed.data.title,
        content: parsed.data.content ?? null,
        status: parsed.data.status,
      });
      logger.info('business.knowledge.create', { userId: req.authUser!.id, businessId: id });
      reply.code(201);
      return { knowledge: publicKnowledge(item) };
    },
  );

  app.patch(
    '/businesses/:id/knowledge/:knowledgeId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, knowledgeId } = req.params as { id: string; knowledgeId: string };
      await loadOwnedBusiness(req, id);

      const existing = await store.getKnowledgeById(knowledgeId);
      if (!existing || existing.businessId !== id) {
        throw errors.notFound('knowledge_not_found', 'Knowledge not found');
      }

      const parsed = updateKnowledgeSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid knowledge fields');

      const updated = await store.updateKnowledge(knowledgeId, parsed.data);
      return { knowledge: publicKnowledge(updated!) };
    },
  );

  app.delete(
    '/businesses/:id/knowledge/:knowledgeId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, knowledgeId } = req.params as { id: string; knowledgeId: string };
      await loadOwnedBusiness(req, id);

      const existing = await store.getKnowledgeById(knowledgeId);
      if (!existing || existing.businessId !== id) {
        throw errors.notFound('knowledge_not_found', 'Knowledge not found');
      }
      await store.deleteKnowledge(knowledgeId);
      logger.info('business.knowledge.delete', { userId: req.authUser!.id, businessId: id });
      return { ok: true };
    },
  );

  // ── Matching rules (deterministic — NOT AI) ────────────────────────────────

  app.get('/businesses/:id/matching-rules', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const items = await store.listRules(id);
    return { matchingRules: items.map(publicRule) };
  });

  app.post(
    '/businesses/:id/matching-rules',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      await loadOwnedBusiness(req, id);

      const parsed = createRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw errors.validation('A valid rule type, value, and integer priority are required');
      }

      const rule = await store.createRule({
        id: newId(),
        businessId: id,
        ruleType: parsed.data.ruleType,
        ruleValue: parsed.data.ruleValue,
        priority: parsed.data.priority,
        status: parsed.data.status,
      });
      logger.info('business.rule.create', { userId: req.authUser!.id, businessId: id });
      reply.code(201);
      return { matchingRule: publicRule(rule) };
    },
  );

  app.patch(
    '/businesses/:id/matching-rules/:ruleId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, ruleId } = req.params as { id: string; ruleId: string };
      await loadOwnedBusiness(req, id);

      const existing = await store.getRuleById(ruleId);
      if (!existing || existing.businessId !== id) {
        throw errors.notFound('rule_not_found', 'Matching rule not found');
      }

      const parsed = updateRuleSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid matching-rule fields');

      const updated = await store.updateRule(ruleId, parsed.data);
      return { matchingRule: publicRule(updated!) };
    },
  );

  app.delete(
    '/businesses/:id/matching-rules/:ruleId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, ruleId } = req.params as { id: string; ruleId: string };
      await loadOwnedBusiness(req, id);

      const existing = await store.getRuleById(ruleId);
      if (!existing || existing.businessId !== id) {
        throw errors.notFound('rule_not_found', 'Matching rule not found');
      }
      await store.deleteRule(ruleId);
      logger.info('business.rule.delete', { userId: req.authUser!.id, businessId: id });
      return { ok: true };
    },
  );
}
