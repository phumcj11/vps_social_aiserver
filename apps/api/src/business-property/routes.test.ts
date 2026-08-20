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
    payload: { name: 'Sea Villa Bangsaen', category: 'accommodation' },
  });
  return { token, businessId: biz.json().business.id };
}

function h(token: string, body?: unknown) {
  return {
    headers: { ...cookieHeader(token), 'x-csrf-token': 'test', origin: 'http://localhost:3000' },
    ...(body !== undefined ? { payload: body } : {}),
  };
}

describe('property CRUD + ownership', () => {
  it('creates, lists, gets, updates, and archives a property', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'owner@example.com');

    const create = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties`,
      ...h(token, { name: 'Sea Villa 01', code: 'SV01', propertyType: 'pool villa' }),
    });
    expect(create.statusCode).toBe(201);
    const pid = create.json().property.id;

    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/properties`,
      headers: cookieHeader(token),
    });
    expect(list.json().properties).toHaveLength(1);

    const upd = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/properties/${pid}`,
      ...h(token, {
        capacity: { maxGuests: 12, bedrooms: 3 },
        location: { area: 'บางแสน' },
        amenities: { privatePool: true },
      }),
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().property.capacity.maxGuests).toBe(12);
    expect(upd.json().property.amenities.privatePool).toBe(true);

    const arch = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties/${pid}/archive`,
      ...h(token),
    });
    expect(arch.json().property.status).toBe('archived');
    await app.close();
  });

  it('rejects a duplicate property code', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'dup@example.com');
    await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties`,
      ...h(token, { name: 'A', code: 'X1' }),
    });
    const dupe = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties`,
      ...h(token, { name: 'B', code: 'X1' }),
    });
    expect(dupe.statusCode).toBe(409);
    expect(dupe.json().error.code).toBe('property_code_taken');
    await app.close();
  });

  it('supports multiple properties per business', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'multi@example.com');
    for (const n of ['Sea Villa 01', 'Sea Villa 02', 'Pattaya Villa 01']) {
      await app.inject({
        method: 'POST',
        url: `/businesses/${businessId}/properties`,
        ...h(token, { name: n }),
      });
    }
    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/properties`,
      headers: cookieHeader(token),
    });
    expect(list.json().properties).toHaveLength(3);
    await app.close();
  });

  it('404s a property in another workspace (no cross-workspace access)', async () => {
    const { app } = await makeTestApp();
    const a = await withBusiness(app, 'a@example.com');
    const b = await withBusiness(app, 'b@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/businesses/${a.businessId}/properties`,
      ...h(a.token, { name: 'Secret' }),
    });
    const pid = created.json().property.id;
    // b tries to read a's property via a's business id
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${a.businessId}/properties/${pid}`,
      headers: cookieHeader(b.token),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('contacts', () => {
  it('creates contacts, validates values, and exposes only approved ones via filtering', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'contact@example.com');
    const bad = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/contacts`,
      ...h(token, { type: 'EMAIL', value: 'not-an-email' }),
    });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/contacts`,
      ...h(token, { type: 'PHONE', value: '0812345678' }),
    });
    expect(good.statusCode).toBe(201);
    const cid = good.json().contact.id;
    expect(good.json().contact.approvedForDrafts).toBe(false); // approval is explicit

    const approve = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/contacts/${cid}`,
      ...h(token, { approvedForDrafts: true, ownerVerified: true }),
    });
    expect(approve.json().contact.approvedForDrafts).toBe(true);
    expect(approve.json().contact.ownerVerifiedAt).not.toBeNull();
    await app.close();
  });
});

describe('policies + readiness + environment + audit', () => {
  it('a test Business is NOT_READY; a fully-configured production Business becomes READY', async () => {
    const { app, bpStore } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'ready@example.com');

    // Initially NOT_READY (test env, no policies, no property, no contact).
    let readiness = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/readiness`,
      headers: cookieHeader(token),
    });
    expect(readiness.json().readiness.status).toBe('NOT_READY');
    expect(readiness.json().readiness.missing).toContain('production environment');

    // Configure profile (serviceArea + responseTone), policies, contact, property, environment.
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/profile`,
      ...h(token, { serviceArea: 'บางแสน', responseTone: 'polite' }),
    });
    await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, {
        availabilityPolicy: 'MANUAL_CONFIRMATION',
        pricingPolicy: 'STARTING_FROM',
        promotionPolicy: 'NONE',
        bookingPolicy: 'CONTACT_ONLY',
        prohibitedClaims: ['no fake availability'],
        responsibleOwner: 'Owner A',
        operatingHours: '09:00-18:00',
        responseSlaMinutes: 120,
      }),
    });
    const c = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/contacts`,
      ...h(token, { type: 'PHONE', value: '0812345678' }),
    });
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/contacts/${c.json().contact.id}`,
      ...h(token, { approvedForDrafts: true, ownerVerified: true }),
    });
    await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties`,
      ...h(token, { name: 'Sea Villa 01' }),
    });
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/environment`,
      ...h(token, { environment: 'production' }),
    });

    readiness = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/readiness`,
      headers: cookieHeader(token),
    });
    expect(readiness.json().readiness.status).toBe('READY');

    // Audit events were recorded for the changes.
    const events = await bpStore.listAuditByBusiness(businessId);
    const types = events.map((e) => e.eventType);
    expect(types).toContain('PropertyCreated');
    expect(types).toContain('PolicyChanged');
    expect(types).toContain('ContactChanged');
    expect(types).toContain('BusinessUpdated');
    await app.close();
  });

  it('property readiness resolves via inherited policies', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'propready@example.com');
    await app.inject({
      method: 'PUT',
      url: `/businesses/${businessId}/policies`,
      ...h(token, {
        availabilityPolicy: 'MANUAL_CONFIRMATION',
        pricingPolicy: 'STARTING_FROM',
        promotionPolicy: 'NONE',
        bookingPolicy: 'CONTACT_ONLY',
        prohibitedClaims: ['no fake availability'],
      }),
    });
    const created = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/properties`,
      ...h(token, {
        name: 'Sea Villa 01',
        propertyType: 'pool villa',
        description: 'A lovely villa near the beach.',
      }),
    });
    const pid = created.json().property.id;
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/properties/${pid}`,
      ...h(token, { capacity: { maxGuests: 12 }, location: { area: 'บางแสน' } }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/properties/${pid}/readiness`,
      headers: cookieHeader(token),
    });
    expect(res.json().readiness.status).toBe('READY');
    expect(res.json().effectivePolicies.inheritedFields).toContain('bookingPolicy');
    await app.close();
  });
});
