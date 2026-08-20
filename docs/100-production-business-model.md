# 100 — Production Business Model

**Status:** SPRINT 015. Types: `apps/api/src/business-property/types.ts`. ADR: [ADR-036](adr/ADR-036-business-vs-property-domain.md).

A **Business** (brand/owner) is distinct from a **Property** (accommodation). A Business has 0..N Properties; a Property belongs to exactly one Business and one Workspace.

```
Workspace → Customer/Owner → Business/Brand → 0..N Properties
```

## Environment (test vs production)

Every Business carries `environment` = `test` (default) or `production`. **A test Business can NEVER satisfy Production readiness** and is never used for a production comment. The column is additive (`businesses.environment`, default `'test'`) — existing test Businesses are untouched.

## Business fields

- **Basic:** display/legal name, internal name, business type, brand name, status (`active`/`inactive`/`archived`), environment, description.
- **Service:** primary province, primary district/area, service areas, categories (in the existing Business Profile: `serviceArea`, `category`).
- **Contacts:** structured channels — [105](105-business-contact-policy.md).
- **Operations & policies:** operating hours, response SLA, responsible owner, tone, availability/pricing/promotion/booking policies, cancellation info, prohibited claims, escalation — persisted in `business_policies` ([105](105-business-contact-policy.md)).

## Persistence

Reuses `businesses` + `business_profiles` (name, category, serviceArea, responseTone, description, prohibited claims) and adds `business_policies`, `business_contacts`, `properties`, `property_policies`, `business_audit_events`. See [107](107-business-property-api.md) for the API and [108](108-business-property-audit.md) for audit.
