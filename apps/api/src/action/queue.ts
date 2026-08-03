import type { ActionJobRecord, ActionStatus } from '../store/types';
import type { ActionRepository } from './repository';
import type { ActionIntent } from './types';
import { ActionError, ActionErrorCode } from './errors';

/** Action lifecycle event names (safe payloads only). */
export const ActionEventType = {
  Created: 'action_job_created',
  Queued: 'action_job_queued',
  Blocked: 'action_job_blocked',
  Cancelled: 'action_job_cancelled',
  Processing: 'action_job_processing',
  Succeeded: 'action_job_succeeded',
  Failed: 'action_job_failed',
  RetryScheduled: 'action_job_retry_scheduled',
  PolicyRejected: 'action_job_policy_rejected',
} as const;

/**
 * The allowed state-machine transitions (SPRINT 011). Terminal states
 * (`succeeded`, `cancelled`) have none. `processing`/`succeeded`/`failed` are
 * NOT entered through runtime execution this sprint — no Action Worker runs.
 */
const ALLOWED_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  queued: ['processing', 'cancelled', 'blocked'],
  blocked: ['queued', 'cancelled'],
  processing: ['succeeded', 'failed'],
  failed: ['queued', 'cancelled'],
  succeeded: [],
  cancelled: [],
};

export function assertTransition(from: ActionStatus, to: ActionStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ActionError(ActionErrorCode.INVALID_TRANSITION, `Invalid transition ${from} → ${to}`);
  }
}

/**
 * ActionQueue (SPRINT 011) — owns the queue mechanics and the state machine:
 * enqueue, block, cancel, mark processing/succeeded/failed, schedule, and retry
 * preparation. It talks only to the Repository. **No worker executes** here —
 * `processing`/`succeeded`/`failed` transitions exist for a future worker and
 * are never triggered by runtime execution this sprint.
 */
export class ActionQueue {
  constructor(private readonly repo: ActionRepository) {}

  /** Create a job for an intent in its initial safe status (queued or blocked). */
  async enqueue(input: {
    intent: ActionIntent;
    initialStatus: 'queued' | 'blocked';
    maxAttempts: number;
    reasons?: { code: string; detail: string }[];
  }): Promise<ActionJobRecord> {
    const { intent, initialStatus, maxAttempts, reasons = [] } = input;
    const job = await this.repo.createJob({
      workspaceId: intent.workspaceId,
      reviewTaskId: intent.reviewTaskId,
      aiDraftId: intent.aiDraftId,
      businessMatchId: intent.businessMatchId,
      actionType: intent.actionType,
      status: initialStatus,
      targetPlatform: intent.targetPlatform,
      targetUrl: intent.targetUrl,
      targetPostKey: intent.targetPostKey,
      // DB-level guard: at most one ACTIVE (non-terminal) job per
      // (review_task, action_type). Released to NULL when the job is terminal.
      activeDedupKey: `${intent.reviewTaskId}:${intent.actionType}`,
      approvedContent: intent.approvedContent,
      maxAttempts,
      blockedAt: initialStatus === 'blocked' ? new Date() : null,
    });
    await this.repo.createEvent(job.id, ActionEventType.Created, {
      actionType: job.actionType,
      status: job.status,
    });
    await this.repo.createEvent(
      job.id,
      initialStatus === 'blocked' ? ActionEventType.Blocked : ActionEventType.Queued,
      { status: initialStatus, reasonCodes: reasons.map((r) => r.code) },
    );
    return job;
  }

  private async transition(
    job: ActionJobRecord,
    to: ActionStatus,
    patch: Parameters<ActionRepository['updateJob']>[1],
    event: string,
    payload: Record<string, unknown> | null,
  ): Promise<ActionJobRecord> {
    assertTransition(job.status, to);
    const updated = await this.repo.updateJob(job.id, { status: to, ...patch });
    if (!updated) throw new ActionError(ActionErrorCode.ACTION_NOT_FOUND, 'Action job not found');
    await this.repo.createEvent(job.id, event, payload);
    return updated;
  }

  block(
    job: ActionJobRecord,
    reasons: { code: string; detail: string }[],
  ): Promise<ActionJobRecord> {
    return this.transition(job, 'blocked', { blockedAt: new Date() }, ActionEventType.Blocked, {
      reasonCodes: reasons.map((r) => r.code),
    });
  }

  cancel(job: ActionJobRecord): Promise<ActionJobRecord> {
    return this.transition(
      job,
      'cancelled',
      // Terminal → release the active-dedup key so a future intent for the same
      // review+type is not permanently blocked by the DB unique index.
      { cancelledAt: new Date(), activeDedupKey: null },
      ActionEventType.Cancelled,
      {
        from: job.status,
      },
    );
  }

  /** blocked → queued after an explicit, passing safety re-evaluation only. */
  requeueAfterRecheck(job: ActionJobRecord): Promise<ActionJobRecord> {
    return this.transition(job, 'queued', { blockedAt: null }, ActionEventType.Queued, {
      via: 'recheck',
    });
  }

  // ── Worker-facing transitions (NOT triggered by runtime execution this sprint) ──

  markProcessing(job: ActionJobRecord): Promise<ActionJobRecord> {
    return this.transition(
      job,
      'processing',
      { startedAt: new Date() },
      ActionEventType.Processing,
      {
        attempt: job.attemptCount + 1,
      },
    );
  }

  markSucceeded(job: ActionJobRecord): Promise<ActionJobRecord> {
    return this.transition(
      job,
      'succeeded',
      // Terminal → release the active-dedup key. The permanent success guard is
      // carried by successIdempotencyKey, set by the executor on VERIFIED success.
      { completedAt: new Date(), activeDedupKey: null },
      ActionEventType.Succeeded,
      null,
    );
  }

  markFailed(
    job: ActionJobRecord,
    error: { code: string; message: string },
  ): Promise<ActionJobRecord> {
    return this.transition(
      job,
      'failed',
      {
        attemptCount: job.attemptCount + 1,
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
      },
      ActionEventType.Failed,
      { code: error.code },
    );
  }

  /** failed → queued, only when under the retry limit (no infinite retries). */
  async retry(job: ActionJobRecord): Promise<ActionJobRecord> {
    if (job.status !== 'failed') {
      throw new ActionError(ActionErrorCode.INVALID_STATE, 'Only a failed job can be retried');
    }
    if (job.attemptCount >= job.maxAttempts) {
      throw new ActionError(
        ActionErrorCode.RETRY_LIMIT_REACHED,
        `Retry limit reached (${job.attemptCount}/${job.maxAttempts})`,
      );
    }
    return this.transition(
      job,
      'queued',
      { scheduledAt: new Date() },
      ActionEventType.RetryScheduled,
      {
        attempt: job.attemptCount,
        maxAttempts: job.maxAttempts,
      },
    );
  }
}
