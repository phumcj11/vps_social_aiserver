# 68 — Execution Verification

The **ExecutionVerificationService** (`apps/api/src/execution/verification.ts`) is pure and deterministic. It is the single home for the safety-critical decisions, so they are enforced identically for every adapter (fake or real). The adapter observes; this service judges.

## Pre-submit contract

Before a single character is submitted:

1. **Target identity** — the observed post identity must equal the intended `targetPostKey`. A mismatch aborts (`TARGET_MISMATCH`).
2. **Exact typed-content equality** — the text in the composer must **exactly** equal the immutable approved content. No trimming, no normalization. What a human approved is what gets posted (`TYPED_CONTENT_MISMATCH`).

Any failure aborts the attempt **before submit** — there is no partial write.

## Post-submit contract

A submit outcome is classified into exactly one of:

- **verified** — the ONLY success. Requires: the submit reported `submitted`, the comment is independently observed on the post, it has a Facebook comment **id**, and its observed content **exactly** equals the approved content.
- **ambiguous** — the outcome cannot be proven. This includes: the adapter reported `ambiguous`; a claimed submit with no observable comment; a comment with no id; or observed content that does not exactly match. Ambiguity is **never** a success and **never** an auto-retry — it routes to [recovery](69-execution-recovery.md).
- **failed** — the submit itself deterministically failed.

## Why a screenshot is not enough

A screenshot can be captured even when the comment did not post, or posted with altered content. Success therefore requires a *verifiable identity plus exact content*, with the screenshot kept only as corroborating [evidence](67-execution-evidence.md).
