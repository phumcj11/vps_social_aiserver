# 105 — Business Contacts & Policies

**Status:** SPRINT 015. Contacts: `business-property/contacts.ts` + `business_contacts`. Policies: `business_policies` + `property_policies`. ADR: [ADR-037](adr/ADR-037-structured-contact-and-policy-model.md).

## Structured contact channels

Contact info is **never** an arbitrary description string. Each channel is typed: `PHONE | LINE_ID | LINE_OA | FACEBOOK_PAGE | WEBSITE | EMAIL | OTHER`, with `value`, `label`, `enabled`, `approvedForDrafts`, `approvedForPublicResponse`, `ownerVerifiedAt`.

- **Draft/AI generation may use ONLY channels that are `enabled` AND `approvedForDrafts`** (`approvedDraftChannels`). Disabled/unapproved channels are never exposed.
- A public response requires the stricter `approvedForPublicResponse`.
- Owner approval = `enabled` + `ownerVerifiedAt` set. Values are validated per type.

## Structured policies

Business-level, with property overrides (null = inherit):

| Policy | Values |
| --- | --- |
| availability | `MANUAL_CONFIRMATION` · `OWNER_SYSTEM` · `EXTERNAL_CALENDAR` · `DO_NOT_MENTION` |
| pricing | `DO_NOT_MENTION` · `STARTING_FROM` · `FIXED_REFERENCE` · `MANUAL_CONFIRMATION` |
| promotion | `NONE` · `APPROVED_ONLY` · `MANUAL_CONFIRMATION` |
| booking | `CONTACT_ONLY` · `LINE` · `PHONE` · `WEBSITE` · `MANUAL` |

Plus cancellation info, prohibited claims, escalation, responsible owner, operating hours, response SLA. **Draft generation may not invent values absent from the policy/data** — e.g. a `DO_NOT_MENTION` pricing policy forbids any price claim, and a `STARTING_FROM` policy still forbids a price when none is stored ([draft context](109-property-matching-foundation.md#draft-context)).
