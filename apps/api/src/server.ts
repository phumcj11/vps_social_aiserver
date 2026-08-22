import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import type { Store } from './store/types';
import type { ApiEnv } from './lib/env';
import { createLogger, type Logger } from './lib/logger';
import { AppError } from './lib/errors';
import { registerAuthRoutes } from './auth/routes';
import { registerWorkspaceRoutes } from './workspaces/routes';
import { registerBusinessRoutes } from './businesses/routes';
import { registerBusinessPropertyRoutes } from './business-property/routes';
import { registerMediaRoutes } from './media/routes';
import { MAX_IMAGE_BYTES } from './media/types';
import { InMemoryBusinessPropertyStore } from './business-property/memory-store';
import type { BusinessPropertyStore } from './business-property/store';
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
import { registerReviewRoutes } from './review/routes';
import { ReviewRepository } from './review/repository';
import { ReviewQueue } from './review/queue';
import { ReviewCoordinator } from './review/coordinator';
import { TelegramReviewAdapter, selectTelegramTransport } from './review/telegram-adapter';
import { registerActionRoutes } from './action/routes';
import { ActionRepository } from './action/repository';
import { ActionQueue } from './action/queue';
import { ActionCoordinator } from './action/coordinator';
import { registerExecutionRoutes } from './execution/routes';
import { ExecutionSessionRepository } from './execution/session-repository';
import { ExecutionEvidenceRepository } from './execution/evidence-repository';
import { ActionIdempotencyRepository } from './execution/idempotency-repository';
import { ActionExecutor } from './execution/executor';
import { ExecutionVerificationService } from './execution/verification';
import { ExecutionRecoveryPolicy } from './execution/recovery';
import { ExecutionCoordinator } from './execution/coordinator';
import { OperationalStateStore } from './operations/state';
import { OperationsService } from './operations/service';
import { registerHealthRoutes, registerOperationsRoutes } from './operations/routes';
import { isBlockedByMaintenance, isBlockedByLockdown } from './operations/guard';

export interface ServerDeps {
  store: Store;
  env: ApiEnv;
  logger?: Logger;
  /** Business+Property persistence (SPRINT 015). Defaults to in-memory when absent. */
  bpStore?: BusinessPropertyStore;
  /** Optional async DB health probe; when absent, /health/db reports "unknown". */
  dbHealth?: () => Promise<boolean>;
  /** Injectable browser driver (tests provide a fake; runtime uses Playwright). */
  facebookDriver?: BrowserDriver;
  /** Injectable collector browser (tests provide a fake; runtime uses Playwright). */
  collectorBrowser?: CollectorBrowser;
  /** Base dir for media storage (defaults to process.cwd()); tests inject a temp dir. */
  mediaBaseDir?: string;
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

  // Trust ONLY a loopback reverse proxy (Caddy on 127.0.0.1) so X-Forwarded-For /
  // X-Forwarded-Proto are honored in production while remaining unspoofable: the
  // API binds to loopback and is reachable only through the local proxy. Without
  // this, every client collapses to 127.0.0.1 and per-IP auth rate-limiting (which
  // keys on req.ip) would degrade to a single global bucket. (SPRINT 017 deploy.)
  const app = Fastify({ logger: false, trustProxy: 'loopback' });

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
    // Every method the API serves must be advertised, or the browser blocks the
    // real request at preflight. PUT drives the Business/Property policy saves and
    // DELETE drives group/rule/knowledge removal; omitting them surfaced only as a
    // generic "บันทึกไม่สำเร็จ" to the owner (owner-setup UX corrective).
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Rate-limit foundation. Global disabled → applied only to routes that opt in
  // (register/login) via their per-route config.
  await app.register(rateLimit, { global: false });

  // Multipart uploads (Media Library images only). Hard per-file size limit; a
  // single file per request. Content is validated by magic bytes, not filename.
  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
  });

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
  // Operational hardening (SPRINT 013): persistent maintenance/lockdown state,
  // health, monitoring, and the operator surface.
  const opsStateStore = new OperationalStateStore(env.OPERATIONS_STATE_FILE);
  const operations = new OperationsService({
    store,
    env,
    audit,
    stateStore: opsStateStore,
    logger,
    dbHealth: deps.dbHealth,
  });

  // Global enforcement of Maintenance and Incident Lockdown. A single hook keeps
  // the policy in one place: maintenance blocks new work-initiating POSTs;
  // lockdown blocks every Facebook-touching endpoint. Health, backups, and the
  // operations surface itself remain available so an operator can recover.
  app.addHook('onRequest', async (req, reply) => {
    const method = req.method;
    const path = req.url.split('?')[0] ?? '';
    if (!isBlockedByMaintenance(method, path) && !isBlockedByLockdown(method, path)) return;
    const state = await opsStateStore.read();
    if (state.lockdown.enabled && isBlockedByLockdown(method, path)) {
      reply
        .code(423)
        .send({ error: { code: 'incident_lockdown', message: 'Incident lockdown is active' } });
      return reply;
    }
    if (state.maintenance.enabled && isBlockedByMaintenance(method, path)) {
      reply
        .code(503)
        .send({ error: { code: 'maintenance_mode', message: 'Maintenance mode is active' } });
      return reply;
    }
  });

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
  const bpStore = deps.bpStore ?? new InMemoryBusinessPropertyStore();
  const matching = new MatchingCoordinator({
    repo: new MatchRepository(store, bpStore),
    logger,
  });
  const aiDrafts = new AiDraftCoordinator({
    repo: new AiDraftRepository(store, bpStore),
    provider: selectAiDraftProvider(env),
    env,
    logger,
  });
  const reviewRepo = new ReviewRepository(store, bpStore);
  const reviews = new ReviewCoordinator({
    repo: reviewRepo,
    queue: new ReviewQueue(reviewRepo),
    // Telegram is only the first Review Adapter; its transport is disabled by
    // default (no bot connected). The engine works even if delivery fails.
    adapter: new TelegramReviewAdapter(selectTelegramTransport(env)),
    env,
    logger,
  });
  const actionRepo = new ActionRepository(store);
  const actionQueue = new ActionQueue(actionRepo);
  const actions = new ActionCoordinator({
    repo: actionRepo,
    queue: actionQueue,
    env,
    logger,
  });
  // Safe Execution Foundation (SPRINT 012). Fake adapter by default; the
  // Playwright boundary refuses. No real Facebook write ships this sprint.
  const executionSessions = new ExecutionSessionRepository(store);
  const executionEvidence = new ExecutionEvidenceRepository(store);
  const executions = new ExecutionCoordinator({
    sessions: executionSessions,
    evidence: executionEvidence,
    idempotency: new ActionIdempotencyRepository(store),
    executor: new ActionExecutor({
      sessions: executionSessions,
      evidence: executionEvidence,
      verification: new ExecutionVerificationService(),
      env,
      logger,
    }),
    recovery: new ExecutionRecoveryPolicy(),
    actionRepo,
    actionQueue,
    env,
    logger,
  });

  // Feature routes.
  registerAuthRoutes(app, { store, env, logger, audit });
  registerWorkspaceRoutes(app, { store, env, logger, audit });
  registerBusinessRoutes(app, { store, env, logger });
  registerBusinessPropertyRoutes(app, {
    store,
    bpStore,
    env,
    logger,
  });
  registerMediaRoutes(app, { store, bpStore, env, logger, baseDir: deps.mediaBaseDir });
  registerFacebookRoutes(app, { store, env, facebook });
  registerGroupRoutes(app, { store, env, groupValidation, audit });
  registerCollectorRoutes(app, { store, env, collector });
  registerOpportunityRoutes(app, { store, env, opportunities });
  registerMatchingRoutes(app, { store, env, matching });
  registerAiDraftRoutes(app, { store, env, aiDrafts });
  registerReviewRoutes(app, { store, env, reviews });
  registerActionRoutes(app, { store, env, actions });
  registerExecutionRoutes(app, { store, env, executions });
  registerHealthRoutes(app, { store, env, operations });
  registerOperationsRoutes(app, { store, env, operations });

  return app;
}
