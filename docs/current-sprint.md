# Current Sprint

## Current Sprint

**SPRINT 010 — Human Review Engine**

## Objectives

**Human Review Engine (channel-agnostic core; Telegram is only the first adapter).**

Turn an **AI Draft** into a **Review Task** a human **approves**, **rejects**, or **edits**. **The Review Engine is the core; Telegram is only a Review Adapter and the engine works without it.** Decisions are recorded **only** — NO Facebook comment/message/write, NO Action Engine, NO auto-approval. Concretely:

- Database: `review_tasks` (UNIQUE `draft_id` — one Draft → one Review Task) + `review_events` (migration `0008`).
- Three engine modules: ReviewQueue (create/assign/expire), ReviewRepository (only DB boundary), ReviewCoordinator (AI Draft → Review Task; approve/reject/edit; ownership; best-effort adapter).
- ReviewAdapter interface (`sendReview`/`updateReview`/`closeReview`) + NoopReviewAdapter; TelegramReviewAdapter (renders + relays via a disabled-by-default transport; never touches the DB).
- API, Review Queue + Review Detail (+ Decision History) web pages, "Send to Review" from AI Drafts.
- Documentation ([54](54-review-engine.md)–[58](58-telegram-review-adapter.md)) and [ADR-018](adr/ADR-018-review-engine.md)/[ADR-019](adr/ADR-019-telegram-adapter.md).

## Scope

**In scope**

- Review Task lifecycle: PENDING → APPROVED / REJECTED / EXPIRED; EDIT stays PENDING (approval still required).
- One Draft → one Review Task (idempotent enqueue); first valid decision wins (duplicate protection); append-only events.
- Channel-agnostic adapter boundary; Telegram adapter renders business/opportunity/draft + Approve/Reject/Edit/Open-Post/Open-Business, disabled by default.

**Out of scope**

- Facebook comment/message/write, Action Engine, auto-approval, auto-comment.
- A live Telegram bot / pairing / webhook; billing; subscription; teams.
- The Review Task has no downstream executor — the pipeline ends at the human decision.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

The engine turns an AI Draft into a Review Task and records the human decision — as a channel-agnostic core where the Queue handles create/assign/expire, the Repository is the only DB boundary, and the Coordinator orchestrates decisions and (best-effort) adapter delivery. One Draft → one Review Task (`UNIQUE draft_id`); enqueue is idempotent. APPROVE/REJECT are terminal (first valid decision wins); EDIT stores revised text and keeps the task PENDING (approval still required). Telegram is only the first Review Adapter: it renders the review and its buttons and relays via a transport that is **disabled by default** (no bot connected) — it never touches the database, and decisions route Telegram → Review API → Coordinator → Repository. The engine works with no adapter at all. No Facebook write, no comment, no Action Engine, no auto-approval. The full quality suite passes (lint, typecheck, test — 278 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL (enqueue → detail → edit → approve → duplicate-decision 409 → reject → filters → cross-workspace 404; the disabled adapter was safely skipped). No commit was made this sprint. Detail: [sprints/SPRINT-010-human-review.md](sprints/SPRINT-010-human-review.md).

## Definition of Done

- [x] Migration `0008` (`review_tasks` UNIQUE `draft_id`, `review_events`); no Facebook/comment-job/action/telegram-destination tables.
- [x] Three engine modules (Queue, Repository sole DB boundary, Coordinator) + ReviewAdapter interface + TelegramReviewAdapter (disabled transport).
- [x] One Draft → one Review Task; idempotent enqueue; APPROVE/REJECT/EDIT; first valid decision wins.
- [x] Telegram never writes the DB (Telegram → Review API → Coordinator → Repository); engine works without Telegram.
- [x] API + Review Queue + Detail + Decision History; ownership enforced (404 cross-workspace).
- [x] Tests (278 passing, 33 new: queue, repository, coordinator, adapter, ownership, API) with a fake transport; no network.
- [x] Full quality suite + `db:status` green; live runtime verified; no Facebook/comment/action/write.
- [x] Documentation + ADR-018/019. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 011 — Playwright Comment Execution**: publish approved comments to Facebook, verified and evidenced — the first Facebook writes, gated by human approval and the kill switch. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
