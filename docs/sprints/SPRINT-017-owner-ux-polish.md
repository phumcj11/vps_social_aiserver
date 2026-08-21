# SPRINT 017 — Owner UX Polish & Guided Onboarding

**Base:** main `67621c20` / tag `v1.3.0-property-matching`.
**Branch:** `feature/s017-owner-ux-polish`.
**Goal:** make a non-technical accommodation owner able to configure the product
with minimal assistance (target Overall Owner UX = 4/5). Targeted UX sprint — NO
new major features, NO matching-algorithm change, NO backend redesign, NO
Facebook/AI/Telegram/production writes.

## Delivered

- **Guided onboarding** ([125]): pure `computeOnboarding()` + 7-step checklist with
  progress bar and next-step CTA on the Business hub; onboarding ≠ Production READY.
- **Property type Thai labels** ([J/C]): one shared `PROPERTY_TYPE_LABELS` +
  common-first `PROPERTY_TYPE_ORDER`; used in forms, cards, and lists (enum kept internally).
- **Review contact** ([130]): `approvedContacts` added to the review read model +
  UI (only enabled && approvedForDrafts; hides unapproved/disabled).
- **Contact approval UX** ([126]): plain-language Thai labels + helper text +
  recommended verify-first flow (semantics unchanged).
- **Policy guidance** ([127]): per-option Thai description + recommended default;
  readiness-required operational fields kept primary (only escalation is advanced).
- **Readiness click-to-fix** ([128]): every missing item links to the fixing tab.
- **Owner match summary** ([129]): new `/settings/businesses/matches` plain-Thai page.
- **Mock draft quality** ([130]): deterministic draft now composes from persisted
  Property facts (name, capacity, amenities incl. karaoke/bbq, starting price) +
  the approved contact — still no fabricated availability/price/promotion/amenity;
  "ทาง <Name>" spacing fixed.
- **Empty states / save feedback** (Phase M/N): Thai empty states for businesses,
  properties, contacts, matches; `SaveStatus` (กำลังบันทึก… / บันทึกเรียบร้อย /
  กรุณาตรวจสอบข้อมูล / ไม่สามารถบันทึกได้).
- **Nav** (Phase J): owner-facing links Thai-ified; "ผลการจับคู่" + "รายการรอตรวจ" added.

## Tests

+20 (617 total, all green): web `owner-ux.test.ts` (onboarding progress, readiness
!= onboarding, property-type labels, click-to-fix routing, policy/contact guidance),
api `mock-draft-property.test.ts` (property-aware deterministic draft, no
fabrication), review approved-contact display/hide.

## Runtime validation (synthetic persona คุณเมย์)

Full journey via the real API: business → contact → policies → Villa A/B/C →
Production READY; matching → **Villa B MATCH** (A capacity-fail, C area-fail); mock
draft = "…Villa B ของ Demo Bangsaen Pool Villa รองรับได้สูงสุด 15 ท่าน และมี
สระส่วนตัวและคาราโอเกะค่ะ ราคาเริ่มต้น 9500 บาท …ผ่าน LINE OA @demo-bangsaen…";
Review answers all 7 questions incl. the contact. Synthetic data deleted; Pilot
job untouched; no Facebook/AI/Telegram.

## Quality gates

lint 0 · typecheck 0 · test 617 · build pass · format:check clean · doctor OK ·
db:status 14 (no new migration — UX-only sprint).
