import { describe, expect, it } from 'vitest';
import {
  SOURCE_SECTION_HEADING,
  SOURCE_SECTION_DESCRIPTION,
  SOURCE_SECTION_HELPER,
  SOURCE_REVIEW_NOTE,
  SOURCE_EMPTY_STATE,
  SOURCE_SAVE_LABEL,
  OPERATOR_SOURCES_HEADING,
  OPERATOR_SOURCES_INTRO,
  OPERATOR_LOGIN_REQUIRED_NOTE,
  OPERATOR_NOT_AUTHORIZED,
  connectionStateThai,
  groupStatusThai,
  flagThai,
  sourceGroupLabel,
} from '../app/settings/businesses/source-ui';

describe('MODEL C source-subscription UX copy (M4/M5)', () => {
  it('1. customer heading + description are owner-facing Thai', () => {
    expect(SOURCE_SECTION_HEADING).toBe('กลุ่มที่ติดตาม');
    expect(SOURCE_SECTION_DESCRIPTION).toContain('เลือกกลุ่ม Facebook');
    expect(SOURCE_SECTION_DESCRIPTION).toContain('Lead');
  });

  it('2. helper makes clear the customer does NOT connect Facebook', () => {
    expect(SOURCE_SECTION_HELPER).toContain('KMKT เป็นผู้ดูแลระบบสแกน');
    expect(SOURCE_SECTION_HELPER).toContain('ไม่ต้องเชื่อมบัญชี Facebook');
  });

  it('3. review note explains leads go to review first — never promises auto-comment', () => {
    expect(SOURCE_REVIEW_NOTE).toContain('รายการรอตรวจสอบ');
    expect(SOURCE_REVIEW_NOTE).not.toMatch(/คอมเมนต์อัตโนมัติ|ตอบอัตโนมัติ|โพสต์อัตโนมัติ/);
  });

  it('4. empty state directs to the KMKT admin, not to a Facebook login', () => {
    expect(SOURCE_EMPTY_STATE).toContain('ติดต่อผู้ดูแล KMKT');
    expect(SOURCE_EMPTY_STATE).not.toMatch(/เข้าสู่ระบบ Facebook|เชื่อม Facebook ของคุณ/);
    expect(SOURCE_SAVE_LABEL).toContain('บันทึก');
  });

  it('5. operator intro states customers need not connect their own Facebook', () => {
    expect(OPERATOR_SOURCES_HEADING).toBe('Facebook Sources');
    expect(OPERATOR_SOURCES_INTRO).toContain('KMKT ใช้ตรวจหา Lead');
    expect(OPERATOR_SOURCES_INTRO).toContain('ไม่จำเป็นต้องเชื่อม Facebook');
    expect(OPERATOR_LOGIN_REQUIRED_NOTE).toBe('ต้องเชื่อมต่อ Facebook โดยผู้ดูแลระบบ');
    expect(OPERATOR_NOT_AUTHORIZED).toContain('ผู้ดูแลระบบ KMKT');
  });

  it('6. connection state maps to safe Thai (no raw internal codes)', () => {
    expect(connectionStateThai('connected')).toBe('เชื่อมต่อแล้ว');
    expect(connectionStateThai('validation_failed')).toBe('ยังไม่ได้เชื่อมต่อ');
    expect(connectionStateThai('reconnect_required')).toBe('ต้องเชื่อมต่อใหม่');
    expect(connectionStateThai(null)).toBe('ยังไม่ได้เชื่อมต่อ');
    // No raw code leaks to the operator label.
    for (const s of ['connected', 'validation_failed', 'reconnect_required']) {
      expect(connectionStateThai(s)).not.toMatch(/_|[a-z]{4,}/);
    }
  });

  it('7. group status + flags render as Thai, never raw booleans', () => {
    expect(groupStatusThai('active')).toBe('ใช้งาน');
    expect(groupStatusThai('disabled')).toBe('ปิดใช้งาน');
    expect(flagThai(true)).toBe('เปิด');
    expect(flagThai(false)).toBe('ปิด');
  });

  it('8. a group label falls back to its URL when unnamed', () => {
    expect(sourceGroupLabel({ name: 'พูลวิลล่าบางแสน', url: 'https://x' })).toBe('พูลวิลล่าบางแสน');
    expect(sourceGroupLabel({ name: null, url: 'https://fb/groups/1' })).toBe(
      'https://fb/groups/1',
    );
    expect(sourceGroupLabel({ name: '  ', url: 'https://fb/groups/2' })).toBe(
      'https://fb/groups/2',
    );
  });
});
