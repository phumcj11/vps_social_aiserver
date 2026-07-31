# 48 — AI Draft Engine

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The AI Draft Engine turns a **MATCH** Business Match into a **draft comment suggestion** for a human to review. Its single job:

> **Propose** a safe, business-specific comment draft — nothing more.

The output is a **DRAFT ONLY**. It is **never** sent to Telegram, **never** posted to Facebook, and **never** triggers any write action. **Human approval remains mandatory** (docs/09-ai-design.md, [ADR-017](adr/ADR-017-human-approval-after-ai-draft.md)). AI proposes; a human disposes.

---

## Pipeline position

```
Collector → Signal → Opportunity Classification → Business Candidate Generation
  → Business Matching → [ AI Draft ] → END OF SPRINT
```

The engine consumes a **MATCH** Business Match (Sprint 008) and produces an immutable, versioned **AI Draft**. The pipeline ends here this sprint — there is no Telegram delivery, approval, or comment execution.

---

## Scope

**In:** verify MATCH → build safe context → build layered prompt → call provider → policy-check → store an immutable Draft version → append events → return a safe result.
**Out:** Telegram notification/approval, Facebook comment/message, auto-comment, approval execution, Action Worker execution, Facebook write, embeddings, semantic search, vector database, AI training, autonomous regeneration loops, multiple AI providers in active use.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **BusinessContextBuilder** | Pure. Assemble a SAFE, bounded, single-workspace context ([49](49-business-context-builder.md)). |
| **AiDraftPromptBuilder** | Pure. Build the layered prompt; request no chain-of-thought ([50](50-ai-prompt-design.md)). |
| **AiDraftProvider** | The text source. Deterministic **Mock** by default; a real provider is a disabled boundary ([53](53-ai-provider-abstraction.md)). |
| **DraftPolicyChecker** | Pure. Screen content → PASS / NEEDS_REVIEW / BLOCK ([51](51-draft-policy-checker.md)). |
| **AiDraftRepository** | The ONLY database boundary; writes immutable, versioned drafts + events. |
| **AiDraftCoordinator** | Orchestrates the flow, enforces ownership and the immutable-versioning invariant ([52](52-ai-draft-lifecycle.md)). |

> **Boundary rule:** the Context/Prompt/Policy modules are PURE (no DB, no network). The Coordinator gathers data via the Repository and hands it to the pure modules and the provider. Only the Repository touches the database.

---

## Safety guarantees

- **Draft only.** No Telegram, no Facebook write, no approval execution, ever.
- **AI disabled by default.** `AI_ENABLED=false`; the Mock provider produces deterministic drafts for tests and local use. A real external provider **refuses to run** while AI is disabled and is not connected this sprint.
- **One business's context per draft.** No cross-business leakage; only the matched business's data is used (BR-22, BR-60).
- **No invented facts.** The prompt and policy checker forbid guaranteed availability, confirmed price, promotions, facilities, locations, contact details, and service terms not present in the context. Missing data is handled with safe, general wording.
- **Prohibited claims are hard constraints** — enforced in the prompt and re-checked by the policy checker.
- **Every attempt is auditable** ([ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md)); every version is preserved; nothing is overwritten.

See also [50-ai-prompt-design.md](50-ai-prompt-design.md), [51-draft-policy-checker.md](51-draft-policy-checker.md), [52-ai-draft-lifecycle.md](52-ai-draft-lifecycle.md), [09-ai-design.md](09-ai-design.md).
