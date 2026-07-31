import { describe, expect, it, vi } from 'vitest';
import { buildServer } from './server';
import { loadApiEnv } from './lib/env';
import { createLogger } from './lib/logger';
import { InMemoryStore } from './store/memory';
import { issueSession } from './auth/session-service';
import { hashSessionToken } from './lib/tokens';
import { makeTestApp, sessionCookie, cookieHeader } from './testing/harness';

const creds = { email: 'sec@example.com', password: 'correct horse 9' };

describe('security', () => {
  it('password hash is never returned by the API', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: creds });
    const token = sessionCookie(reg)!;
    expect(JSON.stringify(reg.json())).not.toContain('scrypt$');
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: cookieHeader(token) });
    const text = JSON.stringify(me.json());
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('scrypt$');
    await app.close();
  });

  it('session token is stored hashed, never in plaintext', async () => {
    const store = new InMemoryStore();
    const env = loadApiEnv({ APP_ENV: 'test' });
    const user = await store.createUser({ id: 'u1', email: creds.email, passwordHash: 'x' });
    const { token } = await issueSession(store, env, user.id);

    // The raw token is not usable as a lookup key...
    expect(await store.getSessionByTokenHash(token)).toBeNull();
    // ...but its SHA-256 hash is, and that hash differs from the raw token.
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const record = await store.getSessionByTokenHash(hash);
    expect(record).not.toBeNull();
    expect(record!.sessionTokenHash).toBe(hash);
  });

  it('the auth cookie has HttpOnly, SameSite=Lax and Path=/ (Secure off in dev)', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: creds });
    const setCookie = String(reg.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure'); // development
    await app.close();
  });

  it('the auth cookie is Secure in production', async () => {
    const store = new InMemoryStore();
    const env = loadApiEnv({ APP_ENV: 'production', WEB_ORIGIN: 'https://app.example.com' });
    const app = await buildServer({ store, env, logger: createLogger('error') });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      // Production CSRF guard requires a matching Origin header.
      headers: { origin: 'https://app.example.com' },
      payload: creds,
    });
    const setCookie = String(reg.headers['set-cookie']);
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    await app.close();
  });

  it('passwords, hashes and tokens are not written to logs', async () => {
    const captured: string[] = [];
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    });

    try {
      const store = new InMemoryStore();
      const env = loadApiEnv({ APP_ENV: 'test' });
      const app = await buildServer({ store, env, logger: createLogger('info') });
      await app.inject({ method: 'POST', url: '/auth/register', payload: creds });
      await app.inject({ method: 'POST', url: '/auth/login', payload: creds });
      await app.close();
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }

    const logs = captured.join('');
    expect(logs).toContain('auth.register'); // logging is happening
    expect(logs).not.toContain(creds.password);
    expect(logs).not.toContain('scrypt$');
    expect(logs).not.toContain('kmkt_session=');
  });
});
