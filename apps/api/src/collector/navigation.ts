/**
 * Navigation (SPRINT 006) — READ-ONLY page movement.
 *
 * The `PageController` interface deliberately exposes ONLY read/navigation
 * capabilities: open, scroll, read HTML, close. There is NO click, like, share,
 * comment, message, or join method — read-only is guaranteed by construction.
 *
 * The `Navigator` is testable with a fake PageController (no browser).
 */

export interface PageController {
  /** Open the group's landing page. */
  goto(url: string, timeoutMs: number): Promise<void>;
  /** Scroll down once to load more posts (read-only). */
  scrollOnce(): Promise<void>;
  /** Read the current page HTML (no mutation). */
  getHtml(): Promise<string>;
}

export interface NavigationResult {
  pageHtml: string;
  scrolls: number;
}

export interface NavigatePlan {
  maxScrolls: number;
  timeoutMs: number;
  scrollDelayMs?: number;
  signal?: AbortSignal;
}

export class Navigator {
  /**
   * Open the group, scroll up to `maxScrolls` times, and return the final page
   * HTML. Never clicks or writes. Stops early if aborted.
   */
  async collect(page: PageController, url: string, plan: NavigatePlan): Promise<NavigationResult> {
    await page.goto(url, plan.timeoutMs);
    let scrolls = 0;
    for (let i = 0; i < plan.maxScrolls; i += 1) {
      if (plan.signal?.aborted) break;
      await page.scrollOnce();
      scrolls += 1;
      if (plan.scrollDelayMs && plan.scrollDelayMs > 0) {
        await new Promise((r) => setTimeout(r, plan.scrollDelayMs));
      }
    }
    const pageHtml = await page.getHtml();
    return { pageHtml, scrolls };
  }
}
