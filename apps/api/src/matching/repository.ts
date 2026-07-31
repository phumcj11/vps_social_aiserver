import type {
  Store,
  BusinessRecord,
  BusinessMatchRecord,
  BusinessMatchFilter,
  MatchDecision,
  MatchReason,
  OpportunityRecord,
  SignalRecord,
} from '../store/types';
import { newId } from '../lib/tokens';
import { MatchingError, MatchingErrorCode } from './errors';

/**
 * MatchRepository (SPRINT 008).
 *
 * The Coordinator talks only to this repository; the repository talks to the
 * database (via the Store). This is the single persistence boundary for the
 * matching engine. It reads existing Opportunities, Signals, businesses,
 * group assignments, and matching rules, and writes Business Matches.
 */
export class MatchRepository {
  constructor(private readonly store: Store) {}

  /** Accepted Opportunities are the ones eligible for business matching. */
  listAcceptedOpportunities(workspaceId: string): Promise<OpportunityRecord[]> {
    return this.store.listOpportunitiesByWorkspace(workspaceId, {
      decision: 'ACCEPT',
      limit: 1000,
    });
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

  /** Businesses assigned to a Signal's group — the raw candidate pool (BR-15). */
  listBusinessesForGroup(groupId: string): Promise<BusinessRecord[]> {
    return this.store.listBusinessesForGroup(groupId);
  }

  /** A business's ACTIVE matching rules only (priority desc, per the store). */
  async listActiveRules(businessId: string): Promise<{ ruleType: string; ruleValue: string }[]> {
    const rules = await this.store.listRules(businessId);
    return rules
      .filter((r) => r.status === 'active')
      .map((r) => ({ ruleType: r.ruleType, ruleValue: r.ruleValue }));
  }

  matchExists(opportunityId: string, businessId: string): Promise<boolean> {
    return this.store.businessMatchExists(opportunityId, businessId);
  }

  async createMatch(input: {
    workspaceId: string;
    businessId: string;
    opportunityId: string;
    decision: MatchDecision;
    reasons: MatchReason[];
    matcherVersion: string;
  }): Promise<BusinessMatchRecord> {
    try {
      return await this.store.createBusinessMatch({ id: newId(), ...input });
    } catch (err) {
      throw new MatchingError(
        MatchingErrorCode.REPOSITORY_ERROR,
        `Business match creation failed: ${(err as Error).message}`,
      );
    }
  }

  getMatchById(id: string): Promise<BusinessMatchRecord | null> {
    return this.store.getBusinessMatchById(id);
  }

  listMatches(workspaceId: string, filter?: BusinessMatchFilter): Promise<BusinessMatchRecord[]> {
    return this.store.listBusinessMatchesByWorkspace(workspaceId, filter);
  }
}
