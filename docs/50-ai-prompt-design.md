# 50 — AI Prompt Design

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **AiDraftPromptBuilder** builds a **layered** prompt from the safe context ([49](49-business-context-builder.md)). It is **pure and deterministic**, requests **no hidden reasoning / chain-of-thought**, and embeds no secrets. Prompt version: **`rules-v1`** (recorded on every draft as `prompt_version`).

---

## Prompt layers (authoritative → specific)

Higher layers override lower ones, so safety sits structurally above business voice, which sits above the individual post (docs/09-ai-design.md):

1. **System Rules** — non-negotiable guardrails: use only the provided context; never invent facts; never state guaranteed availability/price, promotions, facilities, locations, contact details, or service terms not in the context; never make a prohibited claim; produce a proposal only.
2. **Business Context** — name, category, description, selling points, service area, business-provided contact, active knowledge.
3. **Opportunity Context** — the poster's message, source group, opportunity decision.
4. **Matching Reasons** — the deterministic rules that matched (why this business).
5. **Prohibited Claims** — hard constraints, listed explicitly.
6. **Tone Instructions** — the business's response tone, explicitly subordinate to the rules above.
7. **Output Contract** — the exact shape of the expected reply.

---

## Output contract

- Exactly **one** concise Facebook comment draft.
- **Natural Thai by default.**
- Plain text only — **no markdown, no bullet lists.**
- No fabricated facts; no guaranteed availability; no guaranteed price; no aggressive sales claims; no guessing personal data; no duplicate contact spam.
- A safe, gentle **call to action** (invite the poster to ask for more detail).
- A configurable **maximum length** (`AI_DRAFT_MAX_LENGTH`).
- The reply must be **only** the comment text — no reasoning, explanations, or metadata.

---

## No chain-of-thought

The prompt explicitly asks the provider to "Return ONLY the comment text." It never asks the model to explain its reasoning, think step by step, or expose intermediate thoughts. No hidden reasoning is requested, produced, stored, or returned — consistent with the safe-audit rules ([ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md)).

## Determinism & safety

Given the same context and max length, the builder emits an identical layered prompt. The prompt text is used in-memory to call the provider; it is **not** stored on the draft and **not** returned by the API (only the safe `input_snapshot` context is stored/returned).

See [48-ai-draft-engine.md](48-ai-draft-engine.md), [51-draft-policy-checker.md](51-draft-policy-checker.md).
