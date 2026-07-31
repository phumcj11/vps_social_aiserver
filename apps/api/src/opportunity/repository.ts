import type {
  Store,
  SignalRecord,
  OpportunityRecord,
  OpportunityEventRecord,
  OpportunityStatistics,
  OpportunityDecision,
  OpportunityStatus,
} from '../store/types';
import { newId } from '../lib/tokens';
import { OpportunityError, OpportunityErrorCode } from './errors';

/**
 * OpportunityRepository (SPRINT 007).
 *
 * The Coordinator talks only to this repository; the repository talks to the
 * database (via the Store). This is the single persistence boundary for the
 * Opportunity engine.
 */
export class OpportunityRepository {
  constructor(private readonly store: Store) {}

  listUnclassifiedSignals(workspaceId: string, limit?: number): Promise<SignalRecord[]> {
    return this.store.listUnclassifiedSignals(workspaceId, limit);
  }

  getSignalById(id: string): Promise<SignalRecord | null> {
    return this.store.getSignalById(id);
  }

  /** True when an Opportunity already exists for a Signal with this content hash. */
  isDuplicateHash(workspaceId: string, normalizedHash: string): Promise<boolean> {
    return this.store.opportunityExistsForSignalHash(workspaceId, normalizedHash);
  }

  async createOpportunity(input: {
    workspaceId: string;
    signalId: string;
    decision: OpportunityDecision;
    status: OpportunityStatus;
    classifierVersion: string;
  }): Promise<OpportunityRecord> {
    try {
      return await this.store.createOpportunity({ id: newId(), ...input });
    } catch (err) {
      throw new OpportunityError(
        OpportunityErrorCode.REPOSITORY_ERROR,
        `Opportunity creation failed: ${(err as Error).message}`,
      );
    }
  }

  async createEvent(
    opportunityId: string,
    event: string,
    payload: Record<string, unknown> | null,
  ): Promise<OpportunityEventRecord> {
    return this.store.createOpportunityEvent({ id: newId(), opportunityId, event, payload });
  }

  getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    return this.store.getOpportunityById(id);
  }

  getOpportunityBySignal(signalId: string): Promise<OpportunityRecord | null> {
    return this.store.getOpportunityBySignal(signalId);
  }

  listOpportunities(
    workspaceId: string,
    filter?: { status?: OpportunityStatus; decision?: OpportunityDecision; limit?: number },
  ): Promise<OpportunityRecord[]> {
    return this.store.listOpportunitiesByWorkspace(workspaceId, filter);
  }

  updateStatus(id: string, status: OpportunityStatus): Promise<OpportunityRecord | null> {
    return this.store.updateOpportunityStatus(id, status);
  }

  statistics(workspaceId: string): Promise<OpportunityStatistics> {
    return this.store.getOpportunityStatistics(workspaceId);
  }

  listEvents(opportunityId: string): Promise<OpportunityEventRecord[]> {
    return this.store.listOpportunityEvents(opportunityId);
  }
}
