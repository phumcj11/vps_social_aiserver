# SPRINT 015 — Production Business & Property Management

- **Type:** Self-service production-data foundation (backend + persistence). Frontend UI + full Property-matching pipeline deferred to Sprint 016 (per Phase L).
- **Date:** 2026-08-20
- **Branch:** `feature/s015-production-business-property-management`
- **Base:** main `31f651285806274133e0c50efc785312eb0651ff` (tag `v1.0.0-production-pilot-readiness`)

## Goal

Let an operator/owner enter and maintain their own real production Business + Property data from the API/frontend — no Claude, SQL, or DB seeding for normal onboarding. No production Facebook write is activated.

## Shipped (backend + persistence + tests)

- **Domain module** `apps/api/src/business-property/` (pure + persisted): types, structured contacts + approved-channel filtering, policy inheritance, Business + Property readiness (wired to persisted data), deterministic Property matcher, property-aware draft context (no fabrication).
- **Persistence:** additive migration `0012` — `properties`, `property_policies`, `business_contacts`, `business_policies`, `business_audit_events`, and `businesses.environment` (default `test`). Self-contained `BusinessPropertyStore` (Drizzle + in-memory).
- **Workspace-safe API** (auth/CSRF/validation/audit/404): environment, policies, contacts, properties (CRUD + archive), property policy overrides, Business + Property readiness ([107](../107-business-property-api.md)).
- **Operations UI:** read-only Production Businesses & Properties note.
- **Tests:** 28 new (domain 21 + routes 7) — CRUD, ownership, cross-workspace 404, archive, duplicate code, multiple properties, contact validation + approved filtering, policy inheritance/override, Business + Property readiness, test-Business-never-ready, needs-active-Property, audit events, no-fabrication draft context. Full suite: 561 passing.
- **Docs:** [100](../100-production-business-model.md)–[109](../109-property-matching-foundation.md), ADR-036/037/038.

## Deferred to Sprint 016 (designed here)

- Frontend pages / onboarding wizard / tabs ([106](../106-business-property-frontend.md), [102](../102-business-onboarding.md)) — mobile-first UI.
- Full Property-matching PIPELINE integration (Opportunity→…→Property Match→Draft) and wiring the property-aware context into the AI `BusinessContextBuilder`. The deterministic matcher + draft-context builder + interfaces are implemented and tested; `AI_PROVIDER` stays `mock`.

## Compatibility (Phase U)

Additive-only migration; existing test Businesses and the Collector/Signals/Classifier/Business-Matching/Draft/Review/Action/Execution/Operations paths are unchanged (full suite green). No destructive rewrite.

## Acceptance

- [x] Business & Property as distinct persisted entities; multiple Properties per Business.
- [x] Structured contacts + policies with inheritance; approved-channel filtering.
- [x] Persisted Business + Property readiness; test Business never READY; needs active Property.
- [x] Workspace-safe CRUD API with audit; cross-workspace 404; no secrets.
- [x] Deterministic Property matcher + no-fabrication draft context (foundation).
- [x] Quality gates green; no Facebook write; no external AI; no Telegram. **No commit/push** (operator-controlled).
- [ ] Frontend UI + full matching pipeline — Sprint 016.
