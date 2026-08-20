# 95 — Production Submit Authorization (One-Shot)

**Status:** SPRINT 014. Logic: `apps/api/src/production/authorization.ts`. ADR: [ADR-034](adr/ADR-034-one-shot-production-authorization.md).

A production `submit_once` requires a **one-shot authorization**: one authorization permits **at most one** submit.

## What it binds

workspace · operator · Action Job ID · `target_post_key` · **approved-content HASH** (SHA-256 of the exact approved content — never the content itself) · authorization timestamp · expiration · **one-use nonce** · release version · a reference to the `prepare_only` result. **No credentials are stored.**

## Rules

- **One use.** Consumption flips `consumed=true` atomically in the store; a second attempt with the same nonce is refused (`already used`).
- **Expired → refused.** Past `expiresAtMs` (`PILOT_AUTHORIZATION_TTL_SECONDS`, default 300s).
- **Mismatch → refused.** Any of Action Job, `target_post_key`, approved-content hash, or nonce differing from the authorization refuses the submit.
- Validation (`validateAuthorization`) is pure/deterministic; consumption (`consumeAuthorization`) returns the consumed record only when validation passes.

## Flow

`prepare_only` PASS → operator opens a Write Window → operator issues a one-shot authorization bound to the exact job/target/content → the executor consumes the authorization atomically and performs exactly one submit → post-submit verification. The authorization and the Write Window are independent gates; **both** must be satisfied.
