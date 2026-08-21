'use client';

import type {
  Business,
  BusinessProfile,
  BusinessPolicies,
  ContactChannel,
  Property,
  ReadinessVerdict,
} from '../../../lib/api';
import { Card, Button, Progress, colors, type BizTab } from './ui';

/**
 * Owner onboarding checklist (SPRINT 017 Phase B).
 *
 * A guided, resumable checklist layered onto the existing tabbed Business hub —
 * NOT a separate wizard. `computeOnboarding` is pure so it can be unit-tested and
 * so progress is derived from real persisted data. Onboarding completion is NOT
 * the same as Production READY: the readiness evaluator stays authoritative and
 * is simply surfaced as the final step.
 */

export interface OnboardingStep {
  key: string;
  title: string;
  explanation: string;
  tab: BizTab | 'ความพร้อมใช้งาน';
  done: boolean;
}

export interface OnboardingInput {
  business: Pick<Business, 'name' | 'status'>;
  profile: Pick<BusinessProfile, 'serviceArea' | 'responseTone'> | null;
  policies: BusinessPolicies | null;
  contacts: ContactChannel[];
  properties: Property[];
  readiness: ReadinessVerdict | null;
}

export interface OnboardingResult {
  steps: OnboardingStep[];
  done: number;
  total: number;
  /** The first incomplete step, or null when every step is complete. */
  next: OnboardingStep | null;
}

export function computeOnboarding(input: OnboardingInput): OnboardingResult {
  const activeProps = input.properties.filter((p) => p.status === 'active');
  const detailedProps = activeProps.filter(
    (p) => (p.capacity.maxGuests ?? 0) > 0 && !!(p.location.area || p.location.province),
  );
  const hasApprovedContact = input.contacts.some((c) => c.enabled && c.approvedForDrafts);

  const steps: OnboardingStep[] = [
    {
      key: 'business',
      title: 'ข้อมูลธุรกิจ',
      explanation: 'ชื่อธุรกิจ พื้นที่ให้บริการ และโทนการตอบลูกค้า',
      tab: 'ข้อมูลธุรกิจ',
      done: !!input.business.name && !!input.profile?.serviceArea && !!input.profile?.responseTone,
    },
    {
      key: 'contacts',
      title: 'ช่องทางติดต่อ',
      explanation: 'เพิ่มช่องทางที่อนุญาตให้ระบบใช้ในข้อความตอบ',
      tab: 'ช่องทางติดต่อ',
      done: hasApprovedContact,
    },
    {
      key: 'policies',
      title: 'นโยบายการตอบลูกค้า',
      explanation: 'กำหนดว่าระบบพูดเรื่องห้องว่าง ราคา โปรโมชั่น และการจองได้แค่ไหน',
      tab: 'นโยบาย',
      done: input.policies != null,
    },
    {
      key: 'first-property',
      title: 'เพิ่มที่พักอย่างน้อย 1 แห่ง',
      explanation: 'ระบบใช้ข้อมูลที่พักเพื่อเลือกบ้านที่เหมาะกับ Lead แต่ละราย',
      tab: 'ที่พัก',
      done: activeProps.length >= 1,
    },
    {
      key: 'property-details',
      title: 'ตรวจข้อมูลที่พัก',
      explanation: 'ระบุพื้นที่และจำนวนผู้เข้าพักสูงสุดให้ครบ',
      tab: 'ที่พัก',
      done: detailedProps.length >= 1,
    },
    {
      key: 'matching',
      title: 'Matching / กลุ่ม',
      explanation: 'ธุรกิจของคุณพร้อมเข้าสู่การจับคู่ Lead',
      tab: 'ที่พัก',
      done: input.business.status === 'active' && activeProps.length >= 1,
    },
    {
      key: 'readiness',
      title: 'ตรวจสอบความพร้อม',
      explanation: 'ตรวจว่าธุรกิจพร้อมใช้งานจริง (Production READY)',
      tab: 'ความพร้อมใช้งาน',
      done: input.readiness?.ready === true,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, done, total: steps.length, next };
}

export function OnboardingChecklist({
  input,
  onGo,
}: {
  input: OnboardingInput;
  onGo: (tab: string) => void;
}) {
  const { steps, done, total, next } = computeOnboarding(input);
  return (
    <Card>
      <h3 style={{ margin: '0 0 0.4rem' }}>ตั้งค่าธุรกิจของคุณ</h3>
      <Progress done={done} total={total} />
      {next ? (
        <div
          style={{
            margin: '0.6rem 0',
            padding: '0.5rem 0.6rem',
            background: '#eef4ff',
            border: '1px solid #cfe0ff',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: '0.8rem', color: colors.muted }}>ขั้นตอนถัดไปที่แนะนำ</div>
          <div style={{ fontWeight: 600 }}>ต่อไป: {next.title}</div>
          <div style={{ fontSize: '0.85rem', color: colors.muted, marginBottom: 6 }}>
            {next.explanation}
          </div>
          <Button kind="primary" onClick={() => onGo(next.tab)}>
            ตั้งค่าตอนนี้
          </Button>
        </div>
      ) : (
        <p style={{ color: colors.ok, fontWeight: 600 }}>
          ✓ ตั้งค่าครบทุกขั้นตอนแล้ว — ธุรกิจของคุณพร้อมใช้งาน
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0.4rem 0 0' }}>
        {steps.map((s, i) => (
          <li
            key={s.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0.4rem 0',
              borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  color: s.done ? colors.ok : colors.muted,
                  fontWeight: 700,
                  minWidth: 18,
                }}
              >
                {s.done ? '✓' : '○'}
              </span>
              <span>
                <span style={{ fontWeight: s.done ? 400 : 600 }}>
                  {i + 1}. {s.title}
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: colors.muted }}>
                  {s.explanation}
                </span>
              </span>
            </span>
            {!s.done && <Button onClick={() => onGo(s.tab)}>ตั้งค่าตอนนี้</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
