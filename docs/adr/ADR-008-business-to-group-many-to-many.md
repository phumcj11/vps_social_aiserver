# ADR-008 — Business-to-Group Many-to-Many

- **Status:** Accepted
- **Date:** 2026-07-30
- **Sprint:** SPRINT 005 — Facebook Groups Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Business First, Keep MVP Small, Everything Auditable
- **Relates to:** [ADR-004](ADR-004-multiple-businesses-per-customer.md) (multiple businesses per customer), [ADR-005](ADR-005-single-facebook-account-mvp.md) (one Facebook account per workspace), [06-domain-model.md](../06-domain-model.md), [30-facebook-groups.md](../30-facebook-groups.md), [33-business-group-assignment.md](../33-business-group-assignment.md)

---

## Context

A workspace owns many Businesses ([ADR-004](ADR-004-multiple-businesses-per-customer.md)) and, in the MVP, one Facebook account ([ADR-005](ADR-005-single-facebook-account-mvp.md)) through which Facebook Groups are reached. We must decide how Businesses relate to Facebook Groups.

In practice, a single Facebook Group often contains leads for more than one of an owner's businesses (e.g. a local "community marketplace" group is relevant to both a cleaning service and a catering service). Conversely, a business is best served by monitoring several groups. The domain model (docs/06-domain-model.md) already anticipates that a post may match zero, one, or many businesses.

Options:

- **Option A — One group belongs to one business.**
- **Option B — Many-to-many: a group may be assigned to many businesses, and a business may monitor many groups, within the same workspace.**

---

## Decision

**A Facebook Group may be assigned to multiple Businesses, and a Business may monitor multiple Facebook Groups, within the same Workspace (Option B).**

This is modelled by a `business_facebook_groups` join table with a unique `(business_id, facebook_group_id)` constraint, both sides scoped to one workspace.

---

## Consequences

**Positive**
- Matches reality and the domain model: a group's posts can be relevant to several businesses, so each business can independently monitor the shared group.
- Avoids duplicating the same group per business (a single validated group record is reused).
- Keeps assignment a thin, auditable link with no scanning/commenting capability — future matching simply reads these links.

**Negative / costs**
- Slightly more complex than one-to-one: the UI and API expose assignment on both sides (group → businesses, business → groups), and later matching must fan a post out to every business assigned to the group.
- Requires care that assignment never leaks across workspaces (enforced by workspace-scoped ownership checks and the `workspace_id` carried on the join row).

**Neutral**
- The join table carries a `status` for future enable/disable of an assignment without deletion, if needed.

---

## Alternatives Considered

- **Option A — one group per business.** Rejected: it would force the owner to add the same group multiple times (once per business), creating duplicate group records, duplicate validations, and duplicate scanning later — wasteful and error-prone, and inconsistent with "a post may match multiple businesses" (docs/06-domain-model.md). It does not simplify the genuinely important work (correct per-business attribution), which the many-to-many model handles cleanly.

---

## Guarantees affirmed

- Assignments live entirely within one workspace; cross-workspace assignment is impossible (ownership checks + workspace-scoped rows).
- A business is assigned a given group at most once (unique constraint).
- Assignment grants no scanning or commenting capability in this sprint — it only records monitoring intent for later sprints.
