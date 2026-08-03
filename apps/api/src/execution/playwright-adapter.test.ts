import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../lib/env';
import { PlaywrightFacebookCommentAdapter, playwrightGateBlockers } from './playwright-adapter';
import { ExecutionError, ExecutionErrorCode } from './errors';
import type { ExecutionContext } from './types';

const ctx: ExecutionContext = {
  workspaceId: 'w',
  actionJobId: 'j',
  sessionId: 's',
  attemptNumber: 1,
  targetUrl: 'https://www.facebook.com/groups/1/posts/2',
  targetPostKey: 'k',
  approvedContent: 'hello',
  adapter: 'playwright',
};

describe('PlaywrightFacebookCommentAdapter (disabled boundary)', () => {
  it('refuses with ADAPTER_DISABLED under the safe defaults', async () => {
    const env = loadApiEnv({});
    const adapter = new PlaywrightFacebookCommentAdapter(env);
    await expect(adapter.submitComment(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.ADAPTER_DISABLED,
    });
  });

  it('lists every closed gate as a blocker under safe defaults', () => {
    const blockers = playwrightGateBlockers(loadApiEnv({}));
    expect(blockers).toEqual(
      expect.arrayContaining([
        'ACTION_ENGINE_ENABLED must be true',
        'FACEBOOK_WRITE_ACTION_ENABLED must be true',
        'FACEBOOK_COMMENT_ENABLED must be true',
        'GLOBAL_KILL_SWITCH must be false',
        'FACEBOOK_COMMENT_ADAPTER must be playwright',
      ]),
    );
  });

  it('STILL refuses with REAL_WRITE_FORBIDDEN even when every flag is set', async () => {
    // Even fully flagged, no real Facebook write ships this sprint.
    const env = loadApiEnv({
      ACTION_ENGINE_ENABLED: 'true',
      FACEBOOK_WRITE_ACTION_ENABLED: 'true',
      FACEBOOK_COMMENT_ENABLED: 'true',
      GLOBAL_KILL_SWITCH: 'false',
      FACEBOOK_COMMENT_ADAPTER: 'playwright',
    });
    expect(playwrightGateBlockers(env)).toHaveLength(0);
    const adapter = new PlaywrightFacebookCommentAdapter(env);
    await expect(adapter.verifyTarget(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.REAL_WRITE_FORBIDDEN,
    });
    await expect(adapter.submitComment(ctx)).rejects.toBeInstanceOf(ExecutionError);
  });
});
