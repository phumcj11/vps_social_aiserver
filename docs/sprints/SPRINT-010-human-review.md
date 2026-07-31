# SPRINT 010 — Human Review Engine

- **Stage:** SPRINT 010 — Human Review Engine
- **Type:** Feature implementation (channel-agnostic review core; Telegram is the first adapter)
- **Date:** 2026-07-31
- **Owner:** Principal Product Architect / Senior Full Stack Engineer

---

## Goal

Implement the **Human Review Engine** — the CORE human-in-the-loop step. An **AI Draft** becomes a **Review Task** a human **approves**, **rejects**, or **edits**. **Telegram is only the first Review Adapter; the engine works without it.** This sprint records human decisions **only**: NO Facebook comment/message/write, NO Action Engine, NO auto-approval.

```
Collector → Signals → Opportunity → Business Matching → AI Draft → Review Queue → Human Decision → END
```

---

## Deliverables

- **Database:** Drizzle migration `0008` — `review_tasks` (**UNIQUE `draft_id`** — one Draft → one Review Task; status PENDING/APPROVED/REJECTED/EXPIRED; assigned_to; edited_content/editor/edited_at; decided_by/decided_at/decision_reason) and `review_events` (append-only, safe payloads). No Facebook/comment-job/action/telegram-destination columns.
- **Review Engine** (`apps/api/src/review/*`): **ReviewQueue** (create/assign/expire), **ReviewRepository** (only DB boundary), **ReviewCoordinator** (AI Draft → Review Task; approve/reject/edit; ownership; best-effort adapter). Plus `types.ts`/`errors.ts`. Store methods added to `InMemoryStore` and `DrizzleStore`.
- **Review Adapter** (`adapter.ts`): `ReviewAdapter` interface (`sendReview`/`updateReview`/`closeReview`) + `NoopReviewAdapter`. **TelegramReviewAdapter** (`telegram-adapter.ts`): pure `renderMessage` (business/opportunity/draft + Approve/Reject/Edit/Open-Post/Open-Business buttons) over a `TelegramTransport` — `DisabledTelegramTransport` (refuses while `TELEGRAM_ENABLED=false`; no bot connected) + `FakeTelegramTransport` (tests). Telegram never touches the DB.
- **Decisions:** APPROVE (records decision only; posts nothing), REJECT (optional reason), EDIT (stores edited_content/editor/edited_at, stays PENDING — approval still required, BR-28). First valid decision wins (duplicate protection, BR-31).
- **API:** `POST /reviews`, `GET /reviews`, `GET /reviews/:id`, `POST /reviews/:id/approve|reject|edit` — authenticated, workspace-scoped, CSRF-guarded, safe responses.
- **Web:** Review Queue (`/settings/reviews`) with status filters; Review Detail (`/settings/reviews/[id]`) — Business, Opportunity, Draft, Edited Draft, Decision, Decision History; "Send to Review" on the AI Draft detail; nav link. No Approve-and-Send/Comment/Message/Auto.
- **Tests:** 278 passing (33 new: queue, repository, coordinator, review adapter, ownership, API). Adapter tested with a fake transport; no network.
- **Documentation:** [54](../54-review-engine.md)–[58](../58-telegram-review-adapter.md); [ADR-018](../adr/ADR-018-review-engine.md), [ADR-019](../adr/ADR-019-telegram-adapter.md); updates to system-overview, roadmap, domain-model, product-memory, telegram-design, environment-configuration, current-sprint.

---

## Non-Goals (not implemented)

Facebook comment/message/write, Action Engine, auto approval, auto comment, billing, subscription, teams, a live Telegram bot / pairing / webhook. The Review Task has **no downstream executor** — the pipeline ends at the human decision.

---

## Acceptance Criteria

- [x] The Review Engine is channel-agnostic and works with NO adapter (web UI + API is a complete review surface).
- [x] Telegram is only an adapter: it renders + relays, holds no business logic, and NEVER writes to the DB (Telegram → Review API → Coordinator → Repository).
- [x] One Draft → one Review Task (`UNIQUE draft_id`); enqueue idempotent.
- [x] APPROVE / REJECT / EDIT; EDIT stays PENDING; first valid decision wins; every step audited.
- [x] API + UI; ownership enforced (404 cross-workspace); no secrets in responses.
- [x] Telegram disabled by default; adapter delivery best-effort (never blocks a review).
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.
- [x] No Facebook comment/message/write; no Action Engine; no auto-approval.

---

## Runtime verification

MySQL + API started with `TELEGRAM_ENABLED=false` (migration `0008`, 22 tables incl. `review_tasks`, `review_events`). Full pipeline: seeded business/rule/group/assignment + Thai Signal → classify (ACCEPT) → match (MATCH) → AI draft (mock). Live flow: `POST /reviews` → PENDING Review Task (created); detail returned Business, Draft, presentation, Facebook post URL, events; duplicate enqueue → `created:false` (200); `edit` → stays PENDING with edited content; `approve` → APPROVED with reason; duplicate decision (approve/reject after approve) → `409`; regenerated draft → new review → `reject` → REJECTED; status filters (PENDING/APPROVED/REJECTED) correct; cross-workspace GET/approve → `404`, list empty. The disabled Telegram adapter logged `review.adapter_skipped` (best-effort) and never blocked a review; no Telegram/Facebook network attempt in the API log; no comment/action/telegram-destination tables; `review_tasks` has no Facebook/comment columns. Services stopped.

---

## Risks & Mitigations

- **Telegram becoming the source of truth / writing state.** Prevented by construction — the adapter only renders/relays; all decisions route Telegram → Review API → Coordinator → Repository ([ADR-019](../adr/ADR-019-telegram-adapter.md)).
- **A decision posting to Facebook.** Impossible — there is no Action Engine and no posting code path; APPROVE records the decision only ([ADR-018](../adr/ADR-018-review-engine.md)).
- **Duplicate/late decisions.** Mitigated by the PENDING-only guard (first valid decision wins, BR-31).
- **Adapter failure blocking reviews.** Mitigated by best-effort delivery — failures are logged and swallowed; the engine works without Telegram.
- **Cross-workspace access.** Mitigated by per-endpoint ownership (404).

---

## Outcome

Human Review Engine implemented end-to-end (engine, adapter interface, Telegram adapter, API, UI, tests, docs) as a channel-agnostic core with Telegram as a disabled-by-default adapter. No commit made this sprint (per instruction). **Ready for Sprint 011.**
