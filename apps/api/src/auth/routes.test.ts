import { describe, expect, it } from 'vitest';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

const good = { email: 'owner@example.com', password: 'correct horse 9' };

describe('authentication', () => {
  it('register success sets a session cookie and returns the user without a hash', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('owner@example.com');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('password_hash');
    expect(sessionCookie(res)).toBeTruthy();
    await app.close();
  });

  it('duplicate email is rejected', async () => {
    const { app } = await makeTestApp();
    await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
    await app.close();
  });

  it('weak password is rejected', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'weak@example.com', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('login success sets a session cookie', async () => {
    const { app } = await makeTestApp();
    await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: good });
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)).toBeTruthy();
    await app.close();
  });

  it('invalid login is rejected with a generic error', async () => {
    const { app } = await makeTestApp();
    await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: good.email, password: 'wrong password 9' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_credentials');
    // Generic message must not reveal which field was wrong.
    expect(res.json().error.message.toLowerCase()).toContain('invalid');
    await app.close();
  });

  it('login for unknown email is also generic (no user enumeration)', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever 12345' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_credentials');
    await app.close();
  });

  it('unauthenticated /auth/me is rejected with 401', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('authenticated /auth/me succeeds', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    const token = sessionCookie(reg)!;
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: cookieHeader(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('owner@example.com');
    await app.close();
  });

  it('logout revokes the session so the token no longer authenticates', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: good });
    const token = sessionCookie(reg)!;

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: cookieHeader(token),
    });
    expect(logout.statusCode).toBe(200);

    // The same token must now be rejected.
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: cookieHeader(token) });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it('logout is idempotent without a session', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
