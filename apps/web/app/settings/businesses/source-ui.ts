/**
 * MODEL C — source-subscription UI copy (M4 operator + M5 customer).
 *
 * Pure Thai labels + tiny presentation helpers, kept out of the page components
 * so they can be unit-tested. No secrets, no scanner session wording — the
 * customer never connects Facebook; KMKT operates the read-side scanner.
 */

// ── M5 — customer "กลุ่มที่ติดตาม" ────────────────────────────────────────────
export const SOURCE_SECTION_HEADING = 'กลุ่มที่ติดตาม';
export const SOURCE_SECTION_DESCRIPTION =
  'เลือกกลุ่ม Facebook ที่ต้องการให้ระบบตรวจหา Lead สำหรับธุรกิจนี้';
export const SOURCE_SECTION_HELPER =
  'KMKT เป็นผู้ดูแลระบบสแกน Facebook ให้ คุณไม่ต้องเชื่อมบัญชี Facebook ของธุรกิจ';
export const SOURCE_REVIEW_NOTE =
  'เมื่อพบโพสต์ที่ตรงกับธุรกิจ ระบบจะส่งเข้า "รายการรอตรวจสอบ" ก่อน';
export const SOURCE_SAVE_LABEL = 'บันทึกกลุ่มที่ติดตาม';
export const SOURCE_SAVED_LABEL = '✓ บันทึกเรียบร้อย';
export const SOURCE_EMPTY_STATE =
  'ยังไม่มีกลุ่ม Facebook ที่พร้อมให้ติดตาม กรุณาติดต่อผู้ดูแล KMKT';

// ── M4 — operator "Facebook Sources" ─────────────────────────────────────────
export const OPERATOR_SOURCES_HEADING = 'Facebook Sources';
export const OPERATOR_SOURCES_INTRO =
  'Facebook Sources คือแหล่งข้อมูลที่ KMKT ใช้ตรวจหา Lead ลูกค้าไม่จำเป็นต้องเชื่อม Facebook ของตัวเองเพื่อรับ Lead';
export const OPERATOR_LOGIN_REQUIRED_NOTE = 'ต้องเชื่อมต่อ Facebook โดยผู้ดูแลระบบ';
export const OPERATOR_NOT_AUTHORIZED = 'หน้านี้สำหรับผู้ดูแลระบบ KMKT เท่านั้น';
export const OPERATOR_NO_SOURCE_CONFIGURED =
  'ยังไม่ได้ตั้งค่าแหล่งข้อมูล (source workspace) สำหรับสแกน';

/** Owner-facing Thai for a scanner connection state — never exposes internals. */
export function connectionStateThai(state: string | null | undefined): string {
  switch (state) {
    case 'connected':
      return 'เชื่อมต่อแล้ว';
    case 'reconnect_required':
      return 'ต้องเชื่อมต่อใหม่';
    case 'checkpoint_required':
      return 'ต้องยืนยันตัวตน';
    case 'validation_failed':
      return 'ยังไม่ได้เชื่อมต่อ';
    case 'not_connected':
    case 'none':
    case null:
    case undefined:
      return 'ยังไม่ได้เชื่อมต่อ';
    default:
      return 'ไม่ทราบสถานะ';
  }
}

/** Group status → owner Thai. */
export function groupStatusThai(status: string): string {
  switch (status) {
    case 'active':
      return 'ใช้งาน';
    case 'disabled':
      return 'ปิดใช้งาน';
    case 'archived':
      return 'เก็บถาวร';
    default:
      return status;
  }
}

/** Read/Write flag → owner Thai (never a raw boolean). */
export function flagThai(enabled: boolean): string {
  return enabled ? 'เปิด' : 'ปิด';
}

/** A group's display label, falling back to its URL when unnamed. */
export function sourceGroupLabel(g: { name: string | null; url: string }): string {
  return g.name && g.name.trim().length > 0 ? g.name : g.url;
}
