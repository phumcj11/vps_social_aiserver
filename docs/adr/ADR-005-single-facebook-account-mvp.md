# ADR-005 — Single Facebook Account per Workspace (MVP)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Sprint:** SPRINT 000 — Product Foundation
- **Deciders:** Product Architect / Principal Software Architect
- **Related principles:** Keep MVP Small, Platform Adapter, No Feature Creep, Everything Auditable
- **Relates to:** [ADR-004](ADR-004-multiple-businesses-per-customer.md) (multiple businesses per customer), [10-playwright-design.md](../10-playwright-design.md), [07-system-overview.md](../07-system-overview.md)

---

## Context

A workspace may contain multiple businesses ([ADR-004](ADR-004-multiple-businesses-per-customer.md)). Each business monitors Facebook Groups and, on approval, publishes comments. Facebook access happens through a Playwright-driven browser session using real account credentials.

We must decide how many Facebook accounts a workspace supports in the MVP:

- **Option A:** One Facebook account per workspace, shared by all businesses.
- **Option B:** Multiple Facebook accounts per workspace (e.g. one per business).

The target host is a single small VPS (2 CPU cores, 3.8 GiB RAM — see [server-audit.md](../server-audit.md)), and browser automation is the heaviest resource consumer. Each additional live account multiplies persistent browser profiles, session-maintenance work, and CAPTCHA/checkpoint exposure.

---

## Decision

**The MVP supports exactly one Facebook account per workspace, usable by multiple businesses.**

All scanning and commenting for every business in the workspace flow through this single connected account and its single persistent browser profile. Group assignments still bind groups to specific businesses; the account is simply the shared channel through which the adapter reads and writes.

---

## Consequences

**Positive**
- **Fits the VPS budget.** One account means one persistent browser profile and one session to validate, keeping concurrency at one and memory use predictable ([10-playwright-design.md](../10-playwright-design.md)).
- **Simpler, safer session management.** One login/OTP flow, one place to detect expiry and checkpoints, one recovery path.
- **Smaller MVP surface.** Less to build, test, and operate; aligns with Keep MVP Small.
- **Clear audit.** All Facebook actions trace to one known account.

**Negative / costs**
- All businesses in a workspace comment under the same Facebook identity. For owners who would prefer a distinct identity per business, this is a limitation to be communicated.
- Concentrates risk: if the single account faces a checkpoint or expiry, all businesses in the workspace pause until it is resolved. Mitigated by explicit session validation, notifications, and the kill switch.

**Neutral**
- Reinforces the workspace (not the business) as the owner of the Platform Account in the domain model.

---

## Future Migration Path

Multiple Facebook accounts per workspace is a plausible future feature (recorded in the backlog). A migration would:

1. Generalise the **Platform Account** so a workspace can hold more than one, with each **Business Group Assignment** (or business) bound to a specific account.
2. Extend session management to validate and recover several persistent profiles independently.
3. Address the resource impact — likely more than concurrency one and/or a larger host — as its own decision, since running multiple live browser sessions exceeds the current VPS budget. This is why the capability is deferred rather than merely postponed.
4. Preserve all existing guarantees (isolation, idempotency, audit, kill switch) unchanged.

Because Facebook is an adapter behind a common contract (Platform Adapter principle), this extension is expected to be localised to the adapter and the account model, not the core.

---

## Why Multiple Facebook Accounts Are Deferred

- **Resource cost.** Each live account adds a persistent browser and session-maintenance load the current single VPS cannot absorb alongside concurrency one.
- **Operational complexity.** Multiple accounts multiply login, OTP, expiry, and checkpoint handling — the most fragile parts of the system — before the core loop is even proven.
- **Not required to validate the hypothesis.** A pilot customer can prove the core value (find → draft → approve → publish → evidence) with one account. Multiple accounts add reach, not proof.
- **Keep MVP Small / No Feature Creep.** Deferring keeps the first release focused and shippable; the migration path above keeps the door open without paying the cost now.
