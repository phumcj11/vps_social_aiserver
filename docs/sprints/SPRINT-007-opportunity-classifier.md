# SPRINT 007 — Opportunity Classification Engine

- **Stage:** SPRINT 007 — Opportunity Classification Engine
- **Type:** Feature implementation (deterministic classifier — no AI)
- **Date:** 2026-07-31
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Implement the Opportunity Classifier: read existing **Signals** and decide, per Signal, **"should this become an Opportunity?"** — using pure deterministic rules. It produces a binary Decision (`ACCEPT` / `REJECT`) with explicit Reasons. It knows nothing about Businesses, AI, Telegram, comments, notifications, approval, or Facebook writes, and it produces **no score and no confidence**.

```
Collector → Raw Signals → Signals → [ Opportunity Classifier ] → Opportunity → END
```

The concept **Detector** is renamed **Classifier**.

---

## Deliverables

- **Database:** Drizzle migration `0005` — `opportunities` (id, workspace_id, **signal_id UNIQUE**, decision, status, classifier_version, created_at, updated_at) and `opportunity_events` (id, opportunity_id, event, payload, created_at). No business/AI/telegram/comment/score/confidence tables.
- **Opportunity Engine** (`apps/api/src/opportunity/*`): **Classifier** (pure `classifySignal`, no DB/AI), **Repository** (only DB boundary, via the Store), **Coordinator** (classify-all pass, state machine, ownership). Plus `types.ts` and `errors.ts`. Store methods added to `InMemoryStore` and `DrizzleStore`.
- **Rules (`rules-v1`):** `HAS_TEXT`, `TEXT_MIN_LENGTH` (configurable via `OPPORTUNITY_MIN_TEXT_LENGTH`, default 15), `HAS_AUTHOR`, `HAS_URL`, `NOT_DELETED`, `SUPPORTED_LANGUAGE` (Latin + Thai), `NOT_DUPLICATE`. ACCEPT only if every rule passes.
- **State machine:** ACCEPT → status `READY` + `OpportunityCreated`; REJECT → status `ARCHIVED` + `OpportunityRejected`; manual archive → `OpportunityArchived`. One Signal → at most one Opportunity (UNIQUE `signal_id`); classify pass is idempotent.
- **API:** `POST /opportunities/classify`, `GET /opportunities` (status/decision filters), `GET /opportunities/:id`, `PATCH /opportunities/:id/status`, `GET /opportunities/statistics` — authenticated, workspace-scoped, CSRF-guarded, safe responses.
- **Web:** Opportunity Dashboard (`/settings/opportunities`) — statistics (Accepted, Rejected, Ready, Archived, New, Unclassified), classify button, filterable list; Opportunity Detail (`/settings/opportunities/[id]`) — Decision, Reasons, Signal, Events; nav link. No Business, no AI, no Telegram.
- **Tests:** 173 passing (26 new: classifier, repository, coordinator, duplicate, API, state machine).
- **Documentation:** [40](../40-opportunity-classifier.md), [41](../41-opportunity-lifecycle.md), [42](../42-opportunity-events.md), [43](../43-classification-rules.md); [ADR-011](../adr/ADR-011-opportunity-classification.md), [ADR-012](../adr/ADR-012-opportunity-domain.md); updates to system-overview, roadmap, product-memory, domain-model, current-sprint.

---

## Non-Goals (not implemented)

Business matching, AI / ML / embeddings / vector search, score / confidence, Telegram, comment, Facebook write, Facebook message, notification, approval, recommendation. The Opportunity has **no downstream consumer** — the pipeline ends at Opportunity.

---

## Acceptance Criteria

- [x] Classifier is a pure function: Signal + context → Decision + Reasons. No DB, no AI, no I/O.
- [x] Classifier never executes SQL — only the Repository does; Coordinator orchestrates.
- [x] Decision `ACCEPT`/`REJECT`; Reasons array stored in the creation event.
- [x] ACCEPT → `READY`, REJECT → `ARCHIVED`; events `OpportunityCreated`/`OpportunityRejected`/`OpportunityArchived`.
- [x] One Signal → max one Opportunity (UNIQUE `signal_id`); classify pass idempotent.
- [x] API + dashboard + detail; ownership enforced (404 cross-workspace); safe responses.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.
- [x] No AI; no Business; no Telegram; no Comment; no Facebook write. Collector and Signals unchanged.

---

## Runtime verification

MySQL started (loopback), migration `0005` applied (17 tables incl. `opportunities`, `opportunity_events`). Two Signals seeded (one long → ACCEPT, one "help" → REJECT). Live flow: `POST /classify` → `{ processed: 2, accepted: 1, rejected: 1 }`; statistics `{ total: 2, accepted: 1, rejected: 1, ready: 1, archived: 1, unclassifiedSignals: 0 }`; list + `decision=ACCEPT` filter; detail returned Decision, 7 passing Reasons, Signal, and `OpportunityCreated` event; `PATCH …/status → ARCHIVED` succeeded and appended `OpportunityArchived`; invalid status → `400`; re-classify idempotent → `processed: 0`; other workspace isolated (`404`, empty list). Collector data unchanged (Signals intact). Services stopped. No AI, no Business, no Telegram, no Facebook contact.

---

## Risks & Mitigations

- **Scope creep into AI / Business matching.** Mitigated by the pure-Classifier boundary (no DB, no model) and rules-only Decision; documented explicitly in [ADR-011](../adr/ADR-011-opportunity-classification.md).
- **Duplicate Opportunities for one Signal.** Mitigated by the UNIQUE `signal_id` constraint and the idempotent `listUnclassifiedSignals` classify pass.
- **Leaking one workspace's Opportunities to another.** Mitigated by per-endpoint workspace ownership (404 on cross-workspace).

---

## Outcome

Deterministic Opportunity classification implemented end-to-end (engine, API, dashboard, detail, tests, docs). No commit made this sprint (per verification requirement). **Ready for Sprint 008.**
