import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type {
  ReviewTaskRecord,
  ReviewEventRecord,
  ReviewTaskFilter,
  AiDraftRecord,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
} from '../store/types';
import type { ReviewRepository } from './repository';
import type { ReviewQueue } from './queue';
import { ReviewEventType } from './queue';
import type { ReviewAdapter } from './adapter';
import type { ReviewPresentation, AdapterRef } from './types';
import { ReviewError, ReviewErrorCode } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EDIT_LENGTH = 2000;

export interface EnqueueResult {
  task: ReviewTaskRecord;
  created: boolean;
}

export interface ReviewDetail {
  task: ReviewTaskRecord;
  draft: AiDraftRecord | null;
  match: BusinessMatchRecord | null;
  opportunity: OpportunityRecord | null;
  business: BusinessRecord | null;
  events: ReviewEventRecord[];
  presentation: ReviewPresentation | null;
}

export interface ReviewCoordinatorDeps {
  repo: ReviewRepository;
  queue: ReviewQueue;
  /** Optional presentation channel. The engine works with NO adapter. */
  adapter?: ReviewAdapter;
  env: ApiEnv;
  logger: Logger;
}

/**
 * ReviewCoordinator (SPRINT 010) — the CORE of the Human Review Engine:
 *   AI Draft → Create Review Task → human APPROVE / REJECT / EDIT.
 *
 * It is channel-agnostic. A Review Adapter (Telegram is the first) is OPTIONAL
 * and best-effort — the engine records every decision regardless. There is NO
 * Facebook comment/message/write, NO Action Engine, and NO auto-approval: a
 * decision records the human's choice only.
 */
export class ReviewCoordinator {
  constructor(private readonly deps: ReviewCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new ReviewError(ReviewErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  /** AI Draft → Create Review Task (idempotent: one Review Task per Draft). */
  async enqueue(
    workspaceId: string,
    draftId: string,
    assignedTo: string | null,
  ): Promise<EnqueueResult> {
    this.assertWorkspace(workspaceId);
    const draft = await this.deps.repo.getDraftById(draftId);
    if (!draft || draft.workspaceId !== workspaceId) {
      throw new ReviewError(ReviewErrorCode.DRAFT_NOT_FOUND, 'Draft not found');
    }
    // Only a live draft (draft / needs_review) is reviewable; rejected/superseded are not.
    if (draft.status !== 'draft' && draft.status !== 'needs_review') {
      throw new ReviewError(
        ReviewErrorCode.DRAFT_NOT_REVIEWABLE,
        `Draft in status "${draft.status}" cannot be queued for review`,
      );
    }

    const { task, created } = await this.deps.queue.create({
      workspaceId,
      businessMatchId: draft.businessMatchId,
      draftId: draft.id,
      assignedTo,
    });

    if (created) {
      const presentation = await this.buildPresentation(task, draft);
      await this.deliver('send', task.id, presentation);
    }

    return { task, created };
  }

  async listReviews(workspaceId: string, filter?: ReviewTaskFilter): Promise<ReviewTaskRecord[]> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.listTasks(workspaceId, filter);
  }

  async getDetail(workspaceId: string, id: string): Promise<ReviewDetail> {
    this.assertWorkspace(workspaceId);
    const task = await this.loadOwned(workspaceId, id);
    const draft = await this.deps.repo.getDraftById(task.draftId);
    const [match, events] = await Promise.all([
      this.deps.repo.getMatchById(task.businessMatchId),
      this.deps.repo.listEvents(task.id),
    ]);
    const opportunity = match ? await this.deps.repo.getOpportunityById(match.opportunityId) : null;
    const business = match ? await this.deps.repo.getBusinessById(match.businessId) : null;
    const presentation = draft ? await this.buildPresentation(task, draft) : null;
    return { task, draft, match, opportunity, business, events, presentation };
  }

  /** APPROVE — records the human decision only. NEVER posts to Facebook. */
  async approve(
    workspaceId: string,
    id: string,
    decidedBy: string,
    reason: string | null,
  ): Promise<ReviewTaskRecord> {
    return this.decide(workspaceId, id, 'APPROVED', decidedBy, reason);
  }

  /** REJECT — records the human decision only. */
  async reject(
    workspaceId: string,
    id: string,
    decidedBy: string,
    reason: string | null,
  ): Promise<ReviewTaskRecord> {
    return this.decide(workspaceId, id, 'REJECTED', decidedBy, reason);
  }

  private async decide(
    workspaceId: string,
    id: string,
    outcome: 'APPROVED' | 'REJECTED',
    decidedBy: string,
    reason: string | null,
  ): Promise<ReviewTaskRecord> {
    const task = await this.loadOwned(workspaceId, id);
    if (task.status !== 'PENDING') {
      // Duplicate/late decision — the first valid decision wins (BR-31).
      throw new ReviewError(
        ReviewErrorCode.INVALID_STATE,
        `Review is already ${task.status.toLowerCase()}`,
      );
    }
    const updated = await this.deps.repo.updateTask(id, {
      status: outcome,
      decidedBy,
      decidedAt: new Date(),
      decisionReason: reason,
    });
    if (!updated) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    const eventType = outcome === 'APPROVED' ? ReviewEventType.Approved : ReviewEventType.Rejected;
    await this.deps.repo.createEvent(id, eventType, {
      decidedBy,
      reason: reason ?? undefined,
      usedEditedContent: outcome === 'APPROVED' ? task.editedContent !== null : undefined,
    });
    await this.deliver('close', id, null, outcome);
    return updated;
  }

  /** EDIT — stores revised text; the task STAYS pending (approval still required, BR-28). */
  async edit(
    workspaceId: string,
    id: string,
    editor: string,
    editedContent: string,
  ): Promise<ReviewTaskRecord> {
    const task = await this.loadOwned(workspaceId, id);
    if (task.status !== 'PENDING') {
      throw new ReviewError(
        ReviewErrorCode.INVALID_STATE,
        `Cannot edit a review that is ${task.status.toLowerCase()}`,
      );
    }
    const trimmed = editedContent.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_EDIT_LENGTH) {
      throw new ReviewError(
        ReviewErrorCode.INVALID_EDIT,
        `Edited content must be 1–${MAX_EDIT_LENGTH} characters`,
      );
    }
    const updated = await this.deps.repo.updateTask(id, {
      editedContent: trimmed,
      editor,
      editedAt: new Date(),
    });
    if (!updated) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    await this.deps.repo.createEvent(id, ReviewEventType.Edited, { editor });
    const draft = await this.deps.repo.getDraftById(updated.draftId);
    if (draft) await this.deliver('update', id, await this.buildPresentation(updated, draft));
    return updated;
  }

  /** Expire a pending review (delegates to the Queue). */
  async expire(workspaceId: string, id: string): Promise<ReviewTaskRecord> {
    await this.loadOwned(workspaceId, id);
    const updated = await this.deps.queue.expire(id);
    await this.deliver('close', id, null, 'EXPIRED');
    return updated;
  }

  private async loadOwned(workspaceId: string, id: string): Promise<ReviewTaskRecord> {
    const task = await this.deps.repo.getTaskById(id);
    if (!task || task.workspaceId !== workspaceId) {
      throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    }
    return task;
  }

  private async buildPresentation(
    task: ReviewTaskRecord,
    draft: AiDraftRecord,
  ): Promise<ReviewPresentation> {
    const match = await this.deps.repo.getMatchById(task.businessMatchId);
    const [opportunity, business] = await Promise.all([
      match ? this.deps.repo.getOpportunityById(match.opportunityId) : Promise.resolve(null),
      match ? this.deps.repo.getBusinessById(match.businessId) : Promise.resolve(null),
    ]);
    const signal = opportunity ? await this.deps.repo.getSignalById(opportunity.signalId) : null;
    return {
      reviewTaskId: task.id,
      status: task.status,
      business: { name: business?.name ?? '(unknown)' },
      opportunity: {
        decision: opportunity?.decision ?? '(unknown)',
        message: signal?.message ?? null,
      },
      draft: { content: draft.content, version: draft.version, status: draft.status },
      editedContent: task.editedContent,
      links: {
        facebookPostUrl: signal?.postUrl ?? null,
        businessUrl: business ? `${this.deps.env.WEB_ORIGIN}/businesses/${business.id}` : null,
      },
    };
  }

  /**
   * Best-effort adapter delivery. The Review Engine works without an adapter, so
   * an adapter failure (e.g. Telegram disabled) is logged and swallowed — it
   * never blocks the review or its decision.
   */
  private async deliver(
    op: 'send' | 'update' | 'close',
    taskId: string,
    presentation: ReviewPresentation | null,
    outcome?: ReviewTaskRecord['status'],
  ): Promise<void> {
    const adapter = this.deps.adapter;
    if (!adapter) return;
    try {
      if (op === 'send' && presentation) {
        const ref = await adapter.sendReview(presentation);
        await this.deps.repo.createEvent(taskId, ReviewEventType.Sent, {
          adapter: ref.adapter,
          ref: ref.ref,
        });
      } else if (op === 'update' && presentation) {
        const ref = await this.lastAdapterRef(taskId);
        if (ref) await adapter.updateReview(ref, presentation);
      } else if (op === 'close') {
        const ref = await this.lastAdapterRef(taskId);
        if (ref && outcome) await adapter.closeReview(ref, outcome);
      }
    } catch (err) {
      this.deps.logger.info('review.adapter_skipped', {
        op,
        taskId,
        adapter: adapter.name,
        reason: err instanceof Error ? err.message : 'adapter error',
      });
    }
  }

  private async lastAdapterRef(taskId: string): Promise<AdapterRef | null> {
    const events = await this.deps.repo.listEvents(taskId);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i]!;
      if (e.event === ReviewEventType.Sent && e.payload) {
        const adapter = e.payload.adapter;
        const ref = e.payload.ref;
        if (typeof adapter === 'string' && typeof ref === 'string') return { adapter, ref };
      }
    }
    return null;
  }
}
