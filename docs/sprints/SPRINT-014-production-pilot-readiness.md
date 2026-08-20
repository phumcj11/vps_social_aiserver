# SPRINT 014 — Production Pilot Readiness & Controlled Rollout

- **Type:** Readiness + safe scaffolding + rollout plan. **No production writes.**
- **Date:** 2026-08-20
- **Branch:** `feature/s014-production-pilot-readiness`
- **Base:** main `b7d088ff0de898bf5543e9f203298760302e86e3` (tag `v0.9.3-pilot-write-verified`)

## Goal

Prepare the system for a SMALL, human-supervised production pilot against real accommodation-seeking groups — without enabling any production write. Deliver the safety primitives, limits, observability, operator workflow, and a controlled rollout plan.

## What shipped

- **Pilot 0 closure record** — [91](../91-pilot0-closure.md).
- **Production safety primitives** (`apps/api/src/production/`, pure + fully unit-tested; no Facebook write, no flag enablement):
  - `business-readiness.ts` — production Business readiness evaluator (NOT_READY unless real data supplied; test Businesses never used) + draft-mode gate (external_ai refused this sprint). [93](../93-production-business-readiness.md)
  - `group-selection.ts` — recommend ≤1 group/area, ≤3 total, by strict criteria. [92](../92-production-pilot-level1.md)
  - `write-window.ts` — bounded CLOSED/OPEN/LOCKDOWN window with full open-checklist and auto-close-at-expiry (never auto-retries). [94](../94-production-write-window.md), [ADR-033](../adr/ADR-033-production-write-window.md)
  - `authorization.ts` — one-shot submit authorization bound to job/target/content-hash/nonce/version. [95](../95-production-submit-authorization.md), [ADR-034](../adr/ADR-034-one-shot-production-authorization.md)
  - `limits.ts` — Level-1 hard limits + ambiguous-daily-stop + lockdown triggers. [96](../96-production-pilot-limits.md), [ADR-035](../adr/ADR-035-production-pilot-limits.md)
  - `observability.ts` — safe aggregated dashboard read model. [97](../97-production-pilot-observability.md)
- **Env** (safe defaults, no write enablement): `PILOT_DRAFT_MODE`, `PILOT_MAX_GROUPS`, `PILOT_MAX_COMMENTS_PER_DAY`, `PILOT_MAX_COMMENTS_PER_GROUP_PER_DAY`, `PILOT_MAX_COMMENTS_PER_BUSINESS_PER_DAY`, `PILOT_MAX_AMBIGUOUS_PER_DAY`, `PILOT_WRITE_WINDOW_MAX_SECONDS`, `PILOT_AUTHORIZATION_TTL_SECONDS`.
- **Operator runbook** (16 procedures, default-safe) — [98](../98-production-pilot-runbook.md).
- **Rollout levels + Level-1 exit criteria** — [99](../99-production-rollout-levels.md).
- **Operations UI** — read-only Production Pilot section (no Execute-Now, no secrets).
- **Tests** — 44 new cases across the five primitives (readiness, group limit, daily/group/business limits, ambiguous stop, lockdown, window default/expiry/checklist, authorization binding/one-use/expiry/mismatches, NOT_READY for test-only businesses).

## Not done (by design)

No production writes; no Facebook write flags enabled; no automatic Action execution; no external AI provider connected; no Execute-Now API/UI. Live observability query wiring and DB persistence for windows/authorizations are follow-ups; the pure logic + shapes are defined and tested.

## Acceptance

- [x] Pilot 0 closed; Level 1 defined (3 areas, ≤3 groups, ≤3 comments/day).
- [x] Production Business readiness gate; test Businesses never substituted.
- [x] Write Window (default CLOSED, bounded, no auto-retry) + one-shot authorization primitives, tested.
- [x] Hard limits + ambiguous/lockdown policy, tested.
- [x] Observability read model + Operations UI section.
- [x] 16 operator runbooks; rollout levels + exit criteria.
- [x] Quality gates green; no production Facebook write; safe flags unchanged. **No commit/push** (operator-controlled).
