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
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{label}</span>
      {children}
      {hint ? (
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

export function ReadinessChecklist({ missing }: { missing: string[] }) {
  if (missing.length === 0) return <p style={{ color: colors.ok }}>✓ พร้อมใช้งาน (READY)</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {missing.map((m) => (
        <li key={m} style={{ color: colors.danger, marginBottom: 4 }}>
          ✗ {THAI_REQUIREMENT[m] ?? m}
        </li>
      ))}
    </ul>
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
};
