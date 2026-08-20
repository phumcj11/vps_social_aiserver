/**
 * Production Pilot domain types (SPRINT 014 — Production Pilot Readiness).
 *
 * Pure, deterministic types + the small value objects the pilot's safety
 * primitives operate on. NONE of this performs a Facebook write, enables any
 * flag, or executes an action — it defines and enforces the guard rails for a
 * SMALL, human-supervised production pilot. The write path remains gated by the
 * existing execution safety flags.
 */

/** Rollout levels. LEVEL 0 (private test) is already PASS. */
export type PilotLevel =
  'LEVEL_0_PRIVATE_TEST' | 'LEVEL_1_SUPERVISED' | 'LEVEL_2_EXPANDED' | 'LEVEL_3_ASSISTED';

/** How a production draft is produced. mock/manual both require a human rewrite. */
export type DraftMode = 'mock' | 'manual' | 'external_ai';

/** Explicit, bounded write-window states. Default CLOSED. */
export type WriteWindowState = 'CLOSED' | 'OPEN' | 'LOCKDOWN';

/** A readiness verdict with the reasons that produced it. */
export interface ReadinessVerdict {
  ready: boolean;
  status: 'READY' | 'NOT_READY';
  missing: string[];
  reasons: string[];
}

/** The three pilot geographic areas for Level 1. */
export const PILOT_AREAS = ['บางแสน', 'พัทยา', 'ชะอำ'] as const;
export type PilotArea = (typeof PILOT_AREAS)[number];

/** A validated Facebook group as seen by group selection (no session data). */
export interface CandidateGroup {
  internalId: string;
  facebookGroupId: string;
  name: string;
  area: PilotArea | null;
  accessState: string; // 'accessible' | ...
  accountHasAccess: boolean;
  hasGenuineSeekingPosts: boolean;
  stableCollectorParsing: boolean;
  rulesAllowBusinessResponses: boolean;
  manageablePostVolume: boolean;
  noCheckpointHistory: boolean;
  accessStable: boolean;
}

/** Production Business fields required before any production comment. */
export interface ProductionBusinessInput {
  isTestBusiness: boolean;
  realBusinessName?: string;
  category?: string;
  serviceArea?: string;
  verifiedDescription?: string;
  verifiedSellingPoints?: string[];
  actualContactChannel?: string;
  contactChannelOwnerApproved?: boolean;
  approvedResponseTone?: string;
  prohibitedClaims?: string[];
  realAvailabilityPolicy?: string;
  realPricingPolicy?: string;
  promotionPolicy?: string;
  bookingPolicy?: string;
  escalationContactOwner?: string;
  operatingHours?: string;
  maxResponseSlaMinutes?: number;
}

/** Level 1 hard limits (from env; enforced by the limit evaluator). */
export interface PilotLimits {
  maxGroups: number;
  maxCommentsPerDay: number;
  maxCommentsPerGroupPerDay: number;
  maxCommentsPerBusinessPerDay: number;
  maxAmbiguousPerDay: number;
  writeWindowMaxSeconds: number;
  authorizationTtlSeconds: number;
}

/** Today's usage counters that the limit evaluator checks against. */
export interface DailyUsage {
  commentsToday: number;
  commentsForGroupToday: number;
  commentsForBusinessToday: number;
  ambiguousToday: number;
  activeGroups: number;
}

/** A single limit-check result. */
export interface LimitDecision {
  allowed: boolean;
  blockers: string[];
  /** True when the day's writing must stop entirely (ambiguous / lockdown). */
  stopForDay: boolean;
}
