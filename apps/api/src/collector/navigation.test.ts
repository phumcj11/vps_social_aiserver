import { describe, expect, it } from 'vitest';
import { Navigator, type PageController } from './navigation';

class FakePage implements PageController {
  public gotoUrl: string | null = null;
  public scrolls = 0;
  constructor(private html: string) {}
  async goto(url: string): Promise<void> {
    this.gotoUrl = url;
  }
  async scrollOnce(): Promise<void> {
    this.scrolls += 1;
  }
  async getHtml(): Promise<string> {
    return this.html;
  }
}

describe('Navigator (read-only)', () => {
  it('opens the group, scrolls maxScrolls times, and returns the page HTML', async () => {
    const page = new FakePage('<html>posts</html>');
    const result = await new Navigator().collect(page, 'https://www.facebook.com/groups/123', {
      maxScrolls: 3,
      timeoutMs: 1000,
    });
    expect(page.gotoUrl).toBe('https://www.facebook.com/groups/123');
    expect(page.scrolls).toBe(3);
    expect(result.scrolls).toBe(3);
    expect(result.pageHtml).toBe('<html>posts</html>');
  });

  it('stops scrolling early when aborted', async () => {
    const page = new FakePage('<html></html>');
    const controller = new AbortController();
    controller.abort();
    const result = await new Navigator().collect(page, 'https://www.facebook.com/groups/1', {
      maxScrolls: 10,
      timeoutMs: 1000,
      signal: controller.signal,
    });
    expect(result.scrolls).toBe(0);
  });

  it('the PageController exposes only read/navigation methods (no write)', () => {
    const page = new FakePage('') as unknown as Record<string, unknown>;
    for (const forbidden of [
      'click',
      'like',
      'share',
      'comment',
      'message',
      'join',
      'type',
      'fill',
    ]) {
      expect(page[forbidden]).toBeUndefined();
    }
  });
});
