# ADR-038 — Persisted Business & Property Readiness

**Status:** Accepted (SPRINT 015). **Date:** 2026-08-20.

## Context

Production readiness must reflect real, self-service-entered data — not a hand-seeded flag — and gate production comments to genuinely-configured Businesses.

## Decision

Wire the Sprint-014 production readiness concept to PERSISTED data. `evaluateBusinessReadiness` loads environment + profile + contacts + policies + active-Property count and returns READY/NOT_READY with exact missing items; `evaluatePropertyReadiness` evaluates against RESOLVED (inherited) policies. A test Business can never be READY; a production Business needs ≥1 active Property.

## Consequences

- Owners drive readiness entirely from the frontend/API — no SQL or manual seeding.
- Each missing requirement is surfaced separately, so the path to READY is explicit.
- Readiness composes with the Sprint-014 write-window + one-shot authorization gates; being READY does not enable any write.
