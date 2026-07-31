# ADR-007 — Operator-Assisted Facebook Login (MVP)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Sprint:** SPRINT 004 — Facebook Connection Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Keep MVP Small, Human Approval, Everything Auditable, No silent failure
- **Relates to:** [ADR-005](ADR-005-single-facebook-account-mvp.md) (one Facebook account per workspace), [26-facebook-connection.md](../26-facebook-connection.md), [27-facebook-session-lifecycle.md](../27-facebook-session-lifecycle.md), [28-browser-profile-security.md](../28-browser-profile-security.md), [29-facebook-connection-runbook.md](../29-facebook-connection-runbook.md)

---

## Context

The MVP requires a real, human-driven Facebook login into a Playwright-controlled persistent browser profile, with the rule that **the user enters credentials directly into the browser and the backend never receives the password**.

The deployment target is a single headless VPS (2 CPU cores, 3.8 GiB RAM). A self-service login therefore requires either a remote browser viewer (e.g. noVNC or a controlled headed-browser stream) reachable by the customer, or an operator running the browser on the customer's behalf. Product rules for this sprint forbid exposing a browser viewer publicly without authentication and forbid opening a new public port without approval.

Options evaluated (from the sprint brief):

- **Option A — Temporary noVNC browser session** bound to localhost / protected access.
- **Option B — Playwright headed browser exposed through a strictly controlled temporary browser viewer.**
- **Option C — Operator-assisted connection flow for the first pilot customer.**

---

## Decision

**For the MVP, Facebook login is operator-assisted (Option C).**

An operator runs a controlled CLI (`pnpm facebook:connect --workspace <uuid>`) that launches Chromium with the workspace's persistent profile; the customer enters their credentials directly in that browser. The backend never receives or logs the password. The full connection **state model, API, UI, audit, and safety controls** are implemented regardless of login method; only the *interactive login transport* is operator-assisted.

By default `FACEBOOK_LOGIN_ENABLED=false`, so no browser launches and connection attempts are recorded as `LOGIN_DISABLED`. The operator enables login locally only while performing the assisted flow.

Options A and B (a customer-facing remote browser viewer) are **deferred**: they cannot be exposed safely on the current headless VPS without an authenticated remote-browser service and, potentially, a new port — neither of which this sprint may introduce.

---

## Consequences

**Positive**
- Ships a safe, complete connection foundation now, honouring "the backend never sees the password" and "no public browser viewer".
- Smallest safe method for the first pilot; no new public ports, no unauthenticated viewer, no invented remote-browser stack (Keep MVP Small).
- The connection state machine, profile security, audit, and API/UI are fully built and tested, so a future self-service login is an additive change behind the same model.

**Negative / costs**
- Not self-service: onboarding a pilot customer's Facebook session requires an operator (documented in [29-facebook-connection-runbook.md](../29-facebook-connection-runbook.md)).
- On a headless host, running a headed browser needs a virtual display (e.g. `xvfb`) and Playwright system libraries — an operator prerequisite.

**Neutral**
- The `FACEBOOK_LOGIN_ENABLED` gate keeps the default deployment browser-free and Facebook-free until an operator explicitly acts.

---

## Unresolved decision (reported)

The **customer-facing remote-browser login UX** (Option A/B) remains an open product/infra decision: whether to stand up an authenticated remote-browser viewer (noVNC or a controlled headed stream), on what host, and behind what access controls. It is deferred to a later sprint and requires Product Owner input on hosting and security posture. Until then, operator-assisted login is the accepted MVP method.
