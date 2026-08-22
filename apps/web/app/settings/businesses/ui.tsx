'use client';

import type { ReactNode, CSSProperties } from 'react';
import type {
  AvailabilityPolicy,
  PricingPolicy,
  PromotionPolicy,
  BookingPolicy,
  ContactChannelType,
} from '../../../lib/api';

/**
 * Shared, mobile-first UI building blocks + Thai labels for the Business +
 * Property self-service screens (SPRINT 016). Plain inline styles (no external
 * design library), stacked-by-default so there is no horizontal overflow on
 * small screens; tables render as cards. Internal UUIDs are never the label.
 */

export const colors = {
  ok: '#0a7d28',
  warn: '#b26a00',
  danger: '#b00020',
  muted: '#666',
  border: '#e2e2e2',
  cardBg: '#fafafa',
};

export function Page({ children }: { children: ReactNode }) {
  return <main style={{ maxWidth: 820, margin: '0 auto', padding: '0 0.75rem' }}>{children}</main>;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: '1.25rem' }}>
      {title ? <h2 style={{ fontSize: '1.1rem' }}>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Card({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '0.75rem',
        marginBottom: '0.6rem',
        background: colors.cardBg,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  /** Field-level validation message, shown in danger colour below the input. */
  error?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{label}</span>
      {children}
      {error ? (
        <span style={{ display: 'block', fontSize: '0.8rem', color: colors.danger }}>{error}</span>
      ) : hint ? (
        <span style={{ display: 'block', fontSize: '0.8rem', color: colors.muted }}>{hint}</span>
      ) : null}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontSize: '1rem',
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputStyle, minHeight: 80, ...(props.style ?? {}) }} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, minHeight: 32 }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20 }}
      />
      <span>{label}</span>
    </label>
  );
}

export function Button({
  children,
  onClick,
  kind = 'default',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'default' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const bg = kind === 'primary' ? '#0a58ca' : kind === 'danger' ? colors.danger : '#f0f0f0';
  const fg = kind === 'default' ? '#111' : '#fff';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#ccc' : bg,
        color: fg,
        border: 'none',
        borderRadius: 6,
        padding: '0.5rem 0.9rem',
        fontSize: '1rem',
        minHeight: 40,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const c = colors[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.8rem',
        color: '#fff',
        background: c,
      }}
    >
      {text}
    </span>
  );
}

export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        background: '#fff',
        borderTop: `1px solid ${colors.border}`,
        padding: '0.6rem 0',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        margin: '0.5rem 0 1rem',
        overflowX: 'auto',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={{
            border: `1px solid ${active === t ? '#0a58ca' : colors.border}`,
            background: active === t ? '#0a58ca' : '#fff',
            color: active === t ? '#fff' : '#111',
            borderRadius: 999,
            padding: '0.35rem 0.75rem',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * Readiness checklist. When `onFix` is provided each missing requirement becomes
 * a "click-to-fix" row: a Thai explanation of why it matters plus a button that
 * navigates to the tab that resolves it (SPRINT 017 Phase G).
 */
export function ReadinessChecklist({
  missing,
  onFix,
}: {
  missing: string[];
  onFix?: (tab: string) => void;
}) {
  if (missing.length === 0) return <p style={{ color: colors.ok }}>✓ พร้อมใช้งาน (READY)</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {missing.map((m) => {
        const tab = readinessTab(m);
        return (
          <li
            key={m}
            style={{
              marginBottom: 8,
              padding: '0.5rem 0.6rem',
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              background: '#fff',
            }}
          >
            <div style={{ color: colors.danger, fontWeight: 600 }}>
              ✗ {THAI_REQUIREMENT[m] ?? m}
            </div>
            {READINESS_WHY[m] ? (
              <div style={{ fontSize: '0.82rem', color: colors.muted, margin: '2px 0 6px' }}>
                {READINESS_WHY[m]}
              </div>
            ) : null}
            {onFix ? <Button onClick={() => onFix(tab)}>{READINESS_CTA[tab]}</Button> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Simple progress bar for the onboarding checklist. */
export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(pct / 10);
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        {done} จาก {total} ขั้นตอนเสร็จแล้ว
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: '#e8eef7',
          overflow: 'hidden',
          margin: '6px 0 2px',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: '#0a58ca',
            transition: 'width .2s',
          }}
        />
      </div>
      <div style={{ fontSize: '0.8rem', color: colors.muted }}>
        {'█'.repeat(filled)}
        {'░'.repeat(10 - filled)} {pct}%
      </div>
    </div>
  );
}

/** Inline Thai save-status line (SPRINT 017 Phase N). */
export type SaveState = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';
export function SaveStatus({ state, message }: { state: SaveState; message?: string | null }) {
  if (state === 'idle') return null;
  const map: Record<Exclude<SaveState, 'idle'>, { text: string; color: string }> = {
    saving: { text: 'กำลังบันทึก…', color: colors.muted },
    saved: { text: '✓ บันทึกเรียบร้อย', color: colors.ok },
    invalid: { text: message || 'กรุณาตรวจสอบข้อมูล', color: colors.warn },
    error: { text: message || 'ไม่สามารถบันทึกได้ กรุณาลองใหม่', color: colors.danger },
  };
  const s = map[state];
  return (
    <span role="status" style={{ color: s.color, fontSize: '0.9rem' }}>
      {s.text}
    </span>
  );
}

// ── Thai-first labels for enums + readiness requirements ─────────────────────

export const AVAILABILITY_LABELS: Record<AvailabilityPolicy, string> = {
  MANUAL_CONFIRMATION: 'ต้องยืนยันกับเจ้าของ',
  OWNER_SYSTEM: 'ระบบของเจ้าของ',
  EXTERNAL_CALENDAR: 'ปฏิทินภายนอก',
  DO_NOT_MENTION: 'ห้ามพูดเรื่องห้องว่าง',
};
export const PRICING_LABELS: Record<PricingPolicy, string> = {
  DO_NOT_MENTION: 'ห้ามพูดราคา',
  STARTING_FROM: 'ราคาเริ่มต้น',
  FIXED_REFERENCE: 'ราคาอ้างอิง',
  MANUAL_CONFIRMATION: 'ต้องยืนยันก่อน',
};
export const PROMOTION_LABELS: Record<PromotionPolicy, string> = {
  NONE: 'ไม่มีโปรโมชั่น',
  APPROVED_ONLY: 'เฉพาะโปรโมชั่นที่อนุมัติ',
  MANUAL_CONFIRMATION: 'ต้องยืนยันก่อน',
};
export const BOOKING_LABELS: Record<BookingPolicy, string> = {
  CONTACT_ONLY: 'ติดต่อเท่านั้น',
  LINE: 'LINE',
  PHONE: 'โทรศัพท์',
  WEBSITE: 'เว็บไซต์',
  MANUAL: 'กำหนดเอง',
};
export const CONTACT_TYPE_LABELS: Record<ContactChannelType, string> = {
  PHONE: 'โทรศัพท์',
  LINE_ID: 'LINE ID',
  LINE_OA: 'LINE OA',
  FACEBOOK_PAGE: 'เพจ Facebook',
  WEBSITE: 'เว็บไซต์',
  EMAIL: 'อีเมล',
  OTHER: 'อื่นๆ',
};

// ── Property types — owner-friendly Thai; enum kept internally (Phase C/J) ────
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  pool_villa: 'พูลวิลล่า',
  villa: 'วิลล่า',
  resort: 'รีสอร์ท',
  hotel: 'โรงแรม',
  hotel_room: 'ห้องพักโรงแรม',
  homestay: 'โฮมสเตย์',
  condo: 'คอนโด',
  house: 'บ้านพัก',
  raft: 'แพพัก',
  tent: 'เต็นท์ / ลานกางเต็นท์',
  other: 'อื่นๆ',
};
/** Common-first ordering for owner dropdowns. */
export const PROPERTY_TYPE_ORDER: string[] = [
  'pool_villa',
  'villa',
  'resort',
  'hotel',
  'hotel_room',
  'homestay',
  'condo',
  'house',
  'raft',
  'tent',
  'other',
];
export function propertyTypeLabel(t: string | null | undefined): string {
  if (!t) return '—';
  return PROPERTY_TYPE_LABELS[t] ?? t;
}

// ── Policy option guidance: label + one-line Thai + recommended (Phase F) ─────
export interface PolicyOption<T extends string> {
  value: T;
  label: string;
  description: string;
  recommended?: boolean;
}
// Owner-facing questions per policy group (SPRINT owner-setup corrective Phase E).
export const POLICY_QUESTIONS = {
  availability: 'เมื่อลูกค้าถามว่ามีห้องว่างไหม ให้ระบบตอบอย่างไร?',
  pricing: 'ระบบสามารถพูดเรื่องราคาได้หรือไม่?',
  promotion: 'ระบบสามารถพูดถึงโปรโมชั่นได้หรือไม่?',
  booking: 'เมื่อลูกค้าสนใจ ให้แนะนำให้จองอย่างไร?',
};

// Recommended (safe) choice is listed first and marked; enums are unchanged.
export const AVAILABILITY_OPTIONS: PolicyOption<AvailabilityPolicy>[] = [
  {
    value: 'MANUAL_CONFIRMATION',
    label: 'ให้ลูกค้าติดต่อเราเพื่อตรวจสอบ',
    description: 'ระบบจะไม่ยืนยันว่าห้องว่างทันที',
    recommended: true,
  },
  {
    value: 'DO_NOT_MENTION',
    label: 'ไม่พูดเรื่องห้องว่างเลย',
    description: 'ระบบจะไม่พูดถึงเรื่องห้องว่าง',
  },
  {
    value: 'OWNER_SYSTEM',
    label: 'ใช้ระบบเช็คห้องว่างของฉันเอง',
    description: 'ใช้เมื่อคุณมีระบบของตัวเอง',
  },
  {
    value: 'EXTERNAL_CALENDAR',
    label: 'ใช้ปฏิทินภายนอก',
    description: 'ใช้เมื่อคุณจัดการผ่านปฏิทินภายนอก',
  },
];
export const PRICING_OPTIONS: PolicyOption<PricingPolicy>[] = [
  {
    value: 'DO_NOT_MENTION',
    label: 'ไม่พูดราคา (ปลอดภัยที่สุด)',
    description: 'ระบบจะไม่พูดถึงราคาเลย',
    recommended: true,
  },
  {
    value: 'STARTING_FROM',
    label: 'บอกราคาเริ่มต้นที่ฉันกรอกไว้',
    description: 'พูดได้เฉพาะราคาเริ่มต้นที่คุณกรอก',
  },
  {
    value: 'MANUAL_CONFIRMATION',
    label: 'ต้องให้ฉันยืนยันราคาก่อน',
    description: 'ระบบจะชวนลูกค้าสอบถามราคาก่อน',
  },
  {
    value: 'FIXED_REFERENCE',
    label: 'ใช้ราคาอ้างอิงที่กรอกไว้',
    description: 'ใช้ราคาอ้างอิง เช่น ราคาวันธรรมดา',
  },
];
export const PROMOTION_OPTIONS: PolicyOption<PromotionPolicy>[] = [
  {
    value: 'NONE',
    label: 'ไม่มีโปรโมชั่น',
    description: 'ระบบจะไม่พูดถึงโปรโมชั่นใด ๆ',
    recommended: true,
  },
  {
    value: 'APPROVED_ONLY',
    label: 'ใช้เฉพาะโปรโมชั่นที่ฉันอนุมัติ',
    description: 'ระบบจะไม่สร้างโปรโมชั่นขึ้นเอง',
  },
  {
    value: 'MANUAL_CONFIRMATION',
    label: 'ต้องยืนยันกับฉันก่อน',
    description: 'ระบบจะชวนลูกค้าสอบถามกับเจ้าของก่อน',
  },
];
export const BOOKING_OPTIONS: PolicyOption<BookingPolicy>[] = [
  {
    value: 'CONTACT_ONLY',
    label: 'ติดต่อเรา',
    description: 'แนะนำให้ลูกค้าติดต่อทั่วไป',
    recommended: true,
  },
  { value: 'LINE', label: 'LINE', description: 'แนะนำให้ลูกค้าติดต่อผ่าน LINE ที่คุณอนุมัติไว้' },
  { value: 'PHONE', label: 'โทรศัพท์', description: 'แนะนำให้ลูกค้าโทรติดต่อ' },
  { value: 'WEBSITE', label: 'เว็บไซต์', description: 'แนะนำให้ลูกค้าจองผ่านเว็บไซต์' },
  { value: 'MANUAL', label: 'กำหนดเอง', description: 'คุณกำหนดวิธีการจองเอง' },
];

// Response SLA: owner-friendly dropdown → the backend's minutes integer (Phase F).
export const SLA_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 นาที' },
  { value: 10, label: '10 นาที' },
  { value: 15, label: '15 นาที' },
  { value: 30, label: '30 นาที' },
  { value: 60, label: '1 ชั่วโมง' },
  { value: 120, label: '2 ชั่วโมง' },
  { value: 480, label: 'ภายในวันเดียวกัน' },
];

// Recommended prohibited-claim presets (Phase G); owners may add custom lines too.
export const PROHIBITED_CLAIM_PRESETS: string[] = [
  'ห้ามยืนยันว่ามีห้องว่าง',
  'ห้ามรับประกันราคาที่ยังไม่ได้ยืนยัน',
  'ห้ามสร้างโปรโมชั่นขึ้นเอง',
  'ห้ามกล่าวถึงสิ่งอำนวยความสะดวกที่ไม่ได้ระบุ',
  'ห้ามรับประกันระยะทาง/ทำเลที่ไม่ได้บันทึกไว้',
];

// Escalation (Phase H) — owner question + simple recommended options.
export const ESCALATION_DEFAULT = 'ให้ลูกค้าติดต่อผู้ดูแล';
export const ESCALATION_OPTIONS: string[] = [
  'ให้ลูกค้าติดต่อผู้ดูแล',
  'ให้ลูกค้ารอเจ้าของติดต่อกลับ',
];

// ── Radio-card group: owner-friendly single choice (Phase E) ─────────────────
export function RadioCards<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: PolicyOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" style={{ display: 'grid', gap: 6 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '0.6rem 0.7rem',
              border: `1px solid ${selected ? '#0a58ca' : colors.border}`,
              background: selected ? '#eef4ff' : '#fff',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={name}
              checked={selected}
              onChange={() => onChange(o.value)}
              style={{ width: 20, height: 20, marginTop: 2 }}
            />
            <span>
              <span style={{ fontWeight: 600 }}>
                {o.label}
                {o.recommended ? <span style={{ color: colors.ok }}> · แนะนำ</span> : null}
              </span>
              <span style={{ display: 'block', fontSize: '0.82rem', color: colors.muted }}>
                {o.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ── Service-area + operating-hours safe mapping to the single backend fields ──
export function parseServiceArea(s: string | null | undefined): {
  province: string;
  primaryArea: string;
} {
  const raw = (s ?? '').trim();
  if (!raw) return { province: '', primaryArea: '' };
  const parts = raw
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { primaryArea: parts[0]!, province: parts[1]! };
  return { primaryArea: parts[0]!, province: '' };
}
export function composeServiceArea(province: string, primaryArea: string): string {
  const p = primaryArea.trim();
  const prov = province.trim();
  return [p, prov].filter(Boolean).join(', ');
}
export function parseHours(s: string | null | undefined): { from: string; to: string } {
  const m = (s ?? '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return m ? { from: m[1]!, to: m[2]! } : { from: '', to: '' };
}
export function composeHours(from: string, to: string): string | null {
  if (from && to) return `${from}-${to}`;
  return null;
}
/** Thai provinces for the จังหวัด selector (common tourist/accommodation ones first). */
export const THAI_PROVINCES: string[] = [
  'ชลบุรี',
  'ระยอง',
  'จันทบุรี',
  'ตราด',
  'เพชรบุรี',
  'ประจวบคีรีขันธ์',
  'ภูเก็ต',
  'กระบี่',
  'พังงา',
  'สุราษฎร์ธานี',
  'นครราชสีมา',
  'เชียงใหม่',
  'เชียงราย',
  'กาญจนบุรี',
  'ราชบุรี',
  'สมุทรสงคราม',
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'พระนครศรีอยุธยา',
  'เลย',
  'นครศรีธรรมราช',
];

// ── Contact approval plain-language labels + helpers (Phase E) ────────────────
export const CONTACT_APPROVAL_LABELS = {
  enabled: 'เปิดใช้งานช่องทางนี้',
  ownerVerified: 'ฉันยืนยันว่าข้อมูลนี้ถูกต้อง',
  approvedForDrafts: 'ให้ระบบนำช่องทางนี้ไปใส่ในข้อความตอบได้',
  approvedForPublicResponse: 'อนุญาตให้แสดงช่องทางนี้ในคำตอบสาธารณะ',
};
export const CONTACT_APPROVAL_HELP = {
  enabled: 'ปิดไว้ได้ถ้ายังไม่อยากให้ระบบเห็นช่องทางนี้',
  ownerVerified: 'ยืนยันว่าเบอร์/ไอดี/ลิงก์นี้ถูกต้องและเป็นของคุณ',
  approvedForDrafts: 'ระบบจะแนบช่องทางนี้ในข้อความร่างให้ลูกค้าติดต่อ',
  approvedForPublicResponse: 'ใช้เมื่อจะโพสต์ตอบในที่สาธารณะ (เข้มงวดกว่า)',
};

// ── Readiness → tab routing + why-it-matters (Phase G) ───────────────────────
export type BizTab = 'ข้อมูลธุรกิจ' | 'ช่องทางติดต่อ' | 'นโยบาย' | 'ที่พัก' | 'การจับคู่ลูกค้า';
export function readinessTab(missing: string): BizTab {
  const m = missing.toLowerCase();
  if (m.includes('matching')) return 'การจับคู่ลูกค้า';
  if (m.includes('contact') || m.includes('channel')) return 'ช่องทางติดต่อ';
  if (
    m.includes('policy') ||
    m.includes('claim') ||
    m.includes('sla') ||
    m.includes('operating hours') ||
    m.includes('responsible owner')
  )
    return 'นโยบาย';
  if (
    m.includes('property') ||
    m.includes('guests') ||
    m.includes('service location') ||
    m.includes('description')
  )
    return 'ที่พัก';
  return 'ข้อมูลธุรกิจ';
}
export const READINESS_CTA: Record<BizTab, string> = {
  ข้อมูลธุรกิจ: 'ไปตั้งค่าข้อมูลธุรกิจ',
  ช่องทางติดต่อ: 'ไปตั้งค่าช่องทางติดต่อ',
  นโยบาย: 'ไปตั้งค่านโยบาย',
  ที่พัก: 'ไปที่พัก',
  การจับคู่ลูกค้า: 'ไปตั้งค่าการจับคู่',
};
const READINESS_WHY: Record<string, string> = {
  'production environment': 'ต้องเปลี่ยนเป็น Production ก่อนระบบจึงจะใช้งานจริงได้',
  'at least one approved contact channel':
    'ระบบต้องมีช่องทางที่คุณอนุมัติ เพื่อบอกลูกค้าว่าติดต่ออย่างไร',
  'contact channel owner approval': 'ยืนยันช่องทางเพื่อป้องกันการใช้ข้อมูลติดต่อที่ผิด',
  'response tone': 'ช่วยให้ระบบตอบลูกค้าด้วยน้ำเสียงที่ตรงกับแบรนด์ของคุณ',
  'valid service area': 'ใช้จับคู่ Lead ให้ตรงพื้นที่ที่คุณให้บริการ',
  'at least one active Property': 'ระบบใช้ข้อมูลที่พักเพื่อเลือกบ้านที่เหมาะกับ Lead',
  'availability policy': 'กำหนดว่าระบบพูดเรื่องห้องว่างได้แค่ไหน',
  'pricing policy': 'กำหนดว่าระบบพูดเรื่องราคาได้แค่ไหน',
  'promotion policy': 'กำหนดว่าระบบพูดเรื่องโปรโมชั่นได้แค่ไหน',
  'booking policy': 'กำหนดวิธีที่ระบบแนะนำให้ลูกค้าจอง',
  'maximum guests': 'ใช้เทียบกับจำนวนผู้เข้าพักที่ลูกค้าต้องการ',
  'service location': 'ใช้จับคู่ที่พักให้ตรงพื้นที่ที่ลูกค้าถาม',
  'customer matching configuration':
    'ระบบใช้การจับคู่เพื่อเลือกธุรกิจนี้จาก Lead ก่อนเลือกที่พักที่เหมาะสม',
};

const THAI_REQUIREMENT: Record<string, string> = {
  'production environment': 'ต้องเป็นธุรกิจจริง (Production)',
  'active status': 'ธุรกิจต้องเปิดใช้งาน',
  'real Business name': 'ชื่อธุรกิจจริง',
  'valid service area': 'พื้นที่ให้บริการ',
  'at least one approved contact channel': 'ช่องทางติดต่อที่อนุมัติแล้วอย่างน้อย 1 ช่อง',
  'contact channel owner approval': 'เจ้าของยืนยันช่องทางติดต่อ',
  'response tone': 'โทนการตอบลูกค้า',
  'prohibited claims': 'ข้อความที่ห้ามกล่าวอ้าง',
  'pricing policy': 'นโยบายราคา',
  'availability policy': 'นโยบายห้องว่าง',
  'promotion policy': 'นโยบายโปรโมชั่น',
  'booking policy': 'นโยบายการจอง',
  'responsible owner': 'ผู้รับผิดชอบ',
  'operating hours': 'เวลาทำการ',
  'response SLA': 'เวลาตอบกลับสูงสุด (SLA)',
  'at least one active Property': 'ที่พักที่เปิดใช้งานอย่างน้อย 1 แห่ง',
  'maximum guests': 'จำนวนผู้เข้าพักสูงสุด',
  'property name': 'ชื่อที่พัก',
  'property type': 'ประเภทที่พัก',
  'service location': 'ที่ตั้งของที่พัก',
  'meaningful description': 'คำอธิบายที่พัก',
  'customer matching configuration': 'ยังไม่ได้ตั้งค่าการจับคู่ลูกค้า',
};
