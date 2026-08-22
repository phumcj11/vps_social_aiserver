import { describe, expect, it } from 'vitest';
import {
  RESPONSE_STRATEGY_QUESTION,
  RESPONSE_STRATEGY_OPTIONS,
  RESPONSE_STRATEGY_SAFETY_NOTE,
  noMatchExplainLines,
} from '../app/settings/businesses/ui';

describe('response strategy owner UX', () => {
  it('offers exactly the three canonical strategies mapped to plain Thai', () => {
    expect(RESPONSE_STRATEGY_OPTIONS.map((o) => o.value)).toEqual([
      'DO_NOT_RESPOND',
      'DRAFT_BUSINESS_ONLY',
      'HUMAN_REVIEW',
    ]);
    for (const o of RESPONSE_STRATEGY_OPTIONS) {
      expect(o.label).not.toMatch(/_/); // no raw enum tokens
      expect(o.description.length).toBeGreaterThan(5);
    }
  });

  it('recommends HUMAN_REVIEW as the safe default (exactly one recommended)', () => {
    const rec = RESPONSE_STRATEGY_OPTIONS.filter((o) => o.recommended);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.value).toBe('HUMAN_REVIEW');
  });

  it('states the safety guarantee that a mismatch never becomes a MATCH', () => {
    expect(RESPONSE_STRATEGY_SAFETY_NOTE).toContain('ไม่ทำให้ที่พักที่ไม่ตรงกลายเป็น MATCH');
    expect(RESPONSE_STRATEGY_QUESTION).toContain('ไม่มีที่พักที่ตรง');
  });

  it('explains HUMAN_REVIEW without claiming price/availability', () => {
    const lines = noMatchExplainLines('HUMAN_REVIEW');
    expect(lines).toContain('✓ ไม่ยืนยันห้องว่าง');
    expect(lines).toContain('✓ ไม่พูดราคา');
    expect(lines).toContain('✓ ไม่เลือกที่พักหลังใด');
    expect(lines).toContain('✓ รอคุณตรวจสอบ');
  });

  it('explains DO_NOT_RESPOND as producing no message', () => {
    const lines = noMatchExplainLines('DO_NOT_RESPOND');
    expect(lines.some((l) => l.includes('ไม่สร้างข้อความ'))).toBe(true);
  });

  it('DRAFT_BUSINESS_ONLY still promises no price/availability/property selection', () => {
    const lines = noMatchExplainLines('DRAFT_BUSINESS_ONLY');
    expect(lines).toContain('✓ ไม่พูดราคา');
    expect(lines).toContain('✓ ไม่ยืนยันห้องว่าง');
    expect(lines).toContain('✓ ไม่เลือกที่พักหลังใด');
  });
});
