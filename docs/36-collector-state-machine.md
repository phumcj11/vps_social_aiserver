# 36 — Collector State Machine

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A collector run moves through a small, explicit state machine. State is stored on the `collector_runs` record.

---

## States

- **idle** — no run in progress (represented by "no run" / not running).
- **running** — a run is in progress.
- **paused** — the operator stopped the run mid-flight; it can resume from checkpoints on the next start.
- **completed** — the run finished processing all active groups.
- **failed** — a fatal error prevented the run (e.g. session not connected, browser launch failure, lock contention).

---

## Transitions

```
idle ──start──▶ running
running ──all groups processed──▶ completed
running ──stop (operator)───────▶ paused
running ──fatal error───────────▶ failed
running ──reader disabled───────▶ completed (0 posts, no browser)
running ──session not connected─▶ failed (no browser)
paused/completed/failed ──start─▶ running   (resumes from checkpoints)
```

- **Concurrency one:** starting while a run is active is rejected (`ALREADY_RUNNING` → HTTP 409).
- **Stop is graceful:** the current group finishes, then the run is marked `paused`.

---

## Errors (classification)

Every failure is classified and audited — no silent failure:

- **NAVIGATION_ERROR** — opening/scrolling a group failed.
- **EXTRACTION_ERROR** — parsing the page failed.
- **NORMALIZATION_ERROR** — normalizing a capture failed.
- **REPOSITORY_ERROR** — persistence failed.
- **CHECKPOINT_ERROR** — saving the resume checkpoint failed.
- **BROWSER_ERROR** — the browser failed to launch.
- Guards: **READER_DISABLED**, **SESSION_NOT_CONNECTED**, **ALREADY_RUNNING**, **INVALID_WORKSPACE**.

A single group's error increments the run's error count and is recorded, but the run continues to the next group. Fatal errors (before/around the whole run) mark the run `failed`.

---

## Audit events

- `collector_run_started`
- `collector_run_completed`
- `collector_run_paused`
- `collector_run_failed`
- `collector_group_collected` (per group: count)
- `collector_group_error` (per group: code)

Payloads contain only ids, counts, and classifications — never post text, cookies, profile paths, credentials, HTML, or screenshots.
