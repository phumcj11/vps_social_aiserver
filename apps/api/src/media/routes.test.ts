import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

type App = FastifyInstance;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]);

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

/** Build a multipart/form-data body for app.inject. */
function multipart(
  fields: Record<string, string>,
  file?: { field: string; filename: string; type: string; data: Buffer },
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----kmkt' + randomUUID().replace(/-/g, '');
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
    );
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

function uploadHeaders(token: string, origin = 'http://localhost:3000') {
  return { ...cookieHeader(token), 'x-csrf-token': 'test', origin };
}

async function upload(
  app: App,
  token: string,
  businessId: string,
  opts: {
    type?: string;
    filename?: string;
    data?: Buffer;
    category?: string;
    propertyId?: string;
    origin?: string;
  } = {},
) {
  const fields: Record<string, string> = { category: opts.category ?? 'cover' };
  if (opts.propertyId) fields.propertyId = opts.propertyId;
  const mp = multipart(fields, {
    field: 'file',
    filename: opts.filename ?? 'x.png',
    type: opts.type ?? 'image/png',
    data: opts.data ?? PNG,
  });
  return app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/media`,
    headers: { ...uploadHeaders(token, opts.origin), ...mp.headers },
    payload: mp.payload,
  });
}

describe('media upload — validation & security', () => {
  it('uploads a valid PNG and returns an owner-safe projection (no raw path)', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'up@example.com');
    const res = await upload(app, token, businessId, { category: 'cover' });
    expect(res.statusCode).toBe(201);
    const m = res.json().media;
    expect(m.category).toBe('cover');
    expect(m.ownerVerified).toBe(false);
    expect(m.approvedForDrafts).toBe(false);
    expect(m.fileUrl).toBe(`/businesses/${businessId}/media/${m.id}/file`);
    expect(JSON.stringify(m)).not.toMatch(/storage\/media/); // never leaks the path
  });

  it('rejects a MIME/content mismatch (png bytes declared jpeg)', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'mm@example.com');
    const res = await upload(app, token, businessId, { type: 'image/jpeg', filename: 'evil.jpg' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an SVG upload', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'svg@example.com');
    const res = await upload(app, token, businessId, {
      type: 'image/svg+xml',
      filename: 'x.svg',
      data: Buffer.from('<svg></svg>'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth and rejects a cross-origin (CSRF) upload', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'sec@example.com');
    const mp = multipart(
      { category: 'cover' },
      { field: 'file', filename: 'x.png', type: 'image/png', data: PNG },
    );
    const noAuth = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/media`,
      headers: { origin: 'http://localhost:3000', ...mp.headers },
      payload: mp.payload,
    });
    expect(noAuth.statusCode).toBe(401);
    const csrf = await upload(app, token, businessId, { origin: 'http://evil.example.com' });
    expect(csrf.statusCode).toBe(403);
  });

  it('isolates workspaces (upload to another owner business → 404)', async () => {
    const { app } = await makeTestApp();
    const a = await withBusiness(app, 'a@example.com');
    const b = await withBusiness(app, 'b@example.com');
    const res = await upload(app, b.token, a.businessId);
    expect(res.statusCode).toBe(404);
  });

  it('rejects a propertyId that belongs to another business (404)', async () => {
    const { app } = await makeTestApp();
    const a = await withBusiness(app, 'pa@example.com');
    const b = await withBusiness(app, 'pb@example.com');
    const prop = await app.inject({
      method: 'POST',
      url: `/businesses/${b.businessId}/properties`,
      headers: uploadHeaders(b.token),
      payload: { name: 'B Villa' },
    });
    const res = await upload(app, a.token, a.businessId, { propertyId: prop.json().property.id });
    expect(res.statusCode).toBe(404);
  });
});

describe('media CRUD, permissions, file serve', () => {
  it('lists, updates permissions/category, archives, and serves the file', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'crud@example.com');
    const created = (await upload(app, token, businessId, { category: 'cover' })).json().media;

    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/media`,
      headers: cookieHeader(token),
    });
    expect(list.json().media).toHaveLength(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { ownerVerified: true, approvedForDrafts: true, category: 'pool', caption: 'สระ' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().media.ownerVerified).toBe(true);
    expect(patched.json().media.approvedForDrafts).toBe(true);
    expect(patched.json().media.approvedForPublicResponse).toBe(false); // independent, still off
    expect(patched.json().media.category).toBe('pool');

    const file = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/media/${created.id}/file`,
      headers: cookieHeader(token),
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.rawPayload.length).toBe(PNG.length);

    const archived = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { status: 'ARCHIVED' },
    });
    expect(archived.json().media.status).toBe('ARCHIVED');
  });

  it('does not serve another workspace file (404)', async () => {
    const { app } = await makeTestApp();
    const a = await withBusiness(app, 'fa@example.com');
    const b = await withBusiness(app, 'fb@example.com');
    const created = (await upload(app, a.token, a.businessId)).json().media;
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${a.businessId}/media/${created.id}/file`,
      headers: cookieHeader(b.token),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('media suggestion endpoint (deterministic, read-only)', () => {
  it('suggests an approved Business image on NO_PROPERTY_MATCH (HUMAN_REVIEW_ONLY default)', async () => {
    const { app, store, bpStore } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'sugg@example.com');

    // Upload + approve a business-level cover image.
    const created = (await upload(app, token, businessId, { category: 'cover' })).json().media;
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { ownerVerified: true, approvedForDrafts: true },
    });

    // Seed a Business MATCH + a NO_PROPERTY_MATCH record directly in the store.
    const business = (await store.getBusinessById(businessId))!;
    const group = await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: business.workspaceId,
      facebookGroupId: '1',
      canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
      originalUrl: 'https://www.facebook.com/groups/1',
    });
    const signal = await store.createSignal({
      id: randomUUID(),
      workspaceId: business.workspaceId,
      groupId: group.id,
      facebookPostId: null,
      postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
      authorName: 'A',
      authorProfile: null,
      message: 'หาที่พักบางแสน',
      mediaUrls: [],
      createdTime: null,
      normalizedHash: randomUUID(),
    });
    const opp = await store.createOpportunity({
      id: randomUUID(),
      workspaceId: business.workspaceId,
      signalId: signal.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });
    const match = await store.createBusinessMatch({
      id: randomUUID(),
      workspaceId: business.workspaceId,
      businessId,
      opportunityId: opp.id,
      decision: 'MATCH',
      reasons: [{ ruleType: 'keyword', ruleValue: 'บางแสน', matched: true }],
      matcherVersion: 'rules-v1',
    });
    await store.createPropertyMatch({
      id: randomUUID(),
      workspaceId: business.workspaceId,
      opportunityId: opp.id,
      businessMatchId: match.id,
      businessId,
      propertyId: null,
      decision: 'NO_MATCH',
      reasons: {
        reasons: ['NO_PROPERTY_MATCH'],
        rejected: [],
        requirement: { requestedAmenities: [] },
      },
      matcherVersion: 'property-rules-v1',
      candidatesEvaluated: 0,
    });
    void bpStore;

    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/media/suggestion?businessMatchId=${match.id}`,
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestion?.id).toBe(created.id);
    expect(res.json().reasons).toContain('BUSINESS_FALLBACK_NO_MATCH');
    expect(res.json().publicResponseApproved).toBe(false);
  });
});

describe('media metadata/permission save (operator retest corrective)', () => {
  it('persists category+caption+ownerVerified+approvedForDrafts together and round-trips; public stays false', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'save@example.com');
    const created = (await upload(app, token, businessId, { category: 'cover' })).json().media;
    expect(created.approvedForPublicResponse).toBe(false); // upload never implies public

    // One PATCH carrying all the media metadata + permissions (what the per-image save sends).
    const patched = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: {
        category: 'pool',
        caption: 'สระว่ายน้ำส่วนตัว',
        ownerVerified: true,
        approvedForDrafts: true,
        approvedForPublicResponse: false,
      },
    });
    expect(patched.statusCode).toBe(200);

    // Reload via list — the persisted state must be exactly what was set.
    const list = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/media`,
      headers: cookieHeader(token),
    });
    const m = list.json().media.find((x: { id: string }) => x.id === created.id);
    expect(m.category).toBe('pool');
    expect(m.caption).toBe('สระว่ายน้ำส่วนตัว');
    expect(m.ownerVerified).toBe(true);
    expect(m.approvedForDrafts).toBe(true);
    expect(m.approvedForPublicResponse).toBe(false); // never auto-enabled
  });

  it('permissions are independent — enabling drafts does not enable public response', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'indep@example.com');
    const created = (await upload(app, token, businessId)).json().media;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { ownerVerified: true, approvedForDrafts: true },
    });
    expect(patched.json().media.approvedForDrafts).toBe(true);
    expect(patched.json().media.approvedForPublicResponse).toBe(false);
  });

  it('archive is independent of the metadata save (status only)', async () => {
    const { app } = await makeTestApp();
    const { token, businessId } = await withBusiness(app, 'arch@example.com');
    const created = (await upload(app, token, businessId)).json().media;
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { ownerVerified: true, approvedForDrafts: true },
    });
    const archived = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessId}/media/${created.id}`,
      headers: uploadHeaders(token),
      payload: { status: 'ARCHIVED' },
    });
    // Archiving preserves the other fields (no hard delete, no reset).
    expect(archived.json().media.status).toBe('ARCHIVED');
    expect(archived.json().media.ownerVerified).toBe(true);
    expect(archived.json().media.approvedForDrafts).toBe(true);
  });
});
