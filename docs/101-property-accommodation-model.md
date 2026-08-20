# 101 — Property / Accommodation Model

**Status:** SPRINT 015. First-class entity `Property` (`apps/api/src/business-property/types.ts`).

A Property is an accommodation belonging to exactly one Business + Workspace. A Business may have many (e.g. `Sea Villa 01`, `Sea Villa 02`, `Pattaya Villa 01`).

## Fields

- **Identity:** name, code (unique per Business), property type, status (`active`/`inactive`/`archived`), description.
- **Location (normalized for matching):** province, district, subdistrict, area, address, latitude, longitude.
- **Capacity:** bedrooms, bathrooms, beds, maxGuests, extraGuestPolicy.
- **Amenities:** privatePool, sharedPool, beachfront, nearBeach, riverfront, mountainView, parking, kitchen, bbq, karaoke, poolTable, petFriendly, wifi, airConditioning, other[].
- **Characteristics:** accommodation style, target audiences, family/group/couple friendly, event/party allowed (stored in `details`).
- **Commercial (prices stored ONLY when entered — never invented):** startingPrice, priceDisplayMode, weekdayPrice, weekendPrice, holidayPolicy, securityDeposit, extraGuestPrice.
- **Availability:** mode, ownerConfirmationRequired, external calendar (future), notes. A property never claims availability unless its policy permits.
- **Booking:** channel, instructions, deposit, payment instructions, check-in, check-out.
- **Content:** selling points, important notes, prohibited claims, response notes.
- **Media metadata:** cover image, gallery, video URL, map URL (upload/storage is a separately bounded future feature; metadata is modelled now).

## Persistence

`properties` holds normalized queryable columns (name, code, type, status, province/district/area, maxGuests/bedrooms/bathrooms/beds, privatePool/nearBeach/beachfront/riverfront) for matching + filters; the variable structured attributes (full amenities, pricing, content, media, characteristics, location extras, policy overrides) live in a JSON `details` column, (de)serialised in the store. Indexes: workspace, business, status, area, property type.

## Lifecycle

Add / Edit / Duplicate-as-template / Activate-deactivate / **Archive**. Production Properties with historical Matches/Drafts/Reviews are **never hard-deleted** — use `status='archived'`.
