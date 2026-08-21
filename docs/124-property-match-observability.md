# 124 — Property Match Observability

**Status:** SPRINT 016B — SHIPPED. `GET /property-matching/funnel`
(auth + workspace-scoped) returns the aggregate read model
(`store.getMatchingFunnelCounts`):

- `businessMatch` — { MATCH, NO_MATCH }
- `propertyMatch` — { MATCH, NO_MATCH }
- `candidatesEvaluated` — total active Properties evaluated
- `propertiesReceivingMatches` — distinct Properties selected (MATCH)
- `businessMatchWithNoPropertyMatch` — Business MATCH but Property NO_MATCH (the gap)
- `topNoMatchReasons` — tally of NO_MATCH reason codes, most-common first

No heavy monitoring stack. Any bounded caps (top-N reasons, list limits) are
explicit. Aggregates are workspace-scoped and serialise only labels/counts (no
secrets). Also exposed to the web client as `api.getPropertyMatchingFunnel()`.
