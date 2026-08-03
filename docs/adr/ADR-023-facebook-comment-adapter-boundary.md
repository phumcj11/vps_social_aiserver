# ADR-023 — Narrow Facebook Comment Adapter (not a Platform Framework)

- **Status:** Accepted
- **Date:** 2026-08-02
- **Sprint:** SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Safe by Default, Build Only What's Needed, No Silent Failure
- **Relates to:** [ADR-020](ADR-020-action-queue-boundary.md), [ADR-026](ADR-026-playwright-adapter-disabled-boundary.md), [64-facebook-comment-adapter.md](../64-facebook-comment-adapter.md)

---

## Context

The Action Queue ends at a blocked/queued job. To move toward execution we need an abstraction for "post one Facebook comment." The tempting move is a **generic Platform Adapter Framework** (Facebook/TikTok/Instagram/LINE, comment/message/react). The Architecture Review explicitly warned against speculative generalization: we have exactly one platform and one action.

Options:
- **A — Generic Platform Adapter Framework** now.
- **B — A narrow `FacebookCommentAdapter` interface** modeling exactly one action, behind a small stable seam.

## Decision

**Option B.** Define a narrow `FacebookCommentAdapter` with only the steps one comment write needs (verify target, prepare, verify typed content, submit, verify submitted, capture evidence, close). Two implementations: a deterministic `FakeFacebookCommentAdapter` (default) and a disabled `PlaywrightFacebookCommentAdapter` boundary. **Generalize only when a second real platform implementation exists** — not before.

The adapter only *observes and acts*; all safety judgments live in the [verification service](../68-execution-verification.md). The adapter receives a credential-free `ExecutionContext` — no cookies, tokens, or profile paths cross the seam.

## Consequences

**Positive**
- No speculative abstraction to maintain or mis-fit a second platform later.
- The safety-critical logic is centralized and adapter-independent.
- The fake adapter makes the whole pipeline testable with zero write risk.

**Negative / trade-offs**
- A future second platform will require a deliberate refactor to extract a shared interface — accepted, and cheaper than guessing the abstraction now.

**Out of scope:** Facebook Message, other platforms, and any generic framework.
