import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Store, UserRecord, SessionRecord } from '../store/types';
import type { ApiEnv } from './env';
import { validateSession } from '../auth/session-service';
import { errors } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: UserRecord;
    authSession?: SessionRecord;
  }
}

/** Read the raw session token from the request cookies. */
export function readSessionToken(req: FastifyRequest, env: ApiEnv): string | undefined {
  return req.cookies?.[env.SESSION_COOKIE_NAME];
}

/**
 * preHandler that requires a valid session. On success attaches `authUser` and
 * `authSession` to the request; otherwise responds 401 (throws AppError).
 */
export function createAuthenticate(store: Store, env: ApiEnv): preHandlerHookHandler {
  return async (req: FastifyRequest) => {
    const token = readSessionToken(req, env);
    const result = await validateSession(store, token);
    if (!result) throw errors.unauthorized();
    req.authUser = result.user;
    req.authSession = result.session;
  };
}

/**
 * CSRF-aware guard for cookie-authenticated, state-changing requests.
 *
 * Strategy for the MVP: when an Origin header is present (all browser
 * fetch/XHR requests set it), it must exactly match the configured web origin.
 * Combined with SameSite=Lax cookies and a strict CORS allowlist, this blocks
 * cross-site forgery. Requests without an Origin header (e.g. server-to-server
 * or curl during testing) cannot ride a victim's browser cookies and are
 * allowed. See docs/21-session-security.md for the documented limitation.
 */
export function createCsrfGuard(env: ApiEnv): preHandlerHookHandler {
  return async (req: FastifyRequest) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.length > 0 && origin !== env.WEB_ORIGIN) {
      throw errors.csrf();
    }
  };
}

/** Serialise a user for API responses — NEVER includes the password hash. */
export function publicUser(user: UserRecord): {
  id: string;
  email: string;
  status: string;
  createdAt: string;
} {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Consistent no-store headers for auth responses. */
export function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
}
