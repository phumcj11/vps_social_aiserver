# ADR-032 — One-Shot Submit and Ambiguity Handling

**Status:** Accepted (PILOT 0).
**Date:** 2026-08-04

## Context

A Facebook comment write can fail in a way where we **cannot prove** whether it posted (navigation lost, timeout, mid-flow crash, checkpoint interstitial after the click). Retrying blindly risks a **double post**. The engine must never trade a possible duplicate for a retry, and must never treat a screenshot as proof.

## Decision

**Submit exactly once.** The adapter holds a `submitted` latch: after one attempt, any further submit call returns `ambiguous` instead of clicking again — a second submit is structurally impossible. There is no batch mode, no loop, and no fallback selector that could target a different composer.

**Three outcomes only**, judged by the verification service (not the adapter):
- `verified_success` — the comment is independently observed on the target post, with a Facebook comment id, and its text exactly equals the approved content;
- `verified_failure` — a deterministic, provably pre-submit failure (safe to allow a *deliberate* retry after releasing the reservation);
- `ambiguous` — anything unknown, or any platform interrupt (checkpoint / CAPTCHA / session-expired / account-restricted) encountered at or after submit.

**Ambiguous never auto-retries.** The idempotency reservation is kept **live** (blocking new attempts for the same business+post), the job is flagged for **mandatory human recovery**, and `ACTION_AMBIGUOUS_AUTO_RETRY` stays `false` (and is not consulted by any auto-retry code path — there is none).

## Consequences

- The worst case of an unknown outcome is a **paused job awaiting a human**, never a duplicate comment.
- The kill switch is re-checked immediately before the single submit; flipping it mid-flow prevents the write.
- Recovery is explicit and auditable (`execution.recovery` event, `MANUAL_INVESTIGATION` disposition); a human decides whether the comment posted before anything else happens.
- Post-submit verification is mandatory and content-exact; a missing observation after a claimed submit is ambiguous (we cannot prove nothing was posted), not a silent success.
