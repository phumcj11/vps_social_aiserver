import type { Store, UserRecord, SessionRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import { newId, newSessionToken, hashSessionToken } from '../lib/tokens';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

/**
 * Create a new session for a user. Returns the raw token (to be placed in the
 * HttpOnly cookie); only its hash is persisted.
 */
export async function issueSession(
  store: Store,
  env: ApiEnv,
  userId: string,
): Promise<IssuedSession> {
  const token = newSessionToken();
  const sessionId = newId();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  await store.createSession({
    id: sessionId,
    userId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt, sessionId };
}

export interface ValidatedSession {
  user: UserRecord;
  session: SessionRecord;
}

/**
 * Validate a raw session token. Returns the user + session when the session is
 * present, not revoked, not expired, and the user is active. Otherwise null.
 * Updates last-seen as a side effect on success.
 */
export async function validateSession(
  store: Store,
  token: string | undefined,
): Promise<ValidatedSession | null> {
  if (!token) return null;
  const session = await store.getSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const user = await store.getUserById(session.userId);
  if (!user || user.status !== 'active') return null;

  await store.touchSession(session.id, new Date());
  return { user, session };
}

/** Revoke a single session (used on logout). Idempotent. */
export async function revokeSession(store: Store, sessionId: string): Promise<void> {
  await store.revokeSession(sessionId, new Date());
}
