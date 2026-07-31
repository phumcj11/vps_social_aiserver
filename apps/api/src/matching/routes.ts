import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store, BusinessMatchRecord, BusinessRecord, OpportunityRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { MatchingCoordinator, EnrichedMatch } from './coordinator';
import { MatchingError, MatchingErrorCode } from './errors';

export interface MatchingRouteDeps {
  store: Store;
  env: ApiEnv;
  matching: MatchingCoordinator;
}

function publicMatch(m: BusinessMatchRecord, businessName: string | null) {
  return {
    id: m.id,
    businessId: m.businessId,
    businessName,
    opportunityId: m.opportunityId,
    decision: m.decision,
    reasons: m.reasons,
    matcherVersion: m.matcherVersion,
    matchedAt: m.matchedAt.toISOString(),
  };
}

function publicBusiness(b: BusinessRecord | null) {
  if (!b) return null;
  return { id: b.id, name: b.name, slug: b.slug, status: b.status };
}

function publicOpportunity(o: OpportunityRecord | null) {
  if (!o) return null;
  return {
    id: o.id,
    signalId: o.signalId,
    decision: o.decision,
    status: o.status,
    classifierVersion: o.classifierVersion,
  };
}

function toHttp(err: unknown): never {
  if (err instanceof MatchingError) {
    switch (err.code) {
      case MatchingErrorCode.ALREADY_RUNNING:
        throw errors.conflict('matching_running', 'A matching run is already in progress');
      case MatchingErrorCode.MATCH_NOT_FOUND:
        throw errors.notFound('business_match_not_found', 'Business match not found');
      case MatchingErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'matching_error', 'The request could not be completed');
    }
  }
  throw err;
}

const listQuerySchema = z.object({
  opportunityId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  decision: z.enum(['MATCH', 'NO_MATCH']).optional(),
});

export function registerMatchingRoutes(app: FastifyInstance, deps: MatchingRouteDeps): void {
  const { store, env, matching } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /business-matching/run — run deterministic matching over accepted Opportunities.
  app.post(
    '/business-matching/run',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      try {
        return { summary: await matching.runMatching(workspaceId) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // GET /business-matches — list (optional opportunityId/businessId/decision filters).
  app.get('/business-matches', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const list: EnrichedMatch[] = await matching.listMatches(workspaceId, filter);
    return { matches: list.map((e) => publicMatch(e.match, e.businessName)) };
  });

  // GET /business-matches/:id — detail (match + business + opportunity).
  app.get('/business-matches/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const detail = await matching.getDetail(workspaceId, id);
      return {
        match: publicMatch(detail.match, detail.business ? detail.business.name : null),
        business: publicBusiness(detail.business),
        opportunity: publicOpportunity(detail.opportunity),
      };
    } catch (err) {
      toHttp(err);
    }
  });
}
