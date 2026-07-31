import { Navigator, type PageController } from './navigation';
import type { CollectOptions } from './types';

/**
 * Collector browser abstraction (SPRINT 006). The coordinator depends only on
 * this interface, so it runs against real Playwright at runtime and a fake in
 * tests — no real browser or Facebook access is needed to test the pipeline.
 *
 * The browser performs ONLY read-only navigation + HTML capture. It never
 * clicks, likes, shares, comments, messages, joins, or writes.
 */
export interface CollectResult {
  pageHtml: string;
  scrolls: number;
}

export interface CollectorBrowser {
  collect(profileDir: string, canonicalUrl: string, opts: CollectOptions): Promise<CollectResult>;
}

/**
 * Playwright-backed collector browser. Loads Playwright lazily so tests and the
 * default (reader-disabled) runtime never need Chromium. This code path runs
 * only when an operator explicitly enables the reader with a connected session.
 *
 * It scrolls via a string expression (`window.scrollBy(...)`) and reads via
 * `page.content()` — no DOM types, no page mutation beyond scrolling.
 */
export class PlaywrightCollectorBrowser implements CollectorBrowser {
  private readonly navigator = new Navigator();

  async collect(
    profileDir: string,
    canonicalUrl: string,
    opts: CollectOptions,
  ): Promise<CollectResult> {
    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profileDir, { headless: true });
    } catch (err) {
      throw new Error(`browser_launch_failed: ${(err as Error).message}`);
    }
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      const controller: PageController = {
        goto: async (url, timeoutMs) => {
          await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
        },
        // Read-only scroll (string expression avoids DOM types); brief settle.
        scrollOnce: async () => {
          await page.evaluate('window.scrollBy(0, document.body.scrollHeight)');
          await page.waitForTimeout(1000);
        },
        getHtml: () => page.content(),
      };
      return await this.navigator.collect(controller, canonicalUrl, {
        maxScrolls: opts.maxScrolls,
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}
