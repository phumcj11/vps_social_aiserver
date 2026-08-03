# 64 — Facebook Comment Adapter

The **Facebook Comment Adapter** is a *narrow* seam between the Action Executor and one platform action: posting a single Facebook comment. It is deliberately **not** a generic Platform Adapter Framework — per the Architecture Review, we generalize only when a second real platform implementation exists.

## Interface

`FacebookCommentAdapter` (see `apps/api/src/execution/types.ts`) exposes exactly the steps one comment write needs, and nothing else:

- `verifyTarget` — confirm the target post exists and matches the intended identity.
- `prepareComment` — focus the composer and type the approved content (no submit).
- `verifyTypedContent` — read back the composer contents for the exact-equality check.
- `submitComment` — click submit; returns `submitted` / `ambiguous` / `failed`, plus an optional platform `interrupt`.
- `verifySubmittedComment` — observe the posted comment (id, content, author) on the post.
- `captureEvidence` — capture a screenshot/snapshot as an opaque storage key + hash.
- `close` — release any resources.

The adapter **only observes and acts**; it never decides success. Every safety judgment (target match, exact typed-content equality, verified success) lives in the [verification service](68-execution-verification.md) so it is enforced identically for every adapter.

## Implementations

- **`FakeFacebookCommentAdapter`** (default) — fully deterministic, no network, no browser. Given a scenario it reproduces every outcome (success, each pre-submit abort, each ambiguous/interrupt path). It is the **only** adapter used by tests and runtime verification.
- **`PlaywrightFacebookCommentAdapter`** — the [disabled boundary](66-execution-session-lifecycle.md) where a real write would eventually live. It refuses to run (see [ADR-026](adr/ADR-026-playwright-adapter-disabled-boundary.md)).

Selection is by `FACEBOOK_COMMENT_ADAPTER` (`fake` default; `playwright` returns the refusing boundary). No real Facebook write ships this sprint.

## The context object

The adapter receives an `ExecutionContext` carrying only the immutable, credential-free inputs: workspace/job/session ids, the canonical target URL, the deterministic `targetPostKey`, and the exact approved content. **No Facebook credentials, cookies, or browser-profile secrets** ever cross this boundary.

See also: [ADR-023](adr/ADR-023-facebook-comment-adapter-boundary.md).
