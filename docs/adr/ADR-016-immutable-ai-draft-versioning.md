# ADR-016 — Immutable AI Draft Versioning

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 009 — AI Draft Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Everything Auditable, No Silent Failure, Keep MVP Small
- **Relates to:** [ADR-015](ADR-015-ai-provider-abstraction.md), [ADR-017](ADR-017-human-approval-after-ai-draft.md), [52-ai-draft-lifecycle.md](../52-ai-draft-lifecycle.md)

---

## Context

A Business Match may be drafted more than once (the human wants a different phrasing, or the first attempt was blocked). We must decide how versions are stored. AI output is sensitive: we need a complete, auditable history of every generation attempt, and we must never silently discard or overwrite a draft a human might rely on.

Options:
- **A — One mutable draft row per match**, overwritten on each regeneration.
- **B — Immutable, versioned drafts**: each generation is a new row; older versions are retained and marked superseded.

---

## Decision

**Adopt immutable, versioned drafts (Option B).**

- Each generation creates a **new `ai_drafts` row** with a monotonic `version` starting at 1.
- **`UNIQUE (business_match_id, version)`** enforces the invariant at the database level. Existing drafts are **never overwritten** (product rules 11–13).
- Plain **generate is idempotent**: if a draft already exists for the match, it is returned unchanged — no new version, no overwrite.
- **Regenerate** always creates version N+1 and marks prior `draft`/`needs_review` versions **`superseded`** (kept for history).
- Every attempt — including provider failures and blocked output — is **preserved** and **auditable** via `ai_draft_events` (started/generated/needs_review/blocked/regenerated/rejected/superseded/failed) with safe payloads (no secrets, no chain-of-thought).

---

## Consequences

**Positive**
- **Full history** — every draft a human ever saw is retained and explainable.
- **No accidental loss** — the UNIQUE constraint makes overwrite impossible; idempotent generate prevents accidental duplicates.
- **Safe audit** — events capture provenance without leaking prompts or credentials.

**Negative / trade-offs**
- Row growth over time (one per generation). Acceptable at MVP scale; a later retention/archival policy can prune superseded versions if needed, without changing the contract.

**Explicitly out of scope:** approval/sent/posted states (a draft is never "ready to post" this sprint), automatic regeneration loops.
