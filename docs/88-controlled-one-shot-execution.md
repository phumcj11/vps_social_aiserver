# 88 — Controlled One-Shot Execution (prepare_only vs submit_once)

**Status:** PILOT 0 — Real Comment Adapter.
**Applies to:** KMKT Social AI

The real adapter has exactly two modes. There is **no batch mode, no loop, no "execute now" surface**.

---

## `prepare_only` — read-only readiness probe

Coordinator: `ExecutionCoordinator.prepareOnly(workspaceId, jobId)`. CLI: `pnpm action:execution:prepare-live --workspace <uuid> --action <uuid>` (run with cwd `apps/api`, as the non-root browser user).

It **may**: launch the browser, validate the connected session, open the exact target, verify post identity, verify comment availability, inspect existing comments, locate the comment input, validate the approved content, then close.

It **must not**: focus/type into the comment field, submit, react, like, message, join, or modify Facebook in any way.

It creates **no** execution session, **no** idempotency reservation, and **no** job state change. It intentionally does **not** require the write gates — it can never write — so it is usable for readiness checks while every write flag stays disabled (and even while the kill switch is on). Used for automated and operator-supervised readiness checks against the exact Pilot target.

---

## `submit_once` — the single gated write

Available **only** when every hard gate passes together (see [87](87-real-facebook-comment-adapter.md#hard-enablement-gates-a-real-submit-requires-all)) **and** the executor grants an explicit one-shot authorization. It applies to exactly one Action Job id, one `target_post_key`, and the immutable approved content — **no content override**.

The submit sequence:

1. re-verify target identity immediately before typing;
2. re-check for a duplicate matching comment;
3. acquire the composer with strict, container-scoped selectors;
4. type the exact approved content;
5. verify the composer read-back **exactly** equals the approved content (else abort — no submit);
6. re-check the kill switch immediately before submit;
7. submit **once** (a `submitted` latch prevents any second submit);
8. wait for deterministic evidence;
9. classify the outcome as `verified_success`, `verified_failure`, or `ambiguous`;
10. **never** auto-retry when ambiguous.

Authorization is deliberately **not** wired to casual tooling: the CLI exposes no submit command, and there is no Execute-Now API/UI. A real submit is a separate, deliberate operator procedure — see the [controlled write runbook](71-safe-execution-runbook.md).

---

## Abort conditions

Every condition below aborts **before typing or submission**, with an explicit safe error code, and leaves the job blocked/unchanged and the profile lock released:

| Condition | Code |
| --- | --- |
| login required | `LOGIN_REQUIRED` |
| checkpoint | `CHECKPOINT_REQUIRED` |
| CAPTCHA | `CAPTCHA_PRESENT` |
| account restriction | `ACCOUNT_RESTRICTED` |
| wrong / redirected post | `UNEXPECTED_REDIRECT` |
| deleted / not visible | `POST_NOT_VISIBLE` |
| comments disabled | `COMMENTS_DISABLED` |
| ambiguous DOM / multiple inputs | `MULTIPLE_INPUT_CANDIDATES` / `AMBIGUOUS_DOM` |
| no composer found | `COMMENT_INPUT_NOT_FOUND` |
| duplicate matching comment | `DUPLICATE_COMMENT_EXISTS` |
| typed-content mismatch | `TYPED_CONTENT_MISMATCH` (verification service) |
| profile lock conflict / second Chromium | `BROWSER_PROFILE_BUSY` |
| kill switch on | `KILL_SWITCH_ON` |
| write flag off / adapter mismatch | `ADAPTER_DISABLED` |
| not authorized | `SUBMIT_NOT_AUTHORIZED` |
| low RAM / disk warning | `RESOURCE_GUARD` |
| submit confirmation unavailable | `SUBMIT_CONFIRMATION_UNAVAILABLE` → ambiguous |

See [ADR-032](adr/ADR-032-one-shot-submit-and-ambiguity.md) for the ambiguity contract.
