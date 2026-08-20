# 93 — Production Business Readiness

**Status:** SPRINT 014. Evaluator: `evaluateProductionBusinessReadiness` (apps/api/src/production/business-readiness.ts).

A **test Business must never post a production comment.** A production Business is `NOT_READY` until the operator supplies every required real field. Nothing is fabricated or substituted; if only the existing test Businesses exist, production Business = `NOT_READY`.

## Required checklist (all mandatory)

| Field | Notes |
| --- | --- |
| real Business name | not a `*_Test` placeholder; `isTestBusiness` must be false |
| category | e.g. accommodation |
| service area | one of the pilot areas |
| verified description | reviewed by the operator |
| verified selling points | ≥ 1, reviewed |
| actual contact channel | real, reachable |
| contact channel owner approval | explicit owner sign-off |
| approved response tone | reviewed |
| prohibited claims | ≥ 1 (e.g. no availability, no price, no fake promotion) |
| real availability policy | how availability is actually confirmed |
| real pricing policy | how pricing is actually handled |
| promotion policy | real promotions only, or "none" |
| booking policy | real booking terms |
| escalation / contact owner | who owns replies |
| operating hours | real |
| maximum response SLA | minutes; must be > 0 |

## Result

`READY` only when every field is present and `contactChannelOwnerApproved === true` and `maxResponseSlaMinutes > 0`; otherwise `NOT_READY` with the exact missing items. **Do not fabricate production Business data.**
