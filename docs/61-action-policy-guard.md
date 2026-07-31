# 61 — Action Policy Guard

**Document status:** SPRINT 011 — Action Queue Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **ActionPolicyGuard** decides whether an Action intent may become a job, and in which safe state. It is **pure and deterministic** — no I/O, no execution — and reads its safety inputs only from server configuration (never from a request).

---

## Verdict

| Outcome | Meaning | Result |
| ------- | ------- | ------ |
| **REJECT** | A hard failure — **no job may be created** | error returned; no job |
| **BLOCK** | A safety gate is closed — the job is created `blocked` and **never executes** | job created `blocked` |
| **ALLOW** | All clear | job created `queued` |

`REJECT` takes priority over `BLOCK` (hard failures are evaluated first). Because execution is disabled by default (engine off, Facebook writes off, kill switch on), the guard returns **BLOCK** under current defaults — a job is never queued for execution this sprint.

---

## Checks

**REJECT-level (no job created):**

| Code | Fires when |
| ---- | ---------- |
| `UNSUPPORTED_TYPE` | The action type is not in `ACTION_ALLOWED_TYPES` |
| `MISSING_CONTENT` | The approved content is empty |
| `CONTENT_TOO_LONG` | The approved content exceeds the max length |
| `UNSAFE_TARGET_URL` | The target is not a supported Facebook post URL |
| `DUPLICATE_ACTIVE_JOB` | An active job already exists for this (review, type) |

**BLOCK-level (job created, blocked, never executed):**

| Code | Fires when |
| ---- | ---------- |
| `ENGINE_DISABLED` | `ACTION_ENGINE_ENABLED=false` |
| `WRITE_DISABLED` | `FACEBOOK_WRITE_ACTION_ENABLED=false` |
| `KILL_SWITCH_ON` | `GLOBAL_KILL_SWITCH=true` |

The Review-is-APPROVED and same-workspace checks are enforced earlier, by the Intent Builder ([60](60-action-job-lifecycle.md)); the guard additionally re-validates content, length, type, target URL, and duplication.

---

## Recheck

`POST /actions/:id/recheck-policy` re-runs the guard against the current configuration for a **blocked** job. If it now returns **ALLOW**, the job transitions `blocked → queued`; otherwise it **stays blocked** and records an `action_job_policy_rejected` event. Under current defaults it always stays blocked.

## Determinism

Given the same intent and safety state, the guard returns the same verdict and reasons. It performs no I/O and executes nothing — the reasons fully explain why a job is `blocked` (or rejected).

See [59-action-queue-engine.md](59-action-queue-engine.md), [ADR-022](adr/ADR-022-action-execution-disabled-by-default.md).
