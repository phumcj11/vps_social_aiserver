# 130 — Review One-Screen Decision

**Status:** SPRINT 017 — SHIPPED. The reviewer answers all 7 questions without
leaving the page, then decides APPROVE / EDIT / REJECT (unchanged; no auto-approval).

The `/reviews/:id` read model + page surface:

1. ลูกค้าต้องการอะไร — opportunity/signal message
2. Business ไหน — matched Business
3. Property ไหน — selected Property (or NO_PROPERTY_MATCH)
4. ทำไมเลือก — deterministic Thai reasons
5. อะไรยังไม่ยืนยัน — reviewer warnings
6. จะตอบอะไร — the draft content
7. **Contact ไหน** — the approved contact(s) the draft may use (SPRINT 017 addition:
   `approvedContacts`, only enabled && approvedForDrafts, with ✓ อนุญาตใช้ใน Draft /
   ✓ ตอบสาธารณะ / ✓ เจ้าของยืนยันแล้ว; "ยังไม่มีช่องทางติดต่อที่ได้รับอนุญาต" if none).

The deterministic Mock draft now composes from persisted Property facts + the
approved contact (still no fabricated availability/price/promotion/amenity).
