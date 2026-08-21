# 127 — Policy Guidance UX

**Status:** SPRINT 017 — SHIPPED. Backend enums unchanged; each option now shows
plain Thai + a one-line effect + a recommended default.

Examples:
- Availability `ต้องยืนยันกับเจ้าของ` (แนะนำ) — "ระบบจะไม่บอกว่าห้องว่างทันที แต่สามารถชวนลูกค้าติดต่อเพื่อตรวจสอบได้"
- Pricing `ราคาเริ่มต้น` (แนะนำ) — "ระบบพูดได้เฉพาะราคาเริ่มต้นที่คุณกรอกไว้"
- Promotion `เฉพาะโปรโมชั่นที่อนุมัติ` (แนะนำ) — "ระบบจะไม่สร้างโปรโมชั่นขึ้นเอง"
- Booking `LINE` (แนะนำ) — "แนะนำให้ลูกค้าติดต่อผ่าน LINE ที่คุณอนุมัติไว้"

The recommended option is ordered first and marked "(แนะนำ)"; the selected
option's effect is shown beneath the dropdown. Readiness-required operational
fields (ผู้รับผิดชอบ, เวลาทำการ, SLA) are kept **primary** with a
"จำเป็นสำหรับความพร้อมใช้งาน" hint; only the truly-optional escalation note is
under "ข้อมูลเพิ่มเติม (ไม่บังคับ)".
