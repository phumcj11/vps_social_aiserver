import type { PilotLevel, WriteWindowState, DraftMode, PilotLimits } from './types';

/**
 * Production Pilot observability read model (SPRINT 014, Phase J).
 *
 * A single, safe, aggregated snapshot for the operator — built from counts the
 * repositories already expose (no heavy monitoring stack). It contains NO
 * cookies, credentials, profile paths, or session data.
 */

export interface PilotDashboardInput {
  pilotLevel: PilotLevel;
  draftMode: DraftMode;
  limits: PilotLimits;
  // Today's activity
  groupsScanned: number;
  collectorRuns: number;
  postsInspected: number;
  signalsCreated: number;
  duplicatesSkipped: number;
  opportunitiesAccepted: number;
  opportunitiesRejected: number;
  matchesMatch: number;
  matchesNoMatch: number;
  drafts: number;
  reviewsPending: number;
  reviewsApproved: number;
  reviewsRejected: number;
  actionsBlocked: number;
  actionsQueued: number;
  actionsSucceeded: number;
  actionsFailed: number;
  actionsAmbiguous: number;
  commentsVerified: number;
  duplicatePreventionEvents: number;
  // Runtime safety state
  profileLockHeld: boolean;
  writeWindowState: WriteWindowState;
  writeWindowExpiresAtMs: number | null;
  killSwitchOn: boolean;
  facebookSessionConnected: boolean;
  lastVerifiedBackupId: string | null;
  lastVerifiedCommentAtMs: number | null;
}

export interface PilotDashboard extends PilotDashboardInput {
  commentsUsedToday: number;
  commentsRemainingToday: number;
  ambiguousToday: number;
  /** True when the day's writing is stopped (limit hit or ambiguous/lockdown). */
  writesStoppedForDay: boolean;
}

export function buildPilotDashboard(input: PilotDashboardInput): PilotDashboard {
  const commentsUsedToday = input.commentsVerified;
  const ambiguousToday = input.actionsAmbiguous;
  const writesStoppedForDay =
    commentsUsedToday >= input.limits.maxCommentsPerDay ||
    ambiguousToday >= input.limits.maxAmbiguousPerDay ||
    input.writeWindowState === 'LOCKDOWN';
  return {
    ...input,
    commentsUsedToday,
    commentsRemainingToday: Math.max(0, input.limits.maxCommentsPerDay - commentsUsedToday),
    ambiguousToday,
    writesStoppedForDay,
  };
}
