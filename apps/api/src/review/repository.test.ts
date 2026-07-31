import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { ReviewRepository } from './repository';
import { ReviewError } from './errors';

describe('ReviewRepository', () => {
  it('creates and reads a task, and keeps event history in order', async () => {
    const store = new InMemoryStore();
    const repo = new ReviewRepository(store);
    const ws = randomUUID();
    const draftId = randomUUID();
    const task = await repo.createTask({
      workspaceId: ws,
      businessMatchId: randomUUID(),
      draftId,
      assignedTo: null,
    });
    expect(await repo.getTaskByDraft(draftId)).not.toBeNull();

    await repo.createEvent(task.id, 'review_created', { draftId });
    await repo.createEvent(task.id, 'review_approved', { decidedBy: 'u' });
    const events = await repo.listEvents(task.id);
    expect(events.map((e) => e.event)).toEqual(['review_created', 'review_approved']);
  });

  it('enforces one review task per draft (wraps as ReviewError)', async () => {
    const store = new InMemoryStore();
    const repo = new ReviewRepository(store);
    const ws = randomUUID();
    const draftId = randomUUID();
    const input = { workspaceId: ws, businessMatchId: randomUUID(), draftId, assignedTo: null };
    await repo.createTask(input);
    await expect(repo.createTask({ ...input })).rejects.toBeInstanceOf(ReviewError);
  });

  it('updates status and lists by workspace with a status filter', async () => {
    const store = new InMemoryStore();
    const repo = new ReviewRepository(store);
    const ws = randomUUID();
    const t1 = await repo.createTask({
      workspaceId: ws,
      businessMatchId: randomUUID(),
      draftId: randomUUID(),
      assignedTo: null,
    });
    await repo.createTask({
      workspaceId: ws,
      businessMatchId: randomUUID(),
      draftId: randomUUID(),
      assignedTo: null,
    });
    await repo.updateTask(t1.id, { status: 'APPROVED', decidedBy: 'u' });

    expect(await repo.listTasks(ws)).toHaveLength(2);
    expect(await repo.listTasks(ws, { status: 'PENDING' })).toHaveLength(1);
    expect(await repo.listTasks(ws, { status: 'APPROVED' })).toHaveLength(1);
  });
});
