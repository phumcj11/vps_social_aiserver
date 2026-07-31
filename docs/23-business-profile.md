# 23 — Business Profile

**Document status:** SPRINT 003 — Business Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

The Business Profile is the structured description of a business. It is the context a later sprint's AI will use when drafting comments — but in this sprint it is simply **structured business data**, edited and stored. There is exactly **one profile per business**, created automatically when the business is created.

---

## Fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `businessId` | id | The owning business (one profile per business — DB unique). |
| `category` | string | Required at business creation; editable. |
| `description` | text | Optional. |
| `sellingPoints` | string[] | List of selling points (stored as JSON). |
| `serviceArea` | text | Where the business operates. |
| `contactInformation` | text | How to reach the business. |
| `responseTone` | string | Desired voice (e.g. "friendly"). |
| `prohibitedClaims` | string[] | Statements the business must never make (stored as JSON). |
| `createdAt` / `updatedAt` | timestamps | Safe timestamps. |

`sellingPoints` and `prohibitedClaims` are lists; the API accepts/returns JSON arrays, and the store persists them as JSON text.

---

## API

- `GET /businesses/:id/profile` → `{ profile }` for the owned business (404 if the business is not owned / not found).
- `PATCH /businesses/:id/profile` → update any subset of the fields; returns the updated profile.

Both require authentication; PATCH also passes the CSRF/origin guard. Ownership is enforced via user → workspace → business.

---

## Validation

- `category` (when provided): 1–120 chars.
- `description`, `serviceArea`, `contactInformation`: optional text (bounded length).
- `responseTone`: optional, ≤120 chars.
- `sellingPoints`, `prohibitedClaims`: arrays of non-empty strings (each ≤300 chars, ≤50 items).

On creation, `name` and `category` are required (`description` optional); the profile is seeded with the given category/description and empty lists.

---

## UI

The **Profile** tab of the Business Detail page edits: Business Name (updates the business), Category, Description, Selling Points (one per line), Service Area, Contact Information, Response Tone, Prohibited Claims (one per line). Save shows success/error feedback.

---

## Relationship to later sprints

The profile — especially `prohibitedClaims`, `responseTone`, and `sellingPoints` — is exactly the context the AI drafting sprint will consume (docs/09-ai-design.md). This sprint only stores and serves it; **no AI reads it yet.**
