# 52 — AI Draft Lifecycle

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

An **AI Draft** is an immutable, versioned record of a draft comment suggestion for one Business Match. This document describes its storage, states, versioning invariant, and events.

---

## Storage

Table `ai_drafts`:

| Column | Notes |
| ------ | ----- |
| `id` | UUID PK |
| `workspace_id` | FK → workspaces; every query is workspace-scoped |
| `business_match_id` | FK → business_matches — the MATCH this draft is for |
| `opportunity_id`, `business_id` | denormalised FKs for scoping/history |
| `version` | monotonic per business match, starting at **1** |
| `status` | `draft` \| `needs_review` \| `rejected` \| `superseded` |
| `content` | the draft text (null when a provider failed) |
| `provider`, `model`, `prompt_version` | how it was produced (mock values when AI is disabled) |
| `input_snapshot` | JSON — the safe structured context (no secrets) |
| `policy_result` | JSON — PASS/NEEDS_REVIEW/BLOCK + reasons |
| `created_by`, `created_at`, `updated_at` | provenance |

Table `ai_draft_events` — append-only lifecycle events with safe payloads.

---

## Product invariants

1. A Draft belongs to exactly one Business Match.
2. A Business Match may have **many** Draft versions.
3. Only **MATCH** decisions may generate Drafts; **NO_MATCH** never generates.
4. Draft generation uses only same-workspace, single-business context.
5. **Immutable versioning** ([ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md)): `UNIQUE (business_match_id, version)`. Existing drafts are **never overwritten**.
6. Every version is preserved; manual **regeneration creates a new version**.

---

## States

- **draft** — PASS policy; the current candidate for human review.
- **needs_review** — NEEDS_REVIEW or BLOCK policy, or a provider failure; a human must look before anything happens. Never a "ready" state.
- **rejected** — a human rejected it. Never posts.
- **superseded** — a newer version replaced it (kept for history).

There is **no approved/sent/posted state** in this sprint — human approval and delivery arrive later ([ADR-017](adr/ADR-017-human-approval-after-ai-draft.md)).

---

## Flow

```
Business Match (MATCH)
  → build context → build prompt → provider → policy check
  → create immutable Draft version N
  → supersede older non-terminal versions (→ superseded)
  → append events → return safe result
```

- **Generate** is idempotent: if a draft already exists for the match, it is returned unchanged (no overwrite, no new version).
- **Regenerate** always creates version N+1 and marks prior `draft`/`needs_review` versions `superseded`.
- **Reject** sets `rejected` and records an event.

---

## Events

`ai_draft_generation_started`, `ai_draft_generated`, `ai_draft_needs_review`, `ai_draft_blocked`, `ai_draft_regenerated`, `ai_draft_rejected`, `ai_draft_superseded`, `ai_draft_generation_failed`.

Payloads are **safe**: version, status, policy decision, reason codes, provider/model/prompt_version. They exclude API keys, hidden prompt internals, cookies, session tokens, browser profile paths, raw credentials, and chain-of-thought.

---

## Ownership

Every Draft belongs to a workspace; cross-workspace access returns **404**, consistent with [21-session-security.md](21-session-security.md).

See [48-ai-draft-engine.md](48-ai-draft-engine.md), [51-draft-policy-checker.md](51-draft-policy-checker.md), [53-ai-provider-abstraction.md](53-ai-provider-abstraction.md).
