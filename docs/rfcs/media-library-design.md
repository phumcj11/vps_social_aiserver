# RFC — Property / Business Media Library (DESIGN ONLY)

Status: **Design only. Not implemented.** No image upload, no Facebook image post,
no object-storage integration in this feature. This document scopes the next
feature so implementation can be reviewed separately.

## Motivation

Owners want the assistant to be able to show real photos (pool villa exterior,
pool, karaoke room) alongside a text response. Images must never invent facts:
an image may be attached only when persisted Property data supports the claim
(e.g. the Property record has `privatePool = true`), and — for the Pilot — only
under human review.

## Proposed persisted model — `media_asset`

Additive table, workspace-scoped, mirroring existing conventions
(`business_matching_rules` / `properties`):

| column                    | type                | notes                                              |
| ------------------------- | ------------------- | -------------------------------------------------- |
| id                        | varchar(36) PK      |                                                    |
| workspaceId               | varchar(36) FK      | workspace isolation, same as every other table      |
| businessId                | varchar(36) FK      |                                                    |
| propertyId                | varchar(36) nullable| null = business-level asset                        |
| mediaType                 | varchar(20)         | `image` only for now                               |
| storageReference          | varchar(500)        | opaque key into future object storage; never a raw public URL in drafts |
| category                  | varchar(30)         | see categories below                               |
| caption                   | varchar(300) null   | owner text; screened like any draft text           |
| status                    | varchar(20)         | `active` / `archived` (no hard delete)             |
| approvedForDrafts         | boolean default 0   | may appear in an internal Draft for human review    |
| approvedForPublicResponse | boolean default 0   | may be sent externally — OFF until a later feature  |
| ownerVerified             | boolean default 0   | owner confirmed the photo is truthful & owned      |
| createdAt / updatedAt     | timestamp           |                                                    |

### Categories

`cover, exterior, pool, bedroom, bathroom, living_room, karaoke, kitchen, view, other`

## Future response settings (Business-level, additive to policies)

`imageResponse`:

- `OFF` — never attach images.
- `MATCHED_PROPERTY_ONLY` — only images of the Property that MATCHed.
- `BUSINESS_FALLBACK` — business-level images allowed on NO_PROPERTY_MATCH.
- `HUMAN_REVIEW_ONLY` — prepare image selection but require human review.

**Safe Pilot default: `HUMAN_REVIEW_ONLY`.**

## Deterministic, explainable selection (future)

Selection must be a pure function of persisted facts, mirroring the text matcher:

- requested `private pool` (a persisted `amenities.privatePool = true`) → eligible
  `category = pool` images of that Property that are `approvedForDrafts` +
  `ownerVerified`.
- Never infer an amenity because an image *appears* to show it. The amenity fact
  comes from the Property record; the image is only chosen to illustrate a fact
  that already exists.
- No selection on NO_PROPERTY_MATCH except business-level cover images, and only
  when `imageResponse` explicitly allows it.

## Explicit non-goals for the media feature

- No object-storage / CDN integration is designed here beyond the opaque
  `storageReference` placeholder.
- No Facebook image posting. Images, like text, never leave the system without
  the existing review + action gates, which remain authoritative.
- No automatic public image response — `approvedForPublicResponse` stays OFF and
  unused until a separately reviewed feature enables it.

## Interaction with Response Strategy (this feature)

The Response Strategy decides WHETHER/HOW to prepare a *text* response on
NO_PROPERTY_MATCH. The Media Library, when built, will layer on top: it can only
attach images to a response that the Response Strategy already permits, and only
images whose persisted facts hold — it can never turn a NO_PROPERTY_MATCH into a
property claim.
