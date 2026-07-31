import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { ActionRepository } from './repository';
import { ActionQueue, assertTransition } from './queue';
import { ActionError } from './errors';
import type { ActionIntent } from './types';

function makeQueue(store: InMemoryStore) {
  return new ActionQueue(new ActionRepository(store));
}

function intent(ws: string): ActionIntent {
  return {
    workspaceId: ws,
    reviewTaskId: randomUUID(),
    aiDraftId: randomUUID(),
    businessMatchId: randomUUID(),
    actionType: 'facebook_comment',
    targetPlatform: 'facebook',
    targetUrl: 'https://www.facebook.com/groups/1/posts/abc',
    approvedContent: 'สวัสดีค่ะ',
  };
}

describe('ActionQueue state machine', () => {
  it('enqueues a job and records created + status events', async () => {
    const store = new InMemoryStore();
    const q = makeQueue(store);
    const ws = randomUUID();
    const job = await q.enqueue({ intent: intent(ws), initialStatus: 'blocked', maxAttempts: 3 });
    expect(job.status).toBe('blocked');
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).toEqual(['action_job_created', 'action_job_blocked']);
  });

  it('blocks a queued job', async () => {
    const store = new InMemoryStore();
    const q = makeQueue(store);
    const job = await q.enqueue({
      intent: intent(randomUUID()),
      initialStatus: 'queued',
      maxAttempts: 3,
    });
    const blocked = await q.block(job, [{ code: 'KILL_SWITCH_ON', detail: 'x' }]);
    expect(blocked.status).toBe('blocked');
  });

  it('cancels a blocked job', async () => {
    const store = new InMemoryStore();
    const q = makeQueue(store);
    const job = await q.enqueue({
      intent: intent(randomUUID()),
      initialStatus: 'blocked',
      maxAttempts: 3,
    });
    const cancelled = await q.cancel(job);
    expect(cancelled.status).toBe('cancelled');
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).toContain('action_job_cancelled');
  });

  it('rejects an invalid transition', () => {
    expect(() => assertTransition('succeeded', 'queued')).toThrow(ActionError);
    expect(() => assertTransition('cancelled', 'processing')).toThrow(ActionError);
    expect(() => assertTransition('blocked', 'processing')).toThrow(ActionError);
  });

  it('allows retry under the attempt limit and rejects at the limit', async () => {
    const store = new InMemoryStore();
    const q = makeQueue(store);
    // maxAttempts = 1: after one failed attempt, retry is refused.
    const job = await q.enqueue({
      intent: intent(randomUUID()),
      initialStatus: 'queued',
      maxAttempts: 1,
    });
    const processing = await q.markProcessing(job);
    const failed = await q.markFailed(processing, { code: 'X', message: 'boom' });
    expect(failed.status).toBe('failed');
    expect(failed.attemptCount).toBe(1);
    await expect(q.retry(failed)).rejects.toBeInstanceOf(ActionError); // 1 >= 1

    // maxAttempts = 3: retry is allowed.
    const job2 = await q.enqueue({
      intent: intent(randomUUID()),
      initialStatus: 'queued',
      maxAttempts: 3,
    });
    const failed2 = await q.markFailed(await q.markProcessing(job2), {
      code: 'X',
      message: 'boom',
    });
    const requeued = await q.retry(failed2);
    expect(requeued.status).toBe('queued');
    const events = await new ActionRepository(store).listEvents(job2.id);
    expect(events.map((e) => e.event)).toContain('action_job_retry_scheduled');
  });

  it('records processing/succeeded events on the worker-facing path', async () => {
    const store = new InMemoryStore();
    const q = makeQueue(store);
    const job = await q.enqueue({
      intent: intent(randomUUID()),
      initialStatus: 'queued',
      maxAttempts: 3,
    });
    const succeeded = await q.markSucceeded(await q.markProcessing(job));
    expect(succeeded.status).toBe('succeeded');
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['action_job_processing', 'action_job_succeeded']),
    );
  });
});
