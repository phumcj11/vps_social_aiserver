# ADR-030 — Controlled Write Test as a Manual, Reversible Procedure

- **Status:** Accepted
- **Date:** 2026-08-03
- **Sprint:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation
- **Deciders:** Principal Architect / DevOps / SRE / Security
- **Related principles:** Human Approval Mandatory, Safe by Default, No Silent Failure
- **Relates to:** [81-controlled-facebook-write-test.md](../81-controlled-facebook-write-test.md), [ADR-026](ADR-026-playwright-adapter-disabled-boundary.md), [ADR-022](ADR-022-action-execution-disabled-by-default.md)

---

## Context

At some point a real Facebook comment must be posted to prove the executor end-to-end. This is the highest-risk action in the system. We must decide how it is enabled and controlled. A tempting shortcut is a feature flag or an "Execute Now" button that an operator flips. That normalizes a dangerous capability and invites accidents.

## Decision

The first real write is a **manual, operator-supervised, single-shot, fully reversible procedure** — a runbook ([81](../81-controlled-facebook-write-test.md)), not a product feature. It requires a disposable account and post, a fresh verified backup, green health and monitoring, a clear idempotency reservation, and exactly one of each pipeline artifact. Write enablement is **temporary and explicit** (five flags flipped by hand, recorded with operator/reason/time) and **restored immediately** after the single test. Success is verified-only; any abort condition (CAPTCHA, checkpoint, restriction, mismatch, crash, resource warning, unexpected second browser) stops the test and restores flags. No CAPTCHA or checkpoint is ever bypassed.

There is deliberately **no "Execute Now" endpoint** and **no persistent write-enable UI toggle**.

## Consequences

**Positive** — the dangerous capability stays out of the product surface; every real write is deliberate, supervised, backed up, and reversible; the blast radius is a disposable account.

**Negative / trade-offs** — the first write cannot be automated or self-served. Intended: automation of real writes is a later, separately-reviewed decision, not a byproduct of this sprint.

**Out of scope:** enabling real execution in this sprint, an Execute-Now control, and any auto-comment.
