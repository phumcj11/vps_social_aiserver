# 102 — Business Onboarding (Wizard)

**Status:** SPRINT 015 — flow DESIGN; backend + persistence + readiness in place. The guided UI ships in Sprint 016 (frontend deferred per the sprint scope).

A guided, resumable Production Business setup flow. Every step maps to a persisted, workspace-safe API ([107](107-business-property-api.md)); nothing enables a Facebook write.

## Steps

1. **Business information** — name, type, description, service area (`POST /businesses`, `PATCH /businesses/:id`, `PATCH /businesses/:id/profile`).
2. **Contact channels** — structured PHONE/LINE/FACEBOOK_PAGE/WEBSITE/EMAIL (`POST /businesses/:id/contacts`).
3. **Business policies** — availability / pricing / promotion / booking / prohibited claims / owner / hours / SLA (`PUT /businesses/:id/policies`).
4. **Add first Property** — `POST /businesses/:id/properties`.
5. **Property details** — location, capacity, amenities, pricing, content (`PATCH …/properties/:pid`).
6. **Matching preferences** — Business matching rules + Property matching config (see [109](109-property-matching-foundation.md)).
7. **Facebook Group assignments** — view/assign (no auto-join, no writes).
8. **Production Readiness review** — `GET /businesses/:id/readiness` + per-Property readiness.

**Save Draft / Continue Later** — every step persists immediately; a Business/Property is simply `NOT_READY` until required fields pass validation. No step auto-marks READY, and nothing is fabricated.
