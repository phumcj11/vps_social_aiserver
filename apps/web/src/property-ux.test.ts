import { describe, expect, it } from 'vitest';
import type { Property } from '../lib/api';
import {
  PRICE_DISPLAY_MODES,
  PRICE_MODE_OPTIONS,
  toCanonicalPriceMode,
  priceFieldsForMode,
  formatBaht,
  AMENITY_OPTIONS,
  AMENITY_LABELS,
  TRISTATE_FACT_OPTIONS,
  FACT_UNKNOWN_LABEL,
  readPropertyFact,
  otherAmenities,
  CAPACITY_FIELDS,
  LOCATION_FIELDS,
  PROPERTY_TAB_GUIDANCE,
  SAVE_MESSAGES,
  saveErrorMessage,
  amenityChips,
  propertySummary,
  propertyChanged,
} from '../app/settings/businesses/property-ui';

const CANONICAL = ['DO_NOT_SHOW', 'STARTING_FROM', 'RANGE', 'ON_REQUEST'];

function prop(over: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    businessId: 'b1',
    name: 'Villa B',
    code: 'BS-B',
    propertyType: 'pool_villa',
    status: 'active',
    description: null,
    location: {
      province: 'ชลบุรี',
      district: 'เมืองชลบุรี',
      subdistrict: 'แสนสุข',
      area: 'บางแสน',
      address: null,
      latitude: null,
      longitude: null,
    },
    capacity: { bedrooms: 5, bathrooms: 5, beds: 6, maxGuests: 15, extraGuestPolicy: null },
    amenities: { privatePool: true, karaoke: true, other: [] },
    pricing: {
      startingPrice: 9500,
      priceDisplayMode: 'STARTING_FROM',
      weekdayPrice: null,
      weekendPrice: null,
      holidayPolicy: null,
      securityDeposit: null,
      extraGuestPrice: null,
    },
    content: { sellingPoints: [], importantNotes: null, prohibitedClaims: [], responseNotes: null },
    media: { coverImage: null, gallery: [], videoUrl: null, mapUrl: null },
    policyOverrides: {
      availabilityPolicy: null,
      pricingPolicy: null,
      promotionPolicy: null,
      bookingPolicy: null,
    },
    ...over,
  } as unknown as Property;
}

describe('canonical priceDisplayMode (the live bug)', () => {
  it('every selectable price mode is a canonical API enum value', () => {
    for (const o of PRICE_MODE_OPTIONS) expect(CANONICAL).toContain(o.value);
    expect([...PRICE_DISPLAY_MODES]).toEqual(CANONICAL);
  });

  it('never emits a non-canonical token like starting_from / hidden / fixed', () => {
    const values = PRICE_MODE_OPTIONS.map((o) => o.value);
    for (const bad of ['starting_from', 'hidden', 'fixed']) expect(values).not.toContain(bad);
  });

  it('maps legacy/lowercase values onto canonical enum values (GET → form)', () => {
    expect(toCanonicalPriceMode('starting_from')).toBe('STARTING_FROM');
    expect(toCanonicalPriceMode('hidden')).toBe('DO_NOT_SHOW');
    expect(toCanonicalPriceMode('fixed')).toBe('STARTING_FROM');
    expect(toCanonicalPriceMode('STARTING_FROM')).toBe('STARTING_FROM');
    expect(toCanonicalPriceMode('RANGE')).toBe('RANGE');
    expect(toCanonicalPriceMode(null)).toBe('STARTING_FROM');
    // Whatever it maps to is always canonical.
    for (const v of ['starting_from', 'hidden', 'fixed', '', 'weird', null, undefined]) {
      expect(CANONICAL).toContain(toCanonicalPriceMode(v));
    }
  });

  it('STARTING_FROM save round-trips to a canonical value the API accepts', () => {
    const chosen = PRICE_MODE_OPTIONS.find((o) => o.label === 'ราคาเริ่มต้น')!;
    expect(chosen.value).toBe('STARTING_FROM');
    // Reload of the saved value maps straight back to the same canonical mode.
    expect(toCanonicalPriceMode(chosen.value)).toBe('STARTING_FROM');
  });
});

describe('mode-driven pricing fields', () => {
  it('STARTING_FROM shows only the starting price (no weekday/weekend required)', () => {
    expect(priceFieldsForMode('STARTING_FROM')).toEqual({ startingPrice: true, range: false });
  });
  it('RANGE shows the range fields, others show neither', () => {
    expect(priceFieldsForMode('RANGE')).toEqual({ startingPrice: false, range: true });
    expect(priceFieldsForMode('DO_NOT_SHOW')).toEqual({ startingPrice: false, range: false });
    expect(priceFieldsForMode('ON_REQUEST')).toEqual({ startingPrice: false, range: false });
  });
});

describe('formatting (display formatted, persist numeric)', () => {
  it('formats baht with a thousands separator for display', () => {
    expect(formatBaht(9500)).toBe('9,500 บาท');
    expect(formatBaht(7000)).toBe('7,000 บาท');
    expect(formatBaht(null)).toBe('');
  });
});

describe('amenities canonical mapping', () => {
  it('boolean options use canonical matcher keys (tri-state facts moved out)', () => {
    const keys = AMENITY_OPTIONS.map((o) => o.key);
    expect(keys).toContain('karaoke');
    expect(keys).toContain('poolTable');
    // M9B: privatePool / nearBeach are now tri-state facts, NOT boolean checkboxes.
    expect(keys).not.toContain('privatePool');
    expect(keys).not.toContain('nearBeach');
    expect(AMENITY_LABELS.karaoke).toBe('คาราโอเกะ');
  });
  it('includes the 8 boolean amenity options', () => {
    expect(AMENITY_OPTIONS).toHaveLength(8);
  });
  it('reads custom other amenities safely', () => {
    expect(otherAmenities({ other: ['เครื่องเสียง', ' '] })).toEqual(['เครื่องเสียง']);
    expect(otherAmenities({ privatePool: 'YES' })).toEqual([]);
  });
});

describe('tri-state property facts (M9B)', () => {
  it('exposes the four tri-state facts with owner-friendly Thai labels', () => {
    const keys = TRISTATE_FACT_OPTIONS.map((f) => f.key);
    expect(keys).toEqual(['privatePool', 'nearBeach', 'beachfront', 'riverfront']);
    const byKey = Object.fromEntries(TRISTATE_FACT_OPTIONS.map((f) => [f.key, f]));
    expect(byKey.privatePool!.label).toBe('สระส่วนตัว');
    expect(byKey.privatePool!.yesLabel).toBe('มี');
    expect(byKey.privatePool!.noLabel).toBe('ไม่มี');
    expect(byKey.nearBeach!.label).toBe('ใกล้ทะเล');
    expect(byKey.beachfront!.label).toBe('ติดทะเล');
    expect(byKey.riverfront!.label).toBe('ติดแม่น้ำ');
  });
  it('UNKNOWN is shown as plain Thai, not an internal token', () => {
    expect(FACT_UNKNOWN_LABEL).toBe('ยังไม่ได้ระบุ');
    expect(FACT_UNKNOWN_LABEL).not.toMatch(/UNKNOWN|null/i);
  });
  it('readPropertyFact returns the explicit enum, missing ⇒ UNKNOWN', () => {
    expect(readPropertyFact({ privatePool: 'YES' }, 'privatePool')).toBe('YES');
    expect(readPropertyFact({ privatePool: 'NO' }, 'privatePool')).toBe('NO');
    expect(readPropertyFact({ privatePool: 'UNKNOWN' }, 'privatePool')).toBe('UNKNOWN');
    expect(readPropertyFact({}, 'nearBeach')).toBe('UNKNOWN');
  });
  it('readPropertyFact tolerates legacy booleans: true⇒YES, false⇒UNKNOWN (never NO)', () => {
    expect(readPropertyFact({ privatePool: true }, 'privatePool')).toBe('YES');
    expect(readPropertyFact({ nearBeach: false }, 'nearBeach')).toBe('UNKNOWN');
  });
  it('a chip appears only for a confirmed-present tri-state fact', () => {
    expect(amenityChips({ privatePool: 'YES', other: [] })).toEqual(['สระว่ายน้ำส่วนตัว']);
    // NO and UNKNOWN never surface a chip (no truthiness leak from the string).
    expect(amenityChips({ privatePool: 'NO', nearBeach: 'UNKNOWN', other: [] })).toEqual([]);
  });
});

describe('capacity + location + guidance', () => {
  it('capacity fields declare units', () => {
    const g = CAPACITY_FIELDS.find((f) => f.key === 'maxGuests')!;
    expect(g.unit).toBe('คน');
    expect(CAPACITY_FIELDS.find((f) => f.key === 'bedrooms')?.unit).toBe('ห้อง');
  });
  it('location fields provide example placeholders', () => {
    expect(LOCATION_FIELDS.find((f) => f.key === 'province')?.placeholder).toBe('ชลบุรี');
    expect(LOCATION_FIELDS.find((f) => f.key === 'subdistrict')?.placeholder).toBe('แสนสุข');
  });
  it('every content tab has guidance text', () => {
    for (const tab of [
      'ที่ตั้ง',
      'ความจุ',
      'สิ่งอำนวยความสะดวก',
      'ราคา',
      'เนื้อหา',
      'นโยบายเฉพาะ',
    ]) {
      expect(PROPERTY_TAB_GUIDANCE[tab]?.length ?? 0).toBeGreaterThan(5);
    }
  });
});

describe('owner-safe save messages (never raw backend strings)', () => {
  it('maps validation failures to a check-the-form message', () => {
    expect(saveErrorMessage({ status: 400 })).toBe(SAVE_MESSAGES.validation);
    expect(saveErrorMessage({ status: 422 })).toBe(SAVE_MESSAGES.validation);
    expect(saveErrorMessage({ code: 'validation_error' })).toBe(SAVE_MESSAGES.validation);
  });
  it('maps everything else to a generic retry message, not the raw string', () => {
    expect(saveErrorMessage({ status: 500, message: 'Nothing valid to update' })).toBe(
      SAVE_MESSAGES.serverError,
    );
    expect(saveErrorMessage(new Error('Nothing valid to update'))).toBe(SAVE_MESSAGES.serverError);
    expect(saveErrorMessage(null)).toBe(SAVE_MESSAGES.serverError);
  });
  it('exposes the exact owner-facing Thai strings', () => {
    expect(SAVE_MESSAGES.noChanges).toBe('ยังไม่มีข้อมูลที่เปลี่ยนแปลง');
    expect(SAVE_MESSAGES.saving).toBe('กำลังบันทึก...');
    expect(SAVE_MESSAGES.saved).toBe('บันทึกเรียบร้อย');
  });
});

describe('property list summary (Phase I) — structured, no raw enums', () => {
  it('summarizes Villa B without exposing raw enum values', () => {
    const s = propertySummary(prop(), 'READY');
    expect(s.typeLabel).toBe('พูลวิลล่า');
    expect(s.typeLabel).not.toMatch(/_/);
    expect(s.area).toBe('บางแสน');
    expect(s.capacityLine).toBe('รองรับสูงสุด 15 คน');
    expect(s.bedroomsLine).toBe('5 ห้องนอน');
    expect(s.amenityLine).toBe('สระว่ายน้ำส่วนตัว · คาราโอเกะ');
    expect(s.readiness).toBe('READY');
  });
  it('summarizes Villa A (pool only, fewer guests)', () => {
    const s = propertySummary(
      prop({
        name: 'Villa A',
        capacity: { bedrooms: 3, bathrooms: 3, beds: 4, maxGuests: 8, extraGuestPolicy: null },
        amenities: { privatePool: true, karaoke: false, other: [] },
      }),
    );
    expect(s.capacityLine).toBe('รองรับสูงสุด 8 คน');
    expect(s.bedroomsLine).toBe('3 ห้องนอน');
    expect(s.amenityLine).toBe('สระว่ายน้ำส่วนตัว');
  });
  it('amenity chips only surface featured amenities that are present', () => {
    expect(amenityChips({ privatePool: true, karaoke: true, wifi: true, other: [] })).toEqual([
      'สระว่ายน้ำส่วนตัว',
      'คาราโอเกะ',
    ]);
  });
});

describe('change detection', () => {
  it('detects owner edits and reports no-change when identical', () => {
    const a = prop();
    expect(propertyChanged(a.pricing, { ...a.pricing })).toBe(false);
    expect(propertyChanged(a.pricing, { ...a.pricing, startingPrice: 8000 })).toBe(true);
  });
});
