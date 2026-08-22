import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  Store,
  AiDraftRecord,
  AiDraftEventRecord,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
} from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { AiDraftCoordinator } from './coordinator';
import { AiDraftError, AiDraftErrorCode } from './errors';

export interface AiDraftRouteDeps {
  store: Store;
  env: ApiEnv;
  aiDrafts: AiDraftCoordinator;
}

/** List serialization — lean, safe. Never exposes the hidden prompt or secrets. */
function publicDraftSummary(d: AiDraftRecord) {
  return {
    id: d.id,
    businessMatchId: d.businessMatchId,
    opportunityId: d.opportunityId,
    businessId: d.businessId,
    version: d.version,
    status: d.status,
    contentPreview: d.content ? d.content.slice(0, 140) : null,
    provider: d.provider,
    model: d.model,
    promptVersion: d.promptVersion,
    policyResult: d.policyResult,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Detail serialization — includes safe structured context, never the prompt. */
function publicDraft(d: AiDraftRecord) {
  return {
    id: d.id,
    businessMatchId: d.businessMatchId,
    opportunityId: d.opportunityId,
    businessId: d.businessId,
    version: d.version,
    status: d.status,
    content: d.content,
    provider: d.provider,
    model: d.model,
    promptVersion: d.promptVersion,
    policyResult: d.policyResult,
    context: d.inputSnapshot,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function publicEvent(e: AiDraftEventRecord) {
  return {
    id: e.id,
    event: e.event,
    payload: e.payload,
    createdAt: e.createdAt.toISOString(),
  };
}

function publicMatch(m: BusinessMatchRecord | null) {
  if (!m) return null;
  return { id: m.id, decision: m.decision, reasons: m.reasons, matcherVersion: m.matcherVersion };
}

function publicBusiness(b: BusinessRecord | null) {
  if (!b) return null;
  return { id: b.id, name: b.name, slug: b.slug, status: b.status };
}

function publicOpportunity(o: OpportunityRecord | null) {
  if (!o) return null;
  return { id: o.id, decision: o.decision, status: o.status };
}

function toHttp(err: unknown): never {
  if (err instanceof AiDraftError) {
    switch (err.code) {
      case AiDraftErrorCode.MATCH_NOT_FOUND:
        throw errors.notFound('business_match_not_found', 'Business match not found');
      case AiDraftErrorCode.DRAFT_NOT_FOUND:
        throw errors.notFound('ai_draft_not_found', 'Draft not found');
      case AiDraftErrorCode.NOT_A_MATCH:
        throw errors.conflict('not_a_match', 'Only MATCH decisions may generate drafts');
      case AiDraftErrorCode.PROVIDER_DISABLED:
        throw errors.conflict('ai_disabled', 'AI is disabled');
      case AiDraftErrorCode.INVALID_STATE:
        throw errors.conflict('invalid_state', 'The draft is not in a valid state for this action');
      case AiDraftErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'ai_draft_error', 'The request could not be completed');
    }
  }
  throw err;
}

const generateSchema = z.object({ businessMatchId: z.string().uuid() });
const listQuerySchema = z.object({
  businessMatchId: z.string().uuid().optional(),
  status: z.enum(['draft', 'needs_review', 'rejected', 'superseded']).optional(),
});

export function registerAiDraftRoutes(app: FastifyInstance, deps: AiDraftRouteDeps): void {
  const { store, env, aiDrafts } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /ai-drafts/generate — generate the first Draft for a MATCH.
  app.post('/ai-drafts/generate', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A valid businessMatchId is required');
    try {
      const result = await aiDrafts.generate(
        workspaceId,
        parsed.data.businessMatchId,
        req.authUser!.id,
      );
      // Response Strategy suppressed drafting (NO_PROPERTY_MATCH + DO_NOT_RESPOND):
      // no Draft is created and no Action is taken.
      if (!result.draft) {
        reply.code(200);
        return { draft: null, created: false, skipped: result.skipped ?? null };
      }
      reply.code(result.created ? 201 : 200);
      return { draft: publicDraft(result.draft), created: result.created };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /ai-drafts/:id/regenerate — create a new version, supersede older ones.
  app.post(
    '/ai-drafts/:id/regenerate',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      try {
        const result = await aiDrafts.regenerate(workspaceId, id, req.authUser!.id);
        if (!result.draft) {
          reply.code(200);
          return { draft: null, created: false, skipped: result.skipped ?? null };
        }
        reply.code(201);
        return { draft: publicDraft(result.draft), created: result.created };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // POST /ai-drafts/:id/reject — human rejection (never posts, never approves).
  app.post(
    '/ai-drafts/:id/reject',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      try {
        const updated = await aiDrafts.reject(workspaceId, id);
        return { draft: publicDraft(updated) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // GET /ai-drafts — list (optional businessMatchId/status filters).
  app.get('/ai-drafts', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const list = await aiDrafts.listDrafts(workspaceId, filter);
    return { drafts: list.map(publicDraftSummary) };
  });

  // GET /ai-drafts/:id — detail (draft + events + match + opportunity + business).
  app.get('/ai-drafts/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const detail = await aiDrafts.getDetail(workspaceId, id);
      return {
        draft: publicDraft(detail.draft),
        events: detail.events.map(publicEvent),
        match: publicMatch(detail.match),
        opportunity: publicOpportunity(detail.opportunity),
        business: publicBusiness(detail.business),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /business-matches/:id/ai-drafts — version history for a match.
  app.get('/business-matches/:id/ai-drafts', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const list = await aiDrafts.listForMatch(workspaceId, id);
      return { drafts: list.map(publicDraftSummary) };
    } catch (err) {
      toHttp(err);
    }
  });
}
