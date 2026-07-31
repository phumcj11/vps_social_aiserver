# 55 — Review Queue

**Document status:** SPRINT 010 — Human Review Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **ReviewQueue** owns the mechanics of the review queue: **create** a Review Task for a Draft, **assign** it to a reviewer, and **expire** a stale pending task. It talks only to the **ReviewRepository** and contains no channel/adapter logic.

---

## Storage

Table `review_tasks`:

| Column | Notes |
| ------ | ----- |
| `id` | UUID PK |
| `workspace_id` | FK → workspaces; every query is workspace-scoped |
| `business_match_id` | FK → business_matches |
| `draft_id` | FK → ai_drafts, **UNIQUE** — one Review Task per Draft |
| `status` | `PENDING` \| `APPROVED` \| `REJECTED` \| `EXPIRED` |
| `assigned_to` | reviewer (optional) |
| `edited_content`, `editor`, `edited_at` | set by an EDIT decision |
| `decided_by`, `decided_at`, `decision_reason` | set by an APPROVE/REJECT decision |
| `created_at`, `updated_at` | timestamps |

Table `review_events` — append-only lifecycle events with safe payloads.

---

## Statuses

```
                 ┌──────── APPROVE ───────► APPROVED
                 │
PENDING ─────────┼──────── REJECT ────────► REJECTED
   ▲             │
   │ EDIT        └──────── expire ────────► EXPIRED
   └─ (stays PENDING; revised text stored)
```

- **PENDING** — awaiting a human decision. An **EDIT** keeps the task PENDING (approval still required).
- **APPROVED / REJECTED** — terminal human decisions (the first valid decision wins; duplicates are rejected).
- **EXPIRED** — a pending task passed its validity window (a scheduled sweep calls `expire`); terminal.

Only a **PENDING** task can be approved, rejected, edited, or expired.

---

## Operations

- **create** `{ workspaceId, businessMatchId, draftId, assignedTo }` → creates a PENDING task and a `review_created` event. **Idempotent**: if a task already exists for the draft, it is returned unchanged (no duplicate).
- **assign** `(taskId, assignee)` → sets `assigned_to`, records `review_assigned`.
- **expire** `(taskId)` → PENDING → EXPIRED, records `review_expired`. Refuses to expire a non-pending task.

---

## Ownership

Every Review Task belongs to a workspace; cross-workspace access returns **404**, consistent with [21-session-security.md](21-session-security.md).

See [54-review-engine.md](54-review-engine.md), [57-human-decision.md](57-human-decision.md).
