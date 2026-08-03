import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { ActionIdempotencyRepository } from './idempotency-repository';
import { ExecutionError } from './errors';

function identity() {
  return {
    workspaceId: randomUUID(),
    businessId: randomUUID(),
    targetPostKey: 'post-key-abc',
    actionType: 'facebook_comment' as const,
  };
}

describe('ActionIdempotencyRepository (DB-level guard)', () => {
  it('allows only ONE live reservation per identity tuple', async () => {
    const repo = new ActionIdempotencyRepository(new InMemoryStore());
    const id = identity();
    await repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null });
    // A second live reservation for the same identity is rejected.
    await expect(
      repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null }),
    ).rejects.toBeInstanceOf(ExecutionError);
  });

  it('a verified reservation permanently blocks new reservations', async () => {
    const repo = new ActionIdempotencyRepository(new InMemoryStore());
    const id = identity();
    const res = await repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null });
    await repo.markVerified(res.id, 'fb-comment-1');
    const live = await repo.getLive(id);
    expect(live?.status).toBe('verified');
    await expect(
      repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null }),
    ).rejects.toBeInstanceOf(ExecutionError);
  });

  it('releasing frees the slot for a deliberate re-attempt', async () => {
    const repo = new ActionIdempotencyRepository(new InMemoryStore());
    const id = identity();
    const res = await repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null });
    await repo.release(res.id);
    expect(await repo.getLive(id)).toBeNull();
    // A new reservation now succeeds.
    const again = await repo.reserve({
      ...id,
      actionJobId: randomUUID(),
      executionSessionId: null,
    });
    expect(again.status).toBe('reserved');
  });

  it('a different post key is a different identity', async () => {
    const repo = new ActionIdempotencyRepository(new InMemoryStore());
    const id = identity();
    await repo.reserve({ ...id, actionJobId: randomUUID(), executionSessionId: null });
    const other = await repo.reserve({
      ...id,
      targetPostKey: 'post-key-xyz',
      actionJobId: randomUUID(),
      executionSessionId: null,
    });
    expect(other.status).toBe('reserved');
  });
});
