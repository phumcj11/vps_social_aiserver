# 10 — Playwright Design

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document describes how the Facebook platform adapter uses Playwright to read posts and publish approved comments — and the strict safety, resource, and separation rules that govern it.

Playwright is the mechanism of the **Facebook adapter**, nothing more. It acts only on instructions the Backend has authorised, and it never makes business decisions.

> **Implementation status (SPRINT 004–005).** The **connection** half and **group access validation** are implemented: Playwright (Chromium) is installed; a connection service performs manual login, session validation, and disconnect (SPRINT 004), and a group-validation service checks whether the connected session can reach a group's **landing page** (SPRINT 005). Both run at concurrency one, share the per-workspace persistent profile and lock, and are gated by `FACEBOOK_LOGIN_ENABLED` (default off → no browser launches). Group validation navigates ONLY to the canonical group URL and **never scrolls, opens posts, reads post text, or clicks any Like/Join/Comment/Share control** — it reads only safe page-level metadata (title / og:title). This remains **connection-only**: the Scanner (read posts) and Comment Executor (write) described below are **not** implemented; no scanning, post ingestion, or writing occurs. Credentials are typed directly into the browser and never reach the backend; profiles/cookies are never committed to Git. See [26-facebook-connection.md](26-facebook-connection.md), [32-group-access-validation.md](32-group-access-validation.md), [ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md).

---

## Per-Customer Browser Session Concept

- Each workspace's Facebook activity runs under its **own isolated, persistent browser session** tied to that workspace's connected account.
- Sessions are never shared between workspaces; one workspace's cookies, profile, and state never touch another's (data isolation, BR-59).
- A session is a long-lived context that preserves login between runs, so the customer does not re-authenticate on every action.

## One Facebook Account in MVP

- A workspace connects exactly **one Facebook account** (BR-7), usable by all its businesses (BR-8).
- All scanning and commenting for that workspace go through this single account.
- Multiple Facebook accounts per workspace are out of scope and deferred (see [ADR-005](adr/ADR-005-single-facebook-account-mvp.md)).

## Persistent Browser Profile

- Each account uses a **persistent browser profile** (cookies, local session) stored securely server-side.
- The profile lets the session survive restarts and avoids repeated logins.
- **The browser profile, cookies, and credentials must never be committed to Git, never exposed to the frontend, and never leave the server-side trust boundary.** This is a hard rule (BR-9).

## Login and OTP Flow

- Initial connection is a **guided, human-assisted** login: the customer (with operator support) enters credentials and completes any one-time password (OTP) step.
- The system captures the resulting session into the persistent profile; it does not store the password in plain form and never displays it.
- OTP and login are treated as sensitive; the flow is explicit and recorded (that it happened, not the secret values).

## Session Validation

- Before any action, the adapter **validates the session** (confirms the account is still logged in and usable).
- If the session is invalid or expired, no action proceeds: writing is paused, the customer and operator are notified, and re-authentication is requested (BR-49–BR-51).
- Validation results are recorded as audit events.

## Group Scanner (read-only)

- The **Scanner** logs in with the persistent profile and visits each **assigned** group to discover new posts.
- It extracts post identity and content for the Backend to store uniquely (BR-13).
- **The Scanner never writes** — no comments, likes, reactions, joins, or messages. It is strictly read-only.
- Scanning runs on a gentle schedule appropriate to the VPS budget, not continuously.

## Direct Post Navigation

- To comment, the **Comment Executor navigates directly to the specific post** rather than scrolling a feed.
- Direct navigation is faster, more reliable, and less resource-intensive — important on a small VPS — and reduces unintended interactions.

## Comment Execution (write)

- The Comment Executor publishes the **approved** comment text for a specific business-and-post Comment Job dispatched by the Backend.
- It acts only when the Backend confirms a recorded human approval exists, idempotency allows it, and the kill switch is inactive.
- It posts exactly the approved (or approved-edited) text — nothing added or altered.

## Comment Verification

- After posting, the executor **verifies** the comment actually appears on the post.
- A comment that cannot be verified is **not** treated as a confirmed success (BR-44); it is classified as a failure/uncertain outcome and surfaced.
- Verification protects idempotency and the integrity of history.

## Screenshot Capture

- On verified success, the executor **captures a screenshot** as evidence and links it to the Comment Attempt (BR-43).
- Screenshots are stored securely, workspace-scoped (BR-45).
- No verified screenshot means no confirmed success.

## Error Classification

Every failure is classified so it can be handled correctly and audited, including at least:

- **Session invalid / expired** — pause writing, request re-auth.
- **CAPTCHA / checkpoint / verification** — stop, do not bypass, surface to human.
- **Navigation / element failure** — post unreachable or UI changed.
- **Publish failure** — action did not complete.
- **Verification failure** — cannot confirm the comment appeared.
- **Timeout / resource** — action exceeded limits or the host was constrained.

Classifications drive whether a retry is permitted and what the human is told (BR-61, no silent failure).

## Retry Limits

- A retry is permitted **only after a confirmed technical failure** (BR-39) and **never** after a confirmed success or a rejection (BR-40).
- Retries are bounded by a fixed maximum (BR-41); beyond it the job is marked failed and surfaced.
- Each retry is a distinct, recorded **Comment Attempt** (BR-42).

## CAPTCHA or Checkpoint Handling

- If Facebook presents a CAPTCHA, checkpoint, or other verification, the adapter **stops and does not attempt to solve or bypass it** (BR-52, BR-53).
- The interruption is classified, recorded, and surfaced to the human for resolution.
- Affected write actions wait for human resolution rather than failing silently (BR-54).

## Concurrency Set to One

- The adapter runs at **concurrency one**: at most one browser action (scan or comment) at a time across the whole system.
- The Scanner and Comment Executor are distinct roles but share this single-concurrency budget and never run two browsers simultaneously.
- This is a hard constraint driven by the VPS budget and by safe, predictable behaviour.

## Resource Protection for the Current VPS

- A headless browser is the heaviest consumer of RAM on the host (2 cores, 3.8 GiB — see [server-audit.md](server-audit.md)); only one runs at a time.
- Browser instances are launched for work and released promptly; long-idle browsers are shut down to reclaim memory.
- Scan cadence is gentle; actions have timeouts to prevent runaway processes.
- Under resource pressure the system **defers** work (and records the deferral) rather than launching parallel browsers.

## Separation Between Read and Write

- **Reading (scanning) and writing (commenting) are separate roles** with different risk profiles.
- The Scanner has no capability to write; the Executor writes only Backend-authorised, human-approved comments.
- This separation limits blast radius: a scanning problem can never cause an unintended post, and the kill switch targets writes specifically.

## Global Kill Switch

- The **kill switch** (BR-55) halts all new Facebook **write** actions system-wide.
- While active, the Comment Executor initiates no new comment for any workspace; the Backend refuses to dispatch write jobs.
- Read-only scanning may be paused as a policy choice, but writing is always halted.
- Nothing bypasses the kill switch (BR-58); its changes are recorded.

## Credentials and Cookies Must Never Be Committed to Git

**Stated explicitly and without exception:** Facebook credentials, session cookies, OTP secrets, and persistent browser profiles **must never be committed to Git**, never included in any repository, and never exposed to the frontend or any client. They live only in secure server-side storage inside the Playwright/Backend trust boundary. Any process, script, or configuration that would place these in version control is prohibited.

---

## Playwright Adapter Guarantees (summary)

1. One isolated, persistent session per workspace; one Facebook account per workspace in the MVP.
2. Scanning is strictly read-only; commenting writes only approved text.
3. Concurrency of one; browsers launched for work and released to protect the VPS.
4. Sessions are validated before every action; expiry pauses writing and requests re-auth.
5. CAPTCHAs and checkpoints are never bypassed — they are surfaced to a human.
6. Every success is verified and screenshotted; unverifiable actions are not successes.
7. Retries only after confirmed technical failure, bounded and audited.
8. The kill switch stops all new writes and cannot be bypassed.
9. Credentials, cookies, and profiles never enter Git or the frontend.
