# Current Sprint

## Current Sprint

**SPRINT 011 — Action Queue Engine**

## Objectives

**Action Queue Engine (safe boundary; NO execution).**

Turn an **APPROVED Review Task** into an **Action Job** that captures the approved content and target immutably — a **safe boundary** between an approved decision and future platform execution. **This sprint does NOT execute Facebook actions** and runs **NO Action Worker**; every job is created **BLOCKED** under current safety defaults. Concretely:

- Database: `action_jobs` + `action_events` (migration `0009`).
- Five modules: ActionIntentBuilder (pure), ActionPolicyGuard (pure; ALLOW/BLOCK/REJECT), ActionQueue (state machine), ActionRepository (only DB boundary), ActionCoordinator.
- Only APPROVED reviews create jobs; one active job per (review, action type); intent immutable; execution disabled by default.
- API, Action Queue + Action Detail web pages, "Create Action Job" on approved Review Detail, `action:*` CLI; 9 audit event types.
- Documentation ([59](59-action-queue-engine.md)–[63](63-action-queue-runbook.md)) and [ADR-020](adr/ADR-020-action-queue-boundary.md)/[ADR-021](adr/ADR-021-approved-review-to-action-job.md)/[ADR-022](adr/ADR-022-action-execution-disabled-by-default.md).

## Scope

**In scope**

- Approved Review → immutable Intent → Policy Guard → Action Job (queued or **blocked**) → events.
- State machine (queued/blocked/processing/succeeded/failed/cancelled) with enforced transitions; cancel / retry (bounded) / recheck-policy.
- Workspace isolation, idempotency (one active job per review+type), full auditability. No silent failures, no infinite retries.

**Out of scope**

- Facebook comment/message execution, Playwright write, Facebook write, an Action Adapter/Worker.
- Telegram sending, auto-approval, auto-comment, billing, subscription, teams.
- The Action Job has no executor — the pipeline ends at the job.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

An APPROVED review creates an Action Job that captures the approved (or edited) content and the Facebook post target immutably — as pure Intent/Policy modules, an ActionQueue state machine, an ActionRepository (the only DB boundary), and an ActionCoordinator. Only APPROVED reviews create jobs; PENDING/REJECTED/EXPIRED never do. At most one active job exists per (review, action type). The Policy Guard blocks a job unless the engine is enabled, Facebook writes are enabled, and the kill switch is off — so under current defaults every job is created **BLOCKED** and `recheck-policy` keeps it blocked. There is **no Action Worker** and **no Facebook/Playwright/Telegram/AI call** anywhere; `processing` is never entered at runtime. Cancel, bounded retry, and recheck are supported; every transition is an auditable event with safe payloads. The full quality suite passes (lint, typecheck, test — 319 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL (create → blocked → duplicate 409 → recheck stays blocked → PENDING/REJECTED 409 → cancel → cross-workspace 404). No commit was made this sprint. Detail: [sprints/SPRINT-011-action-queue.md](sprints/SPRINT-011-action-queue.md).

## Definition of Done

- [x] Migration `0009` (`action_jobs`, `action_events`); no credential/profile/cookie columns; no screenshot/comment-result table.
- [x] Five modules (Intent/Policy pure; Queue state machine; Repository sole DB boundary; Coordinator).
- [x] Only APPROVED reviews create jobs; one active job per (review, type); intent immutable.
- [x] Execution disabled by default → jobs BLOCKED; recheck stays blocked; state machine enforced; retries bounded.
- [x] 9 events with safe payloads; API + UI + CLI; ownership enforced (404); no secrets in responses.
- [x] No Action Worker; no Facebook/Playwright/Telegram/AI call; no `processing` at runtime.
- [x] Tests (319 passing, 41 new) with mocks; full quality suite + `db:status` green; live runtime verified.
- [x] Documentation + ADR-020/021/022. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 012 — Action Execution (Playwright Comment)**: build the executor behind this boundary — publish approved comments to Facebook, verified and evidenced, at concurrency one, gated by the kill switch and idempotency. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
