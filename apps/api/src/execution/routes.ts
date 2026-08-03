import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store, ExecutionSessionRecord, ExecutionEvidenceRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { ExecutionCoordinator } from './coordinator';
import { ExecutionError, ExecutionErrorCode } from './errors';

export interface ExecutionRouteDeps {
  store: Store;
  env: ApiEnv;
  executions: ExecutionCoordinator;
}

function publicSession(s: ExecutionSessionRecord) {
  return {
    id: s.id,
    actionJobId: s.actionJobId,
    attemptNumber: s.attemptNumber,
    status: s.status,
    adapter: s.adapter,
    recoveryState: s.recoveryState,
    errorCode: s.errorCode,
    errorMessage: s.errorMessage,
    startedAt: iso(s.startedAt),
    preflightVerifiedAt: iso(s.preflightVerifiedAt),
    submittedAt: iso(s.submittedAt),
    verifiedAt: iso(s.verifiedAt),
    ambiguousAt: iso(s.ambiguousAt),
    finishedAt: iso(s.finishedAt),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function publicEvidence(e: ExecutionEvidenceRecord) {
  return {
    id: e.id,
    evidenceType: e.evidenceType,
    // Opaque, relative storage key — never an absolute path.
    storageKey: e.storageKey,
    evidenceHash: e.evidenceHash,
    facebookCommentId: e.facebookCommentId,
    observedContent: e.observedContent,
    observedAuthor: e.observedAuthor,
    observedPostUrl: e.observedPostUrl,
    observedAt: iso(e.observedAt),
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
  };
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toHttp(err: unknown): never {
  if (err instanceof ExecutionError) {
    switch (err.code) {
      case ExecutionErrorCode.JOB_NOT_FOUND:
        throw errors.notFound('job_not_found', 'Action job not found');
      case ExecutionErrorCode.SESSION_NOT_FOUND:
        throw errors.notFound('session_not_found', 'Execution session not found');
      case ExecutionErrorCode.JOB_NOT_EXECUTABLE:
      case ExecutionErrorCode.ACTIVE_SESSION_EXISTS:
      case ExecutionErrorCode.DUPLICATE_SUCCESS:
      case ExecutionErrorCode.IDEMPOTENCY_CONFLICT:
      case ExecutionErrorCode.INVALID_SESSION_STATE:
      case ExecutionErrorCode.INVALID_TRANSITION:
      case ExecutionErrorCode.NOT_RECOVERABLE:
        throw errors.conflict(err.code.toLowerCase(), err.message);
      case ExecutionErrorCode.UNSUPPORTED_ACTION_TYPE:
        throw errors.validation(err.message);
      case ExecutionErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      case ExecutionErrorCode.ADAPTER_DISABLED:
      case ExecutionErrorCode.REAL_WRITE_FORBIDDEN:
      case ExecutionErrorCode.KILL_SWITCH_ON:
      case ExecutionErrorCode.EXECUTION_DISABLED:
      case ExecutionErrorCode.WRITE_NOT_ENABLED:
        throw new AppError(409, 'execution_disabled', err.message);
      default:
        throw new AppError(400, 'execution_error', 'The request could not be completed');
    }
  }
  throw err;
}

const dryRunSchema = z.object({
  scenario: z
    .enum([
      'verified_success',
      'target_unverified',
      'target_mismatch',
      'typed_content_mismatch',
      'submit_failed',
      'submit_ambiguous',
      'comment_not_found',
      'verification_content_mismatch',
      'comment_id_missing',
      'checkpoint_required',
      'session_expired',
      'account_restricted',
      'captcha',
    ])
    .optional(),
});

export function registerExecutionRoutes(app: FastifyInstance, deps: ExecutionRouteDeps): void {
  const { store, env, executions } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  const prepareRateLimit = {
    rateLimit: {
      max: env.EXECUTION_PREPARE_RATE_LIMIT_MAX,
      timeWindow: env.EXECUTION_PREPARE_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };
  const recoverRateLimit = {
    rateLimit: {
      max: env.EXECUTION_RECOVER_RATE_LIMIT_MAX,
      timeWindow: env.EXECUTION_RECOVER_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /actions/:id/prepare-execution — run one execution attempt. Under the
  // safe defaults this returns `blocked` and creates no session. There is NO
  // "Execute Now" endpoint and NO real Facebook write.
  app.post(
    '/actions/:id/prepare-execution',
    { preHandler: [csrfGuard, authenticate], config: prepareRateLimit },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      try {
        const r = await executions.prepareExecution(workspaceId, id);
        return {
          status: r.status,
          blockedReasons: r.blockedReasons ?? null,
          session: r.session ? publicSession(r.session) : null,
        };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // POST /actions/:id/dry-run — fake-only diagnostic. Exercises the full
  // pipeline with the FAKE adapter and does not consume the job.
  app.post(
    '/actions/:id/dry-run',
    { preHandler: [csrfGuard, authenticate], config: prepareRateLimit },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      const parsed = dryRunSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw errors.validation('Invalid scenario');
      try {
        const r = await executions.prepareExecution(workspaceId, id, {
          scenario: parsed.data.scenario,
          dryRun: true,
        });
        return {
          status: r.status,
          blockedReasons: r.blockedReasons ?? null,
          session: r.session ? publicSession(r.session) : null,
        };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // GET /actions/:id/execution-sessions — sessions for a job.
  app.get('/actions/:id/execution-sessions', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const sessions = await executions.listSessions(workspaceId, id);
      return { sessions: sessions.map(publicSession) };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /action-executions/:sessionId — session detail + evidence.
  app.get('/action-executions/:sessionId', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { sessionId } = req.params as { sessionId: string };
    try {
      const d = await executions.getSessionDetail(workspaceId, sessionId);
      return {
        session: publicSession(d.session),
        evidence: d.evidence.map(publicEvidence),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /action-executions/:sessionId/evidence — append-only evidence trail.
  app.get(
    '/action-executions/:sessionId/evidence',
    { preHandler: authenticate },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { sessionId } = req.params as { sessionId: string };
      try {
        const evidence = await executions.listEvidence(workspaceId, sessionId);
        return { evidence: evidence.map(publicEvidence) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // POST /action-executions/:sessionId/cancel — cancel a live session.
  app.post(
    '/action-executions/:sessionId/cancel',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { sessionId } = req.params as { sessionId: string };
      try {
        return { session: publicSession(await executions.cancelSession(workspaceId, sessionId)) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // POST /action-executions/:sessionId/recover — classify for human recovery.
  // NEVER auto-retries; ambiguous/interrupts require a human.
  app.post(
    '/action-executions/:sessionId/recover',
    { preHandler: [csrfGuard, authenticate], config: recoverRateLimit },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { sessionId } = req.params as { sessionId: string };
      try {
        const r = await executions.recover(workspaceId, sessionId);
        return {
          session: publicSession(r.session),
          recovery: {
            disposition: r.classification.disposition,
            reasonCode: r.classification.reasonCode,
            reasonDetail: r.classification.reasonDetail,
            requiresHuman: r.classification.requiresHuman,
          },
        };
      } catch (err) {
        toHttp(err);
      }
    },
  );
}
