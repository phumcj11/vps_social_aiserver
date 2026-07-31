import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { FacebookConnectionService } from './connection-service';
import { FacebookError, FacebookErrorCode } from './errors';

export interface FacebookRouteDeps {
  store: Store;
  env: ApiEnv;
  facebook: FacebookConnectionService;
}

/** Translate a FacebookError into a safe HTTP AppError (never leaks internals). */
function toHttp(err: unknown): never {
  if (err instanceof FacebookError) {
    switch (err.code) {
      case FacebookErrorCode.CONNECTION_ALREADY_RUNNING:
      case FacebookErrorCode.PROFILE_LOCKED:
        throw errors.conflict(
          'connection_busy',
          'A connection or validation process is already running',
        );
      case FacebookErrorCode.CONFIRMATION_REQUIRED:
        throw errors.validation('Explicit confirmation is required');
      case FacebookErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      case FacebookErrorCode.ACCOUNT_NOT_FOUND:
        throw errors.notFound('facebook_account_not_found', 'No Facebook account found');
      default:
        throw new AppError(
          400,
          'facebook_error',
          'The Facebook connection request could not be completed',
        );
    }
  }
  throw err;
}

export function registerFacebookRoutes(app: FastifyInstance, deps: FacebookRouteDeps): void {
  const { store, env, facebook } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  // Resolve the caller's own workspace (ownership is derived from the session;
  // no workspace/account id is ever accepted from the client).
  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // GET /facebook/account — safe metadata only (never profile path/cookies).
  app.get('/facebook/account', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return { account: await facebook.getStatus(workspaceId) };
  });

  // POST /facebook/connect/start — begins a background connection task.
  app.post(
    '/facebook/connect/start',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      try {
        const status = await facebook.startConnection(workspaceId);
        reply.code(202);
        return { status };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // GET /facebook/connect/status — current safe state + user-action hints.
  app.get('/facebook/connect/status', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return { status: await facebook.getStatus(workspaceId) };
  });

  // POST /facebook/validate — validate the persisted session (no scan/write).
  app.post('/facebook/validate', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    try {
      return { status: await facebook.validateSession(workspaceId) };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /facebook/disconnect — requires an explicit confirmation field.
  const disconnectSchema = z.object({ confirm: z.literal(true) });
  app.post(
    '/facebook/disconnect',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const parsed = disconnectSchema.safeParse(req.body);
      if (!parsed.success)
        throw errors.validation('Explicit confirmation ("confirm": true) is required');
      try {
        const { status, cleanupFailed } = await facebook.disconnect(workspaceId, true);
        return { status, cleanupFailed };
      } catch (err) {
        toHttp(err);
      }
    },
  );
}
