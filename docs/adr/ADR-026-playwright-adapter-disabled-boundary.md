# ADR-026 — Playwright Comment Adapter is a Disabled Boundary

- **Status:** Accepted
- **Date:** 2026-08-02
- **Sprint:** SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Safe by Default, No Silent Failure, Human Approval Mandatory
- **Relates to:** [ADR-022](ADR-022-action-execution-disabled-by-default.md), [ADR-023](ADR-023-facebook-comment-adapter-boundary.md), [64-facebook-comment-adapter.md](../64-facebook-comment-adapter.md), [71-safe-execution-runbook.md](../71-safe-execution-runbook.md)

---

## Context

We want the *structural seam* for a real Playwright-driven Facebook comment write to exist now (so the executor, verification, evidence, and idempotency can be built and tested against a stable interface), but we must guarantee that **no real Facebook write can ship or fire this sprint** — not by accident, not by a config flip.

Options:
- **A — Implement the real Playwright adapter** behind flags, trusting operators to keep it off.
- **B — Ship a disabled boundary** that implements the interface but refuses to run, with two independent layers of refusal.

## Decision

**Option B.** `PlaywrightFacebookCommentAdapter` implements `FacebookCommentAdapter` but every method refuses:

1. If the five enablement flags are not ALL set (`ACTION_ENGINE_ENABLED`, `FACEBOOK_WRITE_ACTION_ENABLED`, `FACEBOOK_COMMENT_ENABLED` true; `GLOBAL_KILL_SWITCH` false; `FACEBOOK_COMMENT_ADAPTER=playwright`) → refuse with `ADAPTER_DISABLED` (the normal state).
2. **Even if every flag is set** → still refuse with `REAL_WRITE_FORBIDDEN`. Enabling real execution is a separate, deliberate future change, not a configuration flip.

It opens no browser, launches no Chromium, and makes no network call. The default adapter remains the deterministic fake.

## Consequences

**Positive**
- The interface and the whole execution pipeline are real and testable now.
- A misconfiguration — even flipping all five flags — cannot post; the second layer forbids it.
- The future "enable real execution" change is explicit, reviewable, and isolated to this boundary.

**Negative / trade-offs**
- Operators cannot test a real write yet — intended; real execution is a later sprint with its own verification and sign-off.

**Out of scope:** any real browser automation, stealth/anti-detection, proxy rotation, and CAPTCHA handling.
