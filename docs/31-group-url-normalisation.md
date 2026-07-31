# 31 — Group URL Normalisation

**Document status:** SPRINT 005 — Facebook Groups Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

Before a Facebook Group is stored, its URL is passed through a **strict, offline normaliser**. This guarantees a stable canonical form (for deduplication) and rejects anything that is not a Facebook Group landing page. **No network resolution is performed.**

---

## Accepted

- `https://www.facebook.com/groups/{id-or-slug}`
- `https://facebook.com/groups/{id-or-slug}` (host canonicalised to `www`)
- `https://m.facebook.com/groups/{id}?ref=...` (mobile/web hosts accepted; query removed)
- A URL without a scheme (`facebook.com/groups/123`) — `https://` is assumed
- A trailing slash (`/groups/123/`) — removed

Allowed hosts: `facebook.com`, `www.facebook.com`, `m.facebook.com`, `web.facebook.com`, `mobile.facebook.com`.

---

## Rejected

- Non-Facebook domains and lookalikes (`evil.com`, `facebook.com.evil.com`)
- Profile URLs (`/someprofile`, `/profile.php`)
- Page URLs (`/pages/...`)
- Post / permalink URLs (`/groups/{id}/posts/{n}`, `/groups/{id}/permalink/{n}`) — extra path segments
- The bare groups hub (`/groups/`) and reserved tokens (`feed`, `discover`, `create`, …)
- Malformed URLs
- Unsafe schemes: `javascript:`, `data:`, `file:` (and any non-http(s) scheme)

Rejection throws a `FacebookError` with code `INVALID_GROUP_URL`, surfaced to the API as a `400`.

---

## Output

```ts
{ canonicalUrl: 'https://www.facebook.com/groups/<token>', groupIdentifier: '<token>' | null }
```

- **canonicalUrl** — the stable form used for the unique `(workspace_id, canonical_url)` constraint.
- **groupIdentifier** — the group token. A purely-numeric token is Facebook's group id (stored in `facebook_group_id`); a slug is a safe identifier (the numeric id stays unknown until validation resolves it).

---

## Algorithm (summary)

1. Trim; reject empty/oversized input.
2. If the input has an explicit non-http(s) scheme → reject. If it has `http(s)` → use as-is. Otherwise prepend `https://`.
3. Parse with the URL API; reject malformed.
4. Require `http:`/`https:` protocol and an allowed Facebook host.
5. Require the path to be exactly `/groups/{token}` (two segments); reject otherwise (profiles/pages/posts/hub).
6. Require the token to match `[A-Za-z0-9._-]+` and not be reserved.
7. Drop the query and fragment; build the canonical URL from the token.

The normaliser is pure and synchronous — it never contacts Facebook or resolves redirects.
