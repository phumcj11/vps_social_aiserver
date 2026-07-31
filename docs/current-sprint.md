# Current Sprint

## Current Sprint

**SPRINT 006 — Collector Engine (read-only)**

## Objectives

**Collector Engine.**

Implement the first production data pipeline: open a Facebook Group, navigate, read posts, normalize, and store them as **Signals** — nothing more. The Collector knows nothing about Business, AI, Telegram, comments, approval, matching, or opportunities, and it never writes to Facebook. Concretely:

- Database: `facebook_raw_signals`, `facebook_signals`, `collector_checkpoints`, `collector_runs` (migration `0004`).
- Five modules: Navigation (read-only), Extractor (pure), Normalizer (pure), Repository (only DB boundary), Coordinator (pipeline + state machine + runs).
- Duplicate detection (URL → facebook_post_id → hash) and per-group checkpoints for resume.
- API, Collector Dashboard, Collector Worker, and `collector:run` CLI; audit events.
- Documentation ([34](34-collector-engine.md)–[39](39-checkpoint-design.md)) and [ADR-009](adr/ADR-009-collector-engine.md)/[ADR-010](adr/ADR-010-signal-model.md).

## Scope

**In scope**

- Read-only collection pipeline: Facebook → Navigation → Extraction → Normalization → Persistence.
- Raw + normalized (platform-neutral) Signal storage; duplicate detection; checkpoints; run history.
- Reader-gated, connected-session-guarded, concurrency-one, audited.

**Out of scope**

- Business matching, opportunity engine, AI, Telegram, comment, Facebook write/message, notification, approval, auto-comment.
- Public browser viewer, n8n, billing, subscription, teams.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete.**

The Collector Engine opens groups, reads posts, normalizes, and stores platform-neutral Signals — as a modular pipeline where the Collector talks only to the Repository and the Repository talks to the database. It is **read-only** (no click/like/share/comment/message/join/write), gated by `FACEBOOK_READER_ENABLED` (default off → no browser), and requires a connected Facebook session. Duplicate detection and per-group checkpoints support idempotent resume. The state machine (idle/running/paused/completed/failed) and all errors are audited. Facebook writes remain disabled and the global kill switch stays on. The full quality suite passes (lint, typecheck, test — 147 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL with the reader disabled (no browser, no Facebook contact, no Signals stored). Detail and review status: [sprints/SPRINT-006-collector.md](sprints/SPRINT-006-collector.md).

## Definition of Done

- [x] Migration `0004` (4 collector tables); no opportunity/matching/comment tables.
- [x] Five collector modules with the strict persistence boundary.
- [x] Duplicate detection + checkpoints + run history.
- [x] API + dashboard + worker + CLI; ownership enforced; safe responses.
- [x] Reader gate + connected-session guard + concurrency one + bounded/no-retry.
- [x] Audit events (6 collector events) with sanitised payloads.
- [x] Tests (147 passing) with fakes; no real Facebook access.
- [x] Full quality suite + `db:status` green; live runtime verified.
- [x] Documentation + ADR-009/010; write flag false; kill switch on; secrets absent from Git.

## Next

On sign-off, the project proceeds to **SPRINT 007 — Business Matching and AI Draft**: match Signals to businesses and generate business-specific drafts, with scores and explanations. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
