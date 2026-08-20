import { describe, expect, it } from 'vitest';
import {
  normalizeCommentText,
  commentTextEquals,
  commentTextHash,
  countNormalizedOccurrences,
} from './text-normalize';

const APPROVED =
  'สวัสดีค่ะ ทางบางแสน Test ให้บริการค่ะ 😊 ติดต่อสอบถามได้ที่ ข้อมูลทดสอบ — ไม่เปิดรับจองจริง';

describe('normalizeCommentText / commentTextEquals', () => {
  it('exact text matches itself', () => {
    expect(commentTextEquals(APPROVED, APPROVED)).toBe(true);
  });

  it('tolerates an emoji present in both', () => {
    expect(commentTextEquals('hi 😊 there', 'hi 😊 there')).toBe(true);
  });

  it('tolerates an emoji variation-selector (VS16) difference', () => {
    expect(commentTextEquals(APPROVED, APPROVED.replace('😊', '😊️'))).toBe(true);
  });

  it('tolerates em-dash vs hyphen', () => {
    const withHyphen = APPROVED.replace(' — ', ' - ');
    expect(withHyphen).not.toEqual(APPROVED);
    expect(commentTextEquals(APPROVED, withHyphen)).toBe(true);
  });

  it('tolerates multiple/collapsed spaces', () => {
    expect(commentTextEquals(APPROVED, APPROVED.replace(/ /g, '   '))).toBe(true);
  });

  it('tolerates injected line breaks', () => {
    expect(commentTextEquals(APPROVED, APPROVED.replace('😊', '😊\n'))).toBe(true);
  });

  it('tolerates NBSP and zero-width characters', () => {
    const withInvisible = APPROVED.replace(/ /g, ' ').replace('ข้อมูล', '​ข้อมูล');
    expect(commentTextEquals(APPROVED, withInvisible)).toBe(true);
  });

  it('applies Unicode NFC normalization (decomposed == composed)', () => {
    expect(commentTextEquals('Café', 'Café')).toBe(true);
    expect(normalizeCommentText('Café')).toBe('Café');
  });

  it('an unrelated comment does NOT match', () => {
    expect(commentTextEquals(APPROVED, 'สวัสดีค่ะ อย่างอื่นโดยสิ้นเชิง')).toBe(false);
  });

  it('a partial (truncated) text does NOT match', () => {
    expect(commentTextEquals(APPROVED, 'สวัสดีค่ะ ทางบางแสน Test')).toBe(false);
  });

  it('normalized hash is stable across cosmetic differences', () => {
    expect(commentTextHash(APPROVED)).toBe(commentTextHash(APPROVED.replace(' — ', ' - ')));
    expect(commentTextHash(APPROVED)).not.toBe(commentTextHash(APPROVED + ' extra'));
  });
});

describe('countNormalizedOccurrences', () => {
  it('counts exactly one whole match in surrounding text', () => {
    expect(countNormalizedOccurrences(`post header\n${APPROVED}\ncomments`, APPROVED)).toBe(1);
  });
  it('counts two identical (normalized) matches', () => {
    const dupe = APPROVED.replace(' — ', ' - '); // cosmetic variant, still a match
    expect(countNormalizedOccurrences(`${APPROVED} ||| ${dupe}`, APPROVED)).toBe(2);
  });
  it('counts zero when absent', () => {
    expect(countNormalizedOccurrences('nothing relevant here', APPROVED)).toBe(0);
  });
  it('does not count a partial occurrence', () => {
    expect(countNormalizedOccurrences('สวัสดีค่ะ ทางบางแสน Test only', APPROVED)).toBe(0);
  });
});
