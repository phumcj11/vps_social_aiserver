import type { ApiEnv } from '../lib/env';
import type { PilotLimits, DailyUsage, LimitDecision } from './types';

/**
 * Level-1 pilot limit evaluator (SPRINT 014, Phases G/K).
 *
 * Pure, deterministic hard limits for a supervised production pilot. It only
 * DECIDES whether one more production comment is within limits — it never
 * executes anything. An ambiguous execution or a platform interrupt stops
 * writing for the day.
 */

export function pilotLimitsFromEnv(env: ApiEnv): PilotLimits {
  return {
    maxGroups: env.PILOT_MAX_GROUPS,
    maxCommentsPerDay: env.PILOT_MAX_COMMENTS_PER_DAY,
    maxCommentsPerGroupPerDay: env.PILOT_MAX_COMMENTS_PER_GROUP_PER_DAY,
    maxCommentsPerBusinessPerDay: env.PILOT_MAX_COMMENTS_PER_BUSINESS_PER_DAY,
    maxAmbiguousPerDay: env.PILOT_MAX_AMBIGUOUS_PER_DAY,
    writeWindowMaxSeconds: env.PILOT_WRITE_WINDOW_MAX_SECONDS,
    authorizationTtlSeconds: env.PILOT_AUTHORIZATION_TTL_SECONDS,
  };
}

/** May one more production comment proceed given today's usage? */
export function evaluateCommentLimit(limits: PilotLimits, usage: DailyUsage): LimitDecision {
  const blockers: string[] = [];
  let stopForDay = false;

  // An ambiguous execution already occurred today → stop writing for the day.
  if (usage.ambiguousToday >= limits.maxAmbiguousPerDay) {
    blockers.push(
      `an ambiguous execution occurred today (${usage.ambiguousToday}/${limits.maxAmbiguousPerDay}) — stop writes, operator review required`,
    );
    stopForDay = true;
  }
  if (usage.commentsToday >= limits.maxCommentsPerDay) {
    blockers.push(
      `daily comment limit reached (${usage.commentsToday}/${limits.maxCommentsPerDay})`,
    );
  }
  if (usage.commentsForGroupToday >= limits.maxCommentsPerGroupPerDay) {
    blockers.push(
      `per-group daily limit reached (${usage.commentsForGroupToday}/${limits.maxCommentsPerGroupPerDay})`,
    );
  }
  if (usage.commentsForBusinessToday >= limits.maxCommentsPerBusinessPerDay) {
    blockers.push(
      `per-business daily limit reached (${usage.commentsForBusinessToday}/${limits.maxCommentsPerBusinessPerDay})`,
    );
  }
  if (usage.activeGroups > limits.maxGroups) {
    blockers.push(`too many active pilot groups (${usage.activeGroups}/${limits.maxGroups})`);
  }

  return { allowed: blockers.length === 0, blockers, stopForDay };
}

/** Platform interrupts that force LOCKDOWN and manual operator recovery. */
export type PlatformInterrupt = 'checkpoint' | 'captcha' | 'account_restricted';

export function requiresLockdown(interrupt: PlatformInterrupt | null): boolean {
  return interrupt != null;
}
