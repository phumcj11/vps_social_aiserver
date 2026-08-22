import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

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

const basePolicies = {
  availabilityPolicy: 'MANUAL_CONFIRMATION',
  pricingPolicy: 'DO_NOT_MENTION',
  promotionPolicy: 'NONE',
  bookingPolicy: 'CONTACT_ONLY',
  prohibitedClaims: [],
};

describe('response strategy persistence (via business policies)', () => {
  it('defaults to HUMAN_REVIEW when not provided', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'rs-default@example.com');
    const put = await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, basePolicies),
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/policies`,
      headers: cookieHeader(token),
    });
    expect(got.json().policies.noPropertyMatchStrategy).toBe('HUMAN_REVIEW');
    expect(got.json().policies.allowNearMatchSuggestions).toBe(false);
  });

  it('round-trips a chosen strategy and preserves other policy fields', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'rs-set@example.com');
    await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, { ...basePolicies, noPropertyMatchStrategy: 'DO_NOT_RESPOND' }),
    });
    const got = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/policies`,
      headers: cookieHeader(token),
    });
    const pol = got.json().policies;
    expect(pol.noPropertyMatchStrategy).toBe('DO_NOT_RESPOND');
    expect(pol.pricingPolicy).toBe('DO_NOT_MENTION'); // other fields intact
    expect(pol.availabilityPolicy).toBe('MANUAL_CONFIRMATION');
  });

  it('rejects an invalid strategy value', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'rs-bad@example.com');
    const put = await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, { ...basePolicies, noPropertyMatchStrategy: 'ALWAYS_POST' }),
    });
    expect(put.statusCode).toBe(400);
  });

  it('requires auth and rejects cross-origin (CSRF) writes', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'rs-csrf@example.com');
    const noAuth = await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      headers: { origin: 'http://localhost:3000' },
      payload: basePolicies,
    });
    expect(noAuth.statusCode).toBe(401);
    const csrf = await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, basePolicies, 'http://evil.example.com'),
    });
    expect(csrf.statusCode).toBe(403);
  });
});
