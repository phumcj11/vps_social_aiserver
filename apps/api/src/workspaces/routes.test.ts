import { describe, expect, it } from 'vitest';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

async function registerUser(
  app: Awaited<ReturnType<typeof makeTestApp>>['app'],
  email: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse 9' },
  });
  return sessionCookie(res)!;
}

describe('workspaces', () => {
  it('unauthenticated access is rejected', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/workspaces/current' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/workspaces', payload: { name: 'X' } })).statusCode,
    ).toBe(401);
    await app.close();
  });

  it('workspace creation succeeds and generates a slug', async () => {
    const { app } = await makeTestApp();
    const token = await registerUser(app, 'a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(token),
      payload: { name: 'My First Shop' },
    });
    expect(res.statusCode).toBe(201);
    const ws = res.json().workspace;
    expect(ws.name).toBe('My First Shop');
    expect(ws.slug).toBe('my-first-shop');
    expect(ws.status).toBe('active');
    await app.close();
  });

  it('duplicate workspace creation is rejected', async () => {
    const { app } = await makeTestApp();
    const token = await registerUser(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(token),
      payload: { name: 'One' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(token),
      payload: { name: 'Two' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('workspace_exists');
    await app.close();
  });

  it('current workspace read succeeds', async () => {
    const { app } = await makeTestApp();
    const token = await registerUser(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(token),
      payload: { name: 'Readable' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/workspaces/current',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.name).toBe('Readable');
    await app.close();
  });

  it('workspace update succeeds', async () => {
    const { app } = await makeTestApp();
    const token = await registerUser(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(token),
      payload: { name: 'Old Name' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/workspaces/current',
      headers: cookieHeader(token),
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.name).toBe('New Name');
    await app.close();
  });

  it("a user cannot access another user's workspace", async () => {
    const { app } = await makeTestApp();
    const tokenA = await registerUser(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(tokenA),
      payload: { name: 'A Workspace' },
    });

    // User B has no workspace; /current returns 404 (never A's data).
    const tokenB = await registerUser(app, 'b@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/workspaces/current',
      headers: cookieHeader(tokenB),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('workspace_not_found');

    // B updating "current" cannot touch A's workspace either.
    const patch = await app.inject({
      method: 'PATCH',
      url: '/workspaces/current',
      headers: cookieHeader(tokenB),
      payload: { name: 'Hijacked' },
    });
    expect(patch.statusCode).toBe(404);

    // A's workspace is unchanged.
    const aRead = await app.inject({
      method: 'GET',
      url: '/workspaces/current',
      headers: cookieHeader(tokenA),
    });
    expect(aRead.json().workspace.name).toBe('A Workspace');
    await app.close();
  });
});
