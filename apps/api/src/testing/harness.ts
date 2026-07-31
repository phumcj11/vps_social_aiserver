import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { InMemoryStore } from '../store/memory';
import type { BrowserDriver } from '../facebook/driver';
import type { CollectorBrowser } from '../collector/browser';

export interface TestAppOptions {
  facebookDriver?: BrowserDriver;
  facebookLoginEnabled?: boolean;
  profileRoot?: string;
  collectorBrowser?: CollectorBrowser;
  facebookReaderEnabled?: boolean;
}

/** Build an isolated test app backed by an in-memory store (no MySQL). */
export async function makeTestApp(
  opts: TestAppOptions = {},
): Promise<{ app: FastifyInstance; store: InMemoryStore; profileRoot: string }> {
  const store = new InMemoryStore();
  const profileRoot = opts.profileRoot ?? mkdtempSync(join(tmpdir(), 'kmkt-profiles-'));
  const env = loadApiEnv({
    APP_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:3000',
    PASSWORD_MIN_LENGTH: '10',
    SESSION_TTL_HOURS: '168',
    AUTH_RATE_LIMIT_MAX: '10000',
    DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/test',
    BROWSER_PROFILE_ROOT: profileRoot,
    FACEBOOK_LOGIN_ENABLED: opts.facebookLoginEnabled ? 'true' : 'false',
    FACEBOOK_CONNECT_TIMEOUT_MS: '2000',
    FACEBOOK_VALIDATE_TIMEOUT_MS: '2000',
    FACEBOOK_READER_ENABLED: opts.facebookReaderEnabled ? 'true' : 'false',
    COLLECTOR_MAX_SCROLLS: '2',
    COLLECTOR_MAX_POSTS_PER_GROUP: '30',
    COLLECTOR_TIMEOUT_MS: '3000',
  });
  const app = await buildServer({
    store,
    env,
    logger: createLogger('error'),
    facebookDriver: opts.facebookDriver,
    collectorBrowser: opts.collectorBrowser,
  });
  return { app, store, profileRoot };
}

const COOKIE_NAME = 'kmkt_session';

/** Extract the session cookie value from an inject response, if present. */
export function sessionCookie(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  return res.cookies.find((c) => c.name === COOKIE_NAME)?.value;
}

/** Build a Cookie header for an authenticated request. */
export function cookieHeader(token: string): { cookie: string } {
  return { cookie: `${COOKIE_NAME}=${token}` };
}
