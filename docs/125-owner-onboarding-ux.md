# 125 — Owner Onboarding UX

**Status:** SPRINT 017 — SHIPPED. A guided onboarding checklist layered onto the
existing tabbed Business hub (NOT a separate wizard).

## Checklist (Business hub → ภาพรวม)

`computeOnboarding()` (pure, unit-tested) derives progress from real persisted
data and renders a 7-step checklist with a progress bar
(`ตั้งค่าธุรกิจของคุณ · X จาก 7 ขั้นตอนเสร็จแล้ว · ██████░░░░ NN%`) and a
"ขั้นตอนถัดไปที่แนะนำ" card:

1. ข้อมูลธุรกิจ — name + service area + response tone
2. ช่องทางติดต่อ — ≥1 **approved** (enabled && approvedForDrafts) contact
3. นโยบายการตอบลูกค้า — policies saved
4. เพิ่มที่พักอย่างน้อย 1 แห่ง — ≥1 active Property
5. ตรวจข้อมูลที่พัก — ≥1 active Property with area + max guests
6. Matching / กลุ่ม — business active + ≥1 active Property (eligible to match)
7. ตรวจสอบความพร้อม — Production READY (the readiness evaluator)

Each incomplete step has a "ตั้งค่าตอนนี้" CTA that switches to the correct tab.

## Onboarding ≠ Production READY

Step 7 simply **surfaces** the readiness evaluator (`ready === true`). The
evaluator stays authoritative — the checklist never claims readiness on its own.
Save-and-continue-later works because every tab persists independently.
See [110](110-business-property-self-service-ui.md), [SPRINT-017](sprints/SPRINT-017-owner-ux-polish.md).
