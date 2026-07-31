import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { AuditService } from '../lib/audit';
import { ProfileService } from '../facebook/profile';
import { CollectorRepository } from './repository';
import { CollectorCoordinator } from './coordinator';
import { CollectorErrorCode } from './errors';
import { FakeCollectorBrowser } from '../testing/fake-collector-browser';

const TWO_POSTS = `
<div role="article"><a href="/user/1/">A</a><a href="/groups/9/posts/111/">t</a>
<div data-ad-comet-preview="message"><div dir="auto">post one</div></div></div>
<div role="article"><a href="/user/2/">B</a><a href="/groups/9/posts/222/">t</a>
<div data-ad-comet-preview="message"><div dir="auto">post two</div></div></div>`;

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

async function setup(opts: {
  reader?: boolean;
  connected?: boolean;
  browser?: FakeCollectorBrowser;
}) {
  const store = new InMemoryStore();
  const root = mkdtempSync(join(tmpdir(), 'kmkt-coll-'));
  roots.push(root);
  const env = loadApiEnv({
    APP_ENV: 'test',
    BROWSER_PROFILE_ROOT: root,
    FACEBOOK_READER_ENABLED: opts.reader ? 'true' : 'false',
    COLLECTOR_MAX_SCROLLS: '2',
    COLLECTOR_MAX_POSTS_PER_GROUP: '30',
    COLLECTOR_TIMEOUT_MS: '3000',
  });
  const browser = opts.browser ?? new FakeCollectorBrowser({ pageHtml: TWO_POSTS });
  const coordinator = new CollectorCoordinator({
    repo: new CollectorRepository(store),
    browser,
    profiles: new ProfileService(root),
    audit: new AuditService(store),
    env,
    logger: createLogger('error'),
  });
  const workspaceId = randomUUID();
  if (opts.connected !== false) {
    const acc = await store.createFacebookConnection({
      id: randomUUID(),
      workspaceId,
      profilePath: `${workspaceId}/facebook`,
    });
    await store.updateFacebookIdentity(acc.id, {
      displayName: 'U',
      facebookUserId: '1',
      sessionExpiresAt: null,
    });
  }
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId,
    facebookGroupId: '9',
    canonicalUrl: 'https://www.facebook.com/groups/9',
    originalUrl: 'https://www.facebook.com/groups/9',
  });
  return { store, coordinator, workspaceId, group, browser };
}

describe('CollectorCoordinator — pipeline', () => {
  it('collects, normalizes, persists, and checkpoints (run completed)', async () => {
    const { store, coordinator, workspaceId, group, browser } = await setup({
      reader: true,
      connected: true,
    });
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);

    const status = await coordinator.status(workspaceId);
    expect(status.run!.status).toBe('completed');
    expect(status.run!.postsCollected).toBe(2);
    expect(status.run!.groupsProcessed).toBe(1);
    expect(status.totalSignals).toBe(2);
    expect(browser.collectCalls).toBe(1);

    const cp = await store.getCheckpointByGroup(group.id);
    expect(cp).not.toBeNull();
    expect(cp!.lastScan).not.toBeNull();

    expect(await store.listAuditEventsByType('collector_run_started')).toHaveLength(1);
    expect(await store.listAuditEventsByType('collector_run_completed')).toHaveLength(1);
    expect(await store.listAuditEventsByType('collector_group_collected')).toHaveLength(1);
  });

  it('reader disabled → completes with 0 posts and no browser launch', async () => {
    const { coordinator, workspaceId, browser } = await setup({ reader: false, connected: true });
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    const status = await coordinator.status(workspaceId);
    expect(status.run!.status).toBe('completed');
    expect(status.run!.postsCollected).toBe(0);
    expect(status.run!.errorSummary).toContain('reader_disabled');
    expect(browser.collectCalls).toBe(0);
  });

  it('no connected session → run fails, no browser launch', async () => {
    const { coordinator, workspaceId, browser } = await setup({ reader: true, connected: false });
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    const status = await coordinator.status(workspaceId);
    expect(status.run!.status).toBe('failed');
    expect(status.run!.errorSummary).toBe('session_not_connected');
    expect(browser.collectCalls).toBe(0);
  });

  it('skips duplicates on a second run', async () => {
    const { coordinator, workspaceId } = await setup({ reader: true, connected: true });
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    const runs = await coordinator.listRuns(workspaceId);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.postsCollected).toBe(0); // newest run collected nothing new
    expect((await coordinator.status(workspaceId)).totalSignals).toBe(2);
  });

  it('records a per-group error without failing the whole run', async () => {
    const browser = new FakeCollectorBrowser({ throwMessage: 'navigation boom' });
    const { coordinator, workspaceId, store } = await setup({
      reader: true,
      connected: true,
      browser,
    });
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    const status = await coordinator.status(workspaceId);
    expect(status.run!.status).toBe('completed');
    expect(status.run!.errors).toBe(1);
    expect(status.run!.postsCollected).toBe(0);
    expect(await store.listAuditEventsByType('collector_group_error')).toHaveLength(1);
  });

  it('rejects a concurrent start (concurrency one)', async () => {
    const browser = new FakeCollectorBrowser({ pageHtml: TWO_POSTS, delayMs: 200 });
    const { coordinator, workspaceId } = await setup({ reader: true, connected: true, browser });
    await coordinator.start(workspaceId);
    await expect(coordinator.start(workspaceId)).rejects.toMatchObject({
      code: CollectorErrorCode.ALREADY_RUNNING,
    });
    await coordinator.waitForIdle(workspaceId);
  });

  it('stop marks the run paused', async () => {
    const browser = new FakeCollectorBrowser({ pageHtml: TWO_POSTS, delayMs: 200 });
    const { coordinator, workspaceId } = await setup({ reader: true, connected: true, browser });
    await coordinator.start(workspaceId);
    await new Promise((r) => setTimeout(r, 40));
    await coordinator.stop(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    expect((await coordinator.status(workspaceId)).run!.status).toBe('paused');
  });
});
