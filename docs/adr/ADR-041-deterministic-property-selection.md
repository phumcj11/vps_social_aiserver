# ADR-041 — Deterministic Property Selection

**Status:** Accepted (Sprint 016B).

## Context

The Property matcher must be explainable, reproducible, and safe — no embeddings,
no vector DB, no external AI, no inferred facts — yet still choose one Property
when several qualify, and correctly reject an out-of-area request.

## Decision

Pure attribute logic in `property-selection.ts`. Hard constraints (area, capacity,
bedrooms, explicit pool/beach/river) disqualify; requested amenities and type are
soft signals. Among MATCH candidates, rank by a strict tuple —
area-exact → type-exact → capacity-fit → coverage → **stable id tie-break** — so
selection is never random. Requirement area recognition unions the areas owners
serve with a small, extensible Thai seed lexicon, avoiding both a hard-coded
geography DB and the failure mode where a not-served area goes undetected.

## Consequences

- Every decision is reproducible and carries human-readable reason codes.
- The Sprint-015 `matchProperty` foundation is reused unchanged; the wiring layer
  computes the pipeline decision from reason codes (so area+capacity alone can
  match, which the foundation's suffixed-reason gate would otherwise miss).
- New areas self-extend from owner data; the seed lexicon only bootstraps.
