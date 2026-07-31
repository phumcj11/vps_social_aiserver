import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { AuditService, AuditEventTypes } from '../lib/audit';
import { errors } from '../lib/errors';
import { newId } from '../lib/tokens';
import { hashPassword, verifyPassword } from '../lib/password';
import { normaliseEmail, buildAuthSchemas } from './validation';
import { issueSession, validateSession, revokeSession } from './session-service';
import { setSessionCookie, clearSessionCookie } from '../lib/cookies';
import {
  createAuthenticate,
  createCsrfGuard,
  readSessionToken,
  publicUser,
  noStore,
} from '../lib/http';

export interface AuthDeps {
  store: Store;
  env: ApiEnv;
  logger: Logger;
  audit: AuditService;
}

// A fixed dummy hash so that login timing does not reveal whether an email
// exists (we still run a verify when the user is not found).
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { store, env, logger, audit } = deps;
  const { registerSchema, loginSchema } = buildAuthSchemas(env.PASSWORD_MIN_LENGTH);
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  const authRateLimit = {
    rateLimit: {
      max: env.AUTH_RATE_LIMIT_MAX,
      timeWindow: env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };

  // POST /auth/register
  app.post(
    '/auth/register',
    { preHandler: csrfGuard, config: authRateLimit },
    async (req, reply) => {
      noStore(reply);
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) throw errors.validation('Invalid email or password format');

      const email = normaliseEmail(parsed.data.email);
      const existing = await store.getUserByEmail(email);
      if (existing)
        throw errors.conflict('email_taken', 'An account with this email already exists');

      const passwordHash = await hashPassword(parsed.data.password);
      const user = await store.createUser({ id: newId(), email, passwordHash });

      const { token } = await issueSession(store, env, user.id);
      setSessionCookie(reply, env, token);

      logger.info('auth.register', { userId: user.id });
      reply.code(201);
      return { user: publicUser(user) };
    },
  );

  // POST /auth/login
  app.post('/auth/login', { preHandler: csrfGuard, config: authRateLimit }, async (req, reply) => {
    noStore(reply);
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw errors.invalidCredentials();

    const email = normaliseEmail(parsed.data.email);
    const user = await store.getUserByEmail(email);

    // Always run a verification to equalise timing (prevents user enumeration).
    const ok = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await verifyPassword(parsed.data.password, DUMMY_HASH);

    if (!user || !ok || user.status !== 'active') {
      logger.warn('auth.login_failed', {});
      throw errors.invalidCredentials();
    }

    // Rotation: each login issues a fresh session token.
    const { token } = await issueSession(store, env, user.id);
    setSessionCookie(reply, env, token);

    logger.info('auth.login', { userId: user.id });
    await audit.record(AuditEventTypes.UserLogin, { userId: user.id });
    return { user: publicUser(user) };
  });

  // POST /auth/logout — idempotent.
  app.post('/auth/logout', { preHandler: csrfGuard }, async (req, reply) => {
    noStore(reply);
    const token = readSessionToken(req, env);
    const result = await validateSession(store, token);
    if (result) {
      await revokeSession(store, result.session.id);
      logger.info('auth.logout', { userId: result.user.id });
      await audit.record(AuditEventTypes.UserLogout, { userId: result.user.id });
    }
    clearSessionCookie(reply, env);
    return { ok: true };
  });

  // GET /auth/me
  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    return { user: publicUser(req.authUser!) };
  });
}
