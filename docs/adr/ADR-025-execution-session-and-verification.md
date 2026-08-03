# ADR-025 — Execution Sessions, Verified-Only Success, and Ambiguity

- **Status:** Accepted
- **Date:** 2026-08-02
- **Sprint:** SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** No Silent Failure, Human Approval Mandatory, Correctness over Convenience
- **Relates to:** [65-action-executor.md](../65-action-executor.md), [66-execution-session-lifecycle.md](../66-execution-session-lifecycle.md), [68-execution-verification.md](../68-execution-verification.md), [69-execution-recovery.md](../69-execution-recovery.md)

---

## Context

Executing a browser write against Facebook is inherently uncertain: a submit can succeed, fail, or leave us *unable to tell* (timeout, navigation loss, crash, checkpoint). We must decide what counts as success, how uncertain outcomes are handled, and how every attempt is made auditable — without ever risking a duplicate comment.

## Decision

1. **Explicit Execution Session state machine** (`created → preflight → ready_to_submit → submitting → submitted → verifying → verified`, with `failed`/`cancelled`/`ambiguous`/interrupt off-ramps). Transitions are enforced; each stamps a timestamp; at most one active session per job (DB-enforced).
2. **Verified-only success.** `verified` is the ONLY success and requires an independently observed comment **id** plus **exact** content equality. A screenshot alone is never sufficient — it is corroborating evidence captured after the decision.
3. **Exact-equality pre-submit gate.** The typed content must exactly equal the immutable approved content, and the target identity must match, or the attempt aborts before submit.
4. **Ambiguity is terminal and human-owned.** Any outcome we cannot prove is `ambiguous`: never a success, never an auto-retry. A crash mid-submit becomes `ambiguous`, not a silent retry. Platform interrupts (checkpoint / expired / restricted / captcha) pause for a human and are never bypassed.
5. **Verification is a pure, adapter-independent service**, so the fake and (future) real adapters are judged identically.

## Consequences

**Positive**
- No false-positive successes; no blind retries; no duplicate risk from ambiguity.
- Every attempt is fully auditable via session timestamps + append-only evidence.
- The rules are enforced in one pure module, testable exhaustively with the fake adapter.

**Negative / trade-offs**
- Ambiguous outcomes require human recovery rather than automatic resolution — intentional, and safer than guessing.

**Out of scope:** auto-retry of ambiguous results, CAPTCHA solving, and any real write this sprint.
