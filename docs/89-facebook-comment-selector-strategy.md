# 89 — Facebook Comment Selector Strategy

**Status:** PILOT 0 — Real Comment Adapter.
**Applies to:** `apps/api/src/execution/comment-page.ts` (`PlaywrightCommentPage`).

Facebook's markup is obfuscated and volatile. The selector strategy is therefore **strict, layered, and always scoped to the one verified target-post container**. Ambiguity is an abort, never a guess.

---

## Preferred evidence sources (in order)

1. **Canonical URL + parsed post identity** — the group id and post id parsed from the canonical target URL (identity, not styling). The observed `target_post_key` is re-derived the same way the intent was, and any mismatch aborts (`UNEXPECTED_REDIRECT` / `TARGET_MISMATCH`).
2. **The post container** — a `[role="article"]` element whose permalink/anchor carries the **target post id**. Every subsequent query is scoped **inside this container only**.
3. **The composer** — a `[role="textbox"][contenteditable="true"]` (a comment field by ARIA semantics) found **within** that container.
4. **Observable submitted-comment text** — the just-posted comment located by exact text within the same container.

## Explicitly NOT relied upon

- a single obfuscated CSS class;
- language-specific button text alone (submit is a keyboard action, `Meta/Ctrl+Enter`, on the focused composer — locale-independent);
- broad, page-level `contenteditable` selectors;
- index-based / positional selection without target-container verification.

## Ambiguity is an abort

`locateCommentInput()` returns a **candidate count**. The adapter proceeds **only** when the count is exactly **one**. Zero → `COMMENT_INPUT_NOT_FOUND`; more than one → `MULTIPLE_INPUT_CANDIDATES` (an `AMBIGUOUS_DOM` class of failure). Each fallback layer remains scoped to the verified target-post container, so a fallback can never target another post's composer.

## Composer resolution layers (hardened from a live finding)

A live `prepare_only` run against a real group post showed the comment composer is a single `div[role="textbox"][contenteditable="true"]` (aria-label `เขียนคำตอบ...`) that sits **OUTSIDE every `[role="article"]`** — so an article-scoped-only lookup found zero and falsely reported `COMMENTS_DISABLED`. The composer also **hydrates after `domcontentloaded`**. Resolution is therefore layered (`composerLayers`), first match wins, and the caller still requires **exactly one** candidate:

1. **article-scoped** — the comment textbox inside the verified post container (kept first; correct on layouts that nest it);
2. **labelled** — a page-level `[role="textbox"][contenteditable="true"]` whose accessible name matches a comment/reply pattern (`คำตอบ|ความคิดเห็น|ตอบกลับ|comment|reply|respond|write a`, case-insensitive);
3. **sole-editable** — the single page-level comment textbox on the verified-target permalink (uniqueness-guarded last resort).

The **scope** is the exact canonical single-post permalink (identity confirmed: observed `target_post_key` equals the job's), and **uniqueness** (exactly one) is what keeps it strict — this narrows the fallback rather than broadening it globally. `open()` waits (bounded, `composerWaitMs`, default 20s) for an editable to hydrate before deciding availability, so a slow render is never mistaken for disabled comments.

Also hardened from the same run: `PlaywrightCommentPage.close()` closes pages with `runBeforeUnload:false`, bounds `context.close()`, and — because a persistent context exposes no browser handle to force-close and Facebook's unload handlers can keep Chromium alive — kills, as a last resort, any Chromium still holding **this** `--user-data-dir` (scoped to the unique per-workspace profile, so it can never touch another browser). This guarantees "browser closed" after every run.

## Testing & validation

The selectors live only in `PlaywrightCommentPage` and are **never exercised by unit tests** — the adapter is tested against a deterministic fake `FacebookCommentPage`, so the safety/sequencing logic is proven without Chromium. The selectors were validated against **live DOM during an operator-authorized read-only `prepare_only` run** (types/submits nothing): after the fix it returns comments-available with exactly one unique composer on the exact Pilot target. Further hardening for other layouts happens the same way — read-only, before any `submit_once`.
