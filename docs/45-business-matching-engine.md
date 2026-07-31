# 45 — Business Matching Engine

**Document status:** SPRINT 008 — Business Candidate & Matching Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Business Matcher decides, for one **candidate business** and one **Opportunity**, whether they match:

> **Is this Opportunity relevant to this business — according to the business's own rules?**

It is **deterministic**. NO AI, NO ML, NO embeddings, NO vector or semantic search, NO score, NO confidence. It uses **only** the business's human-authored Business Matching Rules ([25-business-matching-rules.md](25-business-matching-rules.md), [46-matching-rules.md](46-matching-rules.md)).

---

## Pipeline position

```
Opportunity → Candidate Generator → [ Business Matcher ] → Business Match
```

For each accepted Opportunity, the Candidate Generator yields candidate businesses; the Matcher evaluates each candidate and the engine stores a **Business Match**.

---

## Scope

**In:** evaluate a Signal against a business's active rules → emit a Decision (`MATCH` / `NO_MATCH`) with Reasons → persist a Business Match.
**Out (this and every matching concern):** AI, embeddings, semantic search, scoring/confidence, Comment Drafts, Telegram, Facebook writes/messages, notifications, approval, auto-selection among businesses.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **CandidateGenerator** | Pure `selectCandidates(businesses)` — active businesses assigned to the Signal's group. |
| **BusinessMatcher** | Pure `matchBusiness(signal, rules) → { decision, reasons }`. No DB, no AI, no I/O. Deterministic. |
| **MatchRepository** | Read Opportunities/Signals/businesses/assignments/rules; write Business Matches. The ONLY DB boundary. |
| **Coordinator** | Runs the pipeline, enforces idempotency and ownership, records the run summary. |

> **Boundary rule:** the Matcher NEVER touches the database and NEVER calls a model. The Coordinator gathers the facts (candidate businesses, each business's active rules) via the Repository and passes them to the pure Matcher.

---

## Decision

- **MATCH** when **at least one** of the business's active rules matches the Signal.
- **NO_MATCH** otherwise (including when the business has no active rules).

There is **no score and no confidence** — a business either matches or it does not. A single Opportunity may yield zero, one, or many matches across its candidate businesses (BR-17); each candidate is recorded distinctly and none is silently chosen (BR-19, BR-20).

---

## Matcher version

Every Business Match records the `matcher_version` (currently `rules-v1`) that produced it, so matching is auditable and the rule set can evolve (`rules-v2`, …) without ambiguity about which logic applied.

---

## What this is NOT

- **Not** AI — no model, embedding, vector store, or prompt.
- **Not** a ranker — no score, confidence, or ordering by quality.
- **Not** an approver or writer — it never drafts comments, contacts Telegram, or writes to Facebook.
- **Not** an auto-selector — when several businesses match, all are surfaced; the system never picks one on the customer's behalf.

See [ADR-014](adr/ADR-014-business-matching-engine.md), [46-matching-rules.md](46-matching-rules.md), [47-business-match-lifecycle.md](47-business-match-lifecycle.md).
