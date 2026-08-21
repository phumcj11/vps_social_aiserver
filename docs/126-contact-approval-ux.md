# 126 — Contact Approval UX

**Status:** SPRINT 017 — SHIPPED. Backend semantics unchanged; labels made
plain-language for non-technical owners.

## Plain-language labels (Thai)

| Concept (internal) | Owner label |
|---|---|
| `enabled` | เปิดใช้งานช่องทางนี้ |
| `ownerVerified` | ฉันยืนยันว่าข้อมูลนี้ถูกต้อง |
| `approvedForDrafts` | ให้ระบบนำช่องทางนี้ไปใส่ในข้อความตอบได้ |
| `approvedForPublicResponse` | อนุญาตให้แสดงช่องทางนี้ในคำตอบสาธารณะ |

Each toggle carries a one-line helper. The add-contact card states the
recommended flow: **1) กรอกช่องทาง → 2) ยืนยันว่าถูกต้อง → 3) เลือกว่าจะให้ระบบใช้ที่ไหน**.
Contacts are never auto-approved. Only `enabled && approvedForDrafts` channels
reach a Draft — enforced in the draft context and shown in Human Review
([130](130-review-one-screen-decision.md)).
