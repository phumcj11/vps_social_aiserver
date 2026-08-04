# 35 — Collector Pipeline

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The pipeline is a strict, one-directional flow. Each stage has one responsibility; data flows forward only.

```
Facebook → Navigation → Extraction → Normalization → Persistence → finish
```

---

## Stages

### 1. Navigation (browser, read-only)
Opens the group's canonical landing page and scrolls up to `COLLECTOR_MAX_SCROLLS` times to load more posts, then reads the page HTML. It never clicks, likes, shares, comments, messages, or joins. Expressed via a `PageController` that exposes only `goto` / `scrollOnce` / `getHtml`.

### 2. Extraction (pure)
Parses the page HTML into **raw captures** — post URL, Facebook post id, author, message, media URLs, and a created-time hint. Segments the page by post containers (`role="article"`) with a permalink-window fallback. No browser, no DOM, no SQL, no business logic.

### 3. Normalization (pure)
Converts each raw capture into a normalized, platform-neutral Signal: whitespace-cleaned text, de-duplicated media, a parsed `createdTime`, and a stable `normalizedHash`. No business logic.

### 4. Persistence (Repository → database)
For each capture, in order:
1. **Duplicate detection** — post URL → facebook_post_id → normalized hash. If any matches, skip. Persistence is **idempotent** (Pilot 0 fix): a duplicate — including a unique-constraint race or a pinned post rendered twice — is a graceful skip counted as `duplicatesSkipped`, never a `REPOSITORY_ERROR`, and never rewrites an existing Signal. See [86-collector-duplicate-handling.md](86-collector-duplicate-handling.md).
2. Insert the **immutable raw signal** (with a `contentHash`).
3. Insert the **normalized signal**.
4. Update the group **checkpoint** (last post, last scan, last cursor).

The Collector never touches SQL — only the Repository does.

---

## Coordinator responsibilities

- Enforce the safety gates (reader enabled? session connected?) before any browser work.
- Acquire the per-workspace browser lock (concurrency one).
- Iterate the workspace's **active groups** (the Collector knows only groups — never businesses).
- For each group: run Navigation → Extraction → Normalization → Persistence, bounded by `COLLECTOR_MAX_POSTS_PER_GROUP` and `COLLECTOR_TIMEOUT_MS`.
- Record per-group outcomes and errors; a single group's error never fails the whole run.
- Update the run record and status; emit audit events.

---

## Bounds & safety

- **Concurrency one**, per-run timeout, bounded scrolls and posts.
- **No infinite retries.** Per-group failures are recorded and the run continues; fatal failures mark the run `failed`.
- **Reader gate:** with `FACEBOOK_READER_ENABLED=false` (default) the pipeline short-circuits before Navigation — no browser, no Facebook contact — and the run completes with 0 posts.
- **No silent failure:** every error is classified and audited (see [36-collector-state-machine.md](36-collector-state-machine.md)).

---

## Data produced

- **facebook_raw_signals** — immutable raw capture ([37-raw-signal.md](37-raw-signal.md)).
- **facebook_signals** — normalized Signal ([38-normalized-signal.md](38-normalized-signal.md)).
- **collector_checkpoints** — per-group resume point ([39-checkpoint-design.md](39-checkpoint-design.md)).
- **collector_runs** — execution history.
