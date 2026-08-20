# 104 — Property Readiness

**Status:** SPRINT 015. Evaluator: `evaluatePropertyReadiness` (`business-property/readiness.ts`) via `GET /businesses/:id/properties/:pid/readiness`.

A Property inherits Business policies unless it overrides them ([policies](105-business-contact-policy.md)); readiness is evaluated against the RESOLVED (effective) policies.

## Required

active status · property name · property type · service location (area or province) · maximum guests · meaningful description (≥10 chars) · booking policy (own or inherited) · pricing policy (own or inherited) · availability policy (own or inherited) · prohibited claims (own or inherited).

## Inheritance example

```
Business availability policy: MANUAL_CONFIRMATION
Property availability override: (none) → inherits MANUAL_CONFIRMATION
```

The readiness response includes `effectivePolicies` with `inheritedFields` / `overriddenFields` so the operator sees exactly where each policy came from. Data is never duplicated — a null override means "inherit".
