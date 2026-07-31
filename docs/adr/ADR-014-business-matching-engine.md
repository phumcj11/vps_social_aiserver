# ADR-014 — Business Matching Engine (deterministic, rules-only)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 008 — Business Candidate & Matching Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Everything Auditable, Deterministic Before Intelligent
- **Relates to:** [ADR-011](ADR-011-opportunity-classification.md), [ADR-013](ADR-013-business-candidate-generator.md), [25-business-matching-rules.md](../25-business-matching-rules.md), [45-business-matching-engine.md](../45-business-matching-engine.md), [46-matching-rules.md](../46-matching-rules.md)

---

## Context

Given a candidate business and an Opportunity, we must decide whether they match. The product roadmap (BR-16) originally imagined a **confidence score** and, eventually, AI-assisted relevance. But at this stage we need matching to be **cheap, explainable, reproducible, and free of any model** — mirroring the deterministic stance taken for Opportunity classification ([ADR-011](ADR-011-opportunity-classification.md)). The businesses already own human-authored **Business Matching Rules** (Sprint 003), which are precisely the deterministic signal we need.

Options:
- **A — AI/embedding relevance** producing a score/confidence.
- **B — Deterministic evaluation of the business's existing matching rules**, producing a binary decision with explicit reasons.

---

## Decision

**Adopt deterministic, rules-only matching (Option B).**

- The Matcher is a **pure function** `matchBusiness(signal, rules) → { decision, reasons }`. No AI, no ML, no embeddings, no vector/semantic search, no network, no clock, no randomness.
- It uses **only** the candidate business's **active** Business Matching Rules. Evaluation is case-insensitive substring containment of each `ruleValue` in the Signal message (see [46-matching-rules.md](../46-matching-rules.md)).
- Output is a **binary Decision** (`MATCH` / `NO_MATCH`) plus a **Reasons** array (`{ ruleType, ruleValue, matched }`). There is **no score and no confidence**.
- **MATCH** iff at least one active rule matches; otherwise **NO_MATCH** (a business with no active rules is NO_MATCH).
- The rule set is **versioned** (`matcher_version = rules-v1`) and recorded on every Business Match.
- An Opportunity may yield zero, one, or many matches (BR-17); each candidate is recorded distinctly (BR-19) and none is silently chosen (BR-20).
- The Matcher knows **nothing** about AI, Comment Drafts, Telegram, notifications, approval, or Facebook writes.

---

## Consequences

**Positive**
- **Explainable:** every decision carries the exact rules evaluated and whether each matched.
- **Testable & reproducible:** pure unit tests; identical inputs give identical outputs for a `matcher_version`.
- **Cheap:** no model inference cost or latency.
- **Reversible:** a future `rules-v2` (or an AI-assisted stage) can be added later without rewriting history, because the version is recorded — and because scoring was deliberately *not* baked into the schema, adding it later is additive.

**Negative / trade-offs**
- Substring containment is blunt — it cannot capture nuanced intent or synonyms. Accepted for the MVP; richer relevance (including the BR-16 score and any AI) is explicitly a *later* concern. Owners tune matching by editing their rules.

**Explicitly out of scope (this sprint):** AI/ML, embeddings, vector/semantic search, scoring/confidence, Comment Drafts, Telegram, notifications, approval, auto-selection, Facebook writes.
