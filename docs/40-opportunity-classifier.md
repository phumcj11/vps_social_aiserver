# 40 — Opportunity Classifier

**Document status:** SPRINT 007 — Opportunity Classification Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Opportunity Classifier is the second stage of the data pipeline. It answers exactly **one** question:

> **Should this Signal become an Opportunity?**

Nothing more. It does **not** match Businesses, does **not** use AI/ML/embeddings/vector search, produces **no** score and **no** confidence, and knows **nothing** about Businesses, Telegram, comments, notifications, approval, or Facebook writes.

---

## Pipeline position

```
Collector → Raw Signals → Signals → [ Opportunity Classifier ] → Opportunity → END
```

The Classifier reads existing **Signals** (produced by the Collector in Sprint 006) and decides, per Signal, whether it deserves further downstream processing. The result is an **Opportunity** record. This sprint the pipeline ends there — there is no consumer of Opportunities yet.

---

## Scope

**In:** read a Signal → apply deterministic rules → emit a Decision (ACCEPT / REJECT) with Reasons → persist an Opportunity + an event.
**Out (this and every classifier concern):** business matching, AI, embeddings, scoring/confidence, Telegram, comments, Facebook writes/messages, notifications, approval, recommendations.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **Classifier** | Pure function `classifySignal(signal, context) → { decision, reasons }`. No DB, no AI, no I/O. Deterministic. |
| **Repository** | Insert Opportunity / read Signals / duplicate lookup / event append / statistics. The ONLY module that talks to the database (via the Store). |
| **Coordinator** | Runs the classify-all pass, maps Decision → status + event, enforces ownership and the state machine. |

> **Boundary rule:** the Classifier NEVER executes SQL and NEVER reads the database. The Coordinator gathers the facts (including whether a Signal is a duplicate) and passes them to the pure Classifier as a `ClassifierContext`. The Repository is the only module that talks to the Store.

The concept previously sketched as **Detector** is renamed **Classifier**: it *classifies* a Signal into a Decision; it does not "detect" anything probabilistic.

---

## Input and output

**Input** — a `ClassifierSignal` (a projection of a stored Signal): `message`, `authorName`, `postUrl`.
**Context** — a `ClassifierContext`: `minTextLength` (configurable), `isDuplicate` (computed by the Coordinator via the Repository).
**Output** — a `ClassificationResult`: `decision` (`ACCEPT` | `REJECT`) and `reasons` (an ordered array of `{ code, passed }`).

The Decision is **ACCEPT only if every rule passes**; otherwise **REJECT**. See [43-classification-rules.md](43-classification-rules.md) for the rules.

---

## Classifier version

Every Opportunity records the `classifier_version` that produced it (currently `rules-v1`). This makes classification auditable and lets the rule set evolve without rewriting history: a later `rules-v2` can re-classify without ambiguity about which rules applied.

---

## What this is NOT

- **Not** a Business matcher — it never looks at Businesses, matching rules, or knowledge.
- **Not** AI — no model, no embedding, no vector store, no prompt. Pure deterministic rules.
- **Not** a ranker — no score, no confidence, no ordering by quality.
- **Not** a writer — it never touches Facebook, Telegram, comments, or notifications.

See [ADR-011](adr/ADR-011-opportunity-classification.md) (deterministic classification) and [ADR-012](adr/ADR-012-opportunity-domain.md) (Opportunity domain), plus [41-opportunity-lifecycle.md](41-opportunity-lifecycle.md), [42-opportunity-events.md](42-opportunity-events.md), and [43-classification-rules.md](43-classification-rules.md).
