# 34 — Collector Engine

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Collector is the first production data pipeline. It is responsible **only** for collecting data: open a Facebook Group, navigate, read posts, normalize, and store them as **Signals**. It knows **nothing** about Business, AI, Telegram, comments, approval, matching, or opportunities, and it **never writes to Facebook**.

---

## Scope

**In:** open group → navigate → read posts → normalize → store Signals → finish.
**Out (this and every collector concern):** business matching, opportunity discovery, AI, Telegram, commenting, Facebook writes/messages, notifications, approval, auto-comment.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **Navigation** | Open group, scroll, paginate, stop — READ-ONLY (no click/like/share/comment/join). |
| **Extractor** | Parse page HTML → raw captures (DOM/links/images). Pure; no browser, no SQL. |
| **Normalizer** | Convert a raw capture → a normalized, platform-neutral Signal. Pure; no business logic. |
| **Repository** | Insert / update / duplicate-detection / checkpoint. The ONLY module that talks to the database (via the Store). |
| **Coordinator** | Runs the pipeline (Navigation → Extraction → Normalization → Persistence), the state machine, and run history. |

> **Boundary rule:** the Collector NEVER executes SQL directly. The Collector talks only to the Repository; the Repository talks to the database.

The Playwright browser boundary is the `CollectorBrowser` interface (real Playwright at runtime; a fake in tests). Navigation is expressed through a read-only `PageController` (open/scroll/read-HTML only — no write method exists).

---

## Read-only guarantees

- The browser only navigates and scrolls (via `window.scrollBy`) and reads HTML (`page.content()`). It never clicks Like/Join/Comment/Share, never messages, never joins, never writes.
- Reading is gated by `FACEBOOK_READER_ENABLED` (default **false**): with it off, no browser launches and runs complete with 0 posts.
- A connected Facebook session is required; a disconnected/expired session fails the run without launching a browser.
- Concurrency one; the collector shares the per-workspace browser lock with the connection/validation services.
- Facebook write actions remain disabled and the global kill switch stays on.

---

## API

Authenticated, workspace-scoped, CSRF-guarded (state-changing):

| Method & path | Purpose |
| ------------- | ------- |
| `POST /collector/start` | Begin a read-only run (background); returns the run summary. |
| `POST /collector/stop` | Gracefully stop an active run (→ paused). Idempotent. |
| `GET /collector/status` | Latest run summary + total Signals + running flag. |
| `GET /collector/runs` | Execution history. |

Responses contain only safe run metadata — never profile paths, cookies, credentials, or raw HTML.

---

## Worker & CLI

- **Collector Worker** (formerly "Scanner"): a read-only worker; the engine lives in the backend. Placeholder by default (no Playwright import, no contact).
- **CLI:** `pnpm collector:run --workspace <uuid>` — read-only, gated by the reader flag; never prints credentials, cookies, profile paths, or raw HTML.

---

## What a Signal is

A **Signal** is platform-independent (ADR-010): today a Facebook post; tomorrow a TikTok video, Instagram reel, or LINE message — all Signals. The Collector stores an immutable **raw signal** and a normalized **signal**. See [37-raw-signal.md](37-raw-signal.md), [38-normalized-signal.md](38-normalized-signal.md).

See also: [35-collector-pipeline.md](35-collector-pipeline.md), [36-collector-state-machine.md](36-collector-state-machine.md), [39-checkpoint-design.md](39-checkpoint-design.md), [ADR-009](adr/ADR-009-collector-engine.md), [ADR-010](adr/ADR-010-signal-model.md).
