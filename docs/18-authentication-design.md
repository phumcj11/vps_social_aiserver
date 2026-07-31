# 18 — Authentication Design

**Document status:** SPRINT 002 — Authentication & Workspace
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This document describes the authentication implemented in SPRINT 002: email + password with server-managed sessions delivered as HttpOnly cookies. It is intentionally minimal and self-hosted — no third-party auth provider, no social login, no password reset or email verification yet.

Related: [21-session-security.md](21-session-security.md) (session/cookie/CSRF detail), [20-database-foundation.md](20-database-foundation.md) (schema), [16-environment-configuration.md](16-environment-configuration.md) (variables).

---

## Model

- **Identity:** a `User` with a unique, normalised email and a password hash.
- **Credential:** a password, hashed with **scrypt** (Node.js core; memory-hard; per-password random salt). Plaintext passwords are never stored; hashes are never returned.
- **Session:** a server-side `Session` row. On login/register an opaque random token (32 bytes, base64url) is issued to the client in an **HttpOnly** cookie. Only the token's **SHA-256 hash** is stored; the raw token never touches the database.
- **No tokens in JS:** the browser never reads or stores the token (no localStorage); it travels only in the cookie.

---

## Endpoints

All responses are JSON with `Cache-Control: no-store`. Errors use a consistent shape: `{ "error": { "code", "message" } }`.

### POST /auth/register
1. Validate body (`email`, `password`) with Zod; enforce `PASSWORD_MIN_LENGTH`.
2. Normalise email (trim + lowercase).
3. Reject duplicate email → `409 email_taken`.
4. Hash the password (scrypt) and create the user.
5. Issue a session and set the HttpOnly cookie.
6. Return `201 { user }` — **never** the password hash.

### POST /auth/login
1. Validate body.
2. Look up the user by normalised email.
3. Verify the password. A verification runs even when the email is unknown (against a fixed dummy hash) to equalise timing and avoid user enumeration.
4. On any failure return a single generic `401 invalid_credentials` (never revealing which field was wrong, nor whether the email exists).
5. On success **rotate**: issue a fresh session token and set the cookie.
6. Return `200 { user }`.

### POST /auth/logout
1. If a valid session is presented, revoke it (sets `revoked_at`).
2. Clear the cookie.
3. Always return `200 { ok: true }` — **idempotent** (safe to call without a session).

### GET /auth/me
1. Require a valid session (authentication middleware).
2. Return `200 { user }`, or `401` when unauthenticated.

---

## Middleware & session validation

The authentication preHandler:
1. Reads the token from the session cookie.
2. Looks up the session by token hash.
3. Rejects if missing, `revoked_at` set, or `expires_at` in the past.
4. Loads the user; rejects if missing or not `active`.
5. On success, attaches `authUser` / `authSession` to the request and updates `last_seen_at`.

Failures throw a structured `401`; nothing internal leaks.

---

## Rate-limit foundation

`/auth/register` and `/auth/login` are rate-limited per client via `@fastify/rate-limit` (`AUTH_RATE_LIMIT_MAX` requests per `AUTH_RATE_LIMIT_WINDOW_SECONDS`). Rate limiting is disabled globally and applied only to these routes. Exceeding the limit returns `429 rate_limited`.

---

## Audit-safe logging

Structured JSON logs record events (`auth.register`, `auth.login`, `auth.login_failed`, `auth.logout`) with only safe identifiers (e.g. `userId`). A defensive denylist in the logger redacts any forbidden key. The following are **never** logged: passwords, password hashes, session tokens, cookies, or secret environment values.

---

## Explicitly out of scope (this sprint)

- Social / third-party hosted login.
- Password reset and email verification.
- Multi-factor authentication.
- Multiple users per workspace / team members.
- Any Facebook, Telegram, AI, n8n, or Playwright interaction.
