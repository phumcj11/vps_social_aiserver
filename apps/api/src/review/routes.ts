import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  Store,
  ReviewTaskRecord,
  ReviewEventRecord,
  AiDraftRecord,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
} from '../store/types';
import type { ApiEnv } from '../lib/env';
import { errors, AppError } from '../lib/errors';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import type { ReviewCoordinator } from './coordinator';
import { ReviewError, ReviewErrorCode } from './errors';

export interface ReviewRouteDeps {
  store: Store;
  env: ApiEnv;
  reviews: ReviewCoordinator;
}

function publicTask(t: ReviewTaskRecord) {
  return {
    id: t.id,
    businessMatchId: t.businessMatchId,
    draftId: t.draftId,
    status: t.status,
    assignedTo: t.assignedTo,
    editedContent: t.editedContent,
    editor: t.editor,
    editedAt: t.editedAt ? t.editedAt.toISOString() : null,
    decidedBy: t.decidedBy,
    decidedAt: t.decidedAt ? t.decidedAt.toISOString() : null,
    decisionReason: t.decisionReason,
    // SPRINT 016B — immutable Property-match context snapshot.
    businessId: t.businessId,
    propertyId: t.propertyId,
    propertyMatchId: t.propertyMatchId,
    contextHash: t.contextHash,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function publicEvent(e: ReviewEventRecord) {
  return { id: e.id, event: e.event, payload: e.payload, createdAt: e.createdAt.toISOString() };
}

function publicDraft(d: AiDraftRecord | null) {
  if (!d) return null;
  return {
    id: d.id,
    version: d.version,
    status: d.status,
    content: d.content,
    policyResult: d.policyResult,
  };
}

function publicMatch(m: BusinessMatchRecord | null) {
  if (!m) return null;
  return { id: m.id, decision: m.decision, reasons: m.reasons };
}

function publicOpportunity(o: OpportunityRecord | null) {
  if (!o) return null;
  return { id: o.id, decision: o.decision, status: o.status };
}

function publicBusiness(b: BusinessRecord | null) {
  if (!b) return null;
  return { id: b.id, name: b.name, slug: b.slug, status: b.status };
}

function publicReviewPropertyMatch(
  m: import('../store/types').PropertyMatchRecord | null,
  propertyName: string | null,
) {
  if (!m) return null;
  return {
    id: m.id,
    decision: m.decision,
    propertyId: m.propertyId,
    propertyName,
    reasons: m.reasons.reasons,
    matcherVersion: m.matcherVersion,
    candidatesEvaluated: m.candidatesEvaluated,
    requirement: m.reasons.requirement,
    // Candidate properties considered + why each was/ wasn't a full match — used
    // by the Human Review UI to explain a NO_PROPERTY_MATCH. Presentation data
    // only (already computed and stored by the matcher; not recomputed here).
    rejected: m.reasons.rejected.map((r) => ({
      propertyName: r.propertyName,
      decision: r.decision,
      reasons: r.reasons,
    })),
  };
}

function publicReviewProperty(p: import('../business-property/types').Property | null) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    propertyType: p.propertyType,
    area: p.location.area ?? p.location.province,
    maxGuests: p.capacity.maxGuests,
    bedrooms: p.capacity.bedrooms,
  };
}

function toHttp(err: unknown): never {
  if (err instanceof ReviewError) {
    switch (err.code) {
      case ReviewErrorCode.DRAFT_NOT_FOUND:
        throw errors.notFound('draft_not_found', 'Draft not found');
      case ReviewErrorCode.REVIEW_NOT_FOUND:
        throw errors.notFound('review_not_found', 'Review task not found');
      case ReviewErrorCode.DRAFT_NOT_REVIEWABLE:
        throw errors.conflict('draft_not_reviewable', 'This draft cannot be queued for review');
      case ReviewErrorCode.INVALID_STATE:
        throw errors.conflict('invalid_state', err.message);
      case ReviewErrorCode.INVALID_EDIT:
        throw errors.validation(err.message);
      case ReviewErrorCode.INVALID_WORKSPACE:
        throw errors.validation('Invalid workspace');
      default:
        throw new AppError(400, 'review_error', 'The request could not be completed');
    }
  }
  throw err;
}

const enqueueSchema = z.object({
  draftId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
});
const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
  businessMatchId: z.string().uuid().optional(),
});
const reasonSchema = z.object({ reason: z.string().max(500).optional() });
const editSchema = z.object({ editedContent: z.string().min(1).max(2000) });

export function registerReviewRoutes(app: FastifyInstance, deps: ReviewRouteDeps): void {
  const { store, env, reviews } = deps;
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function requireWorkspaceId(req: FastifyRequest): Promise<string> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    return ws.id;
  }

  // POST /reviews — enqueue a Review Task for a Draft (AI Draft → Review Task).
  app.post('/reviews', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = enqueueSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('A valid draftId is required');
    try {
      const result = await reviews.enqueue(
        workspaceId,
        parsed.data.draftId,
        parsed.data.assignedTo ?? null,
      );
      reply.code(result.created ? 201 : 200);
      return { review: publicTask(result.task), created: result.created };
    } catch (err) {
      toHttp(err);
    }
  });

  // GET /reviews — the review queue (optional status/businessMatchId filters).
  app.get('/reviews', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    const filter = parsed.success ? parsed.data : {};
    const list = await reviews.listReviews(workspaceId, filter);
    return { reviews: list.map(publicTask) };
  });

  // GET /reviews/:id — detail (task + draft + match + opportunity + business + events).
  app.get('/reviews/:id', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    try {
      const d = await reviews.getDetail(workspaceId, id);
      return {
        review: publicTask(d.task),
        draft: publicDraft(d.draft),
        match: publicMatch(d.match),
        opportunity: publicOpportunity(d.opportunity),
        business: publicBusiness(d.business),
        presentation: d.presentation,
        events: d.events.map(publicEvent),
        // SPRINT 016B — Property-match review context + warnings.
        propertyMatch: publicReviewPropertyMatch(
          d.propertyMatch,
          d.property ? d.property.name : null,
        ),
        property: publicReviewProperty(d.property),
        warnings: d.warnings,
        // SPRINT 017 — the approved contact(s) the draft may use.
        approvedContacts: d.approvedContacts.map((c) => ({
          type: c.type,
          value: c.value,
          label: c.label,
          approvedForDrafts: c.approvedForDrafts,
          approvedForPublicResponse: c.approvedForPublicResponse,
          ownerVerified: c.ownerVerifiedAt != null,
        })),
      };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /reviews/:id/approve — human APPROVE (records decision only; no post).
  app.post(
    '/reviews/:id/approve',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const workspaceId = await requireWorkspaceId(req);
      const { id } = req.params as { id: string };
      const parsed = reasonSchema.safeParse(req.body ?? {});
      const reason = parsed.success ? (parsed.data.reason ?? null) : null;
      try {
        const task = await reviews.approve(workspaceId, id, req.authUser!.id, reason);
        return { review: publicTask(task) };
      } catch (err) {
        toHttp(err);
      }
    },
  );

  // POST /reviews/:id/reject — human REJECT.
  app.post('/reviews/:id/reject', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    const parsed = reasonSchema.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    try {
      const task = await reviews.reject(workspaceId, id, req.authUser!.id, reason);
      return { review: publicTask(task) };
    } catch (err) {
      toHttp(err);
    }
  });

  // POST /reviews/:id/edit — human EDIT (stores revised text; still requires approval).
  app.post('/reviews/:id/edit', { preHandler: [csrfGuard, authenticate] }, async (req, reply) => {
    noStore(reply);
    const workspaceId = await requireWorkspaceId(req);
    const { id } = req.params as { id: string };
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) throw errors.validation('editedContent (1–2000 chars) is required');
    try {
      const task = await reviews.edit(workspaceId, id, req.authUser!.id, parsed.data.editedContent);
      return { review: publicTask(task) };
    } catch (err) {
      toHttp(err);
    }
  });
}
