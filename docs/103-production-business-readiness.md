# 103 — Production Business Readiness

**Status:** SPRINT 015. Evaluator: `evaluateBusinessReadiness` (`business-property/readiness.ts`), wired to persisted data via `GET /businesses/:id/readiness`. Builds on the Sprint-014 production readiness controls ([docs/93](93-production-business-readiness.md)).

Returns `READY` / `NOT_READY` with the exact missing requirements. A **test** Business is never READY.

## Required (all)

production environment · active status · real Business name · valid service area · ≥1 approved contact channel · contact channel owner approval · response tone · prohibited claims · pricing policy · availability policy · promotion policy · booking policy · responsible owner · operating hours · response SLA · **≥1 active Property**.

## Example

```
NOT_READY
missing: [ "availability policy", "contact channel owner approval", "at least one active Property" ]
```

The frontend displays each missing requirement separately. Nothing is fabricated — every requirement maps to stored data.
