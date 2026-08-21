# 120 — Property Match Ranking

**Status:** SPRINT 016B — SHIPPED. Pure module
`apps/api/src/matching/property-selection.ts` (`property-rules-v1`). NO embeddings,
NO vector DB, NO external AI, NO inferred facts — deterministic attribute logic.

## Requirement parsing

`parsePropertyRequirement(message, knownAreas)` extracts, deterministically:
area, accommodation type, guests, bedrooms, private-pool / beach / river needs,
and requested amenities. **Area** is recognised from the areas owners actually
serve (`knownAreas`) ∪ a small seed lexicon of common Thai tourist areas — so a
requested area a Business does not serve still registers (→ `AREA_MISMATCH`)
without a hard-coded geography database.

## Per-candidate evaluation

`evaluatePropertyCandidate` reuses the Sprint-015 `matchProperty` foundation for
hard constraints and adds soft requested-amenity coverage. Hard mismatch/missing
(`AREA_MISMATCH`, `CAPACITY_MISMATCH`, `BEDROOMS_MISMATCH`,
`PRIVATE_POOL_MISSING`, `BEACH_MISSING`, `RIVER_MISSING`) disqualifies; any
`*_MATCH` code (area, capacity, bedrooms, type, pool/beach/river, amenity) is a
positive signal. A **missing requested amenity is soft** (`AMENITY_MISSING`) — a
warning, never a disqualifier.

## Deterministic ranking (winner selection)

Among MATCH candidates, strict priority order (higher wins):

1. area exact
2. requested type exact
3. capacity fit (snuggest sufficient)
4. requested feature/amenity coverage
5. **stable tie-break on Property id** (never random)

No qualifier ⇒ `NO_MATCH` with reason `NO_PROPERTY_MATCH`. See
[ADR-041](adr/ADR-041-deterministic-property-selection.md).
