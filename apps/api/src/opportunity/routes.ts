import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  Store,
  OpportunityRecord,
  OpportunityEventRecord,
  SignalRecord,
} from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { OpportunityCoordinator } from './coordinator';
import { OpportunityError, OpportunityErrorCode } from './errors';

export interface OpportunityRouteDeps {
  store: Store;
  env: ApiEnv;
  opportunities: OpportunityCoordinator;
}

function publicOpportunity(o: OpportunityRecord) {
  return {
    id: o.id,
    signalId: o.signalId,
    decision: o.decision,
    status: o.status,
    classifierVersion: o.classifierVersion,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function publicSignal(s: SignalRecord | null) {
  if (!s) return null;
  return {
    id: s.id,
    groupId: s.groupId,
    facebookPostId: s.facebookPostId,
    postUrl: s.postUrl,
    authorName: s.authorName,
    authorProfile: s.authorProfile,
    message: s.message,
    mediaUrls: s.mediaUrls,
    createdTime: s.createdTime ? s.createdTime.toISOString() : null,
    normalizedAt: s.normalizedAt.toISOString(),
  };
}

function publicEvent(e: OpportunityEventRecord) {
  return {
    id: e.id,
    event: e.event,
    payload: e.payload,
    createdAt: e.createdAt.toISOString(),
  };
}

function toHttp(err: unknown): never {
  if (err instanceof OpportunityError) {
    switch (err.code) {
      case OpportunityErrorCode.ALREADY_RUNNING:
        throw errors.conflict(
          'classification_running',
          'A classification run is already in progress',
        );
      case OpportunityErrorCode.OPPORTUNITY_NOT_FOUND:
        throw errors.notFound('opportunity_not_found', 'Opportunity not found');
      case OpportunityErrorCode.INVALID_STATUS:
        throw errors.validation('Invalid status');
      case OpportunityErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'opportunity_error', 'The request could not be completed');
    }
  }
  throw err;
}

const listQuerySchema = z.object({
  status: z.enum(['NEW', 'READY', 'ARCHIVED']).optional(),
  decision: z.enum(['ACCEPT', 'REJECT']).optional(),
});
const statusSchema = z.object({ status: z.enum(['NEW', 'READY', 'ARCHIVED']) });

export function registerOpportunityRoutes(app: FastifyInstance, deps: OpportunityRouteDeps): void {
  const { store, env, opportunities } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /opportunities/classify — process all NEW (unclassified) Signals.
  app.post(
    '/opportunities/classify',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      try {
        return { summary: await opportunities.classifyAll(workspaceId) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // GET /opportunities/statistics — counts by decision + status.
  app.get('/opportunities/statistics', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return { statistics: await opportunities.getStatistics(workspaceId) };
  });

  // GET /opportunities — list (optional status/decision filters).
  app.get('/opportunities', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const list = await opportunities.listOpportunities(workspaceId, filter);
    return { opportunities: list.map(publicOpportunity) };
  });

  // GET /opportunities/:id — detail (opportunity + signal + events).
  app.get('/opportunities/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const detail = await opportunities.getDetail(workspaceId, id);
      return {
        opportunity: publicOpportunity(detail.opportunity),
        signal: publicSignal(detail.signal),
        events: detail.events.map(publicEvent),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // PATCH /opportunities/:id/status — transition status.
  app.patch(
    '/opportunities/:id/status',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success)
        throw errors.validation('A valid status (NEW|READY|ARCHIVED) is required');
      try {
        const updated = await opportunities.updateStatus(workspaceId, id, parsed.data.status);
        return { opportunity: publicOpportunity(updated) };
      } catch (err) {
        toHttp(err);
      }
    },
  );
}
