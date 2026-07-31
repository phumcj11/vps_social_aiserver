# 21 — Session Security

**Document status:** SPRINT 002 — Authentication & Workspace
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This document details the session, cookie, CSRF, and CORS design, plus the password policy and the security controls implemented in SPRINT 002.

---

## Sessions

- Server-managed. Each session is a row (`sessions`) with an expiry and a revocation timestamp.
- The client holds only an **opaque random token** (32 random bytes, base64url) in a cookie. The database stores only the token's **SHA-256 hash** — the raw token is never persisted.
- **Validation** rejects sessions that are missing, revoked (`revoked_at`), or expired (`expires_at` past), and requires the user to be `active`. `last_seen_at` is updated on each authenticated request.
- **Rotation on login:** every login issues a new token.
- **Revocation on logout:** logout sets `revoked_at`, so the token can never authenticate again (verified: post-logout `GET /auth/me` → 401).
- **Expiry:** controlled by `SESSION_TTL_HOURS` (default 168h / 7 days).

---

## Cookie

The session cookie is set with:

| Attribute | Value | Why |
| --------- | ----- | --- |
| `HttpOnly` | on | JavaScript cannot read the token (XSS cannot steal it). |
| `SameSite` | `Lax` | Blocks cookies on cross-site subrequests, mitigating CSRF. |
| `Secure` | on in production (auto), off in dev | Encrypted transport in production; HTTP allowed for local dev. |
| `Path` | `/` | Sent for the whole API. |
| `Max-Age` | `SESSION_TTL_HOURS` | Matches session lifetime. |

Verified Set-Cookie in development: `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (no `Secure` in dev). In production the cookie additionally carries `Secure` (verified in tests). The token is **never** placed in localStorage or exposed to JS.

---

## CSRF-aware design

Because auth is cookie-based, state-changing requests need CSRF protection. The MVP layers three defenses:

1. **SameSite=Lax cookies** — the browser does not send the session cookie on cross-site subrequests (e.g. a form auto-POST from a malicious site).
2. **Strict CORS allowlist** — only `WEB_ORIGIN` may make credentialed cross-origin calls.
3. **Origin check on mutations** — a server guard rejects any state-changing request whose `Origin` header is present but does not equal `WEB_ORIGIN` (verified: a request with `Origin: http://evil.example` is rejected `403 csrf_check_failed`).

### Documented development limitation

The Origin guard **allows** requests that carry **no** `Origin` header (e.g. server-to-server or `curl` during testing), since those cannot ride a victim's browser cookies. All real browser requests set `Origin`, so this does not weaken protection against browser-driven CSRF. A stronger, token-based double-submit CSRF scheme is deferred; it is unnecessary for the MVP given SameSite=Lax + strict CORS + the Origin check, but is the natural next step if cross-site embedding scenarios arise.

---

## CORS

`@fastify/cors` is configured with a single `origin` (`WEB_ORIGIN`, default `http://localhost:3000`), `credentials: true`, and an explicit method allowlist. There is **no wildcard**, and never one in production. Credentialed CORS with a wildcard origin is impossible by construction here.

---

## Password policy & hashing

- Minimum length `PASSWORD_MIN_LENGTH` (default 10), with an upper bound to guard hashing against denial-of-service.
- Hashing uses **scrypt** (Node.js core, memory-hard) with a unique random salt per password and a self-describing stored format that records the parameters. Verification is constant-time (`timingSafeEqual`).
- Plaintext passwords are never stored; hashes are never returned by any endpoint (verified in tests and via live curl).

---

## SQL-injection protection

All database access goes through Drizzle ORM with parameterised queries; no SQL is built from string concatenation of user input.

---

## Secret & data hygiene

- **Never logged:** passwords, password hashes, session tokens, cookies, secret env values (enforced by convention and a logger denylist; verified by a test that captures stdout/stderr).
- **Never returned:** password hashes (verified).
- **Never committed:** real `.env`, credentials, cookies, session files — all gitignored; only `.env.example` (no secrets) is tracked.
- **Generic auth errors:** invalid login always returns a single `invalid_credentials` message; login timing is equalised to prevent user enumeration.

---

## Ownership & authorization

- Every workspace endpoint requires authentication and operates only on the authenticated user's own workspace. No endpoint accepts a workspace id, so cross-user access is impossible by construction (verified: user B cannot read or modify user A's workspace).

---

## Verified controls (this sprint)

Password not returned · session token stored hashed (not plaintext) · password/hash/token not logged · cookie flags HttpOnly + SameSite=Lax + Path=/ (+ Secure in prod) · generic invalid-credentials · unauthenticated access blocked · CSRF bad-origin rejected · ownership enforced · logout revokes session.
