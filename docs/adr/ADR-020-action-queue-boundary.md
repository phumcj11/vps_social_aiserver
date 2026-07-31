# ADR-020 — Action Queue as a Safe Boundary

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 011 — Action Queue Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Backend is the Source of Truth, No Silent Failure, Keep MVP Small, Human Approval Mandatory
- **Relates to:** [ADR-018](ADR-018-review-engine.md), [ADR-021](ADR-021-approved-review-to-action-job.md), [ADR-022](ADR-022-action-execution-disabled-by-default.md), [59-action-queue-engine.md](../59-action-queue-engine.md)

---

## Context

Sprint 010 produces approved Human Review decisions. Publishing an approved comment to Facebook is a **write** — the riskiest step in the product. We need to move toward execution without building the executor yet, and without any chance of an accidental post. We must decide what sits between an approved review and a future Playwright/Facebook write.

Options:
- **A — Execute on approval** (or build the executor now).
- **B — Insert a durable, auditable Action Queue as a safe boundary** — approval creates an Action Job that captures intent immutably but never executes this sprint.

---

## Decision

**Insert an Action Queue as a safe boundary (Option B). No execution this sprint.**

- An **APPROVED** Review Task creates an **Action Job** that captures the approved content and target **immutably** (rules 4–5).
- The engine has pure modules (**ActionIntentBuilder**, **ActionPolicyGuard**), an **ActionQueue** state machine, an **ActionRepository** (the only DB boundary), and an **ActionCoordinator**. Nothing makes a Facebook, Playwright, Telegram, or AI call.
- **No Action Worker runs.** `processing`/`succeeded`/`failed` transitions exist for a future executor and are exercised only by tests; runtime never enters `processing`.
- Jobs are **workspace-isolated** and **auditable** (append-only `action_events`, safe payloads). No silent failures; retries are bounded (no infinite retries).
- At most **one active job** per (review, action type). The queue **works without Facebook or Telegram**.

---

## Consequences

**Positive**
- **Zero execution risk** — there is no code path from an Action Job to a Facebook write this sprint.
- **Clean seam** — a future execution adapter attaches behind this boundary without changing the review flow or the job model.
- **Auditable and durable** — every job and transition is recorded; the queue survives restarts and works offline.
- **Reversible** — the boundary can gate, throttle, and kill-switch execution when it is finally built.

**Negative / trade-offs**
- An extra stage before any real posting. Intended — it is the safety mechanism, not overhead.

**Explicitly out of scope:** Facebook comment/message execution, Playwright write, Facebook write, an Action Adapter/Worker, Telegram sending, auto-approval, billing, subscription, teams.
