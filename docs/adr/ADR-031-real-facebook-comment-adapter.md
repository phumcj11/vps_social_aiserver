# ADR-031 — Real Facebook Comment Adapter (behind hard gates)

**Status:** Accepted (PILOT 0). Supersedes [ADR-026](ADR-026-playwright-adapter-disabled-boundary.md).
**Date:** 2026-08-04

## Context

[ADR-026](ADR-026-playwright-adapter-disabled-boundary.md) shipped the Playwright comment adapter as a **disabled boundary**: every method refused, and a fully-flagged build still hit an unconditional `REAL_WRITE_FORBIDDEN`. The Controlled Write Readiness Review confirmed the pipeline was correct up to the write, but that no real write could exist by flag change alone. Pilot 0 requires exactly one supervised comment write to be *possible* under complete gates — without weakening any gate and without shipping an "execute now" surface.

## Decision

Implement the **real** comment execution path behind the **existing** `FacebookCommentAdapter` interface, and **remove the unconditional `REAL_WRITE_FORBIDDEN`** now that a complete gated path exists. Real typing/submitting is refused unless **all** of the following hold together: the five enablement flags are set, the adapter is in `submit_once` mode, the executor grants an explicit one-shot authorization, and the kill switch is off (re-checked immediately before submit). Under the safe defaults, submit is always refused and nothing is typed.

Introduce a narrow `FacebookCommentPage` browser seam (mirroring the Collector's `CollectorBrowser`) so the adapter's safety and sequencing logic is fully unit-tested with a deterministic fake page — **no Chromium in tests**. Real DOM selectors live only in `PlaywrightCommentPage` and are validated during the operator-supervised read-only `prepare_only` probe.

## Consequences

- A real comment write is now *possible* but remains **disabled by default**; enabling it is a deliberate, gated, operator-supervised procedure, not a config flip.
- The adapter stays a narrow actor: no business rules; policy/state/idempotency/authorization remain with the coordinator/executor, and success/mismatch judgments with the verification service.
- No Execute-Now API/UI is added. The only new entry point is a read-only CLI probe.
- The single-real-platform, single-action design is preserved (per the Architecture Review); a second real platform remains the trigger to generalize.
- `REAL_WRITE_FORBIDDEN` remains a defined code (belt-and-suspenders for future callers) but is no longer an unconditional refusal.
