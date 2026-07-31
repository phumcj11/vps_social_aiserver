import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

type App = FastifyInstance;

async function registerToken(app: App, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse 9' },
  });
  return sessionCookie(res)!;
}

async function withWorkspace(app: App, email: string): Promise<string> {
  const token = await registerToken(app, email);
  await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: cookieHeader(token),
    payload: { name: `${email} workspace` },
  });
  return token;
}

async function createBusiness(app: App, token: string, name: string, category = 'Cleaning') {
  const res = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: cookieHeader(token),
    payload: { name, category },
  });
  return res;
}

describe('business CRUD', () => {
  it('requires a workspace before creating a business', async () => {
    const { app } = await makeTestApp();
    const token = await registerToken(app, 'nows@example.com'); // no workspace
    const res = await createBusiness(app, token, 'Shop');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('workspace_required');
    await app.close();
  });

  it('creates a business with a generated slug and returns it', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const res = await createBusiness(app, token, 'Nok Home Cleaning', 'Cleaning');
    expect(res.statusCode).toBe(201);
    const b = res.json().business;
    expect(b.name).toBe('Nok Home Cleaning');
    expect(b.slug).toBe('nok-home-cleaning');
    expect(b.status).toBe('active');
    await app.close();
  });

  it('supports multiple businesses in one workspace and lists them', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    await createBusiness(app, token, 'Coffee Shop', 'Food');
    await createBusiness(app, token, 'Bike Repair', 'Repair');
    const res = await app.inject({
      method: 'GET',
      url: '/businesses',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().businesses.map((b: { name: string }) => b.name)).toEqual([
      'Coffee Shop',
      'Bike Repair',
    ]);
    await app.close();
  });

  it('rejects a duplicate business name within the same workspace', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    await createBusiness(app, token, 'Same Name');
    const res = await createBusiness(app, token, 'Same Name');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('business_name_taken');
    await app.close();
  });

  it('gets a business by id and renames / disables it', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await createBusiness(app, token, 'Old Name')).json().business.id;

    const get = await app.inject({
      method: 'GET',
      url: `/businesses/${id}`,
      headers: cookieHeader(token),
    });
    expect(get.statusCode).toBe(200);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/businesses/${id}`,
      headers: cookieHeader(token),
      payload: { name: 'New Name', status: 'disabled' },
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json().business.name).toBe('New Name');
    expect(rename.json().business.status).toBe('disabled');
    await app.close();
  });

  it('validates required name and category on create', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const noName = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: cookieHeader(token),
      payload: { category: 'X' },
    });
    expect(noName.statusCode).toBe(400);
    const noCat = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: cookieHeader(token),
      payload: { name: 'Y' },
    });
    expect(noCat.statusCode).toBe(400);
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/businesses' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/businesses',
          payload: { name: 'X', category: 'Y' },
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });
});

describe('business profile', () => {
  it('seeds a profile on creation and updates it', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await createBusiness(app, token, 'Shop', 'Cleaning')).json().business.id;

    const get = await app.inject({
      method: 'GET',
      url: `/businesses/${id}/profile`,
      headers: cookieHeader(token),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().profile.category).toBe('Cleaning');
    expect(get.json().profile.sellingPoints).toEqual([]);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/businesses/${id}/profile`,
      headers: cookieHeader(token),
      payload: {
        description: 'We clean homes.',
        sellingPoints: ['Fast', 'Affordable'],
        serviceArea: 'Bangkok',
        contactInformation: 'line: @nok',
        responseTone: 'friendly',
        prohibitedClaims: ['guaranteed spotless'],
      },
    });
    expect(patch.statusCode).toBe(200);
    const p = patch.json().profile;
    expect(p.sellingPoints).toEqual(['Fast', 'Affordable']);
    expect(p.prohibitedClaims).toEqual(['guaranteed spotless']);
    expect(p.serviceArea).toBe('Bangkok');
    await app.close();
  });
});

describe('business knowledge CRUD', () => {
  it('creates, lists, updates and deletes knowledge', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await createBusiness(app, token, 'Shop')).json().business.id;

    const empty = await app.inject({
      method: 'GET',
      url: `/businesses/${id}/knowledge`,
      headers: cookieHeader(token),
    });
    expect(empty.json().knowledge).toEqual([]);

    const created = await app.inject({
      method: 'POST',
      url: `/businesses/${id}/knowledge`,
      headers: cookieHeader(token),
      payload: { title: 'Opening hours', content: 'Mon-Fri 9-5' },
    });
    expect(created.statusCode).toBe(201);
    const kid = created.json().knowledge.id;
    expect(created.json().knowledge.status).toBe('active');

    const shortTitle = await app.inject({
      method: 'POST',
      url: `/businesses/${id}/knowledge`,
      headers: cookieHeader(token),
      payload: { title: 'x' },
    });
    expect(shortTitle.statusCode).toBe(400);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/businesses/${id}/knowledge/${kid}`,
      headers: cookieHeader(token),
      payload: { status: 'archived' },
    });
    expect(updated.json().knowledge.status).toBe('archived');

    const del = await app.inject({
      method: 'DELETE',
      url: `/businesses/${id}/knowledge/${kid}`,
      headers: cookieHeader(token),
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/businesses/${id}/knowledge`,
      headers: cookieHeader(token),
    });
    expect(after.json().knowledge).toEqual([]);
    await app.close();
  });
});

describe('business matching rules CRUD', () => {
  it('creates, validates, updates and deletes rules', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await createBusiness(app, token, 'Shop')).json().business.id;

    const created = await app.inject({
      method: 'POST',
      url: `/businesses/${id}/matching-rules`,
      headers: cookieHeader(token),
      payload: { ruleType: 'keyword', ruleValue: 'cleaning', priority: 5 },
    });
    expect(created.statusCode).toBe(201);
    const rid = created.json().matchingRule.id;
    expect(created.json().matchingRule.priority).toBe(5);

    const badType = await app.inject({
      method: 'POST',
      url: `/businesses/${id}/matching-rules`,
      headers: cookieHeader(token),
      payload: { ruleType: 'not_a_type', ruleValue: 'x', priority: 1 },
    });
    expect(badType.statusCode).toBe(400);

    const badPriority = await app.inject({
      method: 'POST',
      url: `/businesses/${id}/matching-rules`,
      headers: cookieHeader(token),
      payload: { ruleType: 'budget', ruleValue: '5000', priority: 1.5 },
    });
    expect(badPriority.statusCode).toBe(400);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/businesses/${id}/matching-rules/${rid}`,
      headers: cookieHeader(token),
      payload: { priority: 10, status: 'disabled' },
    });
    expect(updated.json().matchingRule.priority).toBe(10);
    expect(updated.json().matchingRule.status).toBe('disabled');

    const del = await app.inject({
      method: 'DELETE',
      url: `/businesses/${id}/matching-rules/${rid}`,
      headers: cookieHeader(token),
    });
    expect(del.statusCode).toBe(200);
    await app.close();
  });

  it('accepts every allowed rule type', async () => {
    const { app } = await makeTestApp();
    const token = await withWorkspace(app, 'a@example.com');
    const id = (await createBusiness(app, token, 'Shop')).json().business.id;
    for (const ruleType of [
      'province',
      'district',
      'keyword',
      'guest_count',
      'budget',
      'facility',
      'custom',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/businesses/${id}/matching-rules`,
        headers: cookieHeader(token),
        payload: { ruleType, ruleValue: 'v', priority: 0 },
      });
      expect(res.statusCode).toBe(201);
    }
    await app.close();
  });
});

describe('ownership & workspace isolation', () => {
  it("a user cannot access another user's business or its sub-resources", async () => {
    const { app } = await makeTestApp();
    const tokenA = await withWorkspace(app, 'a@example.com');
    const idA = (await createBusiness(app, tokenA, 'A Business')).json().business.id;
    const kidA = (
      await app.inject({
        method: 'POST',
        url: `/businesses/${idA}/knowledge`,
        headers: cookieHeader(tokenA),
        payload: { title: 'Secret A' },
      })
    ).json().knowledge.id;

    const tokenB = await withWorkspace(app, 'b@example.com');

    // B sees only their own (empty) business list.
    const listB = await app.inject({
      method: 'GET',
      url: '/businesses',
      headers: cookieHeader(tokenB),
    });
    expect(listB.json().businesses).toEqual([]);

    // B cannot read/modify A's business (404, not 403 — existence not leaked).
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/businesses/${idA}`,
          headers: cookieHeader(tokenB),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/businesses/${idA}`,
          headers: cookieHeader(tokenB),
          payload: { name: 'Hijack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/businesses/${idA}/profile`,
          headers: cookieHeader(tokenB),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/businesses/${idA}/knowledge/${kidA}`,
          headers: cookieHeader(tokenB),
        })
      ).statusCode,
    ).toBe(404);

    // A's knowledge is untouched.
    const stillThere = await app.inject({
      method: 'GET',
      url: `/businesses/${idA}/knowledge`,
      headers: cookieHeader(tokenA),
    });
    expect(stillThere.json().knowledge).toHaveLength(1);
    await app.close();
  });
});
