'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  api,
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
  SaveStatus,
  type SaveState,
  colors,
  AVAILABILITY_LABELS,
  PRICING_LABELS,
  PROMOTION_LABELS,
  BOOKING_LABELS,
  PROPERTY_TYPE_ORDER,
  PROPERTY_TYPE_LABELS,
  THAI_PROVINCES,
} from '../../../ui';
import {
  PRICE_MODE_OPTIONS,
  PRICE_MODE_QUESTION,
  toCanonicalPriceMode,
  priceFieldsForMode,
  formatBaht,
  AMENITY_OPTIONS,
  otherAmenities,
  LOCATION_FIELDS,
  LOCATION_HELP,
  CAPACITY_FIELDS,
  CAPACITY_HELP,
  PROPERTY_TAB_GUIDANCE,
  SAVE_MESSAGES,
  saveErrorMessage,
  propertyChanged,
  type PriceDisplayMode,
} from '../../../property-ui';

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

/** Snapshot of everything the save() sends, for no-change detection. */
function saveSnapshot(p: Property) {
  return {
    name: p.name,
    code: p.code,
    propertyType: p.propertyType,
    description: p.description,
    location: p.location,
    capacity: p.capacity,
    amenities: p.amenities,
    pricing: p.pricing,
    content: p.content,
    policyOverrides: p.policyOverrides,
  };
}

/** Field-level Thai validation; empty object → valid. */
function validate(p: Property): Record<string, string> {
  const e: Record<string, string> = {};
  if (!p.name.trim()) e.name = 'กรุณากรอกชื่อที่พัก';
  if (p.capacity.maxGuests != null && p.capacity.maxGuests <= 0)
    e.maxGuests = 'จำนวนผู้เข้าพักต้องมากกว่า 0';
  for (const k of ['bedrooms', 'bathrooms', 'beds'] as const) {
    const v = p.capacity[k];
    if (v != null && v < 0) e[k] = 'ค่าต้องไม่ติดลบ';
  }
  for (const k of [
    'startingPrice',
    'weekdayPrice',
    'weekendPrice',
    'securityDeposit',
    'extraGuestPrice',
  ] as const) {
    const v = p.pricing[k];
    if (v != null && v < 0) e[k] = 'ราคาต้องไม่ติดลบ';
  }
  return e;
}

function Guidance({ text }: { text?: string }) {
  if (!text) return null;
  return <p style={{ fontSize: '0.85rem', color: colors.muted, margin: '0 0 0.75rem' }}>{text}</p>;
}

export default function PropertyEditPage() {
  const router = useRouter();
  const { id, propertyId } = useParams<{ id: string; propertyId: string }>();
  const [email, setEmail] = useState<string | undefined>();
  const [tab, setTab] = useState('ข้อมูลทั่วไป');
  const [p, setP] = useState<Property | null>(null);
  const [baseline, setBaseline] = useState<ReturnType<typeof saveSnapshot> | null>(null);
  const [readiness, setReadiness] = useState<ReadinessVerdict | null>(null);
  const [effective, setEffective] = useState<EffectivePolicies | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customAmenity, setCustomAmenity] = useState('');

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
        // Canonicalise any legacy price-display value so the form always holds —
        // and later saves — a value the API's enum accepts.
        const normalized: Property = {
          ...property,
          pricing: {
            ...property.pricing,
            priceDisplayMode: toCanonicalPriceMode(property.pricing.priceDisplayMode),
          },
        };
        if (active) {
          setP(normalized);
          setBaseline(saveSnapshot(normalized));
        }
        await loadReadiness();
      } catch {
        if (active) {
          setSaveState('error');
          setSaveMsg(SAVE_MESSAGES.serverError);
        }
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
    if (saveState !== 'idle') {
      setSaveState('idle');
      setSaveMsg(null);
    }
  }

  const mode = p ? toCanonicalPriceMode(p.pricing.priceDisplayMode) : 'STARTING_FROM';
  const priceFields = priceFieldsForMode(mode);

  async function save() {
    if (!p) return;
    // No-change guard — never surface a technical "nothing to update".
    if (baseline && !propertyChanged(saveSnapshot(p), baseline)) {
      setSaveState('idle');
      setSaveMsg(SAVE_MESSAGES.noChanges);
      return;
    }
    const found = validate(p);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveState('invalid');
      setSaveMsg(SAVE_MESSAGES.validation);
      return;
    }
    setSaveState('saving');
    setSaveMsg(SAVE_MESSAGES.saving);
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
      setBaseline(saveSnapshot(p));
      setSaveState('saved');
      setSaveMsg(SAVE_MESSAGES.saved);
    } catch (err) {
      setSaveState('error');
      setSaveMsg(saveErrorMessage(err));
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

  const other = otherAmenities(p.amenities);

  function addAmenity() {
    const v = customAmenity.trim();
    if (!v || !p) return;
    if (!other.includes(v)) set('amenities', { ...p.amenities, other: [...other, v] });
    setCustomAmenity('');
  }
  function removeAmenity(v: string) {
    if (!p) return;
    set('amenities', { ...p.amenities, other: other.filter((o) => o !== v) });
  }

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
      <SaveStatus state={saveState} message={saveMsg} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'ข้อมูลทั่วไป' && (
        <Section>
          <Field label="ชื่อที่พัก" error={errors.name}>
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
          <Guidance text={PROPERTY_TAB_GUIDANCE['ที่ตั้ง']} />
          {LOCATION_FIELDS.map((f) =>
            f.key === 'province' ? (
              <Field key={f.key} label={f.label}>
                <Select
                  value={p.location.province ?? ''}
                  onChange={(e) =>
                    set('location', { ...p.location, province: e.target.value || null })
                  }
                >
                  <option value="">— เลือกจังหวัด —</option>
                  {THAI_PROVINCES.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field key={f.key} label={f.label}>
                <Input
                  value={p.location[f.key] ?? ''}
                  placeholder={`เช่น ${f.placeholder}`}
                  onChange={(e) =>
                    set('location', { ...p.location, [f.key]: e.target.value || null })
                  }
                />
              </Field>
            ),
          )}
          <p style={{ fontSize: '0.8rem', color: colors.muted }}>{LOCATION_HELP}</p>
        </Section>
      )}

      {tab === 'ความจุ' && (
        <Section>
          <Guidance text={PROPERTY_TAB_GUIDANCE['ความจุ']} />
          {CAPACITY_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label} (${f.unit})`} error={errors[f.key]}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={p.capacity[f.key] ?? ''}
                onChange={(e) =>
                  set('capacity', {
                    ...p.capacity,
                    [f.key]: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          ))}
          <Field label="นโยบายผู้เข้าพักเพิ่ม (ไม่บังคับ)">
            <Input
              value={p.capacity.extraGuestPolicy ?? ''}
              onChange={(e) =>
                set('capacity', { ...p.capacity, extraGuestPolicy: e.target.value || null })
              }
            />
          </Field>
          <p style={{ fontSize: '0.8rem', color: colors.muted }}>{CAPACITY_HELP}</p>
        </Section>
      )}

      {tab === 'สิ่งอำนวยความสะดวก' && (
        <Section>
          <Guidance text={PROPERTY_TAB_GUIDANCE['สิ่งอำนวยความสะดวก']} />
          {AMENITY_OPTIONS.map((o) => (
            <Toggle
              key={o.key}
              checked={p.amenities[o.key] === true}
              onChange={(v) => set('amenities', { ...p.amenities, [o.key]: v })}
              label={o.label}
            />
          ))}
          <div style={{ marginTop: '0.75rem' }}>
            <Field label="+ เพิ่มสิ่งอำนวยความสะดวกอื่น">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Input
                  value={customAmenity}
                  placeholder="เช่น เครื่องเสียง"
                  onChange={(e) => setCustomAmenity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAmenity();
                    }
                  }}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <Button onClick={addAmenity}>เพิ่ม</Button>
              </div>
            </Field>
            {other.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {other.map((o) => (
                  <span
                    key={o}
                    style={{
                      background: colors.cardBg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: '0.85rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {o}
                    <button
                      type="button"
                      onClick={() => removeAmenity(o)}
                      aria-label={`ลบ ${o}`}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: colors.muted,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {tab === 'ราคา' && (
        <Section>
          <Guidance text={PROPERTY_TAB_GUIDANCE['ราคา']} />
          <Field label={PRICE_MODE_QUESTION}>
            <div style={{ display: 'grid', gap: 8 }}>
              {PRICE_MODE_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    border: `1px solid ${mode === o.value ? colors.ok : colors.border}`,
                    borderRadius: 8,
                    padding: '0.6rem 0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="priceMode"
                    checked={mode === o.value}
                    onChange={() =>
                      set('pricing', {
                        ...p.pricing,
                        priceDisplayMode: o.value as PriceDisplayMode,
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{o.label}</strong>
                    <br />
                    <span style={{ fontSize: '0.85rem', color: colors.muted }}>
                      {o.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {priceFields.startingPrice && (
            <Field label="ราคาเริ่มต้น (บาท)" error={errors.startingPrice}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={p.pricing.startingPrice ?? ''}
                onChange={(e) =>
                  set('pricing', {
                    ...p.pricing,
                    startingPrice: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              {p.pricing.startingPrice != null && (
                <span style={{ fontSize: '0.8rem', color: colors.muted }}>
                  {formatBaht(p.pricing.startingPrice)}
                </span>
              )}
            </Field>
          )}

          {priceFields.range &&
            (['weekdayPrice', 'weekendPrice'] as const).map((k) => (
              <Field
                key={k}
                label={`${k === 'weekdayPrice' ? 'ราคาวันธรรมดา' : 'ราคาสุดสัปดาห์'} (บาท)`}
                error={errors[k]}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={p.pricing[k] ?? ''}
                  onChange={(e) =>
                    set('pricing', {
                      ...p.pricing,
                      [k]: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
                {p.pricing[k] != null && (
                  <span style={{ fontSize: '0.8rem', color: colors.muted }}>
                    {formatBaht(p.pricing[k])}
                  </span>
                )}
              </Field>
            ))}

          {(['securityDeposit', 'extraGuestPrice'] as const).map((k) => (
            <Field
              key={k}
              label={
                k === 'securityDeposit'
                  ? 'เงินมัดจำ (ไม่บังคับ, บาท)'
                  : 'ผู้เข้าพักเพิ่ม (ไม่บังคับ, บาท/คน)'
              }
              error={errors[k]}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={p.pricing[k] ?? ''}
                onChange={(e) =>
                  set('pricing', {
                    ...p.pricing,
                    [k]: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              {p.pricing[k] != null && (
                <span style={{ fontSize: '0.8rem', color: colors.muted }}>
                  {formatBaht(p.pricing[k])}
                  {k === 'extraGuestPrice' ? ' / คน' : ''}
                </span>
              )}
            </Field>
          ))}
        </Section>
      )}

      {tab === 'เนื้อหา' && (
        <Section>
          <Guidance text={PROPERTY_TAB_GUIDANCE['เนื้อหา']} />
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
          <Guidance text={PROPERTY_TAB_GUIDANCE['นโยบายเฉพาะ']} />
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
        <Button kind="primary" onClick={save} disabled={saveState === 'saving'}>
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
