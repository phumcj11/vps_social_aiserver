# ADR-024 — Database-Level Idempotency via Nullable-Unique Keys

- **Status:** Accepted
- **Date:** 2026-08-02
- **Sprint:** SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Safe by Default, No Silent Failure, Correctness over Convenience
- **Relates to:** [70-database-idempotency.md](../70-database-idempotency.md), [ADR-025](ADR-025-execution-session-and-verification.md)

---

## Context

"At most one successful comment per (business, post)" must hold even under concurrent attempts, retries, and crashes. Enforcing it only in application code is racy — two requests can both read "no success yet" and both proceed. The Architecture Review flagged this as CRITICAL C1. MySQL 8 has no partial unique index, so we cannot directly say "unique where status = live."

Options:
- **A — Application-level check** (`SELECT` then `INSERT`). Racy.
- **B — Database-level uniqueness** using a nullable key column that is set while a row is live and `NULL` when terminal/released, under a `UNIQUE` index (MySQL treats `NULL`s as distinct).

## Decision

**Option B — the nullable-unique-key pattern**, applied in four places: `action_jobs.active_dedup_key`, `action_jobs.success_idempotency_key`, `action_execution_sessions.active_key`, and `action_idempotency_records.idem_key`. The identity is a deterministic `targetPostKey` (a hash of the canonical post identity, from strict URL parsing), never the raw URL.

A reservation advances `reserved → submitted → verified` (key kept live to permanently block duplicates) or is `released` (key → `NULL`) after a provably pre-submit failure. An **ambiguous** outcome keeps the key live pending human recovery — never released, never retried.

## Consequences

**Positive**
- The guarantee is enforced by the database; two concurrent attempts cannot both succeed — the second reservation hits the unique index.
- Released/terminal rows free the slot, so deliberate retries remain possible.
- Works within MySQL 8 without partial indexes or advisory locks.

**Negative / trade-offs**
- Slightly subtle: reviewers must understand that `NULL` means "not live." Documented in [70](../70-database-idempotency.md) and covered by tests.

**Out of scope:** cross-workspace dedup and any non-comment action identity.
