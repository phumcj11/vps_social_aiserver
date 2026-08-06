# 90 — Facebook Comment Evidence

**Status:** PILOT 0 — Real Comment Adapter. Extends [67 — Execution Evidence](67-execution-evidence.md).
**Applies to:** KMKT Social AI

Evidence is a **corroborating audit trail**, never the success decision itself (a screenshot alone is never proof — the verification service requires an independently observed comment with a Facebook comment id whose text exactly equals the approved content).

---

## On verified success we store ONLY

- Action Job id, Execution Session id, workspace id;
- canonical target URL and `target_post_key`;
- submitted-content **hash** (SHA-256);
- timestamp;
- connected Facebook account **reference** (the stored account id, not credentials);
- the submitted comment's URL / stable identifier when available;
- a **redacted screenshot storage key** (a relative, traversal-safe key — never an absolute path);
- verification method;
- adapter version (`playwright-fb-comment-v1`).

## We NEVER store

cookies, localStorage, browser-profile paths, credentials, access tokens, unrelated page content, private messages, or full HTML dumps.

## Storage & safety

- Evidence lives under the server-owned root `storage/screenshots/actions/{workspace}/{job}/{session}/…`; the persisted value is the **relative storage key** produced by `buildEvidenceStorageKey`, which is asserted safe (`isSafeEvidenceStorageKey`: no `..`, no leading `/`, no `\`).
- The redacted screenshot bytes (PNG) are hashed; the adapter surfaces only `{ storageKey, evidenceHash, metadata:{ adapter, captured, adapterVersion } }`.
- **Gitignored & permission-restricted:** `storage/screenshots/*`, `storage/browser-profiles/*`, and `/apps/api/storage/**` are ignored (only `.gitkeep` tracked); the browser profile directory is created `0700` and the lock file `0600`. No session material is ever tracked by git.

## Idempotency & recovery interplay

- **Before execution** the coordinator reserves the idempotency key transactionally and refuses a verified duplicate, an in-flight duplicate, or an ambiguous prior result.
- **On verified success**: finalize the success idempotency record, mark the job `succeeded`, append `action_succeeded`, preserve evidence.
- **On verified failure**: mark `failed` with a safe code; release/finalize the reservation per the existing model; **no** auto-retry.
- **On ambiguous**: mark `ambiguous`, keep the reservation **live**, require human recovery, **never** auto-retry.

See [68 — Execution Verification](68-execution-verification.md) and [69 — Execution Recovery](69-execution-recovery.md).
