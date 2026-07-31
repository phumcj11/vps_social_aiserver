# ADR-006 — Telegram Human Approval

- **Status:** Accepted
- **Date:** 2026-07-30
- **Sprint:** SPRINT 000 — Product Foundation
- **Deciders:** Product Architect / Principal Software Architect
- **Related principles:** Human Approval, Everything Auditable, Keep MVP Small
- **Relates to:** [11-telegram-design.md](../11-telegram-design.md), [05-business-rules.md](../05-business-rules.md), [07-system-overview.md](../07-system-overview.md)

---

## Context

The core safety guarantee of KMKT Social AI is that **no Facebook comment is ever posted without an explicit human approval** (Human Approval principle; BR-29, BR-30). We must choose the interface through which a customer reviews each AI-drafted opportunity and approves, edits, or rejects it.

Target customers are small business owners who are frequently mobile, non-technical, and already active on messaging apps. The MVP must make review fast and reachable without building a heavy notification-and-review system.

Options for the approval interface:

- **Option A:** Telegram bot as the approval interface.
- **Option B:** Web-app-only approval (no messaging).
- **Option C:** Email-based approval.
- **Option D:** A custom mobile app.

---

## Decision

**Telegram is the MVP approval interface, and every comment requires explicit human approval.**

Each opportunity is delivered to the customer's paired Telegram destination showing the business name, group name, post summary, AI match score and reasons, and the draft comment, with actions to **approve, edit, reject, or open the post**. The Backend validates every callback, records the Approval Decision, and only then authorises the Playwright adapter to publish. There is no path — in Telegram or anywhere else — that posts a comment without a recorded human approval, and there is no auto-commenting in the MVP.

Telegram is an **interface, not the source of truth**: it presents opportunities and collects decisions; the Backend decides, enforces every rule, and stores the definitive record.

---

## Consequences

**Positive**
- **Meets people where they are.** Owners get a push notification and can decide with one tap on their phone — ideal for the solo and multi-business owner personas.
- **Fast to build and light to run.** A bot fits the small VPS budget far better than a custom mobile app or a bespoke push system.
- **Upholds the core guarantee.** Approval is explicit, per opportunity, and recorded before any post (Human Approval; Everything Auditable).
- **Safe by design.** Server-side callback validation, duplicate-callback protection, and expired-approval handling prevent accidental or spoofed posting ([11-telegram-design.md](../11-telegram-design.md)).

**Negative / costs**
- Introduces a dependency on Telegram availability; if Telegram is down, approvals wait (the web app remains a secondary review surface, and nothing is posted without approval regardless).
- Requires a pairing/onboarding step to map a customer to a Telegram destination.
- Telegram callbacks must be treated as untrusted input and rigorously validated — accepted as necessary work.

**Neutral**
- Web-app review coexists with Telegram; Telegram is the primary approval channel, the web app the fuller management and history surface.

---

## Alternatives Considered

- **Web-app-only approval (Option B).** Rejected for the MVP as the primary channel — owners are mobile and will not sit in a dashboard; without push-style delivery, timely leads are missed. The web app is retained as a secondary review/history surface.
- **Email approval (Option C).** Rejected — slower, easy to miss, awkward for edit-then-approve and for secure, validated one-tap actions.
- **Custom mobile app (Option D).** Rejected for the MVP — disproportionate build and maintenance cost, app-store friction, and unnecessary to prove the hypothesis. Conflicts with Keep MVP Small.

---

## Non-Negotiable Rule Affirmed

Regardless of interface, **human approval is mandatory before every Facebook comment, and there is no automatic commenting in the MVP.** Telegram is chosen because it makes that mandatory approval fast and convenient — not because it relaxes it. Should the approval interface ever change, the mandatory-approval guarantee remains.
