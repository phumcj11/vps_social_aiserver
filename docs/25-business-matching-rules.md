# 25 — Business Matching Rules

**Document status:** SPRINT 003 — Business Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

> **Important:** Business Matching Rules are **NOT AI**. They are **deterministic rules** a business owner defines to describe what it can serve (locations, keywords, guest counts, budgets, facilities, etc.). **AI matching comes in a later sprint** (docs/09-ai-design.md). This sprint only stores and serves the rules.

Each business owns many matching rules.

---

## Fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | id | UUID. |
| `businessId` | id | Owning business. |
| `ruleType` | string | One of the allowed types below. |
| `ruleValue` | string | The value for the rule (e.g. a keyword, a province name, a number as text). Required. |
| `priority` | integer | Higher = considered first. Must be an integer. |
| `status` | string | `active` (default) or `disabled`. |
| `createdAt` / `updatedAt` | timestamps | Safe timestamps. |

Rules are listed **priority descending** (then oldest first).

---

## Allowed rule types

A fixed, deterministic set:

- `province`
- `district`
- `keyword`
- `guest_count`
- `budget`
- `facility`
- `custom`

Any other value is rejected with `400`.

---

## API

| Method & path | Purpose |
| ------------- | ------- |
| `GET /businesses/:id/matching-rules` | List the business's rules (priority desc). |
| `POST /businesses/:id/matching-rules` | Create a rule. |
| `PATCH /businesses/:id/matching-rules/:ruleId` | Update type/value/priority/status. |
| `DELETE /businesses/:id/matching-rules/:ruleId` | Delete a rule (hard delete — allowed for rules). |

All require authentication; mutations pass the CSRF/origin guard. Ownership is verified via user → workspace → business, and the rule must belong to that business (else `404 rule_not_found`).

---

## Validation

- `ruleType`: required, must be one of the allowed types.
- `ruleValue`: required, 1–255 chars.
- `priority`: **integer** (0–1,000,000); non-integers (e.g. `1.5`) are rejected.
- `status`: one of `active`, `disabled`.

---

## UI

The **Matching Rules** tab of the Business Detail page provides CRUD: a form with a rule-type dropdown (the allowed types), a value field, and an integer priority; a table listing rules with delete. The tab notes clearly that these are deterministic rules, not AI, and that AI matching comes later.

---

## Deterministic by design

These rules are structured data with no model involvement. A future sprint's AI-assisted matching may *read* them as signals, but the rules themselves are authored by humans and evaluated deterministically. Storing them now lets the product capture business intent before any AI exists.
