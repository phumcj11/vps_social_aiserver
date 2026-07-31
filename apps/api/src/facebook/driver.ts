/**
 * Browser driver abstraction for the Facebook connection flow (SPRINT 004).
 *
 * The connection SERVICE (state machine, profile handling, locking, auditing)
 * depends only on this interface. At runtime a Playwright-backed driver launches
 * a persistent Chromium context; in tests a fake driver simulates outcomes so no
 * real browser or Facebook login is required.
 *
 * The driver performs ONLY connection/validation. It never scans groups, reads
 * posts, or performs any write action.
 */

export type ConnectOutcome =
  | 'connected'
  | 'login_required'
  | 'checkpoint_required'
  | 'blocked'
  | 'timeout'
  | 'validation_failed';

export type ValidateOutcome =
  'connected' | 'login_required' | 'checkpoint_required' | 'blocked' | 'validation_failed';

export interface AccountIdentity {
  displayName: string | null;
  facebookUserId: string | null;
}

export interface ConnectResult {
  outcome: ConnectOutcome;
  identity?: AccountIdentity;
  sessionExpiresAt?: Date | null;
}

export interface ValidateResult {
  outcome: ValidateOutcome;
}

export interface DriverRunOptions {
  timeoutMs: number;
  /** Aborted when the workspace is disconnected mid-run. */
  signal?: AbortSignal;
}

export type GroupValidateOutcome =
  | 'accessible'
  | 'inaccessible'
  | 'login_required'
  | 'checkpoint_required'
  | 'not_found'
  | 'validation_failed';

export interface GroupValidateResult {
  outcome: GroupValidateOutcome;
  groupName?: string | null;
  facebookGroupId?: string | null;
}

export interface BrowserDriver {
  /** Interactive, user-driven login into the persistent profile. */
  connectInteractive(profileDir: string, opts: DriverRunOptions): Promise<ConnectResult>;
  /** Validate the persisted session without any scanning or writing. */
  validate(profileDir: string, opts: DriverRunOptions): Promise<ValidateResult>;
  /**
   * Validate that the connected session can access a group's LANDING page.
   * Navigates only to the canonical group URL. It MUST NOT scroll, open posts,
   * read post text, or click any control (Like/Join/Comment/Share). Reads only
   * safe page-level metadata (title / og:title, numeric id).
   */
  validateGroupAccess(
    profileDir: string,
    canonicalUrl: string,
    opts: DriverRunOptions,
  ): Promise<GroupValidateResult>;
}

/**
 * Real Playwright driver. Loads Playwright lazily so that neither tests nor the
 * default (login-disabled) runtime need Chromium present. This code path is
 * exercised only when an operator explicitly enables login and drives it.
 *
 * NOTE: This driver is intentionally conservative. It opens ONLY the Facebook
 * login/home page to let a human log in and to read minimal identity; it never
 * navigates to groups or posts and performs no writes.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  async connectInteractive(profileDir: string, opts: DriverRunOptions): Promise<ConnectResult> {
    // Lazy import keeps `playwright` optional for tests / disabled runtime.
    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
      });
    } catch (err) {
      throw new Error(`browser_launch_failed: ${(err as Error).message}`);
    }
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto('https://www.facebook.com/', {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
      // Wait for a human to complete login: poll for a logged-in indicator or
      // a checkpoint, bounded by the timeout. No credentials are typed here.
      // Login is detected via the presence of the Facebook `c_user` cookie
      // (read from the browser context — no DOM/script injection).
      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() < deadline) {
        if (opts.signal?.aborted) return { outcome: 'validation_failed' };
        if (/\/checkpoint\//.test(page.url())) return { outcome: 'checkpoint_required' };
        const cookies = await context.cookies('https://www.facebook.com').catch(() => []);
        if (cookies.some((c) => c.name === 'c_user')) {
          return { outcome: 'connected', identity: { displayName: null, facebookUserId: null } };
        }
        await page.waitForTimeout(2000);
      }
      return { outcome: 'timeout' };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async validate(profileDir: string, opts: DriverRunOptions): Promise<ValidateResult> {
    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profileDir, { headless: true });
    } catch (err) {
      throw new Error(`browser_launch_failed: ${(err as Error).message}`);
    }
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto('https://www.facebook.com/', {
        timeout: opts.timeoutMs,
        waitUntil: 'domcontentloaded',
      });
      const url = page.url();
      if (/\/checkpoint\//.test(url)) return { outcome: 'checkpoint_required' };
      if (/\/login\//.test(url)) return { outcome: 'login_required' };
      const cookies = await context.cookies('https://www.facebook.com').catch(() => []);
      const loggedIn = cookies.some((c) => c.name === 'c_user');
      return { outcome: loggedIn ? 'connected' : 'login_required' };
    } catch {
      return { outcome: 'validation_failed' };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async validateGroupAccess(
    profileDir: string,
    canonicalUrl: string,
    opts: DriverRunOptions,
  ): Promise<GroupValidateResult> {
    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profileDir, { headless: true });
    } catch (err) {
      throw new Error(`browser_launch_failed: ${(err as Error).message}`);
    }
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      // Navigate ONLY to the group landing page. No scrolling, no post opening,
      // no clicks. Read only safe page-level metadata (title / og:title).
      const response = await page.goto(canonicalUrl, {
        timeout: opts.timeoutMs,
        waitUntil: 'domcontentloaded',
      });
      const url = page.url();
      if (/\/checkpoint\//.test(url)) return { outcome: 'checkpoint_required' };
      if (/\/login\//.test(url) || /login\.php/.test(url)) return { outcome: 'login_required' };
      if (response && response.status() === 404) return { outcome: 'not_found' };

      // Safe metadata only: og:title meta or document title (never post text).
      const ogTitle = await page
        .locator('meta[property="og:title"]')
        .first()
        .getAttribute('content')
        .catch(() => null);
      const title = ogTitle ?? (await page.title().catch(() => ''));
      const lower = (title ?? '').toLowerCase();
      if (lower.includes('content isn') || lower.includes('page not found')) {
        return { outcome: 'not_found' };
      }
      if (lower.includes('log in') || lower.includes('log into facebook')) {
        return { outcome: 'login_required' };
      }
      // A numeric token in the canonical URL is the Facebook group id.
      const idMatch = /\/groups\/(\d+)(?:\/|$)/.exec(canonicalUrl);
      return {
        outcome: 'accessible',
        groupName: title && title.trim().length > 0 ? title.trim() : null,
        facebookGroupId: idMatch ? idMatch[1] : null,
      };
    } catch {
      return { outcome: 'validation_failed' };
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}
