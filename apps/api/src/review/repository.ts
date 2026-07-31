import type {
  Store,
  ReviewTaskRecord,
  ReviewTaskFilter,
  UpdateReviewTaskInput,
  ReviewEventRecord,
  AiDraftRecord,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
  SignalRecord,
  FacebookGroupRecord,
} from '../store/types';
import { newId } from '../lib/tokens';
import { ReviewError, ReviewErrorCode } from './errors';

/**
 * ReviewRepository (SPRINT 010).
 *
 * The Queue and Coordinator talk only to this repository; the repository talks
 * to the database (via the Store). It stores Review Tasks, keeps their history
 * (events), and reads the records needed to present a review. Single
 * persistence boundary — no Adapter and no HTTP layer touches the Store.
 */
export class ReviewRepository {
  constructor(private readonly store: Store) {}

  async createTask(input: {
    workspaceId: string;
    businessMatchId: string;
    draftId: string;
    assignedTo: string | null;
  }): Promise<ReviewTaskRecord> {
    try {
      return await this.store.createReviewTask({ id: newId(), ...input });
    } catch (err) {
      throw new ReviewError(
        ReviewErrorCode.REPOSITORY_ERROR,
        `Review task creation failed: ${(err as Error).message}`,
      );
    }
  }

  getTaskById(id: string): Promise<ReviewTaskRecord | null> {
    return this.store.getReviewTaskById(id);
  }

  getTaskByDraft(draftId: string): Promise<ReviewTaskRecord | null> {
    return this.store.getReviewTaskByDraft(draftId);
  }

  listTasks(workspaceId: string, filter?: ReviewTaskFilter): Promise<ReviewTaskRecord[]> {
    return this.store.listReviewTasksByWorkspace(workspaceId, filter);
  }

  updateTask(id: string, input: UpdateReviewTaskInput): Promise<ReviewTaskRecord | null> {
    return this.store.updateReviewTask(id, input);
  }

  createEvent(
    reviewTaskId: string,
    event: string,
    payload: Record<string, unknown> | null,
  ): Promise<ReviewEventRecord> {
    return this.store.createReviewEvent({ id: newId(), reviewTaskId, event, payload });
  }

  listEvents(reviewTaskId: string): Promise<ReviewEventRecord[]> {
    return this.store.listReviewEvents(reviewTaskId);
  }

  // Reads for building a review presentation.
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

  getFacebookGroupById(id: string): Promise<FacebookGroupRecord | null> {
    return this.store.getFacebookGroupById(id);
  }
}
