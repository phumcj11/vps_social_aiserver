# 129 — Owner Match Explainability

**Status:** SPRINT 017 — SHIPPED. New owner-facing page `/settings/businesses/matches`.

Plain-Thai view over the existing `/property-matches` read model (no algorithm
change): for each Lead it shows what was requested, the recommended Property with
✓ Thai reasons (อยู่บางแสน · รองรับ 12 คน · มีสระส่วนตัว · …), and a collapsible
"ไม่เลือก" list with the mismatch reason (คนละพื้นที่ / รองรับคนได้ไม่พอ). Empty
state: "ยังไม่มีข้อมูลการจับคู่ — ระบบจะแสดงผลเมื่อมี Lead ที่ผ่านการวิเคราะห์".
Linked from the primary nav as "ผลการจับคู่".
