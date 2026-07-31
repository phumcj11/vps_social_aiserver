# ADR-010 — Signal Model

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 006 — Collector Engine (read-only)
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Platform Adapter, Keep MVP Small, Everything Auditable
- **Relates to:** [ADR-009](ADR-009-collector-engine.md), [37-raw-signal.md](../37-raw-signal.md), [38-normalized-signal.md](../38-normalized-signal.md)

---

## Context

The Collector produces stored records of collected posts. The product will later add other platforms (TikTok, Instagram, LINE). We must decide whether the stored model is Facebook-specific or platform-neutral, and whether raw and normalized data are separated.

A recurring concept rename applies here: **Post → Signal**. A "post" is Facebook-specific; a "Signal" is the platform-neutral unit of collected content. Today a Signal is a Facebook post; tomorrow a TikTok video, an Instagram reel, or a LINE message — all Signals.

Options:
- **A — Store only a single Facebook-specific "post" record.**
- **B — Store an immutable raw signal plus a normalized, platform-neutral Signal.**

---

## Decision

**Adopt the two-tier Signal model (Option B): an immutable raw signal and a normalized, platform-neutral Signal.**

- **Raw signal** (`facebook_raw_signals`): immutable capture of exactly what was read (raw HTML/JSON) + a `content_hash`. Never mutated.
- **Normalized Signal** (`facebook_signals`): platform-neutral fields (author, message, media, created time) + a `normalized_hash`. This is what downstream consumers use.
- A **Signal is platform-independent** by design: the normalized shape does not depend on Facebook specifics, so future platforms can produce the same shape and reuse the downstream pipeline.
- **Duplicate detection** on the normalized Signal, in priority order: post URL → facebook_post_id → normalized hash.

The table names carry a `facebook_` prefix for the current platform, but the *model* (raw + normalized, platform-neutral fields) is the contract; additional platforms will add analogous raw/normalized tables producing the same normalized Signal shape.

---

## Consequences

**Positive**
- Immutable raw data gives an auditable source of truth and lets normalization be re-run later without re-reading Facebook.
- The platform-neutral normalized Signal means matching/AI (later sprints) depend on a stable shape, not on Facebook's DOM.
- Clear duplicate-detection tiers keep the store idempotent across re-collection and resumes.

**Negative / costs**
- Two records per post (raw + normalized) — more storage and two inserts. Accepted for auditability and re-derivability.
- The `facebook_`-prefixed table names are platform-specific even though the model is neutral; a future generalisation may introduce neutral table names.

**Neutral**
- Hashes (`content_hash`, `normalized_hash`) are deterministic and used only for dedup, not identity.

---

## Alternatives considered

- **Single Facebook-specific record (Option A).** Rejected: it would couple downstream matching/AI to Facebook specifics and lose the immutable raw source, making re-normalization and multi-platform reuse harder — contrary to the Platform Adapter principle.

---

## Terminology (this ADR anchors the rename)

- **Post → Signal** (platform-neutral unit of collected content).
- Related renames recorded in product memory: **Scanner → Collector**, **Lead → Opportunity**, **Comment Worker → Action Worker**.
