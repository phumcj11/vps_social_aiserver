# ADR-040 — Property Match Persistence in the Core Store

**Status:** Accepted (Sprint 016B).

## Context

After a Business MATCH, a deterministic Property stage must persist which
Property was selected (or that none was), workspace-safely and idempotently, and
be joinable with `business_matches` for the operations funnel. Properties live in
the separate `BusinessPropertyStore`; Business matches live in the core `Store`.

## Decision

Persist `property_matches` in the **core Store** (schema + Drizzle + in-memory),
mirroring `business_matches`, and give the `MatchRepository`/`AiDraftRepository`/
`ReviewRepository` an injected `BusinessPropertyStore` only for **reading**
Properties/policies/contacts. One deterministic result per Business Match,
enforced by a unique index on `business_match_id`. Property matcher versioning
(`property-rules-v1`) is stored per row, independent of the Business matcher
version.

## Consequences

- Funnel queries join `business_matches` + `property_matches` in one store — clean
  aggregation (`getMatchingFunnelCounts`).
- Reads of Property facts reuse the tested `BusinessPropertyStore` — no duplicate
  mapping.
- Migration `0013` is additive only; Pilot data untouched.
