# 62 — Action Events

**Document status:** SPRINT 011 — Action Queue Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

Every meaningful change to an Action Job appends an immutable row to `action_events`, giving a full, auditable history (rule 9). Events are **append-only**: never updated, never deleted.

---

## Storage

Table `action_events`: `id`, `action_job_id` (FK, indexed), `event`, `payload` (JSON), `created_at`.

---

## Event types

| Event | Emitted when |
| ----- | ------------ |
| `action_job_created` | A job is created for an approved review |
| `action_job_queued` | The job is (or becomes) `queued` (ALLOW, or a passing recheck, or a retry) |
| `action_job_blocked` | The job is created/kept `blocked` by a safety gate |
| `action_job_cancelled` | The job is cancelled |
| `action_job_processing` | A worker begins processing *(never emitted at runtime this sprint)* |
| `action_job_succeeded` | Execution verified *(future)* |
| `action_job_failed` | Execution failed *(future)* |
| `action_job_retry_scheduled` | A failed job is re-queued under the attempt limit |
| `action_job_policy_rejected` | A recheck-policy leaves the job blocked (records the reasons) |

---

## Safe payloads

Payloads carry only safe metadata (status, reason codes, attempt numbers). They **must not** contain:

- cookies
- session tokens
- browser profile paths
- credentials
- raw HTML
- private keys
- AI secrets

A typical blocked-then-rechecked trail:

```
action_job_created → action_job_blocked → action_job_policy_rejected
```

See [59-action-queue-engine.md](59-action-queue-engine.md), [60-action-job-lifecycle.md](60-action-job-lifecycle.md).
