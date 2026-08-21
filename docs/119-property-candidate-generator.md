# 119 — Property Candidate Generator

**Status:** SPRINT 016B — SHIPPED. `MatchRepository.listActivePropertiesForBusiness(businessId, workspaceId)`.

After a **Business MATCH**, the Property stage loads candidates with three hard
guarantees:

- **Only the matched Business's own Properties** (`p.businessId === businessId`).
- **Only `active`** Properties (never `inactive`, never `archived`).
- **Same Workspace only** (`p.workspaceId === workspaceId`) — no cross-workspace leak.

Anything else is invisible to the matcher. The candidate set is deterministic
(store order preserved). If the Business has no qualifying candidate the stage
still runs and records a single NO_PROPERTY_MATCH (it never fabricates one).
Covered by `apps/api/src/matching/property-pipeline.test.ts` (same-business,
inactive/archived excluded, cross-workspace isolation).
