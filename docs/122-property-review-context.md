# 122 — Property Review Context

**Status:** SPRINT 016B — SHIPPED. The Human Review read model surfaces the
Property-match context; the three human actions are unchanged
(**APPROVE / EDIT / REJECT**) and there is NO auto-approval and NO Execute-Now.

## Review detail additions (`GET /reviews/:id`)

- `propertyMatch` — decision, selected `propertyId`/name, reasons, matcher version,
  candidates evaluated, parsed requirement.
- `property` — the (live) selected Property's safe facts.
- `warnings[]` — reviewer flags derived from the Property match + the draft
  policy result: `NO_PROPERTY_MATCH`, `AVAILABILITY_UNVERIFIED`,
  `PRICE_UNAVAILABLE`, `CAPACITY_UNSUPPORTED`, `CONTACT_NOT_APPROVED`,
  `PROMOTION_UNSUPPORTED`, `AMENITY_UNSUPPORTED`.

## Frontend (Thai-first)

The review page renders a `การจับคู่ที่พัก` card: the matched Business, the
selected Property (name · area · capacity), the reasons as a Thai checklist
(`✓ บางแสน`, `✓ รองรับ 12 คน`, …), and warnings (`⚠ ห้องว่างยังไม่ได้ยืนยัน`).
On NO_PROPERTY_MATCH it shows a clear “ไม่พบที่พักที่ตรงกับคำขอ” notice. No
Execute-Now control is added.

## Immutability

See [ADR-042](adr/ADR-042-review-property-snapshot.md) and doc 123 — the review
snapshots `business_id`, `property_id`, `property_match_id`, and a `context_hash`
of the draft input at creation, so a later Property edit never mutates an existing
Review/Draft.
