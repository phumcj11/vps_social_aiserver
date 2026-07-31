# ADR-012 — Opportunity Domain Model

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 007 — Opportunity Classification Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Everything Auditable, Single Responsibility
- **Relates to:** [ADR-010](ADR-010-signal-model.md), [ADR-011](ADR-011-opportunity-classification.md), [06-domain-model.md](../06-domain-model.md), [41-opportunity-lifecycle.md](../41-opportunity-lifecycle.md)

---

## Context

We need to persist the result of classification and track what happens to it over time, without leaking into concerns this sprint forbids (Businesses, AI, Telegram, comments). We must decide the shape of the Opportunity record, how it relates to a Signal, and how its history is captured.

---

## Decision

**Model an Opportunity as a workspace-scoped record with a UNIQUE link to one Signal, plus an append-only event log.**

### `opportunities`

| Column | Notes |
| ------ | ----- |
| `id` | UUID PK |
| `workspace_id` | FK → workspaces; every query is workspace-scoped |
| `signal_id` | FK → `facebook_signals`, **UNIQUE** — one Signal → at most one Opportunity |
| `decision` | `ACCEPT` \| `REJECT` — immutable |
| `status` | `NEW` \| `READY` \| `ARCHIVED` — mutable operational state |
| `classifier_version` | which rule set produced this Decision (`rules-v1`) |
| `created_at`, `updated_at` | timestamps |

### `opportunity_events`

| Column | Notes |
| ------ | ----- |
| `id` | UUID PK |
| `opportunity_id` | FK → opportunities, indexed |
| `event` | `OpportunityCreated` \| `OpportunityRejected` \| `OpportunityArchived` |
| `payload` | JSON — creation events carry the full Reasons array |
| `created_at` | append time |

### Module boundary

Three single-responsibility modules: **Classifier** (pure decision), **Repository** (only DB access, via the Store), **Coordinator** (orchestration, state machine, ownership). The Classifier never touches the database; the Repository never contains business logic; the Coordinator never executes SQL.

---

## Consequences

**Positive**
- **Decision vs status separation** keeps the immutable classification verdict distinct from mutable operational state.
- The **UNIQUE `signal_id`** enforces the "one Signal → at most one Opportunity" invariant at the database level and makes the classify pass idempotent.
- The **event log** gives a complete, auditable history (including the Reasons) without bloating the main row.
- **Platform-neutral naming** ("Opportunity", not "Facebook opportunity") anticipates future platforms, consistent with the Signal model (ADR-010).

**Negative / trade-offs**
- Reasons live in the creation event rather than as first-class columns, so querying by individual Reason requires reading the event payload. Acceptable — no such query is needed this sprint.

**Explicitly out of scope:** Businesses / matching, AI, Telegram, comments, notifications, approval, recommendations, Facebook writes. An Opportunity currently has **no downstream consumer** — the pipeline ends at Opportunity.
