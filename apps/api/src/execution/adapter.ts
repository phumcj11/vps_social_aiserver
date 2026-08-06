import type { ApiEnv } from '../lib/env';
import type { FacebookCommentAdapter } from './types';
import type { FacebookCommentPage } from './comment-page';
import { FakeFacebookCommentAdapter, type FakeScenario } from './fake-adapter';
import {
  PlaywrightFacebookCommentAdapter,
  type ProfileLock,
  type ResourceGuard,
  type AdapterMode,
} from './playwright-adapter';
import { ExecutionError, ExecutionErrorCode } from './errors';

export type { FacebookCommentAdapter } from './types';

/** The browser wiring the real Playwright adapter needs (page + lock + mode). */
export interface PlaywrightAdapterWiring {
  page: FacebookCommentPage;
  lock: ProfileLock;
  mode: AdapterMode;
  submitAuthorized: boolean;
  resourceGuard?: ResourceGuard;
}

/**
 * Select the Facebook Comment adapter by configuration.
 *
 * Default is the deterministic FAKE adapter (no network, no Playwright). The
 * `playwright` selection returns the REAL, gated adapter — but ONLY when the
 * caller supplies browser wiring (`opts.playwright`). Selecting `playwright`
 * without wiring is a safe refusal, never a real write: it means someone tried
 * to run the real path without the deliberate wiring that the execution CLI /
 * coordinator provide.
 *
 * `scenario` is honored only by the fake adapter (tests / dry-run).
 */
export function selectCommentAdapter(
  env: ApiEnv,
  opts: { scenario?: FakeScenario; playwright?: PlaywrightAdapterWiring } = {},
): FacebookCommentAdapter {
  if (env.FACEBOOK_COMMENT_ADAPTER === 'playwright') {
    if (!opts.playwright) {
      throw new ExecutionError(
        ExecutionErrorCode.ADAPTER_DISABLED,
        'Playwright adapter selected but no browser wiring was provided',
      );
    }
    return new PlaywrightFacebookCommentAdapter({ env, ...opts.playwright });
  }
  return new FakeFacebookCommentAdapter(opts.scenario);
}
