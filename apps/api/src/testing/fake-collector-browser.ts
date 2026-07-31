import type { CollectorBrowser, CollectResult } from '../collector/browser';

/**
 * Fake collector browser for tests — no Playwright, no Chromium, no Facebook.
 * Returns a fixed page HTML (or throws) so the pipeline can be exercised fully.
 */
export class FakeCollectorBrowser implements CollectorBrowser {
  public collectCalls = 0;

  constructor(private opts: { pageHtml?: string; throwMessage?: string; delayMs?: number } = {}) {}

  async collect(): Promise<CollectResult> {
    this.collectCalls += 1;
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    if (this.opts.throwMessage) throw new Error(this.opts.throwMessage);
    return { pageHtml: this.opts.pageHtml ?? '', scrolls: 3 };
  }
}
