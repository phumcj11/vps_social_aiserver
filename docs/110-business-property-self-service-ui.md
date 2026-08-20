# 110 — Business & Property Self-Service UI (Implementation)

**Status:** SPRINT 016 — SHIPPED (frontend scope). Implements the mobile-first,
Thai-first self-service management UI on top of the Sprint-015 backend
([106](106-business-property-frontend.md) design, [107](107-business-property-api.md) API).
No production Facebook write, no external AI, no Collector, no browser automation
is involved — the UI only reads and writes persisted Business/Property data via
the existing workspace-safe API.

## What shipped

An owner can now complete the entire onboarding and maintenance loop from the
browser — **no SQL, no seed scripts, no CLI, no Claude data entry**:

```
Dashboard → ธุรกิจของฉัน → เพิ่มธุรกิจ → (ข้อมูลธุรกิจ · ช่องทางติดต่อ · นโยบาย)
          → เพิ่มที่พัก → กรอกรายละเอียด (ที่ตั้ง · ความจุ · สิ่งอำนวยฯ · ราคา · เนื้อหา · นโยบายเฉพาะ)
          → ตรวจความพร้อมใช้งาน (READY / NOT_READY) → บันทึก
```

## Routes (Next.js App Router, all `'use client'`)

```
/settings/businesses                                     list + filters
/settings/businesses/new                                 create business
/settings/businesses/[id]                                detail (tabbed hub)
/settings/businesses/[id]/properties/new                 create property
/settings/businesses/[id]/properties/[propertyId]        property editor (tabbed)
```

Both property routes live under the existing `[id]` segment so the business id
param name stays `id` (Next.js forbids two differently-named dynamic segments at
one level).

## Business detail tabs

`ภาพรวม · ที่พัก · ข้อมูลธุรกิจ · ช่องทางติดต่อ · นโยบาย · ความพร้อมใช้งาน · ประวัติ`

- **ที่พัก** — list Properties (as cards), add, duplicate-as-template, archive.
- **ข้อมูลธุรกิจ** — name, description, service area, response tone, and the
  Test→Production environment switch.
- **ช่องทางติดต่อ** — typed contacts with the `enabled` /
  `approvedForDrafts` / `approvedForPublicResponse` / owner-verified toggles.
  Drafts only ever use enabled + approved channels.
- **นโยบาย** — the four policy enums (availability / pricing / promotion /
  booking) with Thai labels, prohibited claims, owner, hours, SLA.
- **ความพร้อมใช้งาน** — the real persisted readiness evaluator; each missing
  item is translated to Thai and points at the tab that fixes it.
- **ประวัติ** — audit trail from `GET /businesses/:id/audit`.

## Property editor tabs

`ข้อมูลทั่วไป · ที่ตั้ง · ความจุ · สิ่งอำนวยความสะดวก · ราคา · เนื้อหา · นโยบายเฉพาะ · ความพร้อม`

Policy-override selects default to “ใช้ตามธุรกิจ” (inherit); the readiness tab
shows the effective (resolved) policies so the owner sees what actually applies.

## Design system

`apps/web/app/settings/businesses/ui.tsx` holds the shared, dependency-free,
mobile-first building blocks (`Page`, `Section`, `Card`, `Field`, `Input`,
`Textarea`, `Select`, `Toggle`, `Button`, `Badge`, `StickyBar`, `Tabs`,
`ReadinessChecklist`) plus the Thai enum/readiness label maps. Everything is
stacked-by-default with card-rendered lists so there is no horizontal overflow at
360/390/768/1024/1440 widths; tap targets are ≥40px. Internal UUIDs are never
shown as the primary label.

## Backend touchpoints added this sprint

- `GET /businesses/:id/readiness` now also returns `environment` and
  `activePropertyCount` so the list/detail can badge without threading Property
  data through the core Store.
- `GET /businesses/:id/audit` — auth + ownership (404 cross-workspace), returns a
  safe projection (ISO timestamps, label/flag payloads only). See
  [108](108-business-property-audit.md).

## Deferred to a later turn (documented, not built)

The Property-match **pipeline** integration and Draft-context wiring remain
backend work and were explicitly out of this frontend turn:

- Property-match candidate/pipeline integration ([109](109-property-matching-foundation.md) is the pure foundation only).
- `property_matches` persistence migration.
- `BusinessContextBuilder` Property/no-fabrication wiring into real Draft generation.
- Human Review enhancement backend.

These do not block owner self-service data entry, which is fully functional.
