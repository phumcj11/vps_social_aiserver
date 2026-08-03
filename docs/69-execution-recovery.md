# 69 — Execution Recovery

The **ExecutionRecoveryPolicy** (`apps/api/src/execution/recovery.ts`) is pure and deterministic. It **classifies** a non-successful terminal session into a disposition; it never executes a retry itself, and auto-retry stays disabled by configuration (`ACTION_AMBIGUOUS_AUTO_RETRY=false`).

## Dispositions

- **SAFE_RETRY** — reserved for deterministic failures that provably occurred **before any submit** (target/typed-content mismatch, preflight failure, a submit the adapter is certain did not go through). No write could have happened, so a deliberate retry is safe. Releases the idempotency reservation.
- **MANUAL_INVESTIGATION** — requires a human. Applies to every **ambiguous** outcome and every platform **interrupt** (checkpoint, expired session, account restriction, captcha), plus any failure we cannot prove was pre-submit.
- **NO_RETRY** — nothing to recover (already `verified`, `cancelled`, or a still-live session).

## The cardinal rule

An **ambiguous** outcome is **never** a safe retry. We cannot prove a comment was not already posted, so retrying risks a duplicate. The ambiguous reservation is kept **live** (never released) until a human confirms on Facebook whether the comment exists.

Platform interrupts are **never bypassed** — CAPTCHA is treated as a checkpoint we do not solve, and an expired session or restricted account always pauses for manual resolution.

## Recovery endpoint

`POST /action-executions/:sessionId/recover` returns the classification (`disposition`, `reasonCode`, `reasonDetail`, `requiresHuman`) and records an `execution.recovery` audit event on the job. It performs **no** Facebook action and starts **no** new attempt automatically.
