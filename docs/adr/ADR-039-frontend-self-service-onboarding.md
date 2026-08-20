# ADR-039 — Frontend Self-Service Onboarding as a Tabbed Hub

**Status:** Accepted (Sprint 016).

## Context

Sprint 015 shipped the Business/Property backend, persistence, and workspace-safe
API but deferred the frontend. Sprint 016 must let an owner enter and maintain
their own **production** data entirely from the browser — no SQL, seed scripts,
CLI, or Claude data entry — on mobile-first, Thai-first screens. The domain is
large (business profile, typed contacts, four policy enums with per-property
overrides, multi-field properties, readiness).

## Decision

1. **Tabbed detail hub, not a linear wizard, as the source of truth.** Creating a
   business is a minimal form (`/settings/businesses/new`) that immediately routes
   into `/settings/businesses/[id]`, whose tabs (ข้อมูลธุรกิจ · ช่องทางติดต่อ ·
   นโยบาย · ที่พัก · ความพร้อมใช้งาน · ประวัติ) are each independently editable and
   re-visitable. Onboarding and ongoing maintenance use the same screens, so there
   is no throwaway wizard state and readiness is always live.
2. **Property routes nest under the existing `[id]` segment.** `[id]/properties/new`
   and `[id]/properties/[propertyId]` keep the business-id param named `id`
   (Next.js forbids two differently-named dynamic segments at one directory level).
3. **A dependency-free shared UI module** (`ui.tsx`) provides mobile-first,
   stacked, card-based primitives + Thai enum/readiness label maps rather than
   pulling in a design library, keeping bundle size small and layout overflow-free
   at 360–1440px.
4. **Readiness drives the UI, never the reverse.** The persisted evaluator is the
   single authority; each missing item is translated to Thai and linked to the tab
   that fixes it. The UI never fabricates or infers readiness client-side.

## Consequences

- Owners get one coherent, resumable surface; partially-configured businesses stay
  `test` and are never production-ready until they pass the real evaluator.
- Two small backend additions were required (readiness `environment`/
  `activePropertyCount`, `GET …/audit`) — both additive and workspace-safe.
- The Property-match pipeline and Draft-context wiring remain backend work
  (deferred), independent of this UI.
