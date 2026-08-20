# 91 — Pilot 0 Closure Record

**Status:** CLOSED — PASS. Release `v0.9.3-pilot-write-verified` (main `b7d088f`).
**Applies to:** KMKT Social AI. Contains no cookies, credentials, profile paths, or private session data.

Pilot 0 proved the full pipeline end-to-end and posted exactly one real comment in an **operator-owned private test group**, then hardened the post-submit verifier.

## What was tested

- **Private test group:** operator-owned group `1013703265040854`, an intentionally-created test post `1013706061707241` (author = the operator/admin). No third-party public group was written to.
- **Read pipeline:** real read-only Collector validation over six pilot groups → Signals (Thai text intact), duplicates handled gracefully.
- **Classifier correction (rules-v2):** intent-driven ACCEPT/REJECT — accepts genuine accommodation-seekers, rejects advertiser/owner/agent/property-code listings ([85](85-pilot0-classifier-correction.md)).
- **Dedup correction:** idempotent `persistSignal`; a duplicate is a graceful skip, never a `REPOSITORY_ERROR` ([86](86-collector-duplicate-handling.md)).
- **Human Review:** exactly one Review Task per approved Draft; operator APPROVE/EDIT/REJECT; Telegram disabled.
- **Action Queue:** one Action Job, created BLOCKED under safe defaults (engine/write off, kill switch on).
- **prepare_only:** live read-only readiness probe — exact identity, comments available, one unique composer, no typing/submit ([88](88-controlled-one-shot-execution.md)).
- **First real submit_once:** one comment posted, exactly once.

## The verification miss and its fix

- **Initial ambiguous result:** the submit posted the comment, but post-submit verification returned AMBIGUOUS (`COMMENT_NOT_OBSERVED`).
- **Root cause:** the verifier did a raw exact-string match on the full approved content. Facebook renders the 😊 emoji as an image whose codepoint is **absent** from the comment's `innerText`, so the exact match failed at the emoji. The safe design correctly refused to claim success without proof (no double-post; idempotency reservation kept live).
- **Verifier correction:** cosmetic-tolerant normalization (Unicode NFC, whitespace, dash variants, invisible formatting, and emoji/pictographic tolerance), a **full** normalized-content match, an **exactly-one-match** requirement, and bounded post-submit polling ([89](89-facebook-comment-selector-strategy.md), text-normalize + verification). Preflight typed-content check stays EXACT.
- **Recovery result:** read-only normalized re-verification confirmed exactly one matching comment; the ambiguous Action Job was recovered to **succeeded / execution_state=verified**, the session to **verified (RECOVERED_SUCCESS)**, and the idempotency reservation to **verified** (key live → permanently blocks a re-post). Original ambiguous history preserved (append-only).

## Final state

- Action Job `2a85a0dd-…`: **succeeded / verified**; `ambiguous_at` preserved for audit.
- Exactly one Execution Session (verified), exactly one idempotency reservation (verified, protective).
- **Zero duplicate comments.** No re-submit.
- Safety flags restored/unchanged throughout (writes disabled, kill switch on, adapter fake); `.env` untouched (flags enabled per-process only during the supervised write).

## Release tags involved

`v0.8.0-safe-execution` → `v0.9.0-operational-hardening` → `v0.9.1-pilot-fixes` → `v0.9.2-real-comment-adapter` → **`v0.9.3-pilot-write-verified`**.

Pilot 0 is closed. Level 1 (supervised production) is defined in [92](92-production-pilot-level1.md); it is **not** activated by this closure.
