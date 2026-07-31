# 49 — Business Context Builder

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **BusinessContextBuilder** assembles the SAFE, structured context that is the AI's *entire permitted knowledge* when drafting. It is a **pure** function: it receives already-fetched records and returns a bounded context object. No I/O, no model, no secrets.

---

## Inputs

Records fetched by the Coordinator (all must belong to the same workspace):

- **Business Match** (the MATCH, with its reasons)
- **Opportunity** (+ its creation-event reasons)
- **Signal** (the source post) and its **Group**
- **Business**, **Business Profile**, **Business Knowledge**, **Matching Rules**

## Output — a safe structured context

Only reviewable content, nothing else:

- business name, category, description, selling points, service area, contact information, response tone
- prohibited claims
- active knowledge entries (bounded, ordered)
- matching rules (active) and matching reasons
- opportunity decision + reasons
- source signal text, safe source URL, source group name/URL

---

## Safety and bounding rules

- **Workspace ownership enforced.** Every record must belong to the same workspace; the profile/knowledge/rules must belong to the business. A mismatch throws — no cross-workspace or cross-business context is ever built (product rule 5).
- **Archived/disabled excluded.** Knowledge with a non-`active` status and disabled rules are dropped.
- **Bounded size.** Knowledge is limited by count (`AI_CONTEXT_MAX_KNOWLEDGE_ITEMS`) and by a cumulative character budget (`AI_CONTEXT_MAX_CHARACTERS`).
- **Deterministic ordering.** Knowledge is ordered by `createdAt` ascending, then id — stable across runs.
- **Thai preserved.** Text is copied verbatim; no transformation, normalisation, or transliteration.
- **No unsafe data.** No absolute file paths, no session data, no Facebook cookies, no internal database metadata, no secrets. The context is safe to store as the draft's `input_snapshot` and to display to a human.

---

## Why a separate, pure builder

Isolating context assembly makes it **testable** (pure unit tests assert ownership enforcement, exclusion, bounding, ordering, and Thai preservation) and makes the safety boundary explicit: whatever is *not* in this object can never reach the prompt, the provider, or the stored draft.

See [48-ai-draft-engine.md](48-ai-draft-engine.md), [50-ai-prompt-design.md](50-ai-prompt-design.md).
