# 02 — Product Scope

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document defines what the MVP includes, what it deliberately excludes, and the boundary at which the MVP is considered ready for a first pilot customer. It is the authoritative scope reference; where any other document appears to widen scope, this document and [not-doing.md](not-doing.md) prevail.

---

## In-Scope MVP Capabilities

### Accounts and structure
- Customer registration and login.
- One **workspace** per customer account.
- One or more **businesses** per workspace.
- A **business profile** per business: products or services, service area, selling points, contact information, tone, keywords, response rules, and prohibited claims.

### Facebook connection (adapter)
- Connecting **one Facebook account** per workspace, usable by multiple businesses.
- Assigning one or more **Facebook Groups** to each business.
- **Read-only scanning** of new posts in assigned groups via Playwright.

### Matching and drafting
- Matching each new post to zero, one, or multiple businesses, with a **confidence score** and a **plain-English explanation**.
- Explicit handling of **multi-business matches** — the system never silently picks one business.
- Generating a **business-specific AI comment draft** using only the selected business's context.

### Human approval
- Sending each opportunity to **Telegram** for review.
- **Approve, edit, or reject** actions, with human approval mandatory before any comment.

### Publishing and evidence
- Publishing an approved comment to Facebook via **Playwright**, with **concurrency of one**.
- **Comment verification** after posting.
- **Screenshot evidence** for successful comments.
- **Idempotency**: one approved comment action per business-and-post combination, unless explicitly retried after a confirmed technical failure.

### Safety and trust
- A global **kill switch** that stops all new Facebook write actions.
- Complete **audit history** of every opportunity, decision, and comment attempt.
- Handling for **session expiry** and **CAPTCHA / checkpoint** interruptions, surfaced to the human rather than worked around silently.

### Surfaces
- A minimal **web application** for setup, review, history, and system status.
- A **Telegram bot** as the approval interface.

---

## Explicit Non-Goals

The following are **out of scope** for the MVP. See [not-doing.md](not-doing.md) for the full list; the most important are:

- **Auto-commenting without human approval** — permanently rejected for the MVP.
- **Multiple Facebook accounts** per workspace — deferred (see [ADR-005](adr/ADR-005-single-facebook-account-mvp.md)).
- **Other platforms** — TikTok, Instagram, LINE, and any non-Facebook platform.
- **Billing, subscriptions, and monetisation.**
- **Team management, roles, and multi-user collaboration** within a workspace.
- **Browser farms, multi-account scaling, and concurrent publishing** beyond concurrency of one.
- **Analytics and performance reporting** on published comments.
- **Mobile applications** (the web app is responsive; Telegram is the mobile approval surface).
- **A public or third-party API.**

---

## Assumptions

- The pilot customer owns and controls the Facebook account they connect, and is entitled to comment in the groups they assign.
- The customer accepts responsibility for compliance with each Facebook Group's rules and Facebook's terms; the product supports but does not guarantee such compliance.
- The customer has a Telegram account and can receive messages from the bot.
- The volume of relevant posts per pilot customer is modest — tens per day, not thousands — consistent with a single-account, single-concurrency MVP on a small VPS.
- One Facebook account is sufficient for a pilot customer's businesses in the MVP.
- An AI provider is available to generate drafts; the specific provider is a later technical decision and is not wired up in this sprint.

---

## Constraints

- **Documentation-only sprint.** SPRINT 000 produces documentation. No application code, packages, services, databases, containers, or external connections are created.
- **Host capacity.** The target VPS has **2 CPU cores and 3.8 GiB RAM** (see [server-audit.md](server-audit.md)). The architecture must run comfortably within this, which forces browser concurrency of one and a small, single-host deployment.
- **Human approval is mandatory.** No design may introduce a path that posts a comment without explicit human approval.
- **Facebook is an adapter.** Business logic must not be Facebook-specific in the core; platform detail stays in the adapter.
- **No autonomous scaling.** No browser farms, no parallel accounts, no concurrent publishing.
- **Security.** Credentials, cookies, and browser profiles must never be committed to Git and must never be exposed to the frontend.

---

## MVP Acceptance Boundary

The MVP is accepted when the full loop works end to end for one pilot customer, on the current VPS, within the safety rules above:

1. Register → workspace → business with profile.
2. Connect one Facebook account → assign groups.
3. Scan (read-only) → match with score and explanation → generate business-specific draft.
4. Notify via Telegram → human approves / edits / rejects.
5. On approval, publish via Playwright → verify → capture screenshot.
6. Store result and full audit history; kill switch halts new write actions on demand.

Everything beyond this loop is out of scope, regardless of how valuable it may be.

---

## What Counts as "Ready for First Pilot Customer"

The product is ready for a first pilot customer when **all** of the following hold:

- A real business owner can complete setup unaided by an engineer, using only the product's screens and Telegram.
- The scanner discovers new posts in assigned groups without ever posting during scanning.
- Matching produces results the owner finds mostly relevant, with visible scores and reasons, and ambiguous multi-business matches are surfaced, never silently resolved.
- Drafts are shaped by the correct business's context and respect its prohibited claims.
- Approval, editing, and rejection all work from Telegram, and no comment is ever posted without approval.
- Approved comments are published reliably, verified, and evidenced by a screenshot.
- Failures (session expiry, CAPTCHA, checkpoints, publish errors) are surfaced to the human and recorded — never silently swallowed.
- The complete audit history is viewable and accurate.
- The kill switch reliably stops all new Facebook write actions.
- The system remains stable within 2 CPU cores and 3.8 GiB RAM under expected pilot load.

If any of these is not met, the product is not yet pilot-ready.
