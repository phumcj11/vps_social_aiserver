import type { ApiEnv } from '../lib/env';
import type { FacebookCommentAdapter } from './types';
import { FakeFacebookCommentAdapter, type FakeScenario } from './fake-adapter';
import { PlaywrightFacebookCommentAdapter } from './playwright-adapter';

export type { FacebookCommentAdapter } from './types';

/**
 * Select the Facebook Comment adapter by configuration (SPRINT 012).
 *
 * Default (and the only functional path this sprint) is the deterministic FAKE
 * adapter. The `playwright` selection returns the DISABLED boundary, which
 * refuses to run — so choosing it can never produce a real Facebook write.
 *
 * `scenario` is honored only by the fake adapter (tests / dry-run).
 */
export function selectCommentAdapter(
  env: ApiEnv,
  opts: { scenario?: FakeScenario } = {},
): FacebookCommentAdapter {
  if (env.FACEBOOK_COMMENT_ADAPTER === 'playwright') {
    return new PlaywrightFacebookCommentAdapter(env);
  }
  return new FakeFacebookCommentAdapter(opts.scenario);
}
