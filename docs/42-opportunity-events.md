# 42 — Opportunity Events

**Document status:** SPRINT 007 — Opportunity Classification Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

Every meaningful change to an Opportunity appends an immutable row to `opportunity_events`. This gives a full, auditable history of *why* an Opportunity exists and *what happened to it* — consistent with the **Everything Auditable** principle.

---

## Storage

Table `opportunity_events`:

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | varchar(36) | UUID primary key |
| `opportunity_id` | varchar(36) | FK → `opportunities.id`, indexed |
| `event` | varchar(60) | Event type (see below) |
| `payload` | text | JSON payload; shape depends on event type |
| `created_at` | timestamp | Append time |

Events are **append-only**: never updated, never deleted.

---

## Event types

| Event | Emitted when | Payload |
| ----- | ------------ | ------- |
| `OpportunityCreated` | Classifier returns `ACCEPT` and the Opportunity is created | `{ decision: "ACCEPT", reasons: [{ code, passed }, …] }` |
| `OpportunityRejected` | Classifier returns `REJECT` and the Opportunity is created | `{ decision: "REJECT", reasons: [{ code, passed }, …] }` |
| `OpportunityArchived` | An Opportunity is manually moved to `ARCHIVED` | `{ from, to }` (previous and new status) |

Both creation events carry the **full Reasons array** — the complete rule evaluation that produced the Decision. This is what the Opportunity Detail page renders under *Reasons*, and it is the durable record of why the Classifier decided as it did.

---

## Why store Reasons in the event

The Reasons are a property of a *classification run*, not of the Opportunity row itself. Storing them in the creation event:

- keeps the `opportunities` row small and focused on current state;
- preserves the exact rule outcome even if the rule set (`classifier_version`) later changes;
- gives a single, ordered, human-readable explanation for both ACCEPT and REJECT.

---

## Retrieval

`GET /opportunities/:id` returns the Opportunity, its Signal, and its events (oldest first). A typical accepted-then-archived Opportunity has the event trail:

```
OpportunityCreated  →  OpportunityArchived
```

Related: [40-opportunity-classifier.md](40-opportunity-classifier.md), [41-opportunity-lifecycle.md](41-opportunity-lifecycle.md), [43-classification-rules.md](43-classification-rules.md).
