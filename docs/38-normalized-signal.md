# 38 — Normalized Signal

**Document status:** SPRINT 006 — Collector Engine (read-only)
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A **Signal** is the normalized, platform-neutral representation of a collected post. It is what later sprints (matching, AI drafting) will consume — but the Collector produces it with **no business logic and no AI**.

Table: `facebook_signals`. Model rationale: [ADR-010](adr/ADR-010-signal-model.md).

---

## Platform independence

A Signal is not intrinsically a Facebook post. Today it is a Facebook post; tomorrow a TikTok video, Instagram reel, or LINE message. The normalized shape (author, message, media, created time) is platform-neutral, so downstream consumers do not depend on Facebook specifics.

---

## Fields

| Field | Notes |
| ----- | ----- |
| `id` | UUID. |
| `workspace_id` | Owning workspace. |
| `group_id` | Internal `facebook_groups.id`. |
| `facebook_post_id` | Facebook's post id (when known). |
| `post_url` | Canonical post URL. |
| `author_name` | Cleaned author display name. |
| `author_profile` | Author profile URL (when available). |
| `message` | Cleaned post text (whitespace-collapsed). |
| `media_urls` | De-duplicated media URLs (JSON array). |
| `created_time` | Parsed post time (unix seconds or ISO), when derivable. |
| `normalized_hash` | SHA-256 over the normalized fields (URL + id + author + message + media). |
| `normalized_at` | When it was normalized. |

**Uniqueness:** one Signal per `(workspace_id, post_url)`.

---

## Duplicate detection

The Collector avoids storing the same Signal twice, in priority order:

1. **Post URL** — `(workspace_id, post_url)`.
2. **facebook_post_id** — `(workspace_id, facebook_post_id)`.
3. **Normalized hash** — `(workspace_id, normalized_hash)`.

If any tier matches, the capture is skipped.

---

## Normalization rules (no business logic)

- Collapse whitespace and trim author/message; empty → null.
- De-duplicate and trim media URLs.
- Parse `created_time` from unix-seconds or ISO; invalid → null.
- Compute a deterministic `normalized_hash` for dedup.

The Normalizer performs no matching, scoring, AI, or business interpretation — it only cleans and hashes.
