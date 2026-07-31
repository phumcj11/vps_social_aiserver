import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  Store,
  ActionJobRecord,
  ActionEventRecord,
  ReviewTaskRecord,
  AiDraftRecord,
  BusinessMatchRecord,
} from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { ActionCoordinator } from './coordinator';
import { ActionError, ActionErrorCode } from './errors';

export interface ActionRouteDeps {
  store: Store;
  env: ApiEnv;
  actions: ActionCoordinator;
}

function publicJob(j: ActionJobRecord) {
  return {
    id: j.id,
    reviewTaskId: j.reviewTaskId,
    aiDraftId: j.aiDraftId,
    businessMatchId: j.businessMatchId,
    actionType: j.actionType,
    status: j.status,
    targetPlatform: j.targetPlatform,
    targetUrl: j.targetUrl,
    approvedContent: j.approvedContent,
    attemptCount: j.attemptCount,
    maxAttempts: j.maxAttempts,
    lastErrorCode: j.lastErrorCode,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

function publicEvent(e: ActionEventRecord) {
  return { id: e.id, event: e.event, payload: e.payload, createdAt: e.createdAt.toISOString() };
}

function publicReview(r: ReviewTaskRecord | null) {
  if (!r) return null;
  return { id: r.id, status: r.status, draftId: r.draftId };
}

function publicDraft(d: AiDraftRecord | null) {
  if (!d) return null;
  return { id: d.id, version: d.version, status: d.status };
}

function publicMatch(m: BusinessMatchRecord | null) {
  if (!m) return null;
  return { id: m.id, decision: m.decision, businessId: m.businessId };
}

function toHttp(err: unknown): never {
  if (err instanceof ActionError) {
    switch (err.code) {
      case ActionErrorCode.REVIEW_NOT_FOUND:
        throw errors.notFound('review_not_found', 'Review task not found');
      case ActionErrorCode.ACTION_NOT_FOUND:
        throw errors.notFound('action_not_found', 'Action job not found');
      case ActionErrorCode.REVIEW_NOT_APPROVED:
        throw errors.conflict('review_not_approved', err.message);
      case ActionErrorCode.DUPLICATE_ACTIVE_JOB:
        throw errors.conflict('duplicate_active_job', err.message);
      case ActionErrorCode.INVALID_TRANSITION:
        throw errors.conflict('invalid_transition', err.message);
      case ActionErrorCode.RETRY_LIMIT_REACHED:
        throw errors.conflict('retry_limit_reached', err.message);
      case ActionErrorCode.INVALID_STATE:
        throw errors.conflict('invalid_state', err.message);
      case ActionErrorCode.UNSUPPORTED_TYPE:
      case ActionErrorCode.MISSING_CONTENT:
      case ActionErrorCode.CONTENT_TOO_LONG:
      case ActionErrorCode.UNSAFE_TARGET_URL:
        throw errors.validation(err.message);
      case ActionErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'action_error', 'The request could not be completed');
    }
  }
  throw err;
}

const createSchema = z.object({
  reviewTaskId: z.string().uuid(),
  actionType: z.enum(['facebook_comment', 'facebook_message']).default('facebook_comment'),
});
const listQuerySchema = z.object({
  status: z
    .enum(['queued', 'blocked', 'processing', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  reviewTaskId: z.string().uuid().optional(),
});

export function registerActionRoutes(app: FastifyInstance, deps: ActionRouteDeps): void {
  const { store, env, actions } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /actions — create an Action Job from an APPROVED Review Task.
  app.post('/actions', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      throw errors.validation('A valid reviewTaskId (and action type) is required');
    try {
      const result = await actions.createFromReview(
        workspaceId,
        parsed.data.reviewTaskId,
        parsed.data.actionType,
      );
      reply.code(201);
      return { action: publicJob(result.job), policy: result.policy };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /actions — the action queue + status counts (optional filters).
  app.get('/actions', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const [list, statistics] = await Promise.all([
      actions.listActions(workspaceId, filter),
      actions.getStatistics(workspaceId),
    ]);
    return { actions: list.map(publicJob), statistics };
  });

  // GET /actions/:id — detail (job + review + draft + match + events + policy).
  app.get('/actions/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const d = await actions.getDetail(workspaceId, id);
      return {
        action: publicJob(d.job),
        review: publicReview(d.review),
        draft: publicDraft(d.draft),
        match: publicMatch(d.match),
        policyReasons: d.policyReasons,
        events: d.events.map(publicEvent),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /actions/:id/cancel — cancel an active job (never executes).
  app.post('/actions/:id/cancel', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      return { action: publicJob(await actions.cancel(workspaceId, id)) };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /actions/:id/retry — retry a failed job (respects max_attempts).
  app.post('/actions/:id/retry', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      return { action: publicJob(await actions.retry(workspaceId, id)) };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /actions/:id/recheck-policy — re-evaluate safety (blocked → queued only if allowed).
  app.post(
    '/actions/:id/recheck-policy',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      try {
        const result = await actions.recheckPolicy(workspaceId, id);
        return { action: publicJob(result.job), policy: result.policy };
      } catch (err) {
        toHttp(err);
      }
    },
  );
}
