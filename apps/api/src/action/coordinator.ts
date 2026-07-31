import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type {
  ActionJobRecord,
  ActionEventRecord,
  ActionJobFilter,
  ActionType,
  ReviewTaskRecord,
  AiDraftRecord,
  BusinessMatchRecord,
} from '../store/types';
import type { ActionRepository } from './repository';
import { ActionQueue, ActionEventType } from './queue';
import { buildActionIntent } from './intent-builder';
import { evaluateActionPolicy } from './policy-guard';
import { ActionError, ActionErrorCode } from './errors';
import type { ActionIntent, ActionPolicyResult, ActionSafetyState } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTION_CONTENT = 2000;

/** Map a REJECT policy reason code to the corresponding error code. */
const REJECT_CODE: Record<string, ActionError['code']> = {
  UNSUPPORTED_TYPE: ActionErrorCode.UNSUPPORTED_TYPE,
  MISSING_CONTENT: ActionErrorCode.MISSING_CONTENT,
  CONTENT_TOO_LONG: ActionErrorCode.CONTENT_TOO_LONG,
  UNSAFE_TARGET_URL: ActionErrorCode.UNSAFE_TARGET_URL,
  DUPLICATE_ACTIVE_JOB: ActionErrorCode.DUPLICATE_ACTIVE_JOB,
};

export interface CreateActionResult {
  job: ActionJobRecord;
  policy: ActionPolicyResult;
}

export interface ActionDetail {
  job: ActionJobRecord;
  review: ReviewTaskRecord | null;
  draft: AiDraftRecord | null;
  match: BusinessMatchRecord | null;
  events: ActionEventRecord[];
  policyReasons: { code: string; detail: string }[];
}

export interface ActionStatistics {
  total: number;
  queued: number;
  blocked: number;
  processing: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface ActionCoordinatorDeps {
  repo: ActionRepository;
  queue: ActionQueue;
  env: ApiEnv;
  logger: Logger;
}

/**
 * ActionCoordinator (SPRINT 011) — the CORE of the Action Queue Engine:
 *   Approved Review → Build Intent → Policy Guard → Create Action Job → Events.
 *
 * It is a SAFE BOUNDARY only: it creates and manages jobs but NEVER executes a
 * Facebook action, runs NO worker, and makes NO Facebook/Playwright/Telegram
 * call. Under current safety defaults (engine off, writes off, kill switch on)
 * every job is created BLOCKED.
 */
export class ActionCoordinator {
  constructor(private readonly deps: ActionCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new ActionError(ActionErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  private safety(): ActionSafetyState {
    const allowed = this.deps.env.ACTION_ALLOWED_TYPES.split(',')
      .map((t) => t.trim())
      .filter((t): t is ActionType => t === 'facebook_comment' || t === 'facebook_message');
    return {
      actionEngineEnabled: this.deps.env.ACTION_ENGINE_ENABLED,
      facebookWriteEnabled: this.deps.env.FACEBOOK_WRITE_ACTION_ENABLED,
      killSwitchOn: this.deps.env.GLOBAL_KILL_SWITCH,
      allowedTypes: allowed,
      maxContentLength: MAX_ACTION_CONTENT,
    };
  }

  /** Approved Review → Action Job (blocked under current safety defaults). */
  async createFromReview(
    workspaceId: string,
    reviewTaskId: string,
    actionType: ActionType,
  ): Promise<CreateActionResult> {
    this.assertWorkspace(workspaceId);
    const review = await this.deps.repo.getReviewTaskById(reviewTaskId);
    if (!review || review.workspaceId !== workspaceId) {
      throw new ActionError(ActionErrorCode.REVIEW_NOT_FOUND, 'Review task not found');
    }
    if (review.status !== 'APPROVED') {
      throw new ActionError(
        ActionErrorCode.REVIEW_NOT_APPROVED,
        `Review is ${review.status}; only APPROVED reviews create actions`,
      );
    }

    const draft = await this.deps.repo.getDraftById(review.draftId);
    const match = draft ? await this.deps.repo.getMatchById(draft.businessMatchId) : null;
    const opportunity = match ? await this.deps.repo.getOpportunityById(match.opportunityId) : null;
    const signal = opportunity ? await this.deps.repo.getSignalById(opportunity.signalId) : null;
    if (!draft || !match || !opportunity || !signal) {
      throw new ActionError(ActionErrorCode.INVALID_STATE, 'Review references missing records');
    }

    const intent = buildActionIntent({
      workspaceId,
      reviewTask: review,
      draft,
      opportunity,
      signal,
      match,
      actionType,
    });

    const isDuplicate = await this.deps.repo.hasActiveJob(reviewTaskId, actionType);
    const policy = evaluateActionPolicy(intent, this.safety(), { isDuplicate });

    if (policy.outcome === 'REJECT') {
      const first = policy.reasons[0];
      const code = (first && REJECT_CODE[first.code]) ?? ActionErrorCode.INVALID_STATE;
      throw new ActionError(code, first?.detail ?? 'Action rejected by policy', policy.reasons);
    }

    const job = await this.deps.queue.enqueue({
      intent,
      initialStatus: policy.outcome === 'ALLOW' ? 'queued' : 'blocked',
      maxAttempts: this.deps.env.ACTION_DEFAULT_MAX_ATTEMPTS,
      reasons: policy.reasons,
    });

    this.deps.logger.info('action.created', {
      workspaceId,
      reviewTaskId,
      actionType,
      status: job.status,
      policyOutcome: policy.outcome,
    });
    return { job, policy };
  }

  async listActions(workspaceId: string, filter?: ActionJobFilter): Promise<ActionJobRecord[]> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.listJobs(workspaceId, filter);
  }

  async getStatistics(workspaceId: string): Promise<ActionStatistics> {
    this.assertWorkspace(workspaceId);
    const jobs = await this.deps.repo.listJobs(workspaceId, { limit: 100000 });
    const s: ActionStatistics = {
      total: jobs.length,
      queued: 0,
      blocked: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const j of jobs) s[j.status] += 1;
    return s;
  }

  async getDetail(workspaceId: string, id: string): Promise<ActionDetail> {
    const job = await this.loadOwned(workspaceId, id);
    const [review, draft, match, events] = await Promise.all([
      this.deps.repo.getReviewTaskById(job.reviewTaskId),
      this.deps.repo.getDraftById(job.aiDraftId),
      this.deps.repo.getMatchById(job.businessMatchId),
      this.deps.repo.listEvents(job.id),
    ]);
    return { job, review, draft, match, events, policyReasons: latestPolicyReasons(events) };
  }

  /** Cancel an active job (queued/blocked/failed). Cancelled jobs never execute. */
  async cancel(workspaceId: string, id: string): Promise<ActionJobRecord> {
    const job = await this.loadOwned(workspaceId, id);
    return this.deps.queue.cancel(job);
  }

  /** Retry a failed job — only under the attempt limit (no infinite retries). */
  async retry(workspaceId: string, id: string): Promise<ActionJobRecord> {
    const job = await this.loadOwned(workspaceId, id);
    return this.deps.queue.retry(job);
  }

  /**
   * Re-evaluate safety for a blocked job. blocked → queued ONLY when the guard
   * now allows it. Under current defaults it stays blocked and records a
   * policy-rejected event.
   */
  async recheckPolicy(workspaceId: string, id: string): Promise<CreateActionResult> {
    const job = await this.loadOwned(workspaceId, id);
    if (job.status !== 'blocked') {
      throw new ActionError(ActionErrorCode.INVALID_STATE, 'Only a blocked job can be re-checked');
    }
    const intent: ActionIntent = {
      workspaceId: job.workspaceId,
      reviewTaskId: job.reviewTaskId,
      aiDraftId: job.aiDraftId,
      businessMatchId: job.businessMatchId,
      actionType: job.actionType,
      targetPlatform: job.targetPlatform,
      targetUrl: job.targetUrl,
      approvedContent: job.approvedContent,
    };
    // Re-evaluating THIS job — it is not a duplicate of itself.
    const policy = evaluateActionPolicy(intent, this.safety(), { isDuplicate: false });
    if (policy.outcome === 'ALLOW') {
      const updated = await this.deps.queue.requeueAfterRecheck(job);
      return { job: updated, policy };
    }
    await this.deps.repo.createEvent(job.id, ActionEventType.PolicyRejected, {
      reasonCodes: policy.reasons.map((r) => r.code),
    });
    return { job, policy };
  }

  private async loadOwned(workspaceId: string, id: string): Promise<ActionJobRecord> {
    this.assertWorkspace(workspaceId);
    const job = await this.deps.repo.getJobById(id);
    if (!job || job.workspaceId !== workspaceId) {
      throw new ActionError(ActionErrorCode.ACTION_NOT_FOUND, 'Action job not found');
    }
    return job;
  }
}

function latestPolicyReasons(events: ActionEventRecord[]): { code: string; detail: string }[] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (
      (e.event === ActionEventType.Blocked || e.event === ActionEventType.PolicyRejected) &&
      e.payload &&
      Array.isArray(e.payload.reasonCodes)
    ) {
      return (e.payload.reasonCodes as unknown[])
        .filter((c): c is string => typeof c === 'string')
        .map((code) => ({ code, detail: code }));
    }
  }
  return [];
}
