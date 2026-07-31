import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { ReviewRepository } from './repository';
import { ReviewQueue } from './queue';
import { ReviewError } from './errors';

function queue(store: InMemoryStore) {
  return new ReviewQueue(new ReviewRepository(store));
}

function createInput(ws: string) {
  return {
    workspaceId: ws,
    businessMatchId: randomUUID(),
    draftId: randomUUID(),
    assignedTo: null,
  };
}

describe('ReviewQueue', () => {
  it('creates a PENDING task and a review_created event', async () => {
    const store = new InMemoryStore();
    const q = queue(store);
    const ws = randomUUID();
    const { task, created } = await q.create(createInput(ws));
    expect(created).toBe(true);
    expect(task.status).toBe('PENDING');
    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toEqual(['review_created']);
  });

  it('is idempotent per draft (one draft → one task)', async () => {
    const store = new InMemoryStore();
    const q = queue(store);
    const ws = randomUUID();
    const input = createInput(ws);
    const first = await q.create(input);
    const second = await q.create(input);
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
  });

  it('assigns a task and records review_assigned', async () => {
    const store = new InMemoryStore();
    const q = queue(store);
    const { task } = await q.create(createInput(randomUUID()));
    const assigned = await q.assign(task.id, 'user-1');
    expect(assigned.assignedTo).toBe('user-1');
    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toContain('review_assigned');
  });

  it('expires a pending task and refuses to expire a non-pending one', async () => {
    const store = new InMemoryStore();
    const repo = new ReviewRepository(store);
    const q = new ReviewQueue(repo);
    const { task } = await q.create(createInput(randomUUID()));
    const expired = await q.expire(task.id);
    expect(expired.status).toBe('EXPIRED');
    await expect(q.expire(task.id)).rejects.toBeInstanceOf(ReviewError);
  });
});
