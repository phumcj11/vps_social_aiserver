# ADR-004 — Multiple Businesses per Customer

- **Status:** Accepted
- **Date:** 2026-07-30
- **Sprint:** SPRINT 000 — Product Foundation
- **Deciders:** Product Architect / Principal Software Architect
- **Related principles:** Business First, Keep MVP Small, No Feature Creep, Everything Auditable
- **Supersedes / relates to:** Establishes the account model referenced by [ADR-005](ADR-005-single-facebook-account-mvp.md) and [ADR-006](ADR-006-telegram-human-approval.md).

*(ADR-001 through ADR-003 are intentionally not present; product ADR numbering for this foundation begins at ADR-004 as directed by the sprint brief.)*

---

## Context

KMKT Social AI serves small business owners. Real owners frequently operate more than one venture — for example a coffee shop, a small catering service, and a repair shop — each with its own offer, service area, tone, keywords, and rules. A recurring, high-value need is to capture leads for *all* of an owner's businesses from one place, while keeping each business's identity and claims cleanly separated.

We must decide how the account model relates customers to businesses:

- **Option A:** One customer account equals exactly one business.
- **Option B:** One customer account (via a workspace) manages multiple businesses.

This decision shapes the domain model, the matching logic (a post may match several of the owner's businesses), the AI drafting isolation, and the entire UX.

---

## Decision

**One customer account may manage multiple businesses.**

Concretely: a **User** owns one **Workspace**, and a workspace contains **one or more Businesses**, each with its own **Business Profile**. Matching, drafting, approval, idempotency, and audit all operate per business. A post may match zero, one, or several of the owner's businesses, and multi-business matches are always surfaced distinctly and never silently resolved.

This is confirmed as **MVP scope**.

---

## Consequences

**Positive**
- Matches how real owners operate; directly serves the multi-business persona (see [03-user-personas.md](03-user-personas.md)).
- Keeps each business's context isolated, enabling correct per-business drafting and preventing cross-contamination (BR-60).
- One connection and one review inbox for an owner with several ventures — less setup, one place to work.
- A clean foundation for per-business audit and history.

**Negative / costs**
- Adds the requirement to handle **multi-business matching** carefully: a single post may be relevant to several businesses, and the system must present each distinctly (BR-19–BR-21). This is deliberately embraced as core to the product's value.
- Slightly more complex UX (choosing/attributing the right business) and data model than a one-business account.
- Requires strict data isolation between businesses within a workspace.

**Neutral**
- Establishes the workspace as the isolation boundary, which later decisions (Facebook account, Telegram destination) build upon.

---

## Alternatives Considered

- **One customer = one business (Option A).** Simpler model and UX. Rejected — see below.
- **Multiple workspaces per customer, one business each.** Would let a customer separate businesses into distinct workspaces. Rejected for the MVP as heavier than needed and worse for the core use case (an owner wants *one* place and *one* Facebook connection for all their businesses); multi-workspace remains out of MVP scope.

---

## Why "One Customer = One Business" Was Rejected

- **It does not match reality.** Many target owners run several ventures; forcing one account per business would make them manage multiple logins and connections for what is, to them, one job.
- **It fragments the Facebook connection.** [ADR-005](ADR-005-single-facebook-account-mvp.md) lets one Facebook account serve several businesses — impossible under a one-business account without duplicating connections.
- **It weakens the value proposition.** The product's edge for multi-business owners is a single, safe inbox with guaranteed correct attribution. A one-business model discards that advantage.
- **It would not actually simplify the hard part.** The genuinely important safety work — never silently attributing a post to the wrong business — arises precisely because posts can be relevant to more than one business. Splitting accounts hides this rather than solving it, and the problem returns the moment an owner has two accounts open.

Accepting multiple businesses per customer costs some model and UX complexity, but it is the complexity the product exists to manage well.
