# 41 — Opportunity Lifecycle

**Document status:** SPRINT 007 — Opportunity Classification Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

An **Opportunity** is the record of a classification decision about a single Signal. This document describes its state machine and the invariants that hold across it.

---

## State machine

```
                 ┌─────────────────── ACCEPT ──────────────────┐
                 │                                              ▼
Signal ──► Classifier                                        READY ──► (manual) ──► ARCHIVED
                 │                                              ▲
                 └─────────────────── REJECT ──────────────► ARCHIVED
```

- **Decision** is immutable once written: `ACCEPT` or `REJECT`. It records what the Classifier concluded and never changes.
- **Status** is mutable and reflects operational state: `NEW`, `READY`, `ARCHIVED`.

### Transitions

| Trigger | Decision | Resulting status | Event |
| ------- | -------- | ---------------- | ----- |
| Classify → all rules pass | `ACCEPT` | `READY` | `OpportunityCreated` |
| Classify → any rule fails | `REJECT` | `ARCHIVED` | `OpportunityRejected` |
| Manual `PATCH …/status` → `ARCHIVED` | (unchanged) | `ARCHIVED` | `OpportunityArchived` |
| Manual `PATCH …/status` → `READY` | (unchanged) | `READY` | *(status change only)* |

`NEW` is the schema default for a freshly-created row; in practice the Coordinator immediately advances an accepted Opportunity to `READY` and a rejected one to `ARCHIVED` in the same operation, so `NEW` is transient. Only `READY` and `ARCHIVED` are valid targets for a manual status change.

---

## Core invariant: one Signal → at most one Opportunity

A Signal is classified **at most once**. The `opportunities.signal_id` column carries a **UNIQUE** constraint, so a second attempt to create an Opportunity for the same Signal is rejected at the database level.

The classify pass is therefore **idempotent**: it processes only Signals that do not yet have an Opportunity (`listUnclassifiedSignals`), so running `POST /opportunities/classify` repeatedly never creates duplicates and reports `processed: 0` once everything is classified.

---

## Statistics

`GET /opportunities/statistics` reports, per workspace:

- `total`, `accepted`, `rejected` — counts by Decision.
- `new`, `ready`, `archived` — counts by Status.
- `unclassifiedSignals` — Signals with no Opportunity yet (the backlog the next classify pass would process).

---

## Ownership

Every Opportunity belongs to a workspace. Cross-workspace access returns **404** (not 403) — the resource is invisible outside its workspace. See [21-session-security.md](21-session-security.md) for the ownership convention.

Related: [40-opportunity-classifier.md](40-opportunity-classifier.md), [42-opportunity-events.md](42-opportunity-events.md), [43-classification-rules.md](43-classification-rules.md).
