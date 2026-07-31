# 33 — Business ↔ Group Assignment

**Document status:** SPRINT 005 — Facebook Groups Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

A Facebook Group may be assigned to **multiple Businesses**, and a Business may monitor **multiple Facebook Groups** — a many-to-many relationship **within a single workspace** ([ADR-008](adr/ADR-008-business-to-group-many-to-many.md)). This mirrors the domain model: a group's posts may be relevant to more than one of an owner's businesses.

---

## Model

`business_facebook_groups` links a `business_id` to a `facebook_group_id` (the internal group row id), carrying the `workspace_id` to keep every assignment inside one workspace.

- **Unique** `(business_id, facebook_group_id)` — a business is assigned a given group at most once.
- Foreign keys reference `businesses.id` and `facebook_groups.id`.
- `status` defaults to `active`.

---

## Rules

- Both the group and the business must belong to the caller's workspace; otherwise the operation returns `404` (existence never leaked across workspaces).
- Assigning the same group to the same business twice returns `409 assignment_exists`.
- Unassignment is idempotent (removing a non-existent assignment is a no-op success).
- Assignment carries no scanning or commenting capability — it only records which businesses monitor which groups for future sprints.

---

## API

| Method & path | Purpose |
| ------------- | ------- |
| `GET /facebook/groups/:id/businesses` | Businesses assigned to a group. |
| `POST /facebook/groups/:id/businesses` | Assign `{ businessId }` (201). |
| `DELETE /facebook/groups/:id/businesses/:businessId` | Unassign. |
| `GET /businesses/:id/facebook-groups` | Groups assigned to a business. |

Each assignment/unassignment records an audit event (`facebook_group_assigned_to_business` / `facebook_group_unassigned_from_business`) with only the group and business ids.

---

## UI

- **`/settings/facebook/groups`** — a per-group panel lists assigned businesses and lets the owner assign (from the workspace's businesses) or unassign.
- **Business detail → Facebook Groups tab** — lists the business's assigned groups and lets the owner assign/unassign from the workspace's groups.

---

## Why many-to-many

The product's core is the Business (docs/06-domain-model.md). A single group frequently contains leads for several of an owner's businesses, and a business is best served by monitoring several groups. A many-to-many assignment is the smallest model that captures this faithfully — see [ADR-008](adr/ADR-008-business-to-group-many-to-many.md).
