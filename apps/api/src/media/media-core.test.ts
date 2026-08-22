import { describe, expect, it } from 'vitest';
import { validateImage } from './image-validation';
import { selectMedia, type MediaSelectionContext } from './selection';
import { buildMediaStorageKey, resolveMediaPath, extForMime } from './storage';
import type { MediaAsset } from './types';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from([0, 0, 0, 0]),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

let seq = 0;
function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  seq += 1;
  return {
    id: over.id ?? `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`,
    workspaceId: 'ws',
    businessId: 'biz',
    propertyId: null,
    mediaType: 'IMAGE',
    storageKey: 'storage/media/x',
    originalFilename: 'x.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    category: 'cover',
    caption: null,
    status: 'ACTIVE',
    approvedForDrafts: true,
    approvedForPublicResponse: false,
    ownerVerified: true,
    width: null,
    height: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function ctx(over: Partial<MediaSelectionContext> = {}): MediaSelectionContext {
  return {
    imageResponseMode: 'HUMAN_REVIEW_ONLY',
    propertyMatch: { decision: 'MATCH', propertyId: 'villa-b' },
    requestedAmenities: ['privatePool', 'karaoke'],
    ...over,
  };
}

describe('image validation (trusts bytes, not filename/declared MIME)', () => {
  it('accepts jpeg/png/webp when bytes match the declared MIME', () => {
    expect(validateImage(JPEG, 'image/jpeg').ok).toBe(true);
    expect(validateImage(PNG, 'image/png').ok).toBe(true);
    expect(validateImage(WEBP, 'image/webp').ok).toBe(true);
  });
  it('reads PNG dimensions from IHDR', () => {
    const png = Buffer.from(PNG);
    png.writeUInt32BE(800, 16);
    png.writeUInt32BE(600, 20);
    const r = validateImage(png, 'image/png');
    expect(r.ok && r.width).toBe(800);
    expect(r.ok && r.height).toBe(600);
  });
  it('rejects SVG and other non-raster types', () => {
    const r = validateImage(SVG, 'image/svg+xml');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('UNSUPPORTED_TYPE');
  });
  it('rejects a MIME/content mismatch (png bytes declared as jpeg)', () => {
    const r = validateImage(PNG, 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('MIME_MISMATCH');
  });
  it('rejects an oversize buffer and an empty buffer', () => {
    expect(validateImage(Buffer.alloc(0), 'image/png').ok).toBe(false);
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const r = validateImage(big, 'image/png');
    expect(!r.ok && r.code).toBe('TOO_LARGE');
  });
});

describe('storage keys (server-generated, traversal-safe)', () => {
  const ids = {
    workspaceId: '11111111-1111-1111-1111-111111111111',
    businessId: '22222222-2222-2222-2222-222222222222',
    assetId: '33333333-3333-3333-3333-333333333333',
  };
  it('builds a key under the media root with a MIME-derived extension', () => {
    const key = buildMediaStorageKey({ ...ids, mime: 'image/webp' });
    expect(key).toBe(`storage/media/${ids.workspaceId}/${ids.businessId}/${ids.assetId}.webp`);
    expect(extForMime('image/jpeg')).toBe('jpg');
  });
  it('rejects a non-UUID component (no client-controlled paths)', () => {
    expect(() =>
      buildMediaStorageKey({ ...ids, businessId: '../etc', mime: 'image/png' }),
    ).toThrow();
  });
  it('resolveMediaPath refuses keys that escape the root', () => {
    expect(() => resolveMediaPath('/srv/app', 'storage/media/../../etc/passwd')).toThrow();
    expect(resolveMediaPath('/srv/app', `storage/media/a.png`)).toContain(
      '/srv/app/storage/media/',
    );
  });
});

describe('deterministic media selection — Property MATCH', () => {
  it('prefers the approved pool image of the matched property when pool is requested', () => {
    const pool = asset({ id: 'p', propertyId: 'villa-b', category: 'pool' });
    const cover = asset({ id: 'c', propertyId: 'villa-b', category: 'cover' });
    const r = selectMedia([cover, pool], ctx());
    expect(r.selected?.id).toBe('p');
    expect(r.reasons).toContain('PROPERTY_MATCH_IMAGE');
    expect(r.reasons).toContain('REQUESTED_AMENITY:privatePool');
    expect(r.reasons).toContain('CATEGORY:pool');
  });
  it('prefers the karaoke image when only karaoke is requested', () => {
    const karaoke = asset({ id: 'k', propertyId: 'villa-b', category: 'karaoke' });
    const cover = asset({ id: 'c', propertyId: 'villa-b', category: 'cover' });
    const r = selectMedia([cover, karaoke], ctx({ requestedAmenities: ['karaoke'] }));
    expect(r.selected?.id).toBe('k');
    expect(r.reasons).toContain('REQUESTED_AMENITY:karaoke');
  });
  it('falls back to cover/exterior when no requested amenity has an image', () => {
    const exterior = asset({ id: 'e', propertyId: 'villa-b', category: 'exterior' });
    const cover = asset({ id: 'c', propertyId: 'villa-b', category: 'cover' });
    const r = selectMedia([exterior, cover], ctx({ requestedAmenities: [] }));
    expect(r.selected?.id).toBe('c'); // cover before exterior
  });
  it('excludes unverified, archived, and non-draft-approved assets', () => {
    const unverified = asset({
      id: 'u',
      propertyId: 'villa-b',
      category: 'pool',
      ownerVerified: false,
    });
    const archived = asset({
      id: 'a',
      propertyId: 'villa-b',
      category: 'pool',
      status: 'ARCHIVED',
    });
    const noDraft = asset({
      id: 'n',
      propertyId: 'villa-b',
      category: 'pool',
      approvedForDrafts: false,
    });
    const r = selectMedia([unverified, archived, noDraft], ctx());
    expect(r.selected).toBeNull();
  });
  it('excludes images of a different property', () => {
    const other = asset({ id: 'o', propertyId: 'villa-a', category: 'pool' });
    const r = selectMedia([other], ctx());
    expect(r.selected).toBeNull();
  });
  it('is a deterministic tie-break: oldest then id', () => {
    const older = asset({
      id: 'b',
      propertyId: 'villa-b',
      category: 'pool',
      createdAt: new Date('2026-01-01'),
    });
    const newer = asset({
      id: 'a',
      propertyId: 'villa-b',
      category: 'pool',
      createdAt: new Date('2026-02-01'),
    });
    const r = selectMedia([newer, older], ctx());
    expect(r.selected?.id).toBe('b'); // older wins despite later id sorting first
  });
});

describe('deterministic media selection — NO_PROPERTY_MATCH', () => {
  const noMatch = ctx({ propertyMatch: { decision: 'NO_MATCH', propertyId: null } });
  it('NEVER selects a Property image, even a matching category', () => {
    const propertyPool = asset({ id: 'p', propertyId: 'villa-b', category: 'pool' });
    const r = selectMedia([propertyPool], noMatch);
    expect(r.selected).toBeNull();
  });
  it('allows a Business-level image under HUMAN_REVIEW_ONLY / BUSINESS_FALLBACK', () => {
    const bizCover = asset({ id: 'b', propertyId: null, category: 'cover' });
    const r = selectMedia([bizCover], noMatch);
    expect(r.selected?.id).toBe('b');
    expect(r.reasons).toContain('BUSINESS_FALLBACK_NO_MATCH');
  });
  it('does NOT use a business image under MATCHED_PROPERTY_ONLY', () => {
    const bizCover = asset({ id: 'b', propertyId: null, category: 'cover' });
    const r = selectMedia(
      [bizCover],
      ctx({
        propertyMatch: { decision: 'NO_MATCH', propertyId: null },
        imageResponseMode: 'MATCHED_PROPERTY_ONLY',
      }),
    );
    expect(r.selected).toBeNull();
  });
  it('returns null (draft still valid) when there is no approved business image', () => {
    const r = selectMedia([], noMatch);
    expect(r.selected).toBeNull();
  });
});

describe('media selection — mode + safety invariants', () => {
  it('OFF never selects anything', () => {
    const pool = asset({ id: 'p', propertyId: 'villa-b', category: 'pool' });
    expect(selectMedia([pool], ctx({ imageResponseMode: 'OFF' })).selected).toBeNull();
  });
  it('a category never becomes an amenity fact — selection only reports the category, not a claim', () => {
    const pool = asset({ id: 'p', propertyId: 'villa-b', category: 'pool' });
    const r = selectMedia([pool], ctx({ requestedAmenities: [] }));
    // Chosen because it is the property's image, but reasons never assert the
    // property "has a pool" — only that the image exists and is approved.
    expect(r.reasons).not.toContain('AMENITY_PROVEN');
    expect(r.reasons.some((x) => x.startsWith('CATEGORY:'))).toBe(true);
  });
  it('public-response approval is independent of draft eligibility', () => {
    const drafts = asset({
      id: 'p',
      propertyId: 'villa-b',
      category: 'pool',
      approvedForPublicResponse: false,
    });
    const r = selectMedia([drafts], ctx());
    expect(r.selected?.id).toBe('p'); // eligible for draft suggestion
    expect(r.selected?.approvedForPublicResponse).toBe(false); // still not public-approved
  });
});
