import { randomBytes, randomUUID, createHash } from 'node:crypto';

/** Generate an application UUID (v4) for primary keys. */
export function newId(): string {
  return randomUUID();
}

/**
 * Generate an opaque session token (the raw secret handed to the client in an
 * HttpOnly cookie). 32 random bytes → 43-char base64url string.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a session token for storage. We store only the SHA-256 hex digest; the
 * raw token never touches the database. SHA-256 is appropriate here because the
 * token is already high-entropy random (unlike a password).
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
