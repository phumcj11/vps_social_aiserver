import { newId } from '../lib/tokens';
import type { ApiEnv } from '../lib/env';
import type { Store, FacebookGroupRecord, BusinessGroupSubscriptionRecord } from '../store/types';
import { RoutingError, RoutingErrorCode } from './errors';

export interface SourceGroupView {
  id: string;
  name: string | null;
  url: string;
  status: string;
  accessState: string;
  subscribed: boolean;
  subscriberCount: number;
}

/**
 * SubscriptionService (MODEL C, M4/M5) — the single place that reconciles a
 * customer Business's subscriptions to system-owned source Facebook Groups.
 *
 * "Source groups" are the Facebook Groups owned by the configured SYSTEM source
 * workspace (env MODEL_C_SOURCE_WORKSPACE_ID). When that is unset there are no
 * source groups — the operator and customer surfaces show their empty states.
 *
 * A customer may ONLY subscribe to real source groups; any other group id is
 * rejected (a customer can never point a subscription at an arbitrary/foreign
 * group). Reconciliation is idempotent and relies on the existing
 * UNIQUE(source_group_id, business_id) constraint.
 */
export class SubscriptionService {
  constructor(
    private readonly store: Store,
    private readonly env: ApiEnv,
  ) {}

  /** The configured system source workspace id, or null when unconfigured. */
  sourceWorkspaceId(): string | null {
    const id = this.env.MODEL_C_SOURCE_WORKSPACE_ID.trim();
    return id.length > 0 ? id : null;
  }

  isConfigured(): boolean {
    return this.sourceWorkspaceId() !== null;
  }

  /** All source Groups (operator view: every status). Empty when unconfigured. */
  async listSourceGroups(): Promise<FacebookGroupRecord[]> {
    const ws = this.sourceWorkspaceId();
    if (!ws) return [];
    return this.store.listFacebookGroupsByWorkspace(ws);
  }

  /** Active source Groups a customer may subscribe to. Empty when unconfigured. */
  async listAvailableSourceGroups(): Promise<FacebookGroupRecord[]> {
    return (await this.listSourceGroups()).filter((g) => g.status === 'active');
  }

  /** The customer-facing view for one Business: available groups + subscribed flag. */
  async businessSourceGroups(businessId: string): Promise<SourceGroupView[]> {
    const groups = await this.listAvailableSourceGroups();
    const subs = await this.store.listSubscriptionsForBusiness(businessId);
    const enabledIds = new Set(subs.filter((s) => s.enabled).map((s) => s.sourceGroupId));
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      url: g.canonicalUrl,
      status: g.status,
      accessState: g.accessState,
      subscribed: enabledIds.has(g.id),
      subscriberCount: 0, // operator-only field; not populated for customers
    }));
  }

  /** The operator-facing view: every source group + live subscriber count. */
  async operatorSourceGroups(): Promise<SourceGroupView[]> {
    const groups = await this.listSourceGroups();
    const out: SourceGroupView[] = [];
    for (const g of groups) {
      out.push({
        id: g.id,
        name: g.name,
        url: g.canonicalUrl,
        status: g.status,
        accessState: g.accessState,
        subscribed: false,
        subscriberCount: await this.store.countEnabledSubscribersForSourceGroup(g.id),
      });
    }
    return out;
  }

  /**
   * Reconcile a Business's subscriptions to EXACTLY the selected source groups.
   * Selected → create-or-enable; deselected → disable. Idempotent; never
   * duplicates. Rejects any selected id that is not a real source group.
   */
  async setBusinessSubscriptions(businessId: string, selectedGroupIds: string[]): Promise<void> {
    const available = await this.listAvailableSourceGroups();
    const availableIds = new Set(available.map((g) => g.id));
    const selected = new Set(selectedGroupIds);

    // Security: a customer can only subscribe to real, available source groups.
    for (const id of selected) {
      if (!availableIds.has(id)) {
        throw new RoutingError(
          RoutingErrorCode.NOT_SOURCE_GROUP,
          'Only KMKT source groups can be followed',
        );
      }
    }

    for (const groupId of availableIds) {
      const want = selected.has(groupId);
      const existing = await this.store.getBusinessGroupSubscription(groupId, businessId);
      if (want) {
        if (!existing) {
          await this.store.createBusinessGroupSubscription({
            id: newId(),
            sourceGroupId: groupId,
            businessId,
            enabled: true,
          });
        } else if (!existing.enabled) {
          await this.store.setBusinessGroupSubscriptionEnabled(existing.id, true);
        }
      } else if (existing && existing.enabled) {
        await this.store.setBusinessGroupSubscriptionEnabled(existing.id, false);
      }
    }
  }

  async listBusinessSubscriptions(businessId: string): Promise<BusinessGroupSubscriptionRecord[]> {
    return this.store.listSubscriptionsForBusiness(businessId);
  }
}
