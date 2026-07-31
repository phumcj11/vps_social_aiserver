# 53 — AI Provider Abstraction

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The engine depends on an **`AiDraftProvider`** interface, not on any concrete AI vendor. This keeps the pipeline testable and provider-agnostic, and lets AI stay **disabled by default** ([ADR-015](adr/ADR-015-ai-provider-abstraction.md)).

---

## Interface

```
AiDraftProvider.generateDraft(input) → {
  content, provider, model, promptVersion, policyMetadata
}
```

`input` carries the safe context and the built prompt. The result is plain content plus safe metadata — **no chain-of-thought, no hidden reasoning**.

---

## Implementations

### MockAiDraftProvider (default)

- **Deterministic** — identical input yields identical output; no clock, no randomness.
- **No network access** — suitable for all automated tests and local use.
- Composes a concise, natural Thai comment from **only** the supplied business context.
- **Never** claims confirmed availability or price; **never** invents contact information (it repeats only the business-provided contact, if any); **never** asserts facilities or locations not present in the context.

### ExternalAiDraftProvider (disabled boundary)

- The seam where a real vendor would connect. **Not connected this sprint.**
- **Refuses to run** whenever `AI_ENABLED=false`; even when enabled, no real provider is wired here, so it refuses.
- Real credentials (e.g. `ANTHROPIC_API_KEY`) are **documented but never populated** (see [16-environment-configuration.md](16-environment-configuration.md)); nothing is committed.

### Selection

`selectAiDraftProvider(env)` returns the Mock when `AI_PROVIDER=mock` (the default), otherwise the disabled external boundary. Automated tests inject `MockAiDraftProvider` directly; **no real AI call occurs in tests**.

---

## Guarantees

- **AI disabled by default** — `AI_ENABLED=false`.
- **No external call without explicit runtime approval** — enabling a real provider requires intentionally setting `AI_ENABLED` and supplying a key via the gitignored `.env`; only one provider is ever active.
- **No embeddings, semantic search, vector database, or AI training** — the abstraction is a single request/response for one draft; there are no autonomous regeneration loops.

See [48-ai-draft-engine.md](48-ai-draft-engine.md), [ADR-015](adr/ADR-015-ai-provider-abstraction.md).
