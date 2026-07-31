import type {
  Store,
  ActionJobRecord,
  ActionType,
  ActionJobFilter,
  UpdateActionJobInput,
  CreateActionJobInput,
  ActionEventRecord,
  ReviewTaskRecord,
  AiDraftRecord,
  OpportunityRecord,
  SignalRecord,
  BusinessMatchRecord,
  BusinessRecord,
} from '../store/types';
import { newId } from '../lib/tokens';
import { ActionError, ActionErrorCode } from './errors';

/**
 * ActionRepository (SPRINT 011).
 *
 * The Queue and Coordinator talk only to this repository; the repository talks
 * to the database (via the Store). It persists Action Jobs, keeps their event
 * history, enforces workspace isolation and idempotency, and reads the records
 * needed to build an intent. Single persistence boundary — no HTTP layer and no
 * worker touches the Store directly.
 */
export class ActionRepository {
  constructor(private readonly store: Store) {}

  async createJob(input: Omit<CreateActionJobInput, 'id'>): Promise<ActionJobRecord> {
    try {
      return await this.store.createActionJob({ id: newId(), ...input });
    } catch (err) {
      throw new ActionError(
        ActionErrorCode.REPOSITORY_ERROR,
        `Action job creation failed: ${(err as Error).message}`,
      );
    }
  }

  getJobById(id: string): Promise<ActionJobRecord | null> {
    return this.store.getActionJobById(id);
  }

  listJobs(workspaceId: string, filter?: ActionJobFilter): Promise<ActionJobRecord[]> {
    return this.store.listActionJobsByWorkspace(workspaceId, filter);
  }

  async hasActiveJob(reviewTaskId: string, actionType: ActionType): Promise<boolean> {
    const active = await this.store.listActiveActionJobsForReview(reviewTaskId, actionType);
    return active.length > 0;
  }

  updateJob(id: string, input: UpdateActionJobInput): Promise<ActionJobRecord | null> {
    return this.store.updateActionJob(id, input);
  }

  createEvent(
    actionJobId: string,
    event: string,
    payload: Record<string, unknown> | null,
  ): Promise<ActionEventRecord> {
    return this.store.createActionEvent({ id: newId(), actionJobId, event, payload });
  }

  listEvents(actionJobId: string): Promise<ActionEventRecord[]> {
    return this.store.listActionEvents(actionJobId);
  }

  // Reads for building the Action intent.
  getReviewTaskById(id: string): Promise<ReviewTaskRecord | null> {
    return this.store.getReviewTaskById(id);
  }

  getDraftById(id: string): Promise<AiDraftRecord | null> {
    return this.store.getAiDraftById(id);
  }

  getMatchById(id: string): Promise<BusinessMatchRecord | null> {
    return this.store.getBusinessMatchById(id);
  }

  getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    return this.store.getOpportunityById(id);
  }

  getSignalById(id: string): Promise<SignalRecord | null> {
    return this.store.getSignalById(id);
  }

  getBusinessById(id: string): Promise<BusinessRecord | null> {
    return this.store.getBusinessById(id);
  }
}
