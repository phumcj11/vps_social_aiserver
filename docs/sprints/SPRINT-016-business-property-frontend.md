# SPRINT 016 — Business & Property Frontend (Self-Service UI)

**Base:** main `fe04cdc4` / tag `v1.1.0-business-property-foundation`.
**Scope (operator-chosen):** the mobile-first, Thai-first Business + Property
self-service management UI on the existing Sprint-015 APIs, verified via
`pnpm build` + component/route tests. The Property-match **pipeline** integration
and Draft-context wiring were explicitly **deferred** to a later turn.

**Safety:** No production Facebook write. No Facebook contact. No Chromium. No
Collector. No `submit_once`. No external AI. No Telegram. Pilot execution state
untouched (Action Job `2a85a0dd…` still `succeeded`). All execution flags remain
in their safe state (`GLOBAL_KILL_SWITCH=true`, `AI_ENABLED=false`,
`TELEGRAM_ENABLED=false`, `N8N_ENABLED=false`).

## Delivered

- Migration `0012` applied to the dev DB (13 migrations total; 3 businesses
  preserved as `test`; Pilot job intact).
- Five Next.js App Router pages (all `'use client'`): business list (+filters),
  create business, tabbed business detail hub, create property, tabbed property
  editor. See [110](../110-business-property-self-service-ui.md).
- Shared mobile-first design system + Thai label maps in
  `apps/web/app/settings/businesses/ui.tsx`.
- Web API client (`apps/web/lib/api.ts`): full Business/Property/contacts/
  policies/readiness/audit types + methods.
- Backend: readiness endpoint extended with `environment` + `activePropertyCount`;
  new `GET /businesses/:id/audit` (auth + ownership + safe projection).
- `ธุรกิจของฉัน` entry added to the primary nav.
- Tests: 2 new API route tests (audit projection + ownership 404; readiness
  environment/count fields) → **563 total, all green**.

## Verification

`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (563), and
`pnpm build` (all 5 new routes compile) pass. `pnpm doctor` passes (2 pre-existing
environment warnings). No live browser UX pass (headless environment) — coverage
is build + route tests.

## Deferred (documented)

Property-match pipeline integration, `property_matches` persistence migration,
`BusinessContextBuilder` Draft-context wiring, and the Human Review enhancement
backend. None block owner self-service data entry.
