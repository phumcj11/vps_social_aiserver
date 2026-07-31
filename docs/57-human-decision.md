# 57 — Human Decision

**Document status:** SPRINT 010 — Human Review Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A human resolves a Review Task with one of three decisions — **APPROVE**, **REJECT**, or **EDIT**. This document describes each, the guarantees around them, and the events they record.

> A decision records the human's choice **only**. There is **NO Facebook comment/message/write, NO Action Engine, and NO auto-approval** in this sprint. Approving does not post anything.

---

## Decisions

### APPROVE

- Sets the task to **APPROVED** and records `decided_by`, `decided_at`, and an optional reason.
- If the task was edited, the **edited content** is the approved text (BR-28); otherwise the draft content.
- Emits `review_approved`. **Posts nothing** — a later sprint may execute an approved comment.

### REJECT

- Sets the task to **REJECTED** with an optional reason. Emits `review_rejected`. No comment is ever posted.

### EDIT

- Stores `edited_content`, `editor`, and `edited_at`. The task **stays PENDING** — an edit is a revision, not an approval; the human must still approve (BR-28).
- Emits `review_edited`. Both the original draft and the edited text are retained (BR-27).

---

## Guarantees

- **Approval is explicit.** Editing never implies approval; only APPROVE finalises.
- **First valid decision wins (duplicate protection).** Once a task is APPROVED/REJECTED/EXPIRED, further approve/reject/edit calls are rejected (`409`). This mirrors the Telegram duplicate-callback rule (BR-31) but is enforced by the Backend for **every** channel, not just Telegram.
- **Ownership.** Only the owning workspace can view or decide a review; cross-workspace access returns `404`.
- **Auditable.** Every creation, assignment, edit, decision, expiry, and adapter delivery is an append-only `review_events` row with a safe payload (decision, editor, reason, adapter ref) — no secrets, no chain-of-thought.

---

## Events

`review_created`, `review_assigned`, `review_sent`, `review_approved`, `review_rejected`, `review_edited`, `review_expired`.

A typical edited-then-approved trail:

```
review_created → review_edited → review_approved
```

See [54-review-engine.md](54-review-engine.md), [55-review-queue.md](55-review-queue.md).
