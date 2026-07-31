# Current Sprint

## Current Sprint

**SPRINT 007 — Opportunity Classification Engine**

## Objectives

**Opportunity Classifier (deterministic, no AI).**

Read existing **Signals** and decide, per Signal, **"should this become an Opportunity?"** using pure deterministic rules. The Classifier produces a binary Decision (`ACCEPT` / `REJECT`) with explicit Reasons — **no score, no confidence**. It knows nothing about Businesses, AI, Telegram, comments, notifications, approval, or Facebook writes. The concept **Detector → Classifier** is renamed. Concretely:

- Database: `opportunities` (UNIQUE `signal_id`) and `opportunity_events` (migration `0005`).
- Three modules: Classifier (pure `classifySignal`), Repository (only DB boundary, via the Store), Coordinator (classify-all pass + state machine + ownership).
- Rules `rules-v1`: HAS_TEXT, TEXT_MIN_LENGTH (configurable), HAS_AUTHOR, HAS_URL, NOT_DELETED, SUPPORTED_LANGUAGE, NOT_DUPLICATE. ACCEPT only if every rule passes.
- API, Opportunity Dashboard + Detail; audit events (`OpportunityCreated`/`OpportunityRejected`/`OpportunityArchived`).
- Documentation ([40](40-opportunity-classifier.md)–[43](43-classification-rules.md)) and [ADR-011](adr/ADR-011-opportunity-classification.md)/[ADR-012](adr/ADR-012-opportunity-domain.md).

## Scope

**In scope**

- Deterministic classification: Signal → rules → Decision (ACCEPT/REJECT) + Reasons.
- Opportunity persistence with UNIQUE `signal_id` (one Signal → max one Opportunity); idempotent classify pass.
- State machine (ACCEPT → READY, REJECT → ARCHIVED; manual → ARCHIVED); append-only event log; statistics.

**Out of scope**

- AI / ML / embeddings / vector search; score / confidence; Business matching.
- Telegram, comment, Facebook write/message, notification, approval, recommendation.
- The Opportunity has no downstream consumer — the pipeline ends at Opportunity.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

The Opportunity Classifier reads Signals and decides `ACCEPT`/`REJECT` with explicit Reasons, as three single-responsibility modules where the Classifier is pure (no DB, no AI), the Repository is the only DB boundary, and the Coordinator runs the state machine and enforces ownership. Accepted Opportunities become `READY` (`OpportunityCreated`), rejected ones `ARCHIVED` (`OpportunityRejected`), and manual archive appends `OpportunityArchived`. The UNIQUE `signal_id` guarantees one Signal → at most one Opportunity and makes the classify pass idempotent. No AI, no score/confidence, no Business matching, no Telegram, no Facebook write. The full quality suite passes (lint, typecheck, test — 173 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL (classify → statistics → list → detail with Reasons/Signal/events → status patch → idempotent re-run → cross-workspace 404). No commit was made this sprint. Detail: [sprints/SPRINT-007-opportunity-classifier.md](sprints/SPRINT-007-opportunity-classifier.md).

## Definition of Done

- [x] Migration `0005` (`opportunities` UNIQUE `signal_id`, `opportunity_events`); no business/AI/telegram/comment/score tables.
- [x] Three modules (Classifier pure, Repository sole DB boundary, Coordinator orchestration).
- [x] Deterministic rules `rules-v1`; Decision + Reasons stored in the creation event.
- [x] State machine + append-only events + statistics; one Signal → max one Opportunity; idempotent.
- [x] API + dashboard + detail; ownership enforced (404 cross-workspace); safe responses.
- [x] Tests (173 passing, 26 new) with in-memory store; no AI, no external calls.
- [x] Full quality suite + `db:status` green; live runtime verified; Collector/Signals unchanged.
- [x] Documentation + ADR-011/012; no AI/Business/Telegram/Comment/Facebook write. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 008 — Business Matching and AI Draft**: match Signals/Opportunities to businesses and generate business-specific drafts, with scores and explanations. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
