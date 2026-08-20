# 107 — Business & Property API

**Status:** SPRINT 015. Routes: `apps/api/src/business-property/routes.ts`. All routes require auth + workspace ownership; writes require CSRF; cross-workspace access returns **404** (existence never leaked). No secrets are returned.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| PATCH | `/businesses/:id/environment` | set `test` / `production` |
| GET/PUT | `/businesses/:id/policies` | get / upsert Business policies |
| GET/POST | `/businesses/:id/contacts` | list / create contact channel |
| PATCH | `/businesses/:id/contacts/:cid` | update / approve / verify a channel |
| GET/POST | `/businesses/:id/properties` | list / create Property |
| GET/PATCH | `/businesses/:id/properties/:pid` | detail / update |
| POST | `/businesses/:id/properties/:pid/archive` | archive (never hard-delete) |
| PUT | `/businesses/:id/properties/:pid/policies` | set Property policy overrides |
| GET | `/businesses/:id/readiness` | Business readiness verdict |
| GET | `/businesses/:id/properties/:pid/readiness` | Property readiness + effective policies |

Business/Profile/Knowledge/Matching-Rule/Group-Assignment CRUD continue via the existing `/businesses` routes. Inputs are zod-validated; pagination applies where lists can grow; every write emits an audit event ([108](108-business-property-audit.md)).

## Persistence

A self-contained `BusinessPropertyStore` (Drizzle at runtime, in-memory for tests) backs Properties, Contacts, Business/Property policies, environment, and audit — see `business-property/store.ts`.
