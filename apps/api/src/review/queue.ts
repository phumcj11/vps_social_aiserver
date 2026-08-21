import type { ReviewTaskRecord } from '../store/types';
import type { ReviewRepository } from './repository';
import { ReviewError, ReviewErrorCode } from './errors';

/** Review lifecycle event names (safe payloads only). */
export const ReviewEventType = {
  Created: 'review_created',
  Assigned: 'review_assigned',
  Sent: 'review_sent',
  Approved: 'review_approved',
  Rejected: 'review_rejected',
  Edited: 'review_edited',
  Expired: 'review_expired',
} as const;

/**
 * ReviewQueue (SPRINT 010) — owns the mechanics of the review queue:
 *   - **create** a Review Task for a Draft (one per draft; idempotent),
 *   - **assign** a task to a reviewer,
 *   - **expire** a stale pending task.
 *
 * It talks only to the Repository. It contains no channel/adapter logic.
 */
export class ReviewQueue {
  constructor(private readonly repo: ReviewRepository) {}

  /** Create (or return the existing) Review Task for a Draft. */
  async create(input: {
    workspaceId: string;
    businessMatchId: string;
    draftId: string;
    assignedTo: string | null;
    // SPRINT 016B — Property-match context snapshot (frozen at creation).
    businessId?: string | null;
    propertyId?: string | null;
    propertyMatchId?: string | null;
    contextHash?: string | null;
  }): Promise<{ task: ReviewTaskRecord; created: boolean }> {
    const existing = await this.repo.getTaskByDraft(input.draftId);
    if (existing) return { task: existing, created: false };

    const task = await this.repo.createTask(input);
    await this.repo.createEvent(task.id, ReviewEventType.Created, {
      draftId: input.draftId,
      businessMatchId: input.businessMatchId,
    });
    if (input.assignedTo) {
      await this.repo.createEvent(task.id, ReviewEventType.Assigned, {
        assignedTo: input.assignedTo,
      });
    }
    return { task, created: true };
  }

  /** Assign (or reassign) a task to a reviewer. */
  async assign(taskId: string, assignee: string): Promise<ReviewTaskRecord> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    const updated = await this.repo.updateTask(taskId, { assignedTo: assignee });
    if (!updated) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    await this.repo.createEvent(taskId, ReviewEventType.Assigned, { assignedTo: assignee });
    return updated;
  }

  /** Expire a pending task (a scheduled sweep would call this with stale tasks). */
  async expire(taskId: string): Promise<ReviewTaskRecord> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    if (task.status !== 'PENDING') {
      throw new ReviewError(ReviewErrorCode.INVALID_STATE, 'Only a pending review can expire');
    }
    const updated = await this.repo.updateTask(taskId, { status: 'EXPIRED' });
    if (!updated) throw new ReviewError(ReviewErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    await this.repo.createEvent(taskId, ReviewEventType.Expired, { from: 'PENDING' });
    return updated;
  }
}
