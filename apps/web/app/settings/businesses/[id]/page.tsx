'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  ApiRequestError,
  type Business,
  type BusinessProfile,
  type BusinessPolicies,
  type ContactChannel,
  type ContactChannelType,
  type Property,
  type ReadinessVerdict,
  type BusinessAuditEvent,
  type Environment,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';
import {
  Page,
  Section,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Toggle,
  Button,
  Badge,
  Tabs,
  ReadinessChecklist,
  StickyBar,
  SaveStatus,
  colors,
  AVAILABILITY_OPTIONS,
  PRICING_OPTIONS,
  PROMOTION_OPTIONS,
  BOOKING_OPTIONS,
  CONTACT_TYPE_LABELS,
  CONTACT_APPROVAL_LABELS,
  CONTACT_APPROVAL_HELP,
  propertyTypeLabel,
  type SaveState,
} from '../ui';
import { OnboardingChecklist } from '../onboarding';

const TABS = [
  'ภาพรวม',
  'ที่พัก',
  'ข้อมูลธุรกิจ',
  'ช่องทางติดต่อ',
  'นโยบาย',
  'ความพร้อมใช้งาน',
  'ประวัติ',
];

export default function BusinessDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const search = useSearchParams();
  const [email, setEmail] = useState<string | undefined>();
  const [tab, setTab] = useState(search.get('tab') ?? 'ภาพรวม');
  const [business, setBusiness] = useState<Business | null>(null);
  const [environment, setEnvironment] = useState<Environment>('test');
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [policies, setPolicies] = useState<BusinessPolicies | null>(null);
  const [contacts, setContacts] = useState<ContactChannel[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [readiness, setReadiness] = useState<ReadinessVerdict | null>(null);
  const [audit, setAudit] = useState<BusinessAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [b, p, pol, cs, props, r] = await Promise.all([
      api.getBusiness(id),
      api.getProfile(id).catch(() => null),
      api.getBusinessPolicies(id).catch(() => ({ policies: null })),
      api.listContacts(id).catch(() => ({ contacts: [] })),
      api.listProperties(id).catch(() => ({ properties: [] })),
      api.getBusinessReadiness(id).catch(() => null),
    ]);
    setBusiness(b.business);
    setProfile(p?.profile ?? null);
    setPolicies(pol.policies);
    setContacts(cs.contacts);
    setProperties(props.properties);
    if (r) {
      setReadiness(r.readiness);
      setEnvironment(r.environment);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (active) setEmail(me.user.email);
      } catch {
        router.push('/login');
        return;
      }
      try {
        await reload();
        const a = await api.listBusinessAudit(id).catch(() => ({ events: [] }));
        if (active) setAudit(a.events);
      } catch (err) {
        if (err instanceof ApiRequestError) setMsg(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router, reload]);

  if (loading || !business)
    return (
      <Page>
        <Nav email={email} />
        <p>กำลังโหลด…</p>
      </Page>
    );

  return (
    <Page>
      <Nav email={email} />
      <Link href="/settings/businesses" style={{ fontSize: '0.9rem' }}>
        ← ธุรกิจของฉัน
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: '0.3rem 0' }}>{business.name}</h1>
        <Badge
          text={environment === 'production' ? 'Production' : 'Test'}
          tone={environment === 'production' ? 'ok' : 'muted'}
        />
        {readiness ? (
          <Badge
            text={readiness.ready ? 'READY' : 'NOT_READY'}
            tone={readiness.ready ? 'ok' : 'danger'}
          />
        ) : null}
      </div>
      {msg && <p style={{ color: colors.warn }}>{msg}</p>}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'ภาพรวม' && (
        <Section>
          <OnboardingChecklist
            input={{ business, profile, policies, contacts, properties, readiness }}
            onGo={setTab}
          />
          <Card>
            <p>
              ที่พักทั้งหมด: {properties.length} · เปิดใช้งาน:{' '}
              {properties.filter((p) => p.status === 'active').length}
            </p>
            <p>
              ช่องทางติดต่อ: {contacts.length} · อนุมัติใน Draft:{' '}
              {contacts.filter((c) => c.enabled && c.approvedForDrafts).length}
            </p>
            <p>
              สถานะความพร้อม:{' '}
              {readiness?.ready
                ? '✓ READY'
                : `NOT_READY (ขาด ${readiness?.missing.length ?? '-'} รายการ)`}
            </p>
          </Card>
        </Section>
      )}

      {tab === 'ที่พัก' && (
        <PropertiesTab businessId={id} properties={properties} onChange={reload} />
      )}

      {tab === 'ข้อมูลธุรกิจ' && (
        <BusinessInfoTab
          business={business}
          profile={profile}
          environment={environment}
          onSaved={async (m) => {
            setMsg(m);
            await reload();
          }}
        />
      )}

      {tab === 'ช่องทางติดต่อ' && (
        <ContactsTab businessId={id} contacts={contacts} onChange={reload} />
      )}

      {tab === 'นโยบาย' && <PoliciesTab businessId={id} policies={policies} onChange={reload} />}

      {tab === 'ความพร้อมใช้งาน' && (
        <Section title="ความพร้อมใช้งาน (Business Readiness)">
          {readiness ? <ReadinessChecklist missing={readiness.missing} onFix={setTab} /> : <p>—</p>}
          {readiness?.ready && (
            <p style={{ fontSize: '0.85rem', color: colors.muted }}>
              ธุรกิจของคุณพร้อมใช้งานจริงแล้ว 🎉
            </p>
          )}
        </Section>
      )}

      {tab === 'ประวัติ' && (
        <Section title="ประวัติการเปลี่ยนแปลง">
          {audit.length === 0 ? (
            <p style={{ color: colors.muted }}>ยังไม่มีประวัติ</p>
          ) : (
            audit.map((e) => (
              <Card key={e.id}>
                <strong>{e.eventType}</strong> · {new Date(e.createdAt).toLocaleString('th-TH')}
                <div style={{ fontSize: '0.85rem', color: colors.muted }}>
                  {e.actorEmail ?? '—'}
                </div>
              </Card>
            ))
          )}
        </Section>
      )}
    </Page>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function PropertiesTab({
  businessId,
  properties,
  onChange,
}: {
  businessId: string;
  properties: Property[];
  onChange: () => Promise<void>;
}) {
  async function archive(pid: string) {
    await api.archiveProperty(businessId, pid);
    await onChange();
  }
  async function duplicate(p: Property) {
    const created = await api.createProperty(businessId, {
      name: `${p.name} (สำเนา)`,
      propertyType: p.propertyType ?? undefined,
      description: p.description ?? undefined,
    });
    await api.updateProperty(businessId, created.property.id, {
      capacity: p.capacity,
      location: p.location,
      amenities: p.amenities,
    });
    await onChange();
  }
  const hasAny = properties.length > 0;
  return (
    <Section title="ที่พัก / บ้าน">
      <Link href={`/settings/businesses/${businessId}/properties/new`}>
        <Button kind="primary">{hasAny ? '+ เพิ่มที่พัก' : 'เพิ่มที่พักแรก'}</Button>
      </Link>
      <div style={{ marginTop: '0.75rem' }}>
        {!hasAny && (
          <Card>
            <strong>ยังไม่มีที่พัก</strong>
            <p style={{ color: colors.muted, margin: '0.35rem 0' }}>
              เพิ่มบ้าน/ห้อง/แพพักที่คุณต้องการให้ระบบใช้ในการจับคู่ Lead
              ระบบใช้ข้อมูลที่พักเพื่อเลือกบ้านที่เหมาะกับ Lead แต่ละราย
            </p>
            <Link href={`/settings/businesses/${businessId}/properties/new`}>
              <Button kind="primary">เพิ่มที่พักแรก</Button>
            </Link>
          </Card>
        )}
        {properties.map((p) => (
          <Card key={p.id}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}
            >
              <strong>{p.name}</strong>
              <Badge
                text={
                  p.status === 'active'
                    ? 'เปิดใช้งาน'
                    : p.status === 'archived'
                      ? 'เก็บถาวร'
                      : 'ปิดใช้งาน'
                }
                tone={p.status === 'active' ? 'ok' : p.status === 'archived' ? 'warn' : 'muted'}
              />
            </div>
            <div style={{ fontSize: '0.9rem', color: colors.muted }}>
              {propertyTypeLabel(p.propertyType)} · {p.location.area ?? p.location.province ?? '—'}{' '}
              · ผู้เข้าพักสูงสุด {p.capacity.maxGuests ?? '—'} · {p.capacity.bedrooms ?? '—'}{' '}
              ห้องนอน
              {p.amenities.privatePool ? ' · สระส่วนตัว' : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <Link href={`/settings/businesses/${businessId}/properties/${p.id}`}>
                <Button>แก้ไข</Button>
              </Link>
              <Button onClick={() => duplicate(p)}>ทำสำเนาเป็นแม่แบบ</Button>
              {p.status !== 'archived' && (
                <Button kind="danger" onClick={() => archive(p.id)}>
                  เก็บถาวร
                </Button>
              )}
            </div>
          </Card>
        ))}
        {hasAny && (
          <p style={{ fontSize: '0.85rem', color: colors.muted, marginTop: 6 }}>
            เพิ่มที่พักอีกหลัง หรือไปที่แท็บ “ความพร้อมใช้งาน” เพื่อตรวจสอบความพร้อม
          </p>
        )}
      </div>
    </Section>
  );
}

function BusinessInfoTab({
  business,
  profile,
  environment,
  onSaved,
}: {
  business: Business;
  profile: BusinessProfile | null;
  environment: Environment;
  onSaved: (msg: string) => Promise<void>;
}) {
  const [name, setName] = useState(business.name);
  const [description, setDescription] = useState(profile?.description ?? '');
  const [serviceArea, setServiceArea] = useState(profile?.serviceArea ?? '');
  const [responseTone, setResponseTone] = useState(profile?.responseTone ?? '');
  const [env, setEnv] = useState<Environment>(environment);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  async function save() {
    if (!name.trim()) {
      setSaveState('invalid');
      return;
    }
    setSaveState('saving');
    try {
      if (name !== business.name) await api.updateBusiness(business.id, { name });
      await api.updateProfile(business.id, { description, serviceArea, responseTone });
      if (env !== environment) await api.setBusinessEnvironment(business.id, env);
      setSaveState('saved');
      await onSaved('');
    } catch (err) {
      setSaveState('error');
      await onSaved(err instanceof ApiRequestError ? err.message : '');
    }
  }

  return (
    <Section title="ข้อมูลธุรกิจ">
      <Field label="ชื่อธุรกิจ">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="คำอธิบาย (ไม่บังคับ)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field
        label="พื้นที่ให้บริการ (จังหวัด/พื้นที่หลัก)"
        hint="ใช้จับคู่ Lead ให้ตรงพื้นที่ที่คุณให้บริการ"
      >
        <Input
          value={serviceArea}
          onChange={(e) => setServiceArea(e.target.value)}
          placeholder="เช่น บางแสน, ชลบุรี"
        />
      </Field>
      <Field label="โทนการตอบลูกค้า" hint="ช่วยให้ระบบตอบด้วยน้ำเสียงที่ตรงกับแบรนด์ของคุณ">
        <Input
          value={responseTone}
          onChange={(e) => setResponseTone(e.target.value)}
          placeholder="เช่น สุภาพ กระชับ"
        />
      </Field>
      <Field label="ประเภทสภาพแวดล้อม" hint="เฉพาะ Production เท่านั้นที่จะพร้อมใช้งานจริง">
        <Select value={env} onChange={(e) => setEnv(e.target.value as Environment)}>
          <option value="test">Test (ทดสอบ)</option>
          <option value="production">Production (ใช้งานจริง)</option>
        </Select>
      </Field>
      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saveState === 'saving'}>
          บันทึก
        </Button>
        <SaveStatus state={saveState} />
      </StickyBar>
    </Section>
  );
}

function ContactsTab({
  businessId,
  contacts,
  onChange,
}: {
  businessId: string;
  contacts: ContactChannel[];
  onChange: () => Promise<void>;
}) {
  const [type, setType] = useState<ContactChannelType>('PHONE');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    try {
      await api.createContact(businessId, { type, value, label: label || undefined });
      setValue('');
      setLabel('');
      await onChange();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'เพิ่มไม่สำเร็จ');
    }
  }
  async function patch(cid: string, p: Partial<ContactChannel> & { ownerVerified?: boolean }) {
    await api.updateContact(businessId, cid, p);
    await onChange();
  }

  return (
    <Section title="ช่องทางติดต่อ">
      {contacts.map((c) => (
        <Card key={c.id}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}
          >
            <strong>
              {CONTACT_TYPE_LABELS[c.type]} — {c.value}
            </strong>
            {c.enabled ? (
              <Badge text="เปิดใช้งาน" tone="ok" />
            ) : (
              <Badge text="ปิดใช้งาน" tone="muted" />
            )}
          </div>
          {/* Recommended owner flow: verify it is correct, then choose where it may be used. */}
          <Toggle
            checked={c.ownerVerifiedAt != null}
            onChange={(v) => patch(c.id, { ownerVerified: v })}
            label={CONTACT_APPROVAL_LABELS.ownerVerified}
          />
          <p style={{ fontSize: '0.78rem', color: colors.muted, margin: '0 0 6px 28px' }}>
            {CONTACT_APPROVAL_HELP.ownerVerified}
          </p>
          <Toggle
            checked={c.approvedForDrafts}
            onChange={(v) => patch(c.id, { approvedForDrafts: v })}
            label={CONTACT_APPROVAL_LABELS.approvedForDrafts}
          />
          <p style={{ fontSize: '0.78rem', color: colors.muted, margin: '0 0 6px 28px' }}>
            {CONTACT_APPROVAL_HELP.approvedForDrafts}
          </p>
          <Toggle
            checked={c.approvedForPublicResponse}
            onChange={(v) => patch(c.id, { approvedForPublicResponse: v })}
            label={CONTACT_APPROVAL_LABELS.approvedForPublicResponse}
          />
          <p style={{ fontSize: '0.78rem', color: colors.muted, margin: '0 0 6px 28px' }}>
            {CONTACT_APPROVAL_HELP.approvedForPublicResponse}
          </p>
          <Button onClick={() => patch(c.id, { enabled: !c.enabled })}>
            {c.enabled ? 'ปิดใช้งานช่องทางนี้' : CONTACT_APPROVAL_LABELS.enabled}
          </Button>
        </Card>
      ))}
      {contacts.length === 0 && (
        <Card>
          <strong>ยังไม่มีช่องทางติดต่อ</strong>
          <p style={{ color: colors.muted, margin: '0.35rem 0 0' }}>
            เพิ่ม LINE, โทรศัพท์ หรือเว็บไซต์ ที่ระบบสามารถแนะนำให้ลูกค้าได้
          </p>
        </Card>
      )}
      <Card>
        <strong>เพิ่มช่องทางติดต่อ</strong>
        <p style={{ fontSize: '0.82rem', color: colors.muted, margin: '4px 0 8px' }}>
          ขั้นตอนแนะนำ: 1) กรอกช่องทาง → 2) ยืนยันว่าถูกต้อง → 3) เลือกว่าจะให้ระบบใช้ที่ไหน
        </p>
        <Field label="ประเภท">
          <Select value={type} onChange={(e) => setType(e.target.value as ContactChannelType)}>
            {(Object.keys(CONTACT_TYPE_LABELS) as ContactChannelType[]).map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ค่า (เบอร์/ID/URL/อีเมล)">
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="ป้ายกำกับ (ไม่บังคับ)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {err && <p style={{ color: colors.danger }}>{err}</p>}
        <Button kind="primary" onClick={add}>
          เพิ่ม
        </Button>
      </Card>
      <p style={{ fontSize: '0.85rem', color: colors.muted }}>
        Draft จะใช้ได้เฉพาะช่องทางที่เปิดใช้งานและอนุมัติแล้วเท่านั้น
      </p>
    </Section>
  );
}

function PoliciesTab({
  businessId,
  policies,
  onChange,
}: {
  businessId: string;
  policies: BusinessPolicies | null;
  onChange: () => Promise<void>;
}) {
  const [p, setP] = useState<BusinessPolicies>(
    policies ?? {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'DO_NOT_MENTION',
      promotionPolicy: 'NONE',
      bookingPolicy: 'CONTACT_ONLY',
      cancellationInfoPolicy: null,
      prohibitedClaims: [],
      escalationPolicy: null,
      responsibleOwner: null,
      operatingHours: null,
      responseSlaMinutes: null,
    },
  );
  const [claims, setClaims] = useState((policies?.prohibitedClaims ?? []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.putBusinessPolicies(businessId, {
        ...p,
        prohibitedClaims: claims
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await onChange();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="นโยบายการตอบลูกค้า">
      <PolicyField
        label="นโยบายห้องว่าง"
        value={p.availabilityPolicy}
        options={AVAILABILITY_OPTIONS}
        onChange={(v) => setP({ ...p, availabilityPolicy: v })}
      />
      <PolicyField
        label="นโยบายราคา"
        value={p.pricingPolicy}
        options={PRICING_OPTIONS}
        onChange={(v) => setP({ ...p, pricingPolicy: v })}
      />
      <PolicyField
        label="นโยบายโปรโมชั่น"
        value={p.promotionPolicy}
        options={PROMOTION_OPTIONS}
        onChange={(v) => setP({ ...p, promotionPolicy: v })}
      />
      <PolicyField
        label="นโยบายการจอง"
        value={p.bookingPolicy}
        options={BOOKING_OPTIONS}
        onChange={(v) => setP({ ...p, bookingPolicy: v })}
      />
      <Field label="ข้อความที่ห้ามกล่าวอ้าง (บรรทัดละ 1 รายการ)">
        <Textarea
          value={claims}
          onChange={(e) => setClaims(e.target.value)}
          placeholder="เช่น ห้ามยืนยันห้องว่าง&#10;ห้ามยืนยันราคา"
        />
      </Field>

      {/* Readiness-required operational fields stay primary (not optional). */}
      <Field label="ผู้รับผิดชอบ" hint="จำเป็นสำหรับความพร้อมใช้งาน">
        <Input
          value={p.responsibleOwner ?? ''}
          onChange={(e) => setP({ ...p, responsibleOwner: e.target.value || null })}
          placeholder="เช่น คุณเมย์"
        />
      </Field>
      <Field label="เวลาทำการ" hint="จำเป็นสำหรับความพร้อมใช้งาน">
        <Input
          value={p.operatingHours ?? ''}
          onChange={(e) => setP({ ...p, operatingHours: e.target.value || null })}
          placeholder="เช่น 09:00-18:00"
        />
      </Field>
      <Field label="เวลาตอบกลับสูงสุด (นาที)" hint="จำเป็นสำหรับความพร้อมใช้งาน">
        <Input
          type="number"
          value={p.responseSlaMinutes ?? ''}
          onChange={(e) =>
            setP({ ...p, responseSlaMinutes: e.target.value ? Number(e.target.value) : null })
          }
          placeholder="เช่น 120"
        />
      </Field>

      <details style={{ marginBottom: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          ข้อมูลเพิ่มเติม (ไม่บังคับ)
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <Field label="นโยบายการยกระดับ/ติดต่อเจ้าของ (ไม่บังคับ)">
            <Input
              value={p.escalationPolicy ?? ''}
              onChange={(e) => setP({ ...p, escalationPolicy: e.target.value || null })}
            />
          </Field>
        </div>
      </details>

      {err && <p style={{ color: colors.danger }}>{err}</p>}
      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saving}>
          บันทึกนโยบาย
        </Button>
      </StickyBar>
    </Section>
  );
}

/** A policy select with per-option Thai description + a recommended badge. */
function PolicyField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description: string; recommended?: boolean }[];
  onChange: (v: T) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.recommended ? ' (แนะนำ)' : ''}
          </option>
        ))}
      </Select>
      {selected ? (
        <span style={{ display: 'block', fontSize: '0.82rem', color: colors.muted, marginTop: 4 }}>
          {selected.recommended ? '⭐ ' : ''}
          {selected.description}
        </span>
      ) : null}
    </Field>
  );
}
