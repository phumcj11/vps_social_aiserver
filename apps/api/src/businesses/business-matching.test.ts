import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import { matchBusiness } from '../matching/matcher';

type App = FastifyInstance;

async function withBusiness(
  app: App,
  email: string,
): Promise<{ token: string; businessId: string }> {
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
  const biz = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: cookieHeader(token),
    payload: { name: 'บางแสนวิลล่า', category: 'accommodation' },
  });
  return { token, businessId: biz.json().business.id };
}

function h(token: string, body?: unknown, origin = 'http://localhost:3000') {
  return {
    headers: { ...cookieHeader(token), 'x-csrf-token': 'test', origin },
    ...(body !== undefined ? { payload: body } : {}),
  };
}

describe('business matching self-service — owner CRUD', () => {
  it('creates area (district), province, type/keyword rules', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'match@example.com');
    for (const rule of [
      { ruleType: 'province', ruleValue: 'ชลบุรี' },
      { ruleType: 'district', ruleValue: 'บางแสน' },
      { ruleType: 'keyword', ruleValue: 'พูลวิลล่า' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/businesses/${businessId}/matching-rules`,
        ...h(token, { ...rule, priority: 0, status: 'active' }),
      });
      expect(res.statusCode, rule.ruleValue).toBe(201);
    }
    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/matching-rules`,
      headers: cookieHeader(token),
    });
    expect(list.json().matchingRules).toHaveLength(3);
    // Serialization is owner-safe: no workspace_id leaks.
    for (const r of list.json().matchingRules) {
      expect(r).not.toHaveProperty('workspaceId');
      expect(r).not.toHaveProperty('workspace_id');
    }
  });

  it('can deactivate (status) a rule without hard delete', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'toggle@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/matching-rules`,
      ...h(token, { ruleType: 'keyword', ruleValue: 'บางแสน', priority: 0, status: 'active' }),
    });
    const ruleId = created.json().matchingRule.id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/matching-rules/${ruleId}`,
      ...h(token, { status: 'disabled' }),
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().matchingRule.status).toBe('disabled');
  });

  it('rejects an unauthenticated write and a cross-origin (CSRF) write', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'csrf@example.com');
    const noAuth = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/matching-rules`,
      headers: { origin: 'http://localhost:3000' },
      payload: { ruleType: 'keyword', ruleValue: 'x', priority: 0 },
    });
    expect(noAuth.statusCode).toBe(401);
    const csrf = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/matching-rules`,
      ...h(token, { ruleType: 'keyword', ruleValue: 'x', priority: 0 }, 'http://evil.example.com'),
    });
    expect(csrf.statusCode).toBe(403);
  });

  it('isolates workspaces: another owner cannot see or write, and gets 404', async () => {
    const { app } = await makeTestApp();
    const a = await withBusiness(app, 'owner-a@example.com');
    const b = await withBusiness(app, 'owner-b@example.com');
    // B lists A's matching rules → 404 (cross-workspace, not 403 that reveals existence).
    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${a.businessId}/matching-rules`,
      headers: cookieHeader(b.token),
    });
    expect(list.statusCode).toBe(404);
    // B tries to create a rule on A's business → 404.
    const write = await app.inject({
      method: 'POST',
      url: `/businesses/${a.businessId}/matching-rules`,
      ...h(b.token, { ruleType: 'keyword', ruleValue: 'x', priority: 0 }),
    });
    expect(write.statusCode).toBe(404);
  });
});

describe('business matching self-service — readiness integration (Phase K)', () => {
  it('a business with zero active rules is NOT_READY for that reason', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'ready0@example.com');
    const r = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/readiness`,
      headers: cookieHeader(token),
    });
    expect(r.json().readiness.missing).toContain('customer matching configuration');
  });

  it('the matching requirement is satisfied after one active rule', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'ready1@example.com');
    await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/matching-rules`,
      ...h(token, { ruleType: 'district', ruleValue: 'บางแสน', priority: 0, status: 'active' }),
    });
    const r = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/readiness`,
      headers: cookieHeader(token),
    });
    expect(r.json().readiness.missing).not.toContain('customer matching configuration');
  });
});

describe('business matcher semantics remain unchanged', () => {
  it('still matches by case-folded containment of an active rule value', () => {
    const res = matchBusiness({ message: 'หาพูลวิลล่าบางแสน 12 คน' }, [
      { ruleType: 'district', ruleValue: 'บางแสน' },
    ]);
    expect(res.decision).toBe('MATCH');
    expect(matchBusiness({ message: 'หาบ้านเชียงใหม่' }, []).decision).toBe('NO_MATCH');
  });
});
