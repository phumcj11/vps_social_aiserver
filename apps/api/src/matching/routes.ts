import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  Store,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
  PropertyMatchRecord,
} from '../store/types';
import type { Property } from '../business-property/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { MatchingCoordinator, EnrichedMatch, EnrichedPropertyMatch } from './coordinator';
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

function publicPropertyMatch(
  m: PropertyMatchRecord,
  propertyName: string | null,
  businessName: string | null,
) {
  return {
    id: m.id,
    opportunityId: m.opportunityId,
    businessMatchId: m.businessMatchId,
    businessId: m.businessId,
    businessName,
    propertyId: m.propertyId,
    propertyName,
    decision: m.decision,
    reasons: m.reasons.reasons,
    rejected: m.reasons.rejected,
    requirement: m.reasons.requirement,
    matcherVersion: m.matcherVersion,
    candidatesEvaluated: m.candidatesEvaluated,
    evaluatedAt: m.evaluatedAt.toISOString(),
  };
}

function publicProperty(p: Property | null) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    propertyType: p.propertyType,
    area: p.location.area ?? p.location.province,
    maxGuests: p.capacity.maxGuests,
    bedrooms: p.capacity.bedrooms,
    status: p.status,
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

const propertyMatchQuerySchema = z.object({
  opportunityId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  businessMatchId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
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

  // GET /property-matches — Property matches (SPRINT 016B), optional filters.
  app.get('/property-matches', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = propertyMatchQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const list: EnrichedPropertyMatch[] = await matching.listPropertyMatches(workspaceId, filter);
    return {
      matches: list.map((e) => publicPropertyMatch(e.match, e.propertyName, e.businessName)),
    };
  });

  // GET /property-matches/:id — Property match detail (match + property + business).
  app.get('/property-matches/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const detail = await matching.getPropertyMatchDetail(workspaceId, id);
      return {
        match: publicPropertyMatch(
          detail.match,
          detail.property ? detail.property.name : null,
          detail.business ? detail.business.name : null,
        ),
        property: publicProperty(detail.property),
        business: publicBusiness(detail.business),
        opportunity: publicOpportunity(detail.opportunity),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /property-matching/funnel — aggregate counts (SPRINT 016B operations).
  app.get('/property-matching/funnel', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return { funnel: await matching.getFunnel(workspaceId) };
  });
}
