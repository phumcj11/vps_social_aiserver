import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Store, BusinessRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { isOperator } from '../operations/guard';
import type { FacebookConnectionService } from '../facebook/connection-service';
import { SubscriptionService } from './subscription-service';
import { RoutingError, RoutingErrorCode } from './errors';

export interface SourceSubscriptionRouteDeps {
  store: Store;
  env: ApiEnv;
  facebook: FacebookConnectionService;
}

const putSchema = z.object({ groupIds: z.array(z.string().uuid()).max(200) });

export function registerSourceSubscriptionRoutes(
  app: FastifyInstance,
  deps: SourceSubscriptionRouteDeps,
): void {
  const { store, env, facebook } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);
  const subscriptions = new SubscriptionService(store, env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  async function loadOwnedBusiness(
    workspaceId: string,
    businessId: string,
  ): Promise<BusinessRecord> {
    const business = await store.getBusinessById(businessId);
    // 404 (not 403) for missing/not-owned — existence is never leaked.
    if (!business || business.workspaceId !== workspaceId) {
      throw errors.notFound('business_not_found', 'Business not found');
    }
    return business;
  }

  // ── M4 — Operator "Facebook Sources" (read-only management view) ────────────
  app.get('/operator/facebook-sources', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    if (!isOperator(env, req.authUser?.email)) {
      throw errors.forbidden('Operator authorization required');
    }
    const sourceWorkspaceId = subscriptions.sourceWorkspaceId();
    // Safe account status ONLY (never cookies/tokens/profile path).
    const account = sourceWorkspaceId ? await facebook.getStatus(sourceWorkspaceId) : null;
    return {
      sourceConfigured: subscriptions.isConfigured(),
      // Read-side operational flags (config state, not secrets).
      readerEnabled: env.FACEBOOK_READER_ENABLED,
      writeEnabled: env.FACEBOOK_WRITE_ACTION_ENABLED,
      account,
      groups: await subscriptions.operatorSourceGroups(),
    };
  });

  // ── M5 — Customer "กลุ่มที่ติดตาม" (per-Business subscriptions) ──────────────
  app.get(
    '/businesses/:id/source-subscriptions',
    { preHandler: authenticate },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      await loadOwnedBusiness(workspaceId, id);
      return {
        sourceConfigured: subscriptions.isConfigured(),
        groups: await subscriptions.businessSourceGroups(id),
      };
    },
  );

  app.put(
    '/businesses/:id/source-subscriptions',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      await loadOwnedBusiness(workspaceId, id);
      const parsed = putSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('A list of group ids is required');
      try {
        await subscriptions.setBusinessSubscriptions(id, parsed.data.groupIds);
      } catch (err) {
        if (err instanceof RoutingError && err.code === RoutingErrorCode.NOT_SOURCE_GROUP) {
          throw errors.validation('Only KMKT source groups can be followed');
        }
        throw err;
      }
      return {
        sourceConfigured: subscriptions.isConfigured(),
        groups: await subscriptions.businessSourceGroups(id),
      };
    },
  );
}
