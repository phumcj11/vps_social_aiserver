import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Store } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { CollectorCoordinator } from './coordinator';
import { CollectorError, CollectorErrorCode } from './errors';

export interface CollectorRouteDeps {
  store: Store;
  env: ApiEnv;
  collector: CollectorCoordinator;
}

function toHttp(err: unknown): never {
  if (err instanceof CollectorError) {
    switch (err.code) {
      case CollectorErrorCode.ALREADY_RUNNING:
        throw errors.conflict('collector_already_running', 'A collection is already running');
      case CollectorErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'collector_error', 'The collector request could not be completed');
    }
  }
  throw err;
}

export function registerCollectorRoutes(app: FastifyInstance, deps: CollectorRouteDeps): void {
  const { store, env, collector } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /collector/start — begins a read-only collection run (background).
  app.post('/collector/start', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    try {
      const run = await collector.start(workspaceId);
      reply.code(202);
      return { run };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /collector/stop — gracefully stop an active run (→ paused). Idempotent.
  app.post('/collector/stop', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    try {
      const run = await collector.stop(workspaceId);
      return { run };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /collector/status — latest run summary + total signals + running flag.
  app.get('/collector/status', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return collector.status(workspaceId);
  });

  // GET /collector/runs — execution history.
  app.get('/collector/runs', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    return { runs: await collector.listRuns(workspaceId) };
  });
}
