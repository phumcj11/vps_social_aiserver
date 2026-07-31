# 37 — Raw Signal

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A **raw signal** is the immutable capture of exactly what the Collector read — the raw material from which a normalized Signal is derived. It is never mutated after insertion.

Table: `facebook_raw_signals`.

---

## Purpose

- Preserve an auditable, immutable record of what was collected.
- Allow re-derivation of normalized Signals later without re-reading Facebook.
- Support third-tier duplicate detection via a content hash.

---

## Fields

| Field | Notes |
| ----- | ----- |
| `id` | UUID. |
| `workspace_id` | Owning workspace. |
| `group_id` | Internal `facebook_groups.id` the post came from. |
| `facebook_post_id` | Facebook's post id (when known). |
| `post_url` | Canonical post URL. |
| `raw_html` | The captured HTML fragment (raw material). |
| `raw_json` | Any captured structured JSON (when available). |
| `content_hash` | SHA-256 over the raw content (URL + id + message + author + media). |
| `collected_at` | When it was collected. |

**Uniqueness:** one raw capture per `(workspace_id, post_url)` — immutable, never duplicated.

---

## Immutability

Raw signals are insert-only. A re-collection of an already-captured post does not insert a new raw row (the unique constraint and the pre-insert existence check prevent it). The normalized Signal is derived from the raw capture but stored separately (see [38-normalized-signal.md](38-normalized-signal.md)).

---

## Not present

No business, matching, opportunity, AI, comment, or approval fields. The raw signal is pure collected data.
