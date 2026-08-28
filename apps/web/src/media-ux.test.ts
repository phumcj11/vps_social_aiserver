import { describe, expect, it } from 'vitest';
import {
  MEDIA_CATEGORIES,
  mediaCategoryLabel,
  IMAGE_RESPONSE_OPTIONS,
  mediaReasonThai,
  noMediaReasonThai,
} from '../app/settings/businesses/media-ui';

describe('media owner-facing labels', () => {
  it('every category has a plain-Thai label (no raw enum token)', () => {
    for (const c of MEDIA_CATEGORIES) {
      const label = mediaCategoryLabel(c);
      expect(label).not.toBe(c);
      expect(label).not.toMatch(/_/);
    }
    expect(mediaCategoryLabel('pool')).toBe('สระว่ายน้ำ');
    expect(mediaCategoryLabel('karaoke')).toBe('คาราโอเกะ');
  });

  it('image-response options recommend HUMAN_REVIEW_ONLY (safe default)', () => {
    const rec = IMAGE_RESPONSE_OPTIONS.filter((o) => o.recommended);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.value).toBe('HUMAN_REVIEW_ONLY');
    expect(IMAGE_RESPONSE_OPTIONS.map((o) => o.value)).toEqual([
      'OFF',
      'MATCHED_PROPERTY_ONLY',
      'BUSINESS_FALLBACK',
      'HUMAN_REVIEW_ONLY',
    ]);
  });

  it('maps selection reason codes to Thai (amenity never asserted as proven)', () => {
    expect(mediaReasonThai('PROPERTY_MATCH_IMAGE')).toContain('ที่พัก');
    expect(mediaReasonThai('REQUESTED_AMENITY:privatePool')).toContain('สระ');
    expect(mediaReasonThai('REQUESTED_AMENITY:karaoke')).toContain('คาราโอเกะ');
    expect(mediaReasonThai('OWNER_VERIFIED')).toContain('ยืนยัน');
    expect(mediaReasonThai('CATEGORY:pool')).toContain('สระว่ายน้ำ');
    // Reason text describes the customer's request, never "the property has X".
    expect(mediaReasonThai('REQUESTED_AMENITY:privatePool')).not.toContain('มีสระ');
  });

  it('maps the hard pool requirement reason to "ลูกค้าต้องการสระ"', () => {
    expect(mediaReasonThai('REQUESTED_REQUIREMENT:private_pool')).toBe('ลูกค้าต้องการสระ');
    // Still describes the request, not a proven property fact.
    expect(mediaReasonThai('REQUESTED_REQUIREMENT:private_pool')).not.toContain('มีสระ');
  });

  it('explains why no image was chosen (draft still valid)', () => {
    expect(noMediaReasonThai('MODE_OFF')).toContain('ปิด');
    expect(noMediaReasonThai('NO_APPROVED_BUSINESS_IMAGE')).toContain('ยังไม่มี');
    expect(noMediaReasonThai('anything')).toContain('ข้อความยังใช้งานได้');
  });
});
