# SPRINT 006 — Collector Engine (read-only)

- **Stage:** SPRINT 006 — Collector Engine (read-only)
- **Type:** Feature implementation (first production data pipeline)
- **Date:** 2026-07-31
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Implement the Collector: open a Facebook Group, navigate, read posts, normalize, and store them as **Signals**, then finish. The Collector knows nothing about Business, AI, Telegram, comments, approval, matching, or opportunities, and it **never writes to Facebook**. Read-only, gated, auditable.

---

## Deliverables

- **Database:** Drizzle migration `0004` — `facebook_raw_signals` (immutable), `facebook_signals` (normalized), `collector_checkpoints`, `collector_runs`. No opportunity/matching/comment tables.
- **Collector Engine** (`apps/api/src/collector/*`): Navigation (read-only), Extractor (pure), Normalizer (pure), Repository (only DB boundary), Coordinator (pipeline + state machine + runs). Browser boundary via `CollectorBrowser` (Playwright real / fake in tests); read-only `PageController`.
- **Duplicate detection:** post URL → facebook_post_id → normalized hash. **Checkpoints** per group for resume.
- **Safety:** reader gate `FACEBOOK_READER_ENABLED` (default off → no browser), connected-session guard, concurrency one, bounded scrolls/posts/timeout, no infinite retries; Facebook writes disabled, kill switch on.
- **API:** `POST /collector/start|stop`, `GET /collector/status|runs` — authenticated, workspace-scoped, CSRF-guarded, safe responses (no paths/cookies/raw HTML).
- **Web:** Collector Dashboard (`/settings/collector`) — status, groups, progress, collected, errors, duration, last scan, run history; nav link.
- **Worker/CLI:** Collector Worker (read-only placeholder) + `pnpm collector:run --workspace <uuid>`.
- **Audit:** 6 collector event types with sanitised payloads.
- **Tests:** 147 passing (extractor, normalizer, navigation, repository, coordinator/collector, API).
- **Documentation:** [34](../34-collector-engine.md), [35](../35-collector-pipeline.md), [36](../36-collector-state-machine.md), [37](../37-raw-signal.md), [38](../38-normalized-signal.md), [39](../39-checkpoint-design.md); [ADR-009](../adr/ADR-009-collector-engine.md), [ADR-010](../adr/ADR-010-signal-model.md); updates to product-memory, roadmap, system-overview, domain-model, current-sprint.
- **Terminology rename:** Scanner → Collector, Lead → Opportunity, Post → Signal, Comment Worker → Action Worker (worker identities updated; concepts documented).

---

## Non-Goals (not implemented)

Business matching, opportunity engine, AI, Telegram, comment, Facebook write, Facebook message, notification, approval, auto-comment, public browser viewer, n8n, billing, subscription, teams.

---

## Acceptance Criteria

- [x] Pipeline Navigation → Extraction → Normalization → Persistence, one direction.
- [x] Collector never executes SQL directly — only the Repository does.
- [x] Read-only: no click/like/share/comment/message/join/write (guaranteed by the `PageController`/browser interface).
- [x] Duplicate detection (URL → fb id → hash); checkpoints for resume.
- [x] State machine idle/running/paused/completed/failed; errors classified and audited.
- [x] Reader gate off by default → no browser, run completes with 0 posts; connected session required.
- [x] API + dashboard + worker + CLI; ownership enforced; safe responses.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.
- [x] No Facebook write; no AI; no Telegram; no opportunity; no matching; no external notification.

---

## Runtime verification

MySQL started (loopback), migration `0004` applied (15 tables). Live flow (reader disabled): status (no run) → start `202` running → completes with 0 posts, `reader_disabled` note, **no browser launched, no Facebook contact**; `collector_runs` recorded; **no raw or normalized signals stored**; audit `collector_run_started/completed` with no secrets/paths; other workspace isolated. Services stopped. No real Facebook access.

---

## Risks & Mitigations

- **Accidental Facebook write / contact.** Mitigated by a read-only `PageController` (no write methods exist), the reader gate (no browser by default), and the connected-session guard.
- **Coupling collection to business/AI.** Mitigated by the module boundary — the Collector knows only groups/Signals; the Repository is the only DB boundary.
- **Resource use (2 cores / 3.8 GiB).** Mitigated by concurrency one, bounded scrolls/posts/timeout, and browser launched only when the reader is explicitly enabled.
- **Extractor quality on live Facebook.** Best-effort HTML parsing now; live-DOM hardening is future work when the reader is enabled with a real session.

---

## Completion Checklist

- [x] Preflight (read-only); no firewall/SSH/user/network changes.
- [x] Migration `0004` + store methods (raw/normalized/checkpoint/run).
- [x] Five collector modules + browser abstraction.
- [x] API + dashboard + worker + CLI.
- [x] Audit events.
- [x] Tests (147 passing) with fakes; no real Facebook access.
- [x] Full quality suite + db:status green; live runtime verified.
- [x] Services stopped; secrets absent from Git; no commits.
- [x] Documentation + ADR-009/010 written; updates applied.

---

## Review Status

**Complete — ready for Product Owner review.**

The Collector Engine is implemented as a modular, read-only, gated, auditable pipeline that opens groups, reads posts, normalizes, and stores platform-neutral Signals — with no writes, no AI, no Telegram, no matching, and no opportunities. Ready for Sprint 007.
