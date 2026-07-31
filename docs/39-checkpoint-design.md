# 39 — Checkpoint Design

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

Checkpoints let the Collector **resume** collection efficiently. One checkpoint is kept per group, updated at the end of each successful group pass.

Table: `collector_checkpoints`.

---

## Purpose

- Record where collection last reached for a group, so subsequent runs are cheaper and idempotent (combined with duplicate detection).
- Provide a per-group "last scan" timestamp for the dashboard.

---

## Fields

| Field | Notes |
| ----- | ----- |
| `id` | UUID. |
| `workspace_id` | Owning workspace. |
| `group_id` | Internal `facebook_groups.id` — **unique** (one checkpoint per group). |
| `last_post_id` | Facebook post id of the newest post seen last pass. |
| `last_post_url` | URL of the newest post seen last pass. |
| `last_scan` | When the group was last scanned. |
| `last_cursor` | An opaque cursor hint (e.g. the number of scroll steps used). |
| `created_at` / `updated_at` | Safe timestamps. |

The run's **duration** is recorded on `collector_runs` (started/finished), not on the checkpoint.

---

## Update rule

At the end of a successful group pass, the checkpoint is **upserted** (updated in place, never duplicated) with the newest post id/URL, the current `last_scan`, and the latest cursor. Failure to save a checkpoint is classified as `CHECKPOINT_ERROR` and recorded — never silently swallowed.

---

## Resume behaviour

On the next run, duplicate detection (URL → facebook_post_id → normalized hash) ensures already-collected posts are skipped, so a resumed run stores only new Signals. The checkpoint provides the last-scan context and cursor hint for the run and the dashboard.
