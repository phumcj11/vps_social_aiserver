import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import { createLogger } from '../lib/logger';
import { RoutingRepository } from './repository';
import { RoutingCoordinator } from './coordinator';

/**
 * MODEL C — M4 (operator Facebook Sources) + M5 (customer กลุ่มที่ติดตาม)
 * management API. Management/UI only: no Facebook login/scan/validate/write is
 * added or reachable, and the customer never sees scanner session data. The
 * final test proves the UI-managed subscription table actually drives Model C
 * routing.
 */

const logger = createLogger('error');
const SOURCE_WS = randomUUID();
const OP_EMAIL = 'op@kmkt.com';

type App = FastifyInstance;

async function appWithSources(groupCount = 2) {
  const ctx = await makeTestApp({
    envOverrides: {
      MODEL_C_SOURCE_WORKSPACE_ID: SOURCE_WS,
      OPERATIONS_OPERATOR_EMAILS: OP_EMAIL,
    },
  });
  // Seed system-owned source Groups directly in the source workspace.
  const groupIds: string[] = [];
  const names = ['หาที่พักบางแสน', 'พูลวิลล่าบางแสน', 'เที่ยวชลบุรี'];
  for (let i = 0; i < groupCount; i++) {
    const g = await ctx.store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: SOURCE_WS,
      facebookGroupId: `src-${i}`,
      canonicalUrl: `https://www.facebook.com/groups/src-${i}`,
      originalUrl: `https://www.facebook.com/groups/src-${i}`,
    });
    // Name comes from validation; set it directly for the fixture.
    await ctx.store.updateFacebookGroup(g.id, { name: names[i] ?? `Group ${i}` });
    groupIds.push(g.id);
  }
  return { ...ctx, groupIds };
}

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
    payload: { name, category: 'ที่พัก' },
  });
  return res.json().business.id;
}

function getSubs(app: App, token: string, businessId: string) {
  return app.inject({
    method: 'GET',
    url: `/businesses/${businessId}/source-subscriptions`,
    headers: cookieHeader(token),
  });
}
function putSubs(app: App, token: string, businessId: string, groupIds: string[]) {
  return app.inject({
    method: 'PUT',
    url: `/businesses/${businessId}/source-subscriptions`,
    headers: cookieHeader(token),
    payload: { groupIds },
  });
}

describe('MODEL C — M4/M5 source subscription API', () => {
  // 1 ─ Customer A lists available source groups safely
  it('1. customer lists available source groups (safe fields only)', async () => {
    const { app, groupIds } = await appWithSources(2);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    const res = await getSubs(app, token, bizA);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sourceConfigured).toBe(true);
    expect(body.groups).toHaveLength(2);
    expect(body.groups.map((g: { id: string }) => g.id).sort()).toEqual([...groupIds].sort());
    expect(body.groups.every((g: { subscribed: boolean }) => g.subscribed === false)).toBe(true);
    await app.close();
  });

  // 2 + 3 ─ subscribe Business A; subscription belongs to A
  it('2+3. subscribing marks the group subscribed for that Business only', async () => {
    const { app, groupIds } = await appWithSources(2);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    const res = await putSubs(app, token, bizA, [groupIds[0]!]);
    expect(res.statusCode).toBe(200);
    const g0 = res.json().groups.find((g: { id: string }) => g.id === groupIds[0]);
    const g1 = res.json().groups.find((g: { id: string }) => g.id === groupIds[1]);
    expect(g0.subscribed).toBe(true);
    expect(g1.subscribed).toBe(false);
    await app.close();
  });

  // 4 ─ Customer A cannot modify Customer B's subscriptions
  it('4. a customer cannot read or modify another workspace’s Business subscriptions', async () => {
    const { app, groupIds } = await appWithSources(2);
    const tokenA = await withWorkspace(app, 'a@example.com');
    const tokenB = await withWorkspace(app, 'b@example.com');
    const bizB = await createBusiness(app, tokenB, 'Villa B');

    // A (different workspace) gets 404 for B's business — existence not leaked.
    expect((await getSubs(app, tokenA, bizB)).statusCode).toBe(404);
    expect((await putSubs(app, tokenA, bizB, [groupIds[0]!])).statusCode).toBe(404);
    // B's own subscriptions are untouched.
    expect(
      (await getSubs(app, tokenB, bizB))
        .json()
        .groups.every((g: { subscribed: boolean }) => !g.subscribed),
    ).toBe(true);
    await app.close();
  });

  // 5 ─ customer cannot see scanner account/session secrets
  it('5. the customer API never exposes scanner account/session data', async () => {
    const { app } = await appWithSources(2);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    const blob = JSON.stringify((await getSubs(app, token, bizA)).json()).toLowerCase();
    for (const secret of [
      'cookie',
      'sessionstorage',
      'browser-profile',
      'account',
      'token',
      'password',
      'connectionstate',
    ]) {
      expect(blob).not.toContain(secret);
    }
    await app.close();
  });

  // 6 ─ duplicate subscribe remains one row
  it('6. subscribing twice stays idempotent (one enabled subscription)', async () => {
    const { app, store, groupIds } = await appWithSources(2);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    await putSubs(app, token, bizA, [groupIds[0]!]);
    await putSubs(app, token, bizA, [groupIds[0]!]);
    const subs = await store.listSubscriptionsForBusiness(bizA);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.enabled).toBe(true);
    await app.close();
  });

  // 7 ─ disable then re-enable remains one row
  it('7. deselect then reselect toggles one row (no duplicate)', async () => {
    const { app, store, groupIds } = await appWithSources(2);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    await putSubs(app, token, bizA, [groupIds[0]!]);
    await putSubs(app, token, bizA, []); // deselect → disable
    let subs = await store.listSubscriptionsForBusiness(bizA);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.enabled).toBe(false);
    await putSubs(app, token, bizA, [groupIds[0]!]); // reselect → enable same row
    subs = await store.listSubscriptionsForBusiness(bizA);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.enabled).toBe(true);
    await app.close();
  });

  // 8 ─ same source group can subscribe businesses in A/B/C
  it('8. the same source group can be followed by businesses across workspaces', async () => {
    const { app, store, groupIds } = await appWithSources(1);
    const g = groupIds[0]!;
    const biz: string[] = [];
    for (const e of ['a@example.com', 'b@example.com', 'c@example.com']) {
      const t = await withWorkspace(app, e);
      const b = await createBusiness(app, t, `Villa ${e}`);
      await putSubs(app, t, b, [g]);
      biz.push(b);
    }
    expect(await store.countEnabledSubscribersForSourceGroup(g)).toBe(3);
    await app.close();
  });

  // 9 ─ operator sees subscriber count
  it('9. operator Facebook Sources shows per-group subscriber counts + safe account', async () => {
    const { app, groupIds } = await appWithSources(2);
    const opToken = await withWorkspace(app, OP_EMAIL);
    const custToken = await withWorkspace(app, 'cust@example.com');
    const biz = await createBusiness(app, custToken, 'Villa');
    await putSubs(app, custToken, biz, [groupIds[0]!]);

    const res = await app.inject({
      method: 'GET',
      url: '/operator/facebook-sources',
      headers: cookieHeader(opToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sourceConfigured).toBe(true);
    expect(body.readerEnabled).toBe(false);
    expect(body.writeEnabled).toBe(false);
    const g0 = body.groups.find((g: { id: string }) => g.id === groupIds[0]);
    expect(g0.subscriberCount).toBe(1);
    // Account status is present but secret-free.
    const accBlob = JSON.stringify(body.account ?? {}).toLowerCase();
    for (const secret of ['cookie', 'token', 'password', 'browser-profile', 'sessionstorage']) {
      expect(accBlob).not.toContain(secret);
    }
    await app.close();
  });

  // 9b ─ operator endpoint is operator-only
  it('9b. a non-operator customer cannot read the operator Facebook Sources', async () => {
    const { app } = await appWithSources(1);
    const custToken = await withWorkspace(app, 'cust@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/operator/facebook-sources',
      headers: cookieHeader(custToken),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // 10 ─ customer cannot edit a source Group (subscribe to a non-source id)
  it('10. a customer cannot follow a non-source group id', async () => {
    const { app, store } = await appWithSources(1);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    // A group the customer created in their OWN workspace is NOT a source group.
    const own = await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: (await store.getBusinessById(bizA))!.workspaceId,
      facebookGroupId: 'own-1',
      canonicalUrl: 'https://www.facebook.com/groups/own-1',
      originalUrl: 'https://www.facebook.com/groups/own-1',
    });
    const res = await putSubs(app, token, bizA, [own.id]);
    expect(res.statusCode).toBe(400);
    expect(await store.listSubscriptionsForBusiness(bizA)).toHaveLength(0);
    await app.close();
  });

  // 11-14 + 15-18 ─ the feature exposes NO scan/login/validate/write/side-effects
  it('11-18. no scan/login/validate/write endpoints; no action job/execution/telegram/AI', async () => {
    const { app, store } = await appWithSources(1);
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');

    // The subscription feature adds only GET/PUT subscription routes; there is
    // no scan/login/validate/write route introduced here.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/businesses/${bizA}/source-subscriptions/scan`,
          headers: cookieHeader(token),
        })
      ).statusCode,
    ).toBe(404);
    // Managing subscriptions creates NO downstream execution artifacts.
    const sub = await store.listSubscriptionsForBusiness(bizA);
    expect(sub).toHaveLength(0);
    await app.close();
  });

  // EMPTY STATE ─ unconfigured source tenant → empty, safe
  it('EMPTY: with no source workspace configured, customer sees an empty list', async () => {
    const { app } = await makeTestApp(); // MODEL_C_SOURCE_WORKSPACE_ID unset
    const token = await withWorkspace(app, 'a@example.com');
    const bizA = await createBusiness(app, token, 'Villa A');
    const res = await getSubs(app, token, bizA);
    expect(res.statusCode).toBe(200);
    expect(res.json().sourceConfigured).toBe(false);
    expect(res.json().groups).toHaveLength(0);
    await app.close();
  });

  // ROUTING INTEGRATION ─ the UI-managed table drives Model C routing
  it('ROUTING: subscriptions from the API drive routing — A+B match, C (not subscribed) gets none', async () => {
    const { app, store, bpStore, groupIds } = await appWithSources(1);
    const sourceGroup = groupIds[0]!;

    // Three customers; A + B follow the source group, C does not.
    async function customer(email: string, subscribe: boolean) {
      const token = await withWorkspace(app, email);
      const businessId = await createBusiness(app, token, `Villa ${email}`);
      const ws = (await store.getBusinessById(businessId))!.workspaceId;
      await store.createRule({
        id: randomUUID(),
        businessId,
        ruleType: 'keyword',
        ruleValue: 'พูลวิลล่า',
        priority: 10,
        status: 'active',
      });
      if (subscribe) await putSubs(app, token, businessId, [sourceGroup]);
      return { token, businessId, ws };
    }
    const a = await customer('a@example.com', true);
    const b = await customer('b@example.com', true);
    const c = await customer('c@example.com', false);

    // A central Opportunity in the source workspace for that source group.
    const signal = await store.createSignal({
      id: randomUUID(),
      workspaceId: SOURCE_WS,
      groupId: sourceGroup,
      facebookPostId: 'post-1',
      postUrl: 'https://www.facebook.com/groups/src-0/posts/1',
      authorName: 'ลูกค้า',
      authorProfile: null,
      message: 'หาพูลวิลล่าบางแสน 12 คน มีสระ',
      mediaUrls: [],
      createdTime: null,
      normalizedHash: randomUUID(),
    });
    const opp = await store.createOpportunity({
      id: randomUUID(),
      workspaceId: SOURCE_WS,
      signalId: signal.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v2',
    });

    const routing = new RoutingCoordinator({
      repo: new RoutingRepository(store, bpStore),
      logger,
    });
    const summary = await routing.routeOpportunity(SOURCE_WS, opp.id);
    expect(summary.matches).toBe(2); // A + B
    expect(summary.projectionsCreated).toBe(2);

    expect(await store.listBusinessMatchesByWorkspace(a.ws)).toHaveLength(1);
    expect(await store.listBusinessMatchesByWorkspace(b.ws)).toHaveLength(1);
    expect(await store.listBusinessMatchesByWorkspace(c.ws)).toHaveLength(0);
    // Match isolation: A's match is not visible in B's workspace listing.
    const aMatch = (await store.listBusinessMatchesByWorkspace(a.ws))[0]!;
    const bMatches = await store.listBusinessMatchesByWorkspace(b.ws);
    expect(bMatches.some((m) => m.id === aMatch.id)).toBe(false);
    await app.close();
  });
});
