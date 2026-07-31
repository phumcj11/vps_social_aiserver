# ADR-022 — Action Execution Disabled by Default

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 011 — Action Queue Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Safe by Default, No Silent Failure, Human Approval Mandatory
- **Relates to:** [ADR-020](ADR-020-action-queue-boundary.md), [ADR-007](ADR-007-operator-assisted-facebook-login-mvp.md), [61-action-policy-guard.md](../61-action-policy-guard.md)

---

## Context

Even with a durable queue and immutable intent, the moment execution is possible there is risk of an unintended Facebook post. We must decide the default execution posture and how it is enforced, so that no configuration mistake or stray call can publish.

Options:
- **A — Execute when a job is queued**, relying on operators to keep it off.
- **B — Execution disabled by default, enforced by an explicit policy guard** that blocks jobs unless multiple independent safety gates are open — and this sprint, execution is not built at all.

---

## Decision

**Execution is disabled by default and enforced by the Policy Guard (Option B). No executor is built this sprint.**

- The **ActionPolicyGuard** blocks a job unless **all** of these gates are open: `ACTION_ENGINE_ENABLED=true`, `FACEBOOK_WRITE_ACTION_ENABLED=true`, and `GLOBAL_KILL_SWITCH=false`. Their safe defaults are `false`, `false`, and `true` respectively, so **every job is created BLOCKED**.
- A blocked job **never executes**. `recheck-policy` re-evaluates the gates; under defaults it stays blocked and records the reasons.
- **No Action Worker runs this sprint** — there is no code that consumes a `queued` job and performs a write. The `processing`/`succeeded`/`failed` transitions exist only for a future executor and are exercised by tests, never at runtime.
- The kill switch is a hard override: while on, no job may leave `blocked` toward execution.

---

## Consequences

**Positive**
- **Multiple independent gates** — a single misconfiguration cannot enable posting; all three must be deliberately changed.
- **Kill switch supremacy** — one flag halts all execution intent.
- **No executor, no risk** — this sprint cannot post because the executor does not exist.
- **Explainable** — the guard's reasons show exactly why a job is blocked.

**Negative / trade-offs**
- Operators cannot test real execution yet. Intended — execution is a later sprint with its own verification, evidence, and idempotency.

**Explicitly out of scope:** building the executor, enabling any write flag, and any Facebook/Playwright/Telegram execution.
