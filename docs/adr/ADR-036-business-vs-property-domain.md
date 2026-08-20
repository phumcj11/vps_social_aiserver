# ADR-036 — Business vs Property Domain Separation

**Status:** Accepted (SPRINT 015). **Date:** 2026-08-20.

## Context

Accommodation owners operate one brand (Business) with many distinct properties (villas/homes). Treating them as one entity would force duplicated data and make Property-level matching, pricing, and readiness impossible.

## Decision

Model **Business** and **Property** as distinct first-class entities. A Business has 0..N Properties; a Property belongs to exactly one Business and one Workspace. Properties are a new table (`properties`) with normalized queryable columns + a JSON `details` blob; Business gains an additive `environment` (test/production) column. Existing test Businesses are untouched (additive, non-destructive migration `0012`).

## Consequences

- Property-level location/capacity/amenity data enables deterministic Property matching ([109](../109-property-matching-foundation.md)) and per-Property readiness.
- A Business can be `NOT_READY` until it has ≥1 active Property; a test Business can never be production-ready.
- No destructive change to the existing Business/Profile/Matching pipeline; the new domain is a self-contained module + store.
