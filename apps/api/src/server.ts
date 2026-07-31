import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Store } from './store/types';
import type { ApiEnv } from './lib/env';
import { createLogger, type Logger } from './lib/logger';
import { AppError } from './lib/errors';
import { registerAuthRoutes } from './auth/routes';
import { registerWorkspaceRoutes } from './workspaces/routes';
import { registerBusinessRoutes } from './businesses/routes';
import { registerFacebookRoutes } from './facebook/routes';
import { registerGroupRoutes } from './facebook/group-routes';
import { ProfileService } from './facebook/profile';
import { PlaywrightBrowserDriver, type BrowserDriver } from './facebook/driver';
import { FacebookConnectionService } from './facebook/connection-service';
import { GroupValidationService } from './facebook/group-validation';
import { AuditService } from './lib/audit';
import { registerCollectorRoutes } from './collector/routes';
import { CollectorRepository } from './collector/repository';
import { CollectorCoordinator } from './collector/coordinator';
import { PlaywrightCollectorBrowser, type CollectorBrowser } from './collector/browser';
import { registerOpportunityRoutes } from './opportunity/routes';
import { OpportunityRepository } from './opportunity/repository';
import { OpportunityCoordinator } from './opportunity/coordinator';
import { registerMatchingRoutes } from './matching/routes';
import { MatchRepository } from './matching/repository';
import { MatchingCoordinator } from './matching/coordinator';
import { registerAiDraftRoutes } from './ai/routes';
import { AiDraftRepository } from './ai/repository';
import { AiDraftCoordinator } from './ai/coordinator';
import { selectAiDraftProvider } from './ai/provider';

export interface ServerDeps {
  store: Store;
  env: ApiEnv;
  logger?: Logger;
  /** Optional async DB health probe; when absent, /health/db reports "unknown". */
  dbHealth?: () => Promise<boolean>;
  /** Injectable browser driver (tests provide a fake; runtime uses Playwright). */
  facebookDriver?: BrowserDriver;
  /** Injectable collector browser (tests provide a fake; runtime uses Playwright). */
  collectorBrowser?: CollectorBrowser;
}

/**
 * Build the KMKT Social AI API server with authentication and workspace routes.
 *
 * Business logic lives entirely in this backend (docs/07-system-overview.md).
 * No Facebook, Playwright, AI, Telegram, or n8n integration exists here.
 */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { store, env } = deps;
  const logger = deps.logger ?? createLogger('info');

  const app = Fastify({ logger: false, trustProxy: false });

  // Tolerate empty JSON bodies (e.g. bodyless POSTs like connect/start) — an
  // empty body parses to `undefined` rather than raising a parse error.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      if (!body || body.trim() === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Cookies (required for the HttpOnly session cookie).
  await app.register(cookie);

  // Strict CORS: only the known web origin, credentials allowed. Never a
  // wildcard — especially not in production.
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });

  // Rate-limit foundation. Global disabled → applied only to routes that opt in
  // (register/login) via their per-route config.
  await app.register(rateLimit, { global: false });

  // Consistent structured error responses. Unknown errors never leak internals.
  app.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    // @fastify/rate-limit sets statusCode 429.
    if (error.statusCode === 429) {
      reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } });
      return;
    }
    // Fastify body-parsing / validation errors.
    if (error.statusCode === 400) {
      reply.code(400).send({ error: { code: 'bad_request', message: 'Invalid request' } });
      return;
    }
    logger.error('unhandled_error', { name: error.name, msg: error.message });
    reply.code(500).send({ error: { code: 'internal_error', message: 'Internal server error' } });
  });

  // Liveness / readiness.
  app.get('/health', async () => ({ status: 'ok', service: 'kmkt-api', check: 'health' }));
  app.get('/ready', async () => ({
    status: 'ready',
    service: 'kmkt-api',
    dependencies: ['database'],
  }));
  app.get('/health/db', async (_req, reply) => {
    if (!deps.dbHealth) return { status: 'unknown', dependency: 'database' };
    const ok = await deps.dbHealth();
    if (!ok) reply.code(503);
    return { status: ok ? 'ok' : 'down', dependency: 'database' };
  });

  // Shared services.
  const audit = new AuditService(store);
  const profiles = new ProfileService(env.BROWSER_PROFILE_ROOT);
  const driver = deps.facebookDriver ?? new PlaywrightBrowserDriver();
  const facebook = new FacebookConnectionService({ store, profiles, driver, audit, env, logger });
  const groupValidation = new GroupValidationService({
    store,
    profiles,
    driver,
    audit,
    env,
    logger,
  });
  const collector = new CollectorCoordinator({
    repo: new CollectorRepository(store),
    browser: deps.collectorBrowser ?? new PlaywrightCollectorBrowser(),
    profiles,
    audit,
    env,
    logger,
  });
  const opportunities = new OpportunityCoordinator({
    repo: new OpportunityRepository(store),
    env,
    logger,
  });
  const matching = new MatchingCoordinator({
    repo: new MatchRepository(store),
    logger,
  });
  const aiDrafts = new AiDraftCoordinator({
    repo: new AiDraftRepository(store),
    provider: selectAiDraftProvider(env),
    env,
    logger,
  });

  // Feature routes.
  registerAuthRoutes(app, { store, env, logger, audit });
  registerWorkspaceRoutes(app, { store, env, logger, audit });
  registerBusinessRoutes(app, { store, env, logger });
  registerFacebookRoutes(app, { store, env, facebook });
  registerGroupRoutes(app, { store, env, groupValidation, audit });
  registerCollectorRoutes(app, { store, env, collector });
  registerOpportunityRoutes(app, { store, env, opportunities });
  registerMatchingRoutes(app, { store, env, matching });
  registerAiDraftRoutes(app, { store, env, aiDrafts });

  return app;
}
