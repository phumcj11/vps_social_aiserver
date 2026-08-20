# 96 — Production Pilot Limits (Level 1)

**Status:** SPRINT 014. Logic: `apps/api/src/production/limits.ts`. ADR: [ADR-035](adr/ADR-035-production-pilot-limits.md).

Hard, deterministic Level-1 limits. The evaluator only DECIDES whether one more production comment is within limits — it executes nothing.

## Recommended initial defaults (env)

| Limit | Env | Default |
| --- | --- | --- |
| Pilot groups | `PILOT_MAX_GROUPS` | 3 |
| Collector concurrency | `COLLECTOR`/`PLAYWRIGHT_CONCURRENCY` | 1 |
| Action concurrency | `ACTION_EXECUTION_CONCURRENCY` | 1 |
| Real comments / day | `PILOT_MAX_COMMENTS_PER_DAY` | 3 |
| Real comments / group / day | `PILOT_MAX_COMMENTS_PER_GROUP_PER_DAY` | 1 |
| Real comments / business / day | `PILOT_MAX_COMMENTS_PER_BUSINESS_PER_DAY` | 1 |
| Ambiguous executions / day | `PILOT_MAX_AMBIGUOUS_PER_DAY` | 1 |

## Stop conditions

- **Ambiguous execution occurs:** immediately **close the Write Window**, **stop production writes for the day**, require operator review. `evaluateCommentLimit` returns `allowed=false, stopForDay=true` once `ambiguousToday ≥ maxAmbiguousPerDay`.
- **Checkpoint / CAPTCHA / account restriction:** **stop Facebook operations, enter LOCKDOWN, require manual operator recovery** (`requiresLockdown`).
- Per-day / per-group / per-business caps each independently block a further comment with an explicit reason.

These limits are advisory defaults enforced by the evaluator at the point a production submit would be authorized; they never trigger or retry an action.
