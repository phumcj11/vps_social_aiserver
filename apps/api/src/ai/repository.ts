import type {
  Store,
  AiDraftRecord,
  AiDraftStatus,
  AiDraftFilter,
  AiDraftEventRecord,
  CreateAiDraftInput,
  BusinessRecord,
  BusinessProfileRecord,
  BusinessKnowledgeRecord,
  BusinessMatchingRuleRecord,
  BusinessMatchRecord,
  OpportunityRecord,
  OpportunityEventRecord,
  SignalRecord,
  FacebookGroupRecord,
} from '../store/types';
import { newId } from '../lib/tokens';
import { AiDraftError, AiDraftErrorCode } from './errors';

/**
 * AiDraftRepository (SPRINT 009).
 *
 * The Coordinator talks only to this repository; the repository talks to the
 * database (via the Store). It reads Business Matches, Opportunities, Signals,
 * businesses, profiles, knowledge, rules, and groups, and writes immutable,
 * versioned AI Drafts and their events. Single persistence boundary.
 */
export class AiDraftRepository {
  constructor(private readonly store: Store) {}

  getMatchById(id: string): Promise<BusinessMatchRecord | null> {
    return this.store.getBusinessMatchById(id);
  }

  getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    return this.store.getOpportunityById(id);
  }

  listOpportunityEvents(opportunityId: string): Promise<OpportunityEventRecord[]> {
    return this.store.listOpportunityEvents(opportunityId);
  }

  getSignalById(id: string): Promise<SignalRecord | null> {
    return this.store.getSignalById(id);
  }

  getFacebookGroupById(id: string): Promise<FacebookGroupRecord | null> {
    return this.store.getFacebookGroupById(id);
  }

  getBusinessById(id: string): Promise<BusinessRecord | null> {
    return this.store.getBusinessById(id);
  }

  getProfileByBusiness(businessId: string): Promise<BusinessProfileRecord | null> {
    return this.store.getProfileByBusiness(businessId);
  }

  listKnowledge(businessId: string): Promise<BusinessKnowledgeRecord[]> {
    return this.store.listKnowledge(businessId);
  }

  listRules(businessId: string): Promise<BusinessMatchingRuleRecord[]> {
    return this.store.listRules(businessId);
  }

  async createDraft(input: Omit<CreateAiDraftInput, 'id'>): Promise<AiDraftRecord> {
    try {
      return await this.store.createAiDraft({ id: newId(), ...input });
    } catch (err) {
      throw new AiDraftError(
        AiDraftErrorCode.REPOSITORY_ERROR,
        `AI draft creation failed: ${(err as Error).message}`,
      );
    }
  }

  getDraftById(id: string): Promise<AiDraftRecord | null> {
    return this.store.getAiDraftById(id);
  }

  listDrafts(workspaceId: string, filter?: AiDraftFilter): Promise<AiDraftRecord[]> {
    return this.store.listAiDraftsByWorkspace(workspaceId, filter);
  }

  listDraftsForMatch(businessMatchId: string): Promise<AiDraftRecord[]> {
    return this.store.listAiDraftsForMatch(businessMatchId);
  }

  getLatestDraftForMatch(businessMatchId: string): Promise<AiDraftRecord | null> {
    return this.store.getLatestAiDraftForMatch(businessMatchId);
  }

  updateStatus(id: string, status: AiDraftStatus): Promise<AiDraftRecord | null> {
    return this.store.updateAiDraftStatus(id, status);
  }

  createEvent(
    aiDraftId: string,
    event: string,
    payload: Record<string, unknown> | null,
  ): Promise<AiDraftEventRecord> {
    return this.store.createAiDraftEvent({ id: newId(), aiDraftId, event, payload });
  }

  listEvents(aiDraftId: string): Promise<AiDraftEventRecord[]> {
    return this.store.listAiDraftEvents(aiDraftId);
  }
}
