import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store, WorkspaceRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { AuditService, AuditEventTypes } from '../lib/audit';
import { errors } from '../lib/errors';
import { newId } from '../lib/tokens';
import { generateUniqueSlug } from '../lib/slug';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';

export interface WorkspaceDeps {
  store: Store;
  env: ApiEnv;
  logger: Logger;
  audit: AuditService;
}

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

function publicWorkspace(w: WorkspaceRecord): {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function registerWorkspaceRoutes(app: FastifyInstance, deps: WorkspaceDeps): void {
  const { store, env, logger, audit } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  // POST /workspaces — create the caller's single workspace.
  app.post('/workspaces', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('Workspace name is required');

    const ownerUserId = req.authUser!.id;
    const existing = await store.getWorkspaceByOwner(ownerUserId);
    if (existing) {
      // Idempotent-friendly: a clear already-exists conflict.
      throw errors.conflict('workspace_exists', 'You already have a workspace');
    }

    const slug = await generateUniqueSlug(parsed.data.name, (s) => store.isSlugTaken(s));
    const workspace = await store.createWorkspace({
      id: newId(),
      ownerUserId,
      name: parsed.data.name,
      slug,
    });

    logger.info('workspace.create', { userId: ownerUserId, workspaceId: workspace.id });
    reply.code(201);
    return { workspace: publicWorkspace(workspace) };
  });

  // GET /workspaces/current — the caller's own workspace (ownership implicit).
  app.get('/workspaces/current', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspace = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!workspace) throw errors.notFound('workspace_not_found', 'No workspace yet');
    return { workspace: publicWorkspace(workspace) };
  });

  // PATCH /workspaces/current — rename the caller's own workspace.
  app.patch(
    '/workspaces/current',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const parsed = nameSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Workspace name is required');

      // We only ever load the authenticated user's workspace, so a user can
      // never read or modify another user's workspace.
      const existing = await store.getWorkspaceByOwner(req.authUser!.id);
      if (!existing) throw errors.notFound('workspace_not_found', 'No workspace yet');

      const updated = await store.updateWorkspaceName(existing.id, parsed.data.name);
      if (!updated) throw errors.notFound('workspace_not_found', 'No workspace yet');

      logger.info('workspace.update', { userId: req.authUser!.id, workspaceId: updated.id });
      await audit.record(AuditEventTypes.WorkspaceUpdated, {
        workspaceId: updated.id,
        userId: req.authUser!.id,
      });
      return { workspace: publicWorkspace(updated) };
    },
  );
}
