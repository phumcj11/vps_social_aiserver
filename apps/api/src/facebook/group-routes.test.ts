import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import { InMemoryStore } from '../store/memory';

type App = FastifyInstance;

async function withWorkspace(app: App, email: string): Promise<string> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse 9' },
  });
  const token = sessionCookie(reg)!;
  await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: cookieHeader(token),
    payload: { name: `${email} ws` },
  });
  return token;
}

async function createBusiness(app: App, token: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: cookieHeader(token),
    payload: { name, category: 'Cleaning' },
  });
  return res.json().business.id;
}

async function addGroup(app: App, token: string, url: string) {
  return app.inject({
    method: 'POST',
    url: '/facebook/groups',
    headers: cookieHeader(token),
    payload: { url },
  });
}

const URL_A = 'https://www.facebook.com/groups/123456789';

describe('facebook groups API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/facebook/groups' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/facebook/groups', payload: { url: URL_A } }))
        .statusCode,
    ).toBe(401);
    await app.close();
  });

  it('adds a group with a canonical URL and rejects a duplicate', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const res = await addGroup(app, token, 'https://facebook.com/groups/123456789?ref=x');
    expect(res.statusCode).toBe(201);
    expect(res.json().group.canonicalUrl).toBe(URL_A);
    expect(res.json().group.accessState).toBe('unknown');

    const dup = await addGroup(app, token, 'https://www.facebook.com/groups/123456789/');
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('group_exists');
    await app.close();
  });

  it('rejects an invalid / non-group URL', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    for (const url of [
      'https://evil.com/groups/1',
      'https://www.facebook.com/someprofile',
      'javascript:alert(1)',
    ]) {
      const res = await addGroup(app, token, url);
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });

  it('lists and gets groups (safe response — no profile path or cookies)', async () => {
    const { app, profileRoot } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await addGroup(app, token, URL_A)).json().group.id;
    const list = await app.inject({
      method: 'GET',
      url: '/facebook/groups',
      headers: cookieHeader(token),
    });
    expect(list.json().groups).toHaveLength(1);
    const get = await app.inject({
      method: 'GET',
      url: `/facebook/groups/${id}`,
      headers: cookieHeader(token),
    });
    const text = JSON.stringify(get.json());
    expect(text).not.toContain('profilePath');
    expect(text).not.toContain('cookie');
    expect(text).not.toContain(profileRoot);
    await app.close();
  });

  it('validate with no connected session → login_required (no browser)', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await addGroup(app, token, URL_A)).json().group.id;
    const res = await app.inject({
      method: 'POST',
      url: `/facebook/groups/${id}/validate`,
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().group.accessState).toBe('login_required');
    await app.close();
  });

  it('patches group status', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await addGroup(app, token, URL_A)).json().group.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/facebook/groups/${id}`,
      headers: cookieHeader(token),
      payload: { status: 'archived' },
    });
    expect(res.json().group.status).toBe('archived');
    await app.close();
  });

  it('assigns a group to multiple businesses and prevents duplicate assignment', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const gid = (await addGroup(app, token, URL_A)).json().group.id;
    const b1 = await createBusiness(app, token, 'Biz One');
    const b2 = await createBusiness(app, token, 'Biz Two');

    for (const bid of [b1, b2]) {
      const res = await app.inject({
        method: 'POST',
        url: `/facebook/groups/${gid}/businesses`,
        headers: cookieHeader(token),
        payload: { businessId: bid },
      });
      expect(res.statusCode).toBe(201);
    }

    const dup = await app.inject({
      method: 'POST',
      url: `/facebook/groups/${gid}/businesses`,
      headers: cookieHeader(token),
      payload: { businessId: b1 },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('assignment_exists');

    const businesses = await app.inject({
      method: 'GET',
      url: `/facebook/groups/${gid}/businesses`,
      headers: cookieHeader(token),
    });
    expect(businesses.json().businesses).toHaveLength(2);

    // Group appears under each business.
    const b1Groups = await app.inject({
      method: 'GET',
      url: `/businesses/${b1}/facebook-groups`,
      headers: cookieHeader(token),
    });
    expect(b1Groups.json().groups).toHaveLength(1);

    // Unassign.
    const del = await app.inject({
      method: 'DELETE',
      url: `/facebook/groups/${gid}/businesses/${b1}`,
      headers: cookieHeader(token),
    });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: `/facebook/groups/${gid}/businesses`,
      headers: cookieHeader(token),
    });
    expect(after.json().businesses).toHaveLength(1);
    await app.close();
  });

  it("a user cannot access or assign another workspace's group", async () => {
    const { app } = await makeTestApp();
    const tokenA = await withWorkspace(app, 'a@example.com');
    const gid = (await addGroup(app, tokenA, URL_A)).json().group.id;

    const tokenB = await withWorkspace(app, 'b@example.com');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/facebook/groups/${gid}`,
          headers: cookieHeader(tokenB),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({ method: 'GET', url: '/facebook/groups', headers: cookieHeader(tokenB) })
      ).json().groups,
    ).toEqual([]);
    // B cannot assign A's group even to B's own business.
    const bBiz = await createBusiness(app, tokenB, 'B Biz');
    const res = await app.inject({
      method: 'POST',
      url: `/facebook/groups/${gid}/businesses`,
      headers: cookieHeader(tokenB),
      payload: { businessId: bBiz },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('facebook group model (store)', () => {
  it('rejects a duplicate group within a workspace but allows the same URL in another', async () => {
    const store = new InMemoryStore();
    const wsA = randomUUID();
    const wsB = randomUUID();
    await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: wsA,
      facebookGroupId: '1',
      canonicalUrl: URL_A,
      originalUrl: URL_A,
    });
    await expect(
      store.createFacebookGroup({
        id: randomUUID(),
        workspaceId: wsA,
        facebookGroupId: '1',
        canonicalUrl: URL_A,
        originalUrl: URL_A,
      }),
    ).rejects.toThrow();
    // Same URL in a different workspace is allowed.
    await expect(
      store.createFacebookGroup({
        id: randomUUID(),
        workspaceId: wsB,
        facebookGroupId: '1',
        canonicalUrl: URL_A,
        originalUrl: URL_A,
      }),
    ).resolves.toBeTruthy();
  });

  it('enforces a unique business-to-group assignment', async () => {
    const store = new InMemoryStore();
    const ws = randomUUID();
    const businessId = randomUUID();
    const groupId = randomUUID();
    await store.assignGroupToBusiness({
      id: randomUUID(),
      workspaceId: ws,
      businessId,
      facebookGroupId: groupId,
    });
    await expect(
      store.assignGroupToBusiness({
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        facebookGroupId: groupId,
      }),
    ).rejects.toThrow();
  });
});
