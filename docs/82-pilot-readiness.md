# 82 — Pilot Readiness

Readiness is staged. A level is reached only when **all** its exit criteria hold. The operator console (`/settings/operations`) shows a coarse current posture; this document is the authoritative checklist.

## Levels and exit criteria

**LEVEL 0 — Development.** Local only; fake adapter; no real Facebook. Exit: full quality suite green (lint, typecheck, test, build, format, doctor); migrations apply.

**LEVEL 1 — Internal Fake Execution.** The whole pipeline runs end-to-end on the **fake** adapter. Exit: execution engine verified by tests; safety health reports execution intentionally disabled; kill switch on.

**LEVEL 2 — Controlled Disposable Facebook Test.** The single supervised write test ([81](81-controlled-facebook-write-test.md)) passes on a disposable account/post. Exit: verified-only success; no duplicate; flags restored; evidence stored; doctor green. _Enabler (2026-08-04): the **real** comment adapter is now implemented behind the hard gates ([87](87-real-facebook-comment-adapter.md), [ADR-031](adr/ADR-031-real-facebook-comment-adapter.md)); the read-only `prepare_only` probe ([88](88-controlled-one-shot-execution.md)) is ready and its live run on the exact Pilot target is the next operator-supervised step — no write flag enabled, no comment posted._

**LEVEL 3 — First Pilot Customer.** One real customer, one business, human-approved comments only. Exit criteria below. _Update (2026-08-04→08-20): LEVEL 2 achieved — one real comment posted + verified in the operator-owned private test group ([91 Pilot 0 closure](91-pilot0-closure.md), tag `v0.9.3-pilot-write-verified`). The SUPERVISED PRODUCTION pilot (3 areas, ≤3 groups, ≤3 comments/day, every draft reviewed, every submit explicitly authorized) is defined in [92 Production Pilot Level 1](92-production-pilot-level1.md) and [99 rollout levels](99-production-rollout-levels.md); it is prepared but NOT activated — no production writes enabled._

**LEVEL 4 — Paid Customer.** Billing/subscription is **out of scope** now — placeholder. Exit: Level 3 sustained + agreed commercial terms (future).

**LEVEL 5 — Multiple Customers.** Concurrency and isolation beyond a single VPS — **future**; explicitly not built (no horizontal scaling this program stage).

## First-pilot requirements (Level 3)

- **Tested backup** and **tested restore dry-run** ([73](73-backup-policy.md), [74](74-database-restore-runbook.md)).
- **Log rotation** configured ([76](76-log-rotation.md)).
- **Monitoring** green with thresholds set ([77](77-health-and-monitoring.md)).
- **Incident lockdown** and **maintenance mode** verified ([79](79-maintenance-mode.md), [80](80-incident-lockdown.md)).
- **Controlled reconnect flow** verified (profile recovery, [75](75-browser-profile-recovery-policy.md)).
- **Controlled write test passed** ([81](81-controlled-facebook-write-test.md)).
- **No ambiguous unresolved Action.**
- **Audit trail complete** and reviewable ([84](84-audit-investigation.md)).
- **Customer consent** obtained; **data-retention policy** agreed; **session-reconnect procedure** documented; **rollback procedure** ready.

Until every Level-3 box is checked, the pilot does not begin.
