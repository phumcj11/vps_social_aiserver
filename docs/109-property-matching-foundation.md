# 109 — Property Matching Foundation

**Status:** SPRINT 015 — deterministic matcher + interfaces. Wiring into the Opportunity→…→Draft PIPELINE is **Sprint 016** (per the sprint's Phase L: implement the model + matching-ready interfaces now, defer pipeline integration if it would destabilize existing Business Matching). Existing Business Matching is unchanged.

## Desired future pipeline

```
Opportunity → Business Candidate → Business Match → Property Candidate → Property Match → Draft
```

## Matcher (implemented, pure)

`matchProperty(property, requirement)` (`business-property/property-matcher.ts`) — **NO embeddings, NO vector DB, NO semantic AI**. Deterministic on area, accommodation type, guest capacity, bedrooms, and location/amenity features, with recorded reasons:

```
MATCH
reasons: [ "AREA_MATCH: บางแสน", "CAPACITY_MATCH: 12 <= 15", "PRIVATE_POOL_MATCH" ]
```

A required feature the property lacks (wrong area, capacity exceeded, missing required pool/beach/river) disqualifies it; a match needs ≥1 positive signal and no disqualifier.

## Draft context

`buildPropertyDraftContext` (`business-property/draft-context.ts`) assembles a safe context with precedence **Property facts → Business policy → Business profile → generic fallback**. It NEVER infers availability, price, promotion, amenity, or capacity unless stored data explicitly supports it, and lists `mustNotClaim`. Wiring this into the AI `BusinessContextBuilder` is Sprint 016; `AI_PROVIDER` stays `mock`.
