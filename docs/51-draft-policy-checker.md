# 51 — Draft Policy Checker

**Document status:** SPRINT 009 — AI Draft Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **DraftPolicyChecker** screens generated draft content against safety rules and returns a decision with structured reasons. It is **pure and deterministic** — no I/O, no model, no auto-approval. It is the Backend's validation step over provider output (docs/09-ai-design.md, "AI Output Contract").

---

## Decision

| Decision | Meaning | Resulting draft status |
| -------- | ------- | ---------------------- |
| **PASS** | No issues found | `draft` |
| **NEEDS_REVIEW** | Soft flags a human should check | `needs_review` |
| **BLOCK** | A hard safety failure | `needs_review` (NEVER a ready/approved state) |

`decision = BLOCK` if any block-level reason fires; else `NEEDS_REVIEW` if any review-level reason fires; else `PASS`. A **BLOCK never yields a ready or approved state**, a **NEEDS_REVIEW** is stored as `needs_review`, and a **PASS** may be stored as `draft`. There is no automatic approval and no automatic regeneration loop.

---

## Checks

**Block-level (hard failures):**

| Code | Fires when |
| ---- | ---------- |
| `EMPTY_OUTPUT` | Content is empty after trimming |
| `EXCESSIVE_LENGTH` | Content exceeds `AI_DRAFT_MAX_LENGTH` |
| `PROHIBITED_CLAIM` | Content contains a business prohibited claim |
| `GUARANTEED_AVAILABILITY` | Asserts guaranteed availability (Thai/English phrase set) |
| `GUARANTEED_PRICE` | Asserts a guaranteed/lowest price |
| `UNSAFE_LANGUAGE` | Contains abusive/unsafe terms |

**Review-level (soft flags):**

| Code | Fires when |
| ---- | ---------- |
| `MISSING_BUSINESS_NAME` | The business name is absent from the draft |
| `UNSUPPORTED_CONTACT` | A phone/email/URL appears that is **not** in the business-provided contact |
| `UNSUPPORTED_PROMOTION` | Promotion wording not backed by the business context |

A provider failure is treated by the Coordinator as a `BLOCK` (`PROVIDER_FAILED`) so the attempt is preserved as `needs_review` with no content.

---

## Determinism

Given the same content and context, the checker returns the same decision and reasons. All detection is explicit keyword/pattern matching (no model, no clock, no randomness), so results are reproducible and the stored `policy_result` fully explains why a draft is `draft` vs `needs_review`.

See [48-ai-draft-engine.md](48-ai-draft-engine.md), [52-ai-draft-lifecycle.md](52-ai-draft-lifecycle.md).
