import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { OperationsService } from './service';
import { OperationsError, OperationsErrorCode } from './errors';

export interface OperationsRouteDeps {
  store: Store;
  env: ApiEnv;
  operations: OperationsService;
}

function toHttp(err: unknown): never {
  if (err instanceof OperationsError) {
    switch (err.code) {
      case OperationsErrorCode.REASON_REQUIRED:
      case OperationsErrorCode.CONFIRMATION_REQUIRED:
        throw errors.validation(err.message);
      case OperationsErrorCode.NOT_OPERATOR:
        throw new AppError(403, 'not_operator', 'Operator authorization required');
      case OperationsErrorCode.OPERATIONS_DISABLED:
        throw new AppError(404, 'operations_disabled', 'Operations surface is disabled');
      default:
        throw new AppError(400, 'operations_error', 'The request could not be completed');
    }
  }
  throw err;
}

const bodySchema = z.object({
  reason: z.string().min(3).max(500),
  confirm: z.literal(true),
});

/** Register the public-safe health endpoints (no auth, no secrets). */
export function registerHealthRoutes(app: FastifyInstance, deps: OperationsRouteDeps): void {
  const { operations } = deps;

  app.get('/health/dependencies', async (_req, reply) => {
    noStore(reply);
    const r = await operations.dependencyHealth();
    if (r.status === 'down') reply.code(503);
    return r;
  });

  app.get('/health/safety', async (_req, reply) => {
    noStore(reply);
    return operations.safetyHealth();
  });

  app.get('/health/storage', async (_req, reply) => {
    noStore(reply);
    const r = await operations.storageHealth();
    if (r.status === 'down') reply.code(503);
    return r;
  });

  app.get('/health/queues', async (_req, reply) => {
    noStore(reply);
    return operations.queueHealth();
  });
}

/** Register the operator-only operations endpoints. */
export function registerOperationsRoutes(app: FastifyInstance, deps: OperationsRouteDeps): void {
  const { store, env, operations } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  const opsRateLimit = {
    rateLimit: {
      max: env.OPERATIONS_RATE_LIMIT_MAX,
      timeWindow: env.OPERATIONS_RATE_LIMIT_WINDOW_MS,
    },
  };

  // Operator guard: authenticated AND email in the operator allowlist. Runs
  // after `authenticate`, so req.authUser is populated.
  async function operatorGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!env.OPERATIONS_ENABLED) {
      throw new AppError(404, 'operations_disabled', 'Operations surface is disabled');
    }
    const email = req.authUser?.email ?? null;
    if (!operations.isOperatorEmail(email)) {
      throw new AppError(403, 'not_operator', 'Operator authorization required');
    }
  }

  const opGet = { preHandler: [authenticate, operatorGuard] };
  const opPost = { preHandler: [csrfGuard, authenticate, operatorGuard], config: opsRateLimit };

  app.get('/operations/status', opGet, async (_req, reply) => {
    noStore(reply);
    return operations.status();
  });

  app.get('/operations/backups', opGet, async (_req, reply) => {
    noStore(reply);
    return { backups: await operations.backups() };
  });

  app.get('/operations/monitoring', opGet, async (_req, reply) => {
    noStore(reply);
    return operations.monitoring();
  });

  app.get('/operations/incidents', opGet, async (_req, reply) => {
    noStore(reply);
    return { incidents: await operations.incidents() };
  });

  const operatorEmail = (req: FastifyRequest): string => req.authUser!.email;

  app.post('/operations/maintenance/enable', opPost, async (req, reply) => {
    noStore(reply);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A reason and confirm:true are required');
    try {
      const state = await operations.setMaintenance(true, operatorEmail(req), parsed.data.reason);
      return { maintenance: state.maintenance };
    } catch (err) {
      toHttp(err);
    }
  });

  app.post('/operations/maintenance/disable', opPost, async (req, reply) => {
    noStore(reply);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A reason and confirm:true are required');
    try {
      const state = await operations.setMaintenance(false, operatorEmail(req), parsed.data.reason);
      return { maintenance: state.maintenance };
    } catch (err) {
      toHttp(err);
    }
  });

  app.post('/operations/lockdown/enable', opPost, async (req, reply) => {
    noStore(reply);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A reason and confirm:true are required');
    try {
      const state = await operations.setLockdown(true, operatorEmail(req), parsed.data.reason);
      return { lockdown: state.lockdown };
    } catch (err) {
      toHttp(err);
    }
  });

  app.post('/operations/lockdown/disable', opPost, async (req, reply) => {
    noStore(reply);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A reason and confirm:true are required');
    try {
      const state = await operations.setLockdown(false, operatorEmail(req), parsed.data.reason);
      return { lockdown: state.lockdown };
    } catch (err) {
      toHttp(err);
    }
  });
}
