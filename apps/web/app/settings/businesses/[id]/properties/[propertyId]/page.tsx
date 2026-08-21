'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  ApiRequestError,
  type Property,
  type ReadinessVerdict,
  type EffectivePolicies,
} from '../../../../../../lib/api';
import { Nav } from '../../../../../../components/Nav';
import {
  Page,
  Section,
  Field,
  Input,
  Textarea,
  Select,
  Toggle,
  Button,
  Badge,
  Tabs,
  StickyBar,
  ReadinessChecklist,
  colors,
  AVAILABILITY_LABELS,
  PRICING_LABELS,
  PROMOTION_LABELS,
  BOOKING_LABELS,
  PROPERTY_TYPE_ORDER,
  PROPERTY_TYPE_LABELS,
} from '../../../ui';

const TABS = [
  'ข้อมูลทั่วไป',
  'ที่ตั้ง',
  'ความจุ',
  'สิ่งอำนวยความสะดวก',
  'ราคา',
  'เนื้อหา',
  'นโยบายเฉพาะ',
  'ความพร้อม',
];
const AMENITY_KEYS: Array<[string, string]> = [
  ['privatePool', 'สระว่ายน้ำส่วนตัว'],
  ['wifi', 'Wi-Fi'],
  ['parking', 'ที่จอดรถ'],
  ['kitchen', 'ครัว'],
  ['airConditioning', 'เครื่องปรับอากาศ'],
  ['petFriendly', 'สัตว์เลี้ยงได้'],
  ['bbq', 'พื้นที่ BBQ'],
  ['karaoke', 'คาราโอเกะ'],
];

export default function PropertyEditPage() {
  const router = useRouter();
  const { id, propertyId } = useParams<{ id: string; propertyId: string }>();
  const [email, setEmail] = useState<string | undefined>();
  const [tab, setTab] = useState('ข้อมูลทั่วไป');
  const [p, setP] = useState<Property | null>(null);
  const [readiness, setReadiness] = useState<ReadinessVerdict | null>(null);
  const [effective, setEffective] = useState<EffectivePolicies | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadReadiness() {
    const r = await api.getPropertyReadiness(id, propertyId).catch(() => null);
    if (r) {
      setReadiness(r.readiness);
      setEffective(r.effectivePolicies ?? null);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api.me().then((m) => active && setEmail(m.user.email));
      } catch {
        router.push('/login');
        return;
      }
      try {
        const { property } = await api.getProperty(id, propertyId);
        if (active) setP(property);
        await loadReadiness();
      } catch (err) {
        if (err instanceof ApiRequestError) setMsg(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, propertyId, router]);

  function set<K extends keyof Property>(key: K, value: Property[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!p) return;
    setSaving(true);
    setMsg(null);
    try {
      await api.updateProperty(id, propertyId, {
        name: p.name,
        code: p.code,
        propertyType: p.propertyType,
        description: p.description,
        location: p.location,
        capacity: p.capacity,
        amenities: p.amenities,
        pricing: p.pricing,
        content: p.content,
      });
      await api.putPropertyPolicies(id, propertyId, p.policyOverrides);
      await loadReadiness();
      setMsg('บันทึกแล้ว');
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: 'active' | 'inactive') {
    await api.updateProperty(id, propertyId, { status });
    set('status', status);
    await loadReadiness();
  }

  if (loading || !p)
    return (
      <Page>
        <Nav email={email} />
        <p>กำลังโหลด…</p>
      </Page>
    );

  return (
    <Page>
      <Nav email={email} />
      <Link href={`/settings/businesses/${id}?tab=ที่พัก`} style={{ fontSize: '0.9rem' }}>
        ← กลับไปที่พัก
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: '0.3rem 0' }}>{p.name}</h1>
        <Badge
          text={p.status}
          tone={p.status === 'active' ? 'ok' : p.status === 'archived' ? 'warn' : 'muted'}
        />
        {readiness ? (
          <Badge
            text={readiness.ready ? 'READY' : 'NOT_READY'}
            tone={readiness.ready ? 'ok' : 'danger'}
          />
        ) : null}
      </div>
      {msg && <p style={{ color: msg === 'บันทึกแล้ว' ? colors.ok : colors.warn }}>{msg}</p>}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'ข้อมูลทั่วไป' && (
        <Section>
          <Field label="ชื่อที่พัก">
            <Input value={p.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="รหัส (ไม่บังคับ)">
            <Input value={p.code ?? ''} onChange={(e) => set('code', e.target.value || null)} />
          </Field>
          <Field label="ประเภทที่พัก">
            <Select
              value={p.propertyType ?? ''}
              onChange={(e) => set('propertyType', e.target.value || null)}
            >
              <option value="">— เลือก —</option>
              {PROPERTY_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="คำอธิบาย">
            <Textarea
              value={p.description ?? ''}
              onChange={(e) => set('description', e.target.value || null)}
            />
          </Field>
        </Section>
      )}

      {tab === 'ที่ตั้ง' && (
        <Section>
          {(['province', 'district', 'subdistrict', 'area', 'address'] as const).map((k) => (
            <Field
              key={k}
              label={
                {
                  province: 'จังหวัด',
                  district: 'อำเภอ/เขต',
                  subdistrict: 'ตำบล/แขวง',
                  area: 'พื้นที่/ย่าน',
                  address: 'ที่อยู่',
                }[k]
              }
            >
              <Input
                value={p.location[k] ?? ''}
                onChange={(e) => set('location', { ...p.location, [k]: e.target.value || null })}
              />
            </Field>
          ))}
        </Section>
      )}

      {tab === 'ความจุ' && (
        <Section>
          {(['bedrooms', 'bathrooms', 'beds', 'maxGuests'] as const).map((k) => (
            <Field
              key={k}
              label={
                {
                  bedrooms: 'ห้องนอน',
                  bathrooms: 'ห้องน้ำ',
                  beds: 'จำนวนเตียง',
                  maxGuests: 'ผู้เข้าพักสูงสุด',
                }[k]
              }
            >
              <Input
                type="number"
                value={p.capacity[k] ?? ''}
                onChange={(e) =>
                  set('capacity', {
                    ...p.capacity,
                    [k]: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          ))}
          <Field label="นโยบายผู้เข้าพักเพิ่ม">
            <Input
              value={p.capacity.extraGuestPolicy ?? ''}
              onChange={(e) =>
                set('capacity', { ...p.capacity, extraGuestPolicy: e.target.value || null })
              }
            />
          </Field>
        </Section>
      )}

      {tab === 'สิ่งอำนวยความสะดวก' && (
        <Section>
          {AMENITY_KEYS.map(([key, label]) => (
            <Toggle
              key={key}
              checked={p.amenities[key] === true}
              onChange={(v) => set('amenities', { ...p.amenities, [key]: v })}
              label={label}
            />
          ))}
        </Section>
      )}

      {tab === 'ราคา' && (
        <Section>
          <Field label="โหมดการแสดงราคา">
            <Select
              value={p.pricing.priceDisplayMode}
              onChange={(e) => set('pricing', { ...p.pricing, priceDisplayMode: e.target.value })}
            >
              <option value="hidden">ไม่แสดงราคา</option>
              <option value="starting_from">ราคาเริ่มต้น</option>
              <option value="fixed">ราคาคงที่</option>
            </Select>
          </Field>
          {(
            [
              'startingPrice',
              'weekdayPrice',
              'weekendPrice',
              'securityDeposit',
              'extraGuestPrice',
            ] as const
          ).map((k) => (
            <Field
              key={k}
              label={
                {
                  startingPrice: 'ราคาเริ่มต้น',
                  weekdayPrice: 'ราคาวันธรรมดา',
                  weekendPrice: 'ราคาสุดสัปดาห์',
                  securityDeposit: 'เงินมัดจำ',
                  extraGuestPrice: 'ราคาผู้เข้าพักเพิ่ม',
                }[k]
              }
            >
              <Input
                type="number"
                value={p.pricing[k] ?? ''}
                onChange={(e) =>
                  set('pricing', {
                    ...p.pricing,
                    [k]: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          ))}
        </Section>
      )}

      {tab === 'เนื้อหา' && (
        <Section>
          <Field label="จุดเด่น (บรรทัดละ 1)">
            <Textarea
              value={p.content.sellingPoints.join('\n')}
              onChange={(e) =>
                set('content', {
                  ...p.content,
                  sellingPoints: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="ข้อควรทราบสำคัญ">
            <Textarea
              value={p.content.importantNotes ?? ''}
              onChange={(e) =>
                set('content', { ...p.content, importantNotes: e.target.value || null })
              }
            />
          </Field>
          <Field label="ข้อความที่ห้ามกล่าวอ้าง (บรรทัดละ 1)">
            <Textarea
              value={p.content.prohibitedClaims.join('\n')}
              onChange={(e) =>
                set('content', {
                  ...p.content,
                  prohibitedClaims: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="หมายเหตุการตอบลูกค้า">
            <Textarea
              value={p.content.responseNotes ?? ''}
              onChange={(e) =>
                set('content', { ...p.content, responseNotes: e.target.value || null })
              }
            />
          </Field>
        </Section>
      )}

      {tab === 'นโยบายเฉพาะ' && (
        <Section title="นโยบายเฉพาะที่พัก (ปล่อยว่าง = ใช้ตามธุรกิจ)">
          <Field label="นโยบายห้องว่าง">
            <Select
              value={p.policyOverrides.availabilityPolicy ?? ''}
              onChange={(e) =>
                set('policyOverrides', {
                  ...p.policyOverrides,
                  availabilityPolicy: (e.target.value ||
                    null) as Property['policyOverrides']['availabilityPolicy'],
                })
              }
            >
              <option value="">ใช้ตามธุรกิจ</option>
              {(Object.keys(AVAILABILITY_LABELS) as Array<keyof typeof AVAILABILITY_LABELS>).map(
                (k) => (
                  <option key={k} value={k}>
                    {AVAILABILITY_LABELS[k]}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="นโยบายราคา">
            <Select
              value={p.policyOverrides.pricingPolicy ?? ''}
              onChange={(e) =>
                set('policyOverrides', {
                  ...p.policyOverrides,
                  pricingPolicy: (e.target.value ||
                    null) as Property['policyOverrides']['pricingPolicy'],
                })
              }
            >
              <option value="">ใช้ตามธุรกิจ</option>
              {(Object.keys(PRICING_LABELS) as Array<keyof typeof PRICING_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {PRICING_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="นโยบายโปรโมชั่น">
            <Select
              value={p.policyOverrides.promotionPolicy ?? ''}
              onChange={(e) =>
                set('policyOverrides', {
                  ...p.policyOverrides,
                  promotionPolicy: (e.target.value ||
                    null) as Property['policyOverrides']['promotionPolicy'],
                })
              }
            >
              <option value="">ใช้ตามธุรกิจ</option>
              {(Object.keys(PROMOTION_LABELS) as Array<keyof typeof PROMOTION_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {PROMOTION_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="นโยบายการจอง">
            <Select
              value={p.policyOverrides.bookingPolicy ?? ''}
              onChange={(e) =>
                set('policyOverrides', {
                  ...p.policyOverrides,
                  bookingPolicy: (e.target.value ||
                    null) as Property['policyOverrides']['bookingPolicy'],
                })
              }
            >
              <option value="">ใช้ตามธุรกิจ</option>
              {(Object.keys(BOOKING_LABELS) as Array<keyof typeof BOOKING_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {BOOKING_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </Section>
      )}

      {tab === 'ความพร้อม' && (
        <Section title="ความพร้อมใช้งานของที่พัก">
          {readiness ? <ReadinessChecklist missing={readiness.missing} /> : <p>—</p>}
          {effective && (
            <p style={{ fontSize: '0.85rem', color: colors.muted }}>
              นโยบายที่มีผล: ห้องว่าง {AVAILABILITY_LABELS[effective.availabilityPolicy]} · ราคา{' '}
              {PRICING_LABELS[effective.pricingPolicy]}
            </p>
          )}
        </Section>
      )}

      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saving}>
          บันทึก
        </Button>
        {p.status === 'active' ? (
          <Button onClick={() => setStatus('inactive')}>ปิดใช้งาน</Button>
        ) : (
          <Button onClick={() => setStatus('active')}>เปิดใช้งาน</Button>
        )}
      </StickyBar>
    </Page>
  );
}
