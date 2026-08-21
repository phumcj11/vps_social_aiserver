# 128 — Readiness Click-to-Fix

**Status:** SPRINT 017 — SHIPPED. Every NOT_READY requirement is actionable.

The readiness checklist renders each missing item as a card with: the Thai
requirement, a "why it matters" line, and a button that navigates to the tab that
resolves it (`readinessTab()` maps each requirement → tab). Examples:

- ✗ ยังไม่มีช่องทางติดต่อที่อนุมัติ → **[ไปตั้งค่าช่องทางติดต่อ]**
- ✗ ที่พักที่เปิดใช้งานอย่างน้อย 1 แห่ง → **[ไปที่พัก]**
- ✗ นโยบายห้องว่าง → **[ไปตั้งค่านโยบาย]**

Routing is unit-tested. The evaluator remains the single source of truth; the UI
only makes its output navigable.
