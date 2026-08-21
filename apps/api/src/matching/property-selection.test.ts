import { describe, expect, it } from 'vitest';
import {
  parsePropertyRequirement,
  evaluatePropertyCandidate,
  selectBestProperty,
  PROPERTY_MATCHER_VERSION,
} from './property-selection';
import { emptyPropertyDefaults } from '../business-property/store';
import type { Property } from '../business-property/types';

function property(id: string, over: Partial<Property> = {}): Property {
  return {
    ...emptyPropertyDefaults(),
    id,
    workspaceId: 'ws',
    businessId: 'biz',
    name: id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as Property;
}

function loc(area: string): Property['location'] {
  return { ...emptyPropertyDefaults().location, area };
}
function cap(maxGuests: number, bedrooms: number | null = null): Property['capacity'] {
  return { ...emptyPropertyDefaults().capacity, maxGuests, bedrooms };
}

// The Sprint-016B canonical scenario (spec Phase Q).
const villaA = property('villa-a', {
  name: 'Villa A',
  propertyType: 'pool_villa',
  location: loc('บางแสน'),
  capacity: cap(8),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: true },
});
const villaB = property('villa-b', {
  name: 'Villa B',
  propertyType: 'pool_villa',
  location: loc('บางแสน'),
  capacity: cap(15),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: true, karaoke: true },
});
const villaC = property('villa-c', {
  name: 'Villa C',
  propertyType: 'pool_villa',
  location: loc('พัทยา'),
  capacity: cap(20),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: true },
});

const KNOWN_AREAS = ['บางแสน', 'พัทยา'];
const REQUEST = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';

describe('parsePropertyRequirement', () => {
  it('parses area (from known areas), guests, type, pool, and requested amenities', () => {
    const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);
    expect(req.area).toBe('บางแสน');
    expect(req.guests).toBe(12);
    expect(req.accommodationType).toBe('pool_villa');
    expect(req.needsPrivatePool).toBe(true);
    expect(req.requestedAmenities).toContain('karaoke');
  });

  it('recognises a served area or a seed-lexicon area, and null for an unknown place', () => {
    // Served by a candidate Property.
    expect(parsePropertyRequirement('หาบ้านพัทยา', KNOWN_AREAS).area).toBe('พัทยา');
    // In the seed lexicon even if no candidate serves it (→ enables AREA_MISMATCH).
    expect(parsePropertyRequirement('หาบ้านเชียงใหม่', KNOWN_AREAS).area).toBe('เชียงใหม่');
    // A made-up place is not recognised as an area.
    expect(parsePropertyRequirement('หาบ้านเมืองสมมติแห่งหนึ่ง', KNOWN_AREAS).area).toBeNull();
  });

  it('parses bedrooms and beach/river requirements', () => {
    const req = parsePropertyRequirement('บ้านริมทะเล 3 ห้องนอน', ['หัวหิน']);
    expect(req.bedrooms).toBe(3);
    expect(req.needsBeach).toBe(true);
    expect(req.needsRiver).toBe(false);
  });
});

describe('evaluatePropertyCandidate', () => {
  const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);

  it('MATCHes a qualifying property with positive reasons', () => {
    const e = evaluatePropertyCandidate(villaB, req);
    expect(e.decision).toBe('MATCH');
    expect(e.reasons.some((r) => r.startsWith('AREA_MATCH'))).toBe(true);
    expect(e.reasons.some((r) => r.startsWith('CAPACITY_MATCH'))).toBe(true);
    expect(e.reasons).toContain('AMENITY_MATCH: karaoke');
  });

  it('NO_MATCH when capacity is too low (disqualifier)', () => {
    const e = evaluatePropertyCandidate(villaA, req);
    expect(e.decision).toBe('NO_MATCH');
    expect(e.reasons.some((r) => r.startsWith('CAPACITY_MISMATCH'))).toBe(true);
  });

  it('NO_MATCH when the area mismatches (disqualifier)', () => {
    const e = evaluatePropertyCandidate(villaC, req);
    expect(e.decision).toBe('NO_MATCH');
    expect(e.reasons.some((r) => r.startsWith('AREA_MISMATCH'))).toBe(true);
  });

  it('records a soft AMENITY_MISSING for a requested amenity the property lacks', () => {
    const noKaraoke = property('villa-d', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: true },
    });
    const e = evaluatePropertyCandidate(noKaraoke, req);
    expect(e.decision).toBe('MATCH'); // missing amenity is soft, not disqualifying
    expect(e.reasons).toContain('AMENITY_MISSING: karaoke');
  });
});

describe('selectBestProperty', () => {
  const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);

  it('selects the single qualifying property (Villa B) in the canonical scenario', () => {
    const sel = selectBestProperty([villaA, villaB, villaC], req);
    expect(sel.decision).toBe('MATCH');
    expect(sel.selected?.property.id).toBe('villa-b');
    expect(sel.candidatesEvaluated).toBe(3);
  });

  it('NO_PROPERTY_MATCH when nothing qualifies (never fabricates a property)', () => {
    const sel = selectBestProperty([villaA, villaC], req); // A fails capacity, C fails area
    expect(sel.decision).toBe('NO_MATCH');
    expect(sel.selected).toBeNull();
    expect(sel.reasons).toContain('NO_PROPERTY_MATCH');
  });

  it('ranks amenity/feature coverage above a bare match, deterministically', () => {
    const plain = property('villa-plain', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: true },
    });
    const richer = property('villa-rich', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: true, karaoke: true },
    });
    const sel = selectBestProperty([plain, richer], req);
    expect(sel.selected?.property.id).toBe('villa-rich');
  });

  it('uses a stable id tie-break when candidates rank identically', () => {
    const p1 = property('aaa', { location: loc('บางแสน'), capacity: cap(12) });
    const p2 = property('bbb', { location: loc('บางแสน'), capacity: cap(12) });
    const bare = parsePropertyRequirement('หาที่พักบางแสน 12 คน', KNOWN_AREAS);
    const sel = selectBestProperty([p2, p1], bare);
    expect(sel.selected?.property.id).toBe('aaa'); // 'aaa' < 'bbb'
  });

  it('prefers the snuggest sufficient capacity', () => {
    const snug = property('snug', { location: loc('บางแสน'), capacity: cap(12) });
    const huge = property('huge', { location: loc('บางแสน'), capacity: cap(40) });
    const bare = parsePropertyRequirement('หาที่พักบางแสน 12 คน', KNOWN_AREAS);
    const sel = selectBestProperty([huge, snug], bare);
    expect(sel.selected?.property.id).toBe('snug');
  });
});

describe('matcher version', () => {
  it('is the stable property-rules-v1 constant', () => {
    expect(PROPERTY_MATCHER_VERSION).toBe('property-rules-v1');
  });
});
