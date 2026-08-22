import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import { buildPropertyDraftContext } from './draft-context';
import { emptyPropertyDefaults } from './store';
import type { BusinessPolicies, Property } from './types';

type App = FastifyInstance;

async function withProperty(
  app: App,
  email: string,
): Promise<{ token: string; businessId: string; pid: string }> {
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
  const businessId = biz.json().business.id;
  const create = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/properties`,
    ...h(token, { name: 'Villa B', code: 'BS-B', propertyType: 'pool_villa' }),
  });
  return { token, businessId, pid: create.json().property.id };
}

function h(token: string, body?: unknown) {
  return {
    headers: { ...cookieHeader(token), 'x-csrf-token': 'test', origin: 'http://localhost:3000' },
    ...(body !== undefined ? { payload: body } : {}),
  };
}

describe('property price save regression (canonical priceDisplayMode)', () => {
  it('saves STARTING_FROM + startingPrice with blank optional fields, and reloads exactly', async () => {
    const { app } = await makeTestApp();
    const { token, businessId, pid } = await withProperty(app, 'price@example.com');

    // The exact operator payload: mode ราคาเริ่มต้น, 9,500, deposit/extra blank.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/properties/${pid}`,
      ...h(token, {
        pricing: {
          priceDisplayMode: 'STARTING_FROM',
          startingPrice: 9500,
          weekdayPrice: null,
          weekendPrice: null,
          securityDeposit: null,
          extraGuestPrice: null,
        },
      }),
    });
    expect(patch.statusCode).toBe(200);

    // GET → form → save → reload round-trip is stable.
    const got = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/properties/${pid}`,
      headers: cookieHeader(token),
    });
    const pricing = got.json().property.pricing;
    expect(pricing.priceDisplayMode).toBe('STARTING_FROM');
    expect(pricing.startingPrice).toBe(9500);
    expect(pricing.securityDeposit).toBeNull();
    expect(pricing.extraGuestPrice).toBeNull();
  });

  it('rejects a non-canonical price mode with a validation error (not a silent success)', async () => {
    const { app } = await makeTestApp();
    const { token, businessId, pid } = await withProperty(app, 'badmode@example.com');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/properties/${pid}`,
      // The old frontend value that caused "Nothing valid to update".
      ...h(token, { pricing: { priceDisplayMode: 'starting_from', startingPrice: 9500 } }),
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.code).toBe('validation_error');
  });

  it('accepts all four canonical modes', async () => {
    const { app } = await makeTestApp();
    const { token, businessId, pid } = await withProperty(app, 'modes@example.com');
    for (const priceDisplayMode of ['DO_NOT_SHOW', 'STARTING_FROM', 'RANGE', 'ON_REQUEST']) {
      const patch = await app.inject({
        method: 'PATCH',
        url: `/businesses/${businessId}/properties/${pid}`,
        ...h(token, { pricing: { priceDisplayMode } }),
      });
      expect(patch.statusCode, priceDisplayMode).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase H — pricing policy is authoritative; a stored price must NOT be exposed
// in the Draft while the Business pricing policy forbids mentioning price.
// ---------------------------------------------------------------------------

function policies(over: Partial<BusinessPolicies> = {}): BusinessPolicies {
  return {
    availabilityPolicy: 'MANUAL_CONFIRMATION',
    pricingPolicy: 'DO_NOT_MENTION',
    promotionPolicy: 'NONE',
    bookingPolicy: 'CONTACT_ONLY',
    prohibitedClaims: [],
    responseSlaMinutes: 10,
    escalationContact: null,
    ...over,
  } as unknown as BusinessPolicies;
}

function propertyWithPrice(startingPrice: number): Property {
  const base = emptyPropertyDefaults();
  return {
    ...base,
    id: 'villa-b',
    workspaceId: 'ws',
    businessId: 'biz',
    name: 'Villa B',
    propertyType: 'pool_villa',
    location: { ...base.location, area: 'บางแสน' },
    capacity: { ...base.capacity, maxGuests: 15 },
    pricing: { ...base.pricing, priceDisplayMode: 'STARTING_FROM', startingPrice },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as Property;
}

describe('pricing policy safety (Phase H)', () => {
  it('never exposes a stored price when the business policy is ห้ามพูดราคา (DO_NOT_MENTION)', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'บางแสนวิลล่า',
      serviceArea: 'บางแสน',
      responseTone: null,
      businessPolicies: policies({ pricingPolicy: 'DO_NOT_MENTION' }),
      contacts: [],
      property: propertyWithPrice(9500), // stored internally
    });
    expect(ctx.property?.priceFact).toBeNull();
    expect(ctx.mustNotClaim).toContain('price');
  });

  it('exposes the starting price only when the policy explicitly allows it', () => {
    const ctx = buildPropertyDraftContext({
      businessName: 'บางแสนวิลล่า',
      serviceArea: 'บางแสน',
      responseTone: null,
      businessPolicies: policies({ pricingPolicy: 'STARTING_FROM' }),
      contacts: [],
      property: propertyWithPrice(9500),
    });
    expect(ctx.property?.priceFact).toBe('starting from 9500');
    expect(ctx.mustNotClaim).not.toContain('price');
  });
});
