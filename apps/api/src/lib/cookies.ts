import type { FastifyReply } from 'fastify';
import type { ApiEnv } from './env';
import { cookieSecure } from './env';

/**
 * Set the session cookie. It is HttpOnly (not readable by JS), SameSite=Lax,
 * Secure in production, scoped to the whole site, with an explicit max-age that
 * matches the session lifetime.
 */
export function setSessionCookie(reply: FastifyReply, env: ApiEnv, token: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(env),
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
  });
}

/** Clear the session cookie (used on logout). */
export function clearSessionCookie(reply: FastifyReply, env: ApiEnv): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(env),
    path: '/',
  });
}
