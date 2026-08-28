import type { Store } from '../store/types';
import type { BusinessPropertyStore } from '../business-property/store';
import type {
  BusinessGroupSubscriptionRecord,
  BusinessMatchRecord,
  BusinessRecord,
  CreateBusinessGroupSubscriptionInput,
  CreateOpportunityEventInput,
  CreateOpportunityInput,
  CreateSignalInput,
  MatchDecision,
  OpportunityEventRecord,
  OpportunityRecord,
  SignalRecord,
} from '../store/types';
import type { MatchReason } from '../matching/types';
import { MatchRepository } from '../matching/repository';

/**
 * RoutingRepository (MODEL C) — the persistence boundary for cross-workspace
 * lead routing. It reuses the existing MatchRepository for the matching/match
 * pieces (so routing writes the SAME kind of Business Match the workspace-local
 * matcher does) and adds the source-group subscription lookups.
 *
 * It never reads or exposes any Facebook account/session/browser-profile data —
 * only Signal facts, subscriptions, and Business Matches.
 */
export class RoutingRepository {
  private readonly match: MatchRepository;

  constructor(
    private readonly store: Store,
    bpStore: BusinessPropertyStore,
  ) {
    this.match = new MatchRepository(store, bpStore);
  }

  // ── Source Opportunity / Signal (source tenant, read by id) ────────────────
  getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    return this.match.getOpportunityById(id);
  }

  getSignalById(id: string): Promise<SignalRecord | null> {
    return this.match.getSignalById(id);
  }

  // ── Customer-safe projection (MODEL C, M2b) ────────────────────────────────
  getProjectedOpportunity(
    sourceOpportunityId: string,
    workspaceId: string,
  ): Promise<OpportunityRecord | null> {
    return this.store.getProjectedOpportunity(sourceOpportunityId, workspaceId);
  }

  createSignal(input: CreateSignalInput): Promise<SignalRecord> {
    return this.store.createSignal(input);
  }

  createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
    return this.store.createOpportunity(input);
  }

  listOpportunityEvents(opportunityId: string): Promise<OpportunityEventRecord[]> {
    return this.store.listOpportunityEvents(opportunityId);
  }

  createOpportunityEvent(input: CreateOpportunityEventInput): Promise<OpportunityEventRecord> {
    return this.store.createOpportunityEvent(input);
  }

  // ── Subscriptions (source group → customer businesses) ─────────────────────
  createSubscription(
    input: CreateBusinessGroupSubscriptionInput,
  ): Promise<BusinessGroupSubscriptionRecord> {
    return this.store.createBusinessGroupSubscription(input);
  }

  subscriptionExists(sourceGroupId: string, businessId: string): Promise<boolean> {
    return this.store.businessGroupSubscriptionExists(sourceGroupId, businessId);
  }

  listEnabledSubscriptionsForSourceGroup(
    sourceGroupId: string,
  ): Promise<BusinessGroupSubscriptionRecord[]> {
    return this.store.listEnabledSubscriptionsForSourceGroup(sourceGroupId);
  }

  setSubscriptionEnabled(
    id: string,
    enabled: boolean,
  ): Promise<BusinessGroupSubscriptionRecord | null> {
    return this.store.setBusinessGroupSubscriptionEnabled(id, enabled);
  }

  // ── Business matching (delegated to the shared matcher repository) ──────────
  getBusinessById(id: string): Promise<BusinessRecord | null> {
    return this.match.getBusinessById(id);
  }

  listActiveRules(businessId: string): Promise<{ ruleType: string; ruleValue: string }[]> {
    return this.match.listActiveRules(businessId);
  }

  matchExists(opportunityId: string, businessId: string): Promise<boolean> {
    return this.match.matchExists(opportunityId, businessId);
  }

  createMatch(input: {
    workspaceId: string;
    businessId: string;
    opportunityId: string;
    decision: MatchDecision;
    reasons: MatchReason[];
    matcherVersion: string;
  }): Promise<BusinessMatchRecord> {
    return this.match.createMatch(input);
  }
}
