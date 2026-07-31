# 44 — Business Candidate Engine

**Document status:** SPRINT 008 — Business Candidate & Matching Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Candidate Generator answers a single question:

> **Which businesses should this Opportunity even be considered for?**

It does **not** decide relevance — that is the Business Matcher's job ([45-business-matching-engine.md](45-business-matching-engine.md)). It only narrows the field to a deterministic, defensible set of **candidate businesses**.

---

## Pipeline position

```
Opportunity → [ Candidate Generator ] → Business Matcher → Business Match
```

The engine consumes **accepted Opportunities** (Sprint 007) and, for each, produces the list of candidate businesses that the Matcher will then evaluate.

---

## Selection rule (deterministic)

Candidates for an Opportunity are the businesses **assigned to the Opportunity's Signal's group** (BR-15), restricted to those that are **`active`**.

- An Opportunity references one Signal; the Signal was collected from exactly one Facebook Group.
- Businesses are assigned to groups (many-to-many, [ADR-008](adr/ADR-008-business-to-group-many-to-many.md)).
- Therefore the candidate pool is `businesses assigned to signal.groupId`, filtered to `status = 'active'`.

Disabled or archived businesses are never candidates. There is **no AI, no ranking, no scoring** — membership is a set operation over existing assignment data.

---

## Purity boundary

The **`selectCandidates`** function is PURE: it receives the already-fetched businesses (id, name, status) and returns those that are `active`, preserving order. The database fetch (`listBusinessesForGroup`) lives in the Repository; the Coordinator wires the two together. This keeps candidate selection deterministic and unit-testable with no database.

```
selectCandidates(businesses) → businesses.filter(active)
```

---

## Why "candidate", not "match"

A candidate is merely *eligible for evaluation*. Whether it actually matches depends on the business's own Business Matching Rules, evaluated by the Matcher. Separating the two keeps each step simple and auditable: the candidate set explains *why a business was considered*, and the match reasons explain *why it did or did not match*.

See [ADR-013](adr/ADR-013-business-candidate-generator.md), [45-business-matching-engine.md](45-business-matching-engine.md), [46-matching-rules.md](46-matching-rules.md), [47-business-match-lifecycle.md](47-business-match-lifecycle.md).
