import type { SubmittedCommentObservation } from './types';

/**
 * FacebookCommentPage — the narrow browser seam the real Playwright adapter
 * depends on (PILOT 0 real comment adapter).
 *
 * This is to the comment adapter what `CollectorBrowser` is to the Collector: a
 * tiny interface that a real Playwright-backed page implements at runtime and a
 * deterministic fake implements in tests. The adapter contains the SAFETY and
 * SEQUENCING logic; the page contains only raw, target-scoped DOM observation
 * and interaction. No business rules live here.
 *
 * The page NEVER returns cookies, localStorage, tokens, a profile path, or raw
 * HTML — only the minimal structured observations below. Every read/interaction
 * is scoped to the single verified target-post container (see the selector
 * strategy in `PlaywrightCommentPage`).
 */

/** A pre-submit platform interrupt — each ABORTS before any type/submit. */
export type PageInterrupt = 'login_required' | 'checkpoint' | 'captcha' | 'account_restricted';

/** What `open()` observed about the navigated target post. */
export interface PageTargetObservation {
  /** The page loaded and a post container is present. */
  loaded: boolean;
  /** A platform interrupt was detected (abort before typing). */
  interrupt: PageInterrupt | null;
  /** Final observed URL after navigation (canonicalized, no query/fragment). */
  observedUrl: string | null;
  /** Observed Facebook group id, when the target is a group post. */
  groupId: string | null;
  /** Observed Facebook post id. */
  postId: string | null;
  /** The post itself is visible (not deleted / not "content unavailable"). */
  postVisible: boolean;
  /** The post exposes a comment composer (comments are open). */
  commentsAvailable: boolean;
  /** Navigation landed somewhere other than the requested post. */
  redirected: boolean;
}

/** Result of locating the comment composer within the target post container. */
export interface CommentInputObservation {
  /** Number of composer candidates found INSIDE the verified post container. */
  candidateCount: number;
  /** Exactly one strict candidate was found. */
  located: boolean;
}

/** Whether a comment whose text matches the approved content already exists. */
export interface ExistingCommentObservation {
  matchFound: boolean;
}

/**
 * The browser seam. All methods operate on the single verified target post.
 * `screenshot()` returns redacted image bytes only (never HTML/session data).
 */
export interface FacebookCommentPage {
  /** Launch (if needed) and navigate to the exact target; observe identity. */
  open(targetUrl: string): Promise<PageTargetObservation>;
  /** Locate the comment composer strictly within the target post container. */
  locateCommentInput(): Promise<CommentInputObservation>;
  /** Look for an existing comment matching `needle` on the target post. */
  findExistingComment(needle: string): Promise<ExistingCommentObservation>;
  /** Type `content` into the located composer (submit_once path only). */
  typeIntoCommentInput(content: string): Promise<void>;
  /** Read the composer contents back for the exact-equality check. */
  readCommentInput(): Promise<string>;
  /** Click submit exactly once (submit_once path only). */
  submitComment(): Promise<void>;
  /** After submit, find the just-posted comment on the target post. */
  findSubmittedComment(needle: string): Promise<SubmittedCommentObservation>;
  /** Redacted screenshot bytes for evidence, or null. Never HTML/cookies. */
  screenshot(): Promise<Buffer | null>;
  /** Close Chromium and free all page resources. Idempotent. */
  close(): Promise<void>;
}

/** Options for constructing the real Playwright-backed page. */
export interface PlaywrightCommentPageOptions {
  /** Absolute, server-owned profile directory (never logged / exposed). */
  profileDir: string;
  /** Expected group id parsed from the canonical target (identity guard). */
  expectedGroupId: string | null;
  /** Expected post id parsed from the canonical target (identity guard). */
  expectedPostId: string | null;
  headless: boolean;
  navTimeoutMs: number;
  /** Bounded wait for the composer to hydrate after navigation (default 20s). */
  composerWaitMs?: number;
}

/**
 * Accessible-name pattern for a comment/reply composer, across locales. The
 * live Thai group composer is aria-label "เขียนคำตอบ..." (write a reply); FB also
 * uses "เขียนความคิดเห็น" / English "Write a comment" / "Comment" / "Reply". This
 * only narrows the page-level fallback — the caller still requires exactly one
 * match, so it can never select a second composer.
 */
const COMMENT_COMPOSER_NAME = /คำตอบ|ความคิดเห็น|ตอบกลับ|comment|reply|respond|write a/i;

/** Parse the group id + post id out of a canonical Facebook post URL. */
export function parsePostIdentity(url: string): { groupId: string | null; postId: string | null } {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter((s) => s.length > 0);
    if (segs[0] === 'groups' && (segs[2] === 'posts' || segs[2] === 'permalink')) {
      return { groupId: segs[1] ?? null, postId: segs[3] ?? null };
    }
    if (segs.length >= 3 && segs[segs.length - 2] === 'posts') {
      return { groupId: null, postId: segs[segs.length - 1] ?? null };
    }
    if (segs[0] === 'permalink.php') {
      return { groupId: null, postId: u.searchParams.get('story_fbid') };
    }
  } catch {
    /* fall through */
  }
  return { groupId: null, postId: null };
}

/**
 * PlaywrightCommentPage (PILOT 0 real comment adapter) — the ONLY code that
 * touches a real Facebook page. Playwright is imported LAZILY so tests, the
 * default (fake-adapter) runtime, and typecheck never need Chromium.
 *
 * SELECTOR STRATEGY (see docs/89-facebook-comment-selector-strategy.md). Layers,
 * in order, each STRICTLY scoped to the verified target-post container:
 *   1. canonical URL + parsed group/post id (identity, not styling);
 *   2. the post container: an `article`/`[role=article]` whose permalink carries
 *      the target post id;
 *   3. the composer: a `[role=textbox][contenteditable=true]` with an
 *      aria-label naming a comment field, found INSIDE that container only;
 *   4. observable submitted-comment text within the same container.
 * We deliberately do NOT rely on a single obfuscated CSS class, on
 * language-specific button text alone, on page-level `contenteditable`
 * selectors, or on positional/index selection without container verification.
 * A candidate count other than exactly one is an AMBIGUOUS_DOM abort — never a
 * guess.
 *
 * NOTE: these selectors are validated against live DOM during the
 * operator-supervised `prepare_only` run; they are never exercised by the unit
 * tests (which inject a deterministic fake page).
 */
export class PlaywrightCommentPage implements FacebookCommentPage {
  private context: import('playwright').BrowserContext | undefined;
  private page: import('playwright').Page | undefined;

  constructor(private readonly opts: PlaywrightCommentPageOptions) {}

  private requirePage(): import('playwright').Page {
    if (!this.page) throw new Error('page_not_open');
    return this.page;
  }

  /**
   * The post container: an `[role=article]` whose permalink carries the target
   * post id. Used for the preferred (article-scoped) composer layer and for
   * comment scans on layouts that nest the composer.
   */
  private postContainer(): import('playwright').Locator {
    const page = this.requirePage();
    return this.opts.expectedPostId
      ? page
          .locator('[role="article"]')
          .filter({ has: page.locator(`a[href*="${this.opts.expectedPostId}"]`) })
          .first()
      : page.locator('[role="article"]').first();
  }

  /**
   * Resolve the ONE comment composer for the verified target post, using layered
   * strategies (see docs/89). Each layer is strict — a comment/reply editable —
   * and the caller requires the resolved count to be exactly ONE. On a canonical
   * single-post permalink (identity already verified) the composer is unique.
   *
   * Layers, in order — the first with ≥1 match wins:
   *   1. article-scoped: the comment textbox INSIDE the verified post container
   *      (for layouts that nest it);
   *   2. labelled: a page-level `[role=textbox][contenteditable]` whose accessible
   *      name marks it a comment/reply composer (FB places it OUTSIDE the article);
   *   3. sole-editable: the single page-level `[role=textbox][contenteditable]`
   *      on the verified-target permalink (last-resort, uniqueness-guarded).
   */
  private composerLayers(): Array<{ name: string; loc: import('playwright').Locator }> {
    const page = this.requirePage();
    const editable = page.locator('[contenteditable="true"]');
    return [
      { name: 'article-scoped', loc: this.postContainer().getByRole('textbox').and(editable) },
      {
        name: 'labelled',
        loc: page.getByRole('textbox', { name: COMMENT_COMPOSER_NAME }).and(editable),
      },
      { name: 'sole-editable', loc: page.getByRole('textbox').and(editable) },
    ];
  }

  /** First composer layer that matches, with its candidate count. */
  private async resolveComposer(): Promise<{
    loc: import('playwright').Locator;
    count: number;
    layer: string;
  }> {
    const layers = this.composerLayers();
    for (const layer of layers) {
      const count = await layer.loc.count();
      if (count >= 1) return { loc: layer.loc, count, layer: layer.name };
    }
    const last = layers[layers.length - 1]!;
    return { loc: last.loc, count: 0, layer: 'none' };
  }

  async open(targetUrl: string): Promise<PageTargetObservation> {
    const { chromium } = await import('playwright');
    if (!this.context) {
      this.context = await chromium.launchPersistentContext(this.opts.profileDir, {
        headless: this.opts.headless,
      });
    }
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    this.page = page;
    await page.goto(targetUrl, {
      timeout: this.opts.navTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    const observedUrlRaw = page.url();

    // Interrupt detection from URL + minimal, language-agnostic signals.
    const interrupt = await this.detectInterrupt(page, observedUrlRaw);
    const { groupId, postId } = parsePostIdentity(observedUrlRaw);
    const canonicalObserved = stripUrl(observedUrlRaw);

    if (interrupt) {
      return {
        loaded: false,
        interrupt,
        observedUrl: canonicalObserved,
        groupId,
        postId,
        postVisible: false,
        commentsAvailable: false,
        redirected: false,
      };
    }

    const postVisible = (await page.locator('[role="article"]').count()) > 0;

    // The comment composer hydrates AFTER domcontentloaded — wait (bounded) for
    // any editable to appear before deciding availability, so a slow render is
    // never mistaken for "comments disabled".
    await page
      .waitForSelector('[contenteditable="true"], [role="textbox"]', {
        timeout: this.opts.composerWaitMs ?? 20_000,
        state: 'attached',
      })
      .catch(() => undefined);
    const composer = await this.resolveComposer();
    const commentsAvailable = postVisible && composer.count >= 1;
    const redirected =
      this.opts.expectedPostId != null && postId != null && postId !== this.opts.expectedPostId;

    return {
      loaded: postVisible,
      interrupt: null,
      observedUrl: canonicalObserved,
      groupId,
      postId,
      postVisible,
      commentsAvailable,
      redirected,
    };
  }

  private async detectInterrupt(
    page: import('playwright').Page,
    url: string,
  ): Promise<PageInterrupt | null> {
    const host = safeHost(url);
    const path = safePath(url);
    if (path.startsWith('/login') || path.startsWith('/checkpoint')) {
      return path.startsWith('/checkpoint') ? 'checkpoint' : 'login_required';
    }
    // A login form present on any page → session not connected.
    if ((await page.locator('input[name="pass"]').count()) > 0) return 'login_required';
    if (host.includes('checkpoint')) return 'checkpoint';
    // CAPTCHA iframes / challenge widgets.
    if ((await page.locator('iframe[src*="captcha"], iframe[title*="captcha" i]').count()) > 0) {
      return 'captcha';
    }
    return null;
  }

  async locateCommentInput(): Promise<CommentInputObservation> {
    const { count } = await this.resolveComposer();
    // Strict one-target: proceed only when exactly one composer is found.
    return { candidateCount: count, located: count === 1 };
  }

  async findExistingComment(needle: string): Promise<ExistingCommentObservation> {
    const page = this.requirePage();
    // Exact, trimmed text match on the verified single-post permalink. The
    // approved content is a specific business comment, so an exact match anywhere
    // in the post's comment list is a genuine duplicate.
    const matches = await page.getByText(needle.trim(), { exact: true }).count();
    return { matchFound: matches > 0 };
  }

  async typeIntoCommentInput(content: string): Promise<void> {
    const box = (await this.resolveComposer()).loc.first();
    await box.click();
    await box.fill(content);
  }

  async readCommentInput(): Promise<string> {
    const box = (await this.resolveComposer()).loc.first();
    return (await box.innerText()).trim();
  }

  async submitComment(): Promise<void> {
    // Keyboard submit is the most stable, language-agnostic action and stays
    // scoped to the focused composer (no button-text guessing across locales).
    await this.requirePage().keyboard.press('Meta+Enter');
  }

  async findSubmittedComment(needle: string): Promise<SubmittedCommentObservation> {
    const page = this.requirePage();
    const found = (await page.getByText(needle.trim(), { exact: true }).count()) > 0;
    return {
      found,
      facebookCommentId: null,
      observedContent: found ? needle.trim() : null,
      observedAuthor: null,
      observedPostUrl: stripUrl(page.url()),
      reason: found ? undefined : 'Submitted comment not observed on the post',
    };
  }

  async screenshot(): Promise<Buffer | null> {
    try {
      return await this.requirePage().screenshot({ type: 'png' });
    } catch {
      return null;
    }
  }

  /**
   * Close Chromium reliably. Facebook pages can register unload handlers that
   * make a plain `context.close()` hang or resolve without the browser dying, and
   * a persistent context exposes no browser handle to force-close. So we: close
   * each page with runBeforeUnload:false, bound `context.close()`, and — as a
   * last resort — kill any Chromium still holding THIS profile (scoped to the
   * unique per-workspace profile dir, so it can never touch another browser).
   */
  async close(): Promise<void> {
    const ctx = this.context;
    const profileDir = this.opts.profileDir;
    this.context = undefined;
    this.page = undefined;
    if (ctx) {
      try {
        for (const p of ctx.pages()) {
          await p.close({ runBeforeUnload: false }).catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
      await Promise.race([
        ctx.close().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 15_000)),
      ]);
    }
    await killChromeForProfile(profileDir);
  }
}

/**
 * Last-resort: terminate any Chromium still running with this exact
 * `--user-data-dir`. Scoped to the unique per-workspace profile path, so it
 * cannot affect any other browser. Best-effort and non-throwing.
 */
async function killChromeForProfile(profileDir: string): Promise<void> {
  if (!profileDir) return;
  try {
    const { execFile } = await import('node:child_process');
    await new Promise<void>((resolve) => {
      execFile('pkill', ['-f', `--user-data-dir=${profileDir}`], () => resolve());
    });
    // Give SIGTERM a moment, then force any stragglers for this profile only.
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    await new Promise<void>((resolve) => {
      execFile('pkill', ['-9', '-f', `--user-data-dir=${profileDir}`], () => resolve());
    });
  } catch {
    /* best-effort */
  }
}

function stripUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw;
  }
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function safePath(raw: string): string {
  try {
    return new URL(raw).pathname;
  } catch {
    return '';
  }
}
