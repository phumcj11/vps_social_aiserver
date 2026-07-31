# 22 — Business Foundation

**Document status:** SPRINT 003 — Business Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

The **Business is the core of the product** (docs/06-domain-model.md, [project-principles.md](project-principles.md) — Business First). This sprint implements the Business domain: businesses, their profile, structured knowledge, and deterministic matching rules — with strict workspace ownership. **No Facebook, AI, Playwright, Telegram, or n8n** exists yet.

Realises the objective: **one user → one workspace → multiple businesses.**

---

## Domain shape

```
User → owns → Workspace → owns → many Businesses
                                   └─ owns → one Business Profile
                                   └─ owns → many Business Knowledge items
                                   └─ owns → many Business Matching Rules
```

- A workspace owns many businesses ([ADR-004](adr/ADR-004-multiple-businesses-per-customer.md): multiple businesses per customer).
- A business owns exactly one profile, and many knowledge items and matching rules.
- Businesses are **never deleted** — soft `status` only. Knowledge and matching rules **may** be deleted.

---

## Rules

- **Ownership:** every business belongs to exactly one workspace; every profile/knowledge/rule belongs to exactly one business.
- **Unique slug:** each business slug is globally unique (generated from the name, collision-resolved).
- **Unique name per workspace:** a business name is unique within its workspace (DB unique index on `(workspace_id, name)`), not globally.
- **Soft status:** `businesses.status` defaults to `active`; deletion of businesses is not supported.

---

## API

All endpoints require authentication; mutations also pass the CSRF/origin guard ([21-session-security.md](21-session-security.md)). Ownership is verified on **every** endpoint via the chain **user → workspace (by owner) → business → sub-resource**. Cross-user access returns **404** (never 403), so the existence of another user's data is never leaked.

| Method & path | Purpose |
| ------------- | ------- |
| `POST /businesses` | Create a business (requires `name` + `category`; seeds the profile). |
| `GET /businesses` | List the workspace's businesses. |
| `GET /businesses/:id` | Get one owned business. |
| `PATCH /businesses/:id` | Rename and/or change status. |
| `GET/PATCH /businesses/:id/profile` | Read/update the profile ([23](23-business-profile.md)). |
| `GET/POST /businesses/:id/knowledge` | List/create knowledge ([24](24-business-knowledge.md)). |
| `PATCH/DELETE /businesses/:id/knowledge/:knowledgeId` | Update/delete a knowledge item. |
| `GET/POST /businesses/:id/matching-rules` | List/create matching rules ([25](25-business-matching-rules.md)). |
| `PATCH/DELETE /businesses/:id/matching-rules/:ruleId` | Update/delete a rule. |

Creating a business requires the user to already have a workspace; otherwise `409 workspace_required`. A duplicate name in the workspace returns `409 business_name_taken`.

---

## Web UI

Simple, production-conscious pages (no design system, no Facebook UI):

- **Businesses List** (`/businesses`) — list, create (name + category), open, see status; prompts to create a workspace first if needed.
- **Business Detail** (`/businesses/[id]`) — tabs for **Profile**, **Knowledge**, **Matching Rules**.
  - **Profile** — Business Name, Category, Description, Selling Points, Service Area, Contact, Response Tone, Prohibited Claims.
  - **Knowledge** — CRUD (title, content, status).
  - **Matching Rules** — CRUD (rule type, value, priority, status).

All pages verify the session (`GET /auth/me`) and redirect to `/login` if unauthenticated.

---

## Data model summary

Four tables via Drizzle migration `0001` (see [20-database-foundation.md](20-database-foundation.md)):
`businesses`, `business_profiles`, `business_knowledge`, `business_matching_rules`. UUID PKs, safe timestamps, soft status. Detail per entity in [23](23-business-profile.md), [24](24-business-knowledge.md), [25](25-business-matching-rules.md).

---

## Explicitly NOT in this sprint

Facebook (login/groups), Playwright, AI (matching or drafting), Telegram, n8n, opportunity discovery, comment draft/approval/execution, billing, subscriptions, teams, and multiple workspace users. Business Knowledge is **structured data, not AI memory**; Matching Rules are **deterministic, not AI**. AI consumes these in a later sprint.
