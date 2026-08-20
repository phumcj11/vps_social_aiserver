# 106 — Business & Property Frontend (Design)

**Status:** SPRINT 015 — information-architecture DESIGN. Implementation ships in **Sprint 016** (frontend deferred this sprint; backend + persistence + APIs are complete). Mobile-first; uses the existing app typography/design system; internal UUIDs are never the primary label.

## Routes

```
/settings/businesses                 list
/settings/businesses/new             create
/settings/businesses/[id]            detail (tabs)
/settings/businesses/[id]/properties/new
/settings/businesses/[id]/properties/[propertyId]   (tabs)
```

## Business detail tabs

Overview · Properties · Profile · Contacts · Policies · Matching · Facebook Groups · Readiness · History.

## Property tabs

Overview · Location · Capacity · Amenities · Pricing · Availability · Booking · Content · Media · Readiness.

## Matching rule UI (design)

List / add / edit / enable-disable / priority / keyword / rule type / test rule; Property matching config (service area, capacity, property type, amenities). Show "Why this Business matches" / "Why this Property matches" from the match reasons. No SQL/CLI for routine rule management.

## Facebook Group assignment UI (design)

View group name, area, access status, enabled status, validation status, assigned Business. Admin assign/reassign with workspace ownership + duplicate prevention + area warning. **No auto-join, no Facebook writes.**

## Onboarding wizard

The 8-step guided flow in [102](102-business-onboarding.md), with Save Draft / Continue Later. Every backend endpoint the UI needs already exists ([107](107-business-property-api.md)).
