# ADR-011 — Opportunity Classification (deterministic, rules-only)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 007 — Opportunity Classification Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Everything Auditable, Deterministic Before Intelligent
- **Relates to:** [ADR-010](ADR-010-signal-model.md), [ADR-012](ADR-012-opportunity-domain.md), [40-opportunity-classifier.md](../40-opportunity-classifier.md), [43-classification-rules.md](../43-classification-rules.md)

---

## Context

The pipeline now has Signals (Sprint 006). The next question is: **should a Signal become an Opportunity?** It is tempting to answer this with AI — an LLM or an embedding-similarity model scoring each Signal for "business relevance". But at this stage of the MVP we need the decision to be **cheap, testable, explainable, and reproducible**, and we are not yet matching Businesses at all.

Options:
- **A — Classify with AI/ML** (LLM prompt or embedding similarity), producing a score/confidence.
- **B — Classify with a fixed set of deterministic rules**, producing a binary Decision with explicit Reasons.

---

## Decision

**Adopt deterministic, rules-only classification (Option B).**

- The Classifier is a **pure function**: `classifySignal(signal, context) → { decision, reasons }`. No AI, no ML, no embeddings, no vector search, no network, no clock, no randomness.
- Output is a **binary Decision** (`ACCEPT` / `REJECT`) plus an ordered array of **Reasons** (`{ code, passed }`). There is **no score and no confidence**.
- A Decision is `ACCEPT` **only if every rule passes**; otherwise `REJECT`.
- The rule set is **versioned** (`classifier_version = rules-v1`) and recorded on every Opportunity.
- The Classifier does **not** know about Businesses, matching, Telegram, comments, notifications, or Facebook writes.
- The single non-local fact — duplication — is computed by the Coordinator (via the Repository) and injected as `isDuplicate` in the context, so the Classifier stays pure while `NOT_DUPLICATE` still works.

Rules (v1): `HAS_TEXT`, `TEXT_MIN_LENGTH`, `HAS_AUTHOR`, `HAS_URL`, `NOT_DELETED`, `SUPPORTED_LANGUAGE`, `NOT_DUPLICATE`. See [43-classification-rules.md](../43-classification-rules.md).

---

## Consequences

**Positive**
- **Explainable:** every Decision comes with the exact Reasons that produced it, stored in the creation event.
- **Testable:** pure unit tests, no database or model required.
- **Reproducible & auditable:** identical inputs yield identical outputs for a given `classifier_version`.
- **Cheap:** no model inference cost or latency.
- **Reversible:** a future `rules-v2` (or an AI-assisted stage) can be added without rewriting history, because the version is recorded.

**Negative / trade-offs**
- Rules are blunt — they cannot capture nuanced "is this a real buying intent" judgement. Accepted for the MVP; AI relevance is explicitly a *later* concern.
- Rule tuning (e.g. minimum length, supported scripts) is manual.

**Explicitly out of scope (this sprint):** AI/ML, embeddings, vector search, scoring/confidence, Business matching, Telegram, comments, notifications, approval, recommendations, Facebook writes.
