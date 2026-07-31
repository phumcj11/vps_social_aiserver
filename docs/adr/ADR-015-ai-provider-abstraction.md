# ADR-015 — AI Provider Abstraction

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 009 — AI Draft Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Everything Auditable, AI Proposes / Human Disposes
- **Relates to:** [ADR-016](ADR-016-immutable-ai-draft-versioning.md), [ADR-017](ADR-017-human-approval-after-ai-draft.md), [09-ai-design.md](../09-ai-design.md), [53-ai-provider-abstraction.md](../53-ai-provider-abstraction.md)

---

## Context

The AI Draft Engine needs draft text, but we must not couple the pipeline to a vendor, must keep AI **disabled by default**, and must run all automated tests deterministically without any network call. We also must not accumulate AI infrastructure the MVP does not need (embeddings, vector DBs, multiple active providers).

Options:
- **A — Call a real provider SDK directly** from the coordinator.
- **B — Depend on a small `AiDraftProvider` interface**, default to a deterministic Mock, and keep a disabled boundary for a future real provider.

---

## Decision

**Adopt a provider abstraction with a deterministic Mock default (Option B).**

- The engine depends on `AiDraftProvider.generateDraft(input) → { content, provider, model, promptVersion, policyMetadata }`.
- **MockAiDraftProvider** is the default: deterministic, no network, safe, using only supplied context. It powers tests and local use.
- **ExternalAiDraftProvider** is a disabled boundary: it **refuses to run while `AI_ENABLED=false`**, and no real vendor is connected this sprint.
- Provider selection is config-driven (`AI_PROVIDER`, default `mock`). Only **one** provider is ever active — no "multiple AI providers in active use".
- **No embeddings, semantic search, vector database, or AI training** are introduced.
- Real credentials are documented by name only and never committed; enabling a real provider is an explicit, later runtime decision.

---

## Consequences

**Positive**
- **Deterministic, offline tests** — the Mock removes flakiness and cost from CI.
- **Safe by default** — AI is off; a real provider cannot run accidentally.
- **Vendor-agnostic & reversible** — a real provider slots in behind the interface without touching the coordinator, policy checker, or storage.
- **Minimal** — no premature AI infrastructure.

**Negative / trade-offs**
- The Mock's drafts are simple; they demonstrate the flow rather than produce production-grade copy. Acceptable — the goal this sprint is the safe pipeline and human-review contract, not model quality.

**Explicitly out of scope:** real provider connection, multiple active providers, embeddings, semantic search, vector database, AI training, autonomous regeneration loops.
