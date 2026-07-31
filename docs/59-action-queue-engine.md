# 59 — Action Queue Engine

**Document status:** SPRINT 011 — Action Queue Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Action Queue Engine is a **SAFE BOUNDARY** between an approved Human Review decision and future platform execution. It turns an **APPROVED Review Task** into an **Action Job** that captures the approved content and target immutably.

> **This sprint does NOT execute Facebook actions.** There is NO Action Worker, NO Playwright write, NO Facebook write, and NO Telegram send. Execution is disabled by default; combined with Facebook writes off and the global kill switch on, **every Action Job is created BLOCKED** and never executes.

---

## Pipeline position

```
AI Draft → Human Review → Approved Review → [ Action Queue → Action Job ] → END
```

The engine consumes an **APPROVED** Review Task (Sprint 010) and produces an Action Job with an append-only event history. The pipeline ends here this sprint — a later sprint may add an execution adapter behind this boundary.

---

## Scope

**In:** approved review → build immutable intent → policy guard → create Action Job (queued or **blocked**) → append events → safe result; cancel / retry (guarded) / recheck-policy; workspace-isolated, auditable.
**Out:** Facebook comment/message execution, Playwright write, Facebook write, an Action Adapter/Worker, Telegram sending, auto-approval, auto-comment, unbounded retries, billing, subscription, teams.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **ActionIntentBuilder** | Pure. Build an IMMUTABLE intent from an APPROVED review (edited content preferred, else draft), with a safe target URL ([60](60-action-job-lifecycle.md)). |
| **ActionPolicyGuard** | Pure. Decide ALLOW / BLOCK / REJECT from safety flags and content/target checks ([61](61-action-policy-guard.md)). |
| **ActionQueue** | The state machine: enqueue, block, cancel, mark processing/succeeded/failed, schedule, retry. **No worker executes.** |
| **ActionRepository** | The ONLY DB boundary: persistence, event history, idempotency, workspace isolation, status transitions. |
| **ActionCoordinator** | Orchestrates: Approved Review → Intent → Policy Guard → Create Job → Events → safe result. |

> **Boundary rule:** the Intent Builder and Policy Guard are pure (no DB, no network). Only the Repository touches the Store. Nothing here makes a Facebook, Playwright, Telegram, or AI call.

---

## Core rules

- **Only APPROVED reviews** create Action Jobs; PENDING / REJECTED / EXPIRED never do.
- **At most one ACTIVE job** per (review task, action type) — active = `queued | blocked | processing` (enforced by the repository).
- **Intent is immutable after creation** — the approved content and target are never silently altered; only execution status and timestamps change.
- **Execution is disabled by default**; Facebook writes stay off and the kill switch stays on, so jobs are created **BLOCKED**.
- **No silent failures, no infinite retries** — every outcome is an event; retries are capped by `max_attempts`.
- **The queue works without Facebook or Telegram.**

See [ADR-020](adr/ADR-020-action-queue-boundary.md), [ADR-021](adr/ADR-021-approved-review-to-action-job.md), [ADR-022](adr/ADR-022-action-execution-disabled-by-default.md), and the runbook [63](63-action-queue-runbook.md).
