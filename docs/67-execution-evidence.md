# 67 — Execution Evidence

Every execution attempt leaves an **append-only evidence trail** (`action_execution_evidence`) of what it *observed*. Evidence corroborates the decision; it never *is* the decision — a screenshot alone is never proof of success (see [68](68-execution-verification.md)).

## Evidence types

- `pre_submit_snapshot` — the target post state before typing.
- `typed_content_snapshot` — the composer read-back used for the exact-equality check.
- `submit_snapshot` — the moment after submit.
- `comment_identity` — the observed comment id, content, author, and post URL.
- `verification_snapshot` — the corroborating post-submit screenshot on success.
- `post_submit_screenshot` — a captured screenshot (opaque key + hash).
- `failure_snapshot` — recorded on any failure/ambiguous/interrupt path with a reason.

## Storage keys, not paths

Evidence stores an **opaque, relative storage key**, never an absolute filesystem path and never a client-supplied path. Keys are server-derived under a fixed root:

```
storage/screenshots/actions/{workspace}/{job}/{session}/{name}
```

`evidence-storage.ts` validates every path component against traversal (`..`, separators, absolute markers) and derives the filename from a content hash, so a caller can never influence where bytes land. This sprint writes only **synthetic** evidence (the fake adapter); the storage-key machinery exists so real capture is safe by construction the moment it is ever added.

Evidence records store a `sha256` `evidence_hash` and optional safe observations (content, author, comment id) — **never** secrets, cookies, or profile paths. The storage root is gitignored.
