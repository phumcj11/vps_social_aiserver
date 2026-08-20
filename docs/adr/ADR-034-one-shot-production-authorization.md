# ADR-034 — One-Shot Production Submit Authorization

**Status:** Accepted (SPRINT 014). **Date:** 2026-08-20.

## Context

A production comment is irreversible and third-party-visible. Authorization to submit must be explicit, single-use, and tightly bound to exactly what was reviewed — not a standing "execution enabled" state.

## Decision

Require a **one-shot authorization** for every production `submit_once`. It binds workspace, operator, Action Job ID, `target_post_key`, and the **hash** of the exact approved content (never the content or any credential), plus timestamp, expiration, a **one-use nonce**, the release version, and a reference to the `prepare_only` result. Consumption is atomic; validation refuses an expired, already-used, or mismatched (job / target / content-hash / nonce) authorization.

## Consequences

- One authorization ⇒ at most one submit; a replayed nonce is refused.
- Editing the content, target, or job after authorization invalidates it (hash/id mismatch) — you re-review and re-authorize.
- No credentials are stored in the authorization.
- Combined with the Write Window ([ADR-033](ADR-033-production-write-window.md)), a production write needs BOTH an OPEN window AND a valid one-shot authorization — there is no Execute-Now surface.
