# 60 — Action Job Lifecycle

**Document status:** SPRINT 011 — Action Queue Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

An **Action Job** is the immutable record of intent to perform an approved action on a platform, plus a mutable execution status. This document describes its storage, state machine, and invariants.

---

## Storage

Table `action_jobs`:

| Column | Notes |
| ------ | ----- |
| `id` | UUID PK |
| `workspace_id` | FK → workspaces; every query is workspace-scoped |
| `review_task_id` | FK → review_tasks — the APPROVED review this comes from |
| `ai_draft_id`, `business_match_id` | denormalised source references |
| `action_type` | `facebook_comment` \| `facebook_message` (only `facebook_comment` selectable in the MVP UI) |
| `status` | `queued` \| `blocked` \| `processing` \| `succeeded` \| `failed` \| `cancelled` (default `blocked`) |
| `target_platform` | fixed to `facebook` for the MVP |
| `target_url` | the Facebook post URL (validated) |
| `approved_content` | **immutable** — the approved (or edited) review content |
| `attempt_count`, `max_attempts` | retry accounting (no infinite retries) |
| `scheduled_at`, `started_at`, `completed_at`, `cancelled_at`, `blocked_at` | lifecycle timestamps |
| `last_error_code`, `last_error_message` | safe error classification |
| `created_at`, `updated_at` | timestamps |

The row holds **NO credentials, NO browser profile path, NO cookies**. There is no screenshot table and no Facebook comment-result table this sprint. `action_events` records the append-only history.

---

## Immutability of intent

`approved_content`, `target_url`, `action_type`, and the source references are **never updated** after creation (rule 4–5). Execution status, attempt count, timestamps, and error fields may change; the approved content and target must not be silently altered.

---

## State machine

```
                 ┌── cancelled  (terminal)
                 │
queued ──────────┼── processing ──┬── succeeded (terminal)
   ▲   ▲         │                └── failed ──┬── queued (retry, attempt < max)
   │   │         └── blocked                   └── cancelled (terminal)
   │   └── (recheck) ── blocked → queued
   └── (retry) ── failed → queued
```

**Allowed transitions**

| From | To |
| ---- | -- |
| `queued` | `processing`, `cancelled`, `blocked` |
| `blocked` | `queued` (only after an explicit passing safety re-evaluation), `cancelled` |
| `processing` | `succeeded`, `failed` |
| `failed` | `queued` (only when `attempt_count < max_attempts`), `cancelled` |

Terminal states: `succeeded`, `cancelled`. Any other transition is rejected (`INVALID_TRANSITION`). **`processing` is never entered through runtime execution this sprint** — no Action Worker runs; those transitions exist for a future executor and are exercised only by unit tests.

---

## Invariants

- Created only from an **APPROVED** review; at most one **active** job per (review, action type).
- **Blocked or cancelled jobs never execute.** Under current defaults every job is created `blocked`.
- Retries are bounded by `max_attempts` — no infinite retries.
- Workspace-isolated; cross-workspace access returns **404**.

See [59-action-queue-engine.md](59-action-queue-engine.md), [61-action-policy-guard.md](61-action-policy-guard.md), [62-action-events.md](62-action-events.md).
