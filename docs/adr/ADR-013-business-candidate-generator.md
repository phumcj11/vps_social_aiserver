# ADR-013 — Business Candidate Generator

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 008 — Business Candidate & Matching Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Deterministic Before Intelligent, Single Responsibility
- **Relates to:** [ADR-008](ADR-008-business-to-group-many-to-many.md), [ADR-012](ADR-012-opportunity-domain.md), [ADR-014](ADR-014-business-matching-engine.md), [44-business-candidate-engine.md](../44-business-candidate-engine.md)

---

## Context

Before deciding *whether* an Opportunity is relevant to a business, we must decide *which* businesses to consider at all. Evaluating every business in a workspace against every Opportunity is wasteful and semantically wrong — a business should only be considered for posts in groups it actually watches.

Options for generating the candidate set:
- **A — Consider all businesses in the workspace** and let the matcher filter.
- **B — Consider only businesses assigned to the Opportunity's Signal's group** (the existing group-assignment graph, ADR-008).
- **C — Use AI/embedding similarity** to pre-select likely-relevant businesses.

---

## Decision

**Adopt group-assignment-scoped candidate generation (Option B).**

- Candidates for an Opportunity are the businesses **assigned to the Opportunity's Signal's group** (BR-15), restricted to `status = 'active'`.
- Selection is a **pure function** `selectCandidates(businesses)` that filters to active businesses and preserves order. It performs no I/O and calls no model; the Repository fetches the assigned businesses and the Coordinator wires them in.
- **No AI, no ranking, no scoring.** Candidacy is a set-membership operation over existing assignment data.
- A candidate is only *eligible for evaluation* — relevance is decided separately by the Business Matcher ([ADR-014](ADR-014-business-matching-engine.md)).

---

## Consequences

**Positive**
- **Correct by construction:** a business is considered only for groups it is actually assigned to.
- **Cheap:** a set lookup, not a scan or a model call.
- **Explainable & testable:** the candidate set is fully determined by assignments; the pure function unit-tests without a database.
- **Reuses existing data:** builds directly on the Sprint 005 business↔group assignment graph.

**Negative / trade-offs**
- A business must be assigned to a group to be considered — un-assigned businesses are silently out of scope. This is intended (assignment is how owners declare interest), and is visible in the group-assignment UI.

**Explicitly out of scope:** AI/embedding pre-selection, cross-group inference, scoring, ranking.
