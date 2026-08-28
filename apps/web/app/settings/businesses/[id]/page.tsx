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
  type MatchingRule,
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
  RadioCards,
  colors,
  AVAILABILITY_OPTIONS,
  PRICING_OPTIONS,
  PROMOTION_OPTIONS,
  BOOKING_OPTIONS,
  POLICY_QUESTIONS,
  RESPONSE_STRATEGY_QUESTION,
  RESPONSE_STRATEGY_OPTIONS,
  RESPONSE_STRATEGY_SAFETY_NOTE,
  noMatchExplainLines,
  type NoPropertyMatchStrategyValue,
  SLA_OPTIONS,
  PROHIBITED_CLAIM_PRESETS,
  ESCALATION_DEFAULT,
  ESCALATION_OPTIONS,
  CONTACT_TYPE_LABELS,
  CONTACT_APPROVAL_LABELS,
  CONTACT_APPROVAL_HELP,
  parseServiceArea,
  composeServiceArea,
  parseHours,
  composeHours,
  THAI_PROVINCES,
  propertyTypeLabel,
  type SaveState,
} from '../ui';
import { propertySummary } from '../property-ui';
import {
  TYPE_OPTIONS,
  EMPTY_CONFIG,
  configToDesiredRules,
  rulesToConfig,
  reconcile,
  matchingStatus,
  suggestConfig,
  previewMatch,
  hasAnyCriterion,
  isDuplicateToken,
  dedupeTokens,
  MATCHING_SAVE_MESSAGES,
  matchingSaveError,
  type MatchingConfig,
} from '../business-matching-ui';
import { MediaManager } from '../MediaManager';
import { IMAGE_RESPONSE_OPTIONS } from '../media-ui';
import { SourceSubscriptions } from '../SourceSubscriptions';
import { OnboardingChecklist } from '../onboarding';

const TABS = [
  'ภาพรวม',
  'ที่พัก',
  'ข้อมูลธุรกิจ',
  'ช่องทางติดต่อ',
  'นโยบาย',
  'การจับคู่ลูกค้า',
  'กลุ่มที่ติดตาม',
  'กลยุทธ์การตอบ Lead',
  'รูปภาพ',
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

      {tab === 'การจับคู่ลูกค้า' && (
        <MatchingTab businessId={id} profile={profile} properties={properties} onChange={reload} />
      )}

      {tab === 'กลุ่มที่ติดตาม' && <SourceSubscriptions businessId={id} />}

      {tab === 'กลยุทธ์การตอบ Lead' && (
        <ResponseStrategyTab
          businessId={id}
          policies={policies}
          onChange={reload}
          onGoPolicies={() => setTab('นโยบาย')}
        />
      )}

      {tab === 'รูปภาพ' && (
        <MediaManager
          businessId={id}
          title="รูปภาพธุรกิจ"
          helper="ใช้สำหรับแนะนำธุรกิจเมื่อยังไม่มีที่พักหลังใดตรงความต้องการ"
        />
      )}

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
            {(() => {
              const s = propertySummary(p);
              const line1 = [s.typeLabel, s.area].filter(Boolean).join(' · ');
              const line2 = [s.capacityLine, s.bedroomsLine].filter(Boolean).join(' · ');
              return (
                <div style={{ fontSize: '0.9rem', color: colors.muted }}>
                  {line1 && <div>{line1}</div>}
                  {line2 && <div>{line2}</div>}
                  {s.amenityLine && <div>{s.amenityLine}</div>}
                </div>
              );
            })()}
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
  const parsedArea = parseServiceArea(profile?.serviceArea);
  const [province, setProvince] = useState(parsedArea.province);
  const [primaryArea, setPrimaryArea] = useState(parsedArea.primaryArea);
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
      await api.updateProfile(business.id, {
        description,
        // The two owner-facing fields map safely into the single serviceArea string.
        serviceArea: composeServiceArea(province, primaryArea),
        responseTone,
      });
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
      <Field label="จังหวัด" hint="จังหวัดหลักที่คุณให้บริการ">
        <Select value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">— เลือกจังหวัด —</option>
          {THAI_PROVINCES.map((pv) => (
            <option key={pv} value={pv}>
              {pv}
            </option>
          ))}
          {province && !THAI_PROVINCES.includes(province) && (
            <option value={province}>{province}</option>
          )}
        </Select>
      </Field>
      <Field
        label="พื้นที่หลัก"
        hint="เช่น ตำบล/ย่าน ที่พักของคุณอยู่ — ใช้จับคู่ Lead ให้ตรงพื้นที่"
      >
        <Input
          value={primaryArea}
          onChange={(e) => setPrimaryArea(e.target.value)}
          placeholder="เช่น บางแสน"
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
  // Safe recommended defaults for a NEW business (visible to the owner).
  const isNew = policies == null;
  const [p, setP] = useState<BusinessPolicies>(
    policies ?? {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'DO_NOT_MENTION',
      promotionPolicy: 'NONE',
      bookingPolicy: 'CONTACT_ONLY',
      cancellationInfoPolicy: null,
      prohibitedClaims: [],
      escalationPolicy: ESCALATION_DEFAULT,
      responsibleOwner: null,
      operatingHours: null,
      responseSlaMinutes: 10,
      noPropertyMatchStrategy: 'HUMAN_REVIEW',
      allowNearMatchSuggestions: false,
      imageResponseMode: 'HUMAN_REVIEW_ONLY',
    },
  );
  // Prohibited claims split into recommended presets (checkboxes) + custom lines.
  const initialClaims = policies?.prohibitedClaims ?? [];
  const [presetOn, setPresetOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      // A new business starts with the safe presets checked; an existing one
      // reflects exactly what was saved.
      PROHIBITED_CLAIM_PRESETS.map((c) => [c, isNew ? true : initialClaims.includes(c)]),
    ),
  );
  const [customClaims, setCustomClaims] = useState(
    initialClaims.filter((c) => !PROHIBITED_CLAIM_PRESETS.includes(c)).join('\n'),
  );
  // Operating hours as From/To (no free typing of "09:00 - 18:00").
  const initHours = parseHours(policies?.operatingHours);
  const [fromT, setFromT] = useState(initHours.from);
  const [toT, setToT] = useState(initHours.to);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  function collectClaims(): string[] {
    const presets = PROHIBITED_CLAIM_PRESETS.filter((c) => presetOn[c]);
    const custom = customClaims
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...presets, ...custom]));
  }

  async function save() {
    setFieldErr(null);
    // Field-level validation with owner-friendly Thai messages (Phase J).
    if (!p.responsibleOwner || !p.responsibleOwner.trim()) {
      setFieldErr('กรุณาระบุผู้ดูแลลูกค้า');
      setSaveState('invalid');
      return;
    }
    if ((fromT && !toT) || (!fromT && toT)) {
      setFieldErr('กรุณาระบุทั้งเวลาเริ่มต้นและเวลาสิ้นสุด');
      setSaveState('invalid');
      return;
    }
    if (fromT && toT && fromT >= toT) {
      setFieldErr('เวลาเริ่มต้นต้องอยู่ก่อนเวลาสิ้นสุด');
      setSaveState('invalid');
      return;
    }
    setSaveState('saving');
    try {
      await api.putBusinessPolicies(businessId, {
        ...p,
        prohibitedClaims: collectClaims(),
        operatingHours: composeHours(fromT, toT),
      });
      setSaveState('saved');
      await onChange();
    } catch (e) {
      // A genuine validation error from the API is shown; otherwise the safe generic.
      if (e instanceof ApiRequestError && (e.status === 400 || e.status === 422)) {
        setFieldErr('กรุณาตรวจสอบข้อมูลด้านล่าง');
        setSaveState('invalid');
      } else {
        setFieldErr('ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง');
        setSaveState('error');
      }
    }
  }

  return (
    <Section title="นโยบายการตอบลูกค้า">
      <Field label={POLICY_QUESTIONS.availability}>
        <RadioCards
          name="availability"
          value={p.availabilityPolicy}
          options={AVAILABILITY_OPTIONS}
          onChange={(v) => setP({ ...p, availabilityPolicy: v })}
        />
      </Field>
      <Field label={POLICY_QUESTIONS.pricing}>
        <RadioCards
          name="pricing"
          value={p.pricingPolicy}
          options={PRICING_OPTIONS}
          onChange={(v) => setP({ ...p, pricingPolicy: v })}
        />
      </Field>
      <Field label={POLICY_QUESTIONS.promotion}>
        <RadioCards
          name="promotion"
          value={p.promotionPolicy}
          options={PROMOTION_OPTIONS}
          onChange={(v) => setP({ ...p, promotionPolicy: v })}
        />
      </Field>
      <Field label={POLICY_QUESTIONS.booking}>
        <RadioCards
          name="booking"
          value={p.bookingPolicy}
          options={BOOKING_OPTIONS}
          onChange={(v) => setP({ ...p, bookingPolicy: v })}
        />
      </Field>

      <Field label="ผู้ดูแลลูกค้า" hint="คนที่รับช่วงต่อเมื่อลูกค้าต้องการคุยกับคนจริง">
        <Input
          value={p.responsibleOwner ?? ''}
          onChange={(e) => setP({ ...p, responsibleOwner: e.target.value || null })}
          placeholder="เช่น คุณภูมิ"
        />
      </Field>

      <Field label="เวลาที่สะดวกตอบลูกค้า">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            type="time"
            value={fromT}
            onChange={(e) => setFromT(e.target.value)}
            style={{ width: 140 }}
          />
          <span>ถึง</span>
          <Input
            type="time"
            value={toT}
            onChange={(e) => setToT(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
      </Field>

      <Field label="ปกติคุณสามารถตอบลูกค้าได้ภายใน">
        <Select
          value={p.responseSlaMinutes ?? ''}
          onChange={(e) =>
            setP({ ...p, responseSlaMinutes: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">— เลือก —</option>
          {SLA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ข้อความที่ห้ามระบบพูด (เลือกได้หลายข้อ)">
        <div style={{ display: 'grid', gap: 4 }}>
          {PROHIBITED_CLAIM_PRESETS.map((c) => (
            <Toggle
              key={c}
              checked={!!presetOn[c]}
              onChange={(v) => setPresetOn({ ...presetOn, [c]: v })}
              label={c}
            />
          ))}
        </div>
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', color: colors.muted }}>+ เพิ่มข้อห้ามอื่น</summary>
          <Textarea
            value={customClaims}
            onChange={(e) => setCustomClaims(e.target.value)}
            placeholder="พิมพ์ข้อห้ามเพิ่มเติม บรรทัดละ 1 รายการ"
            style={{ marginTop: 6 }}
          />
        </details>
      </Field>

      <details style={{ marginBottom: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          ข้อมูลเพิ่มเติม (ไม่บังคับ)
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <Field label="เมื่อระบบตอบไม่ได้ ให้ทำอย่างไร?">
            <Select
              value={
                ESCALATION_OPTIONS.includes(p.escalationPolicy ?? '')
                  ? (p.escalationPolicy ?? '')
                  : p.escalationPolicy
                    ? '__custom__'
                    : ESCALATION_DEFAULT
              }
              onChange={(e) =>
                setP({
                  ...p,
                  escalationPolicy: e.target.value === '__custom__' ? '' : e.target.value,
                })
              }
            >
              {ESCALATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                  {o === ESCALATION_DEFAULT ? ' (แนะนำ)' : ''}
                </option>
              ))}
              <option value="__custom__">กำหนดเอง…</option>
            </Select>
            {!ESCALATION_OPTIONS.includes(p.escalationPolicy ?? '') && (
              <Input
                value={p.escalationPolicy ?? ''}
                onChange={(e) => setP({ ...p, escalationPolicy: e.target.value || null })}
                placeholder="ระบุวิธีที่ต้องการ"
                style={{ marginTop: 6 }}
              />
            )}
          </Field>
        </div>
      </details>

      {fieldErr && <p style={{ color: colors.danger }}>{fieldErr}</p>}
      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saveState === 'saving'}>
          บันทึกนโยบาย
        </Button>
        <SaveStatus state={saveState} message={fieldErr} />
      </StickyBar>
    </Section>
  );
}

// ── Customer Matching (การจับคู่ลูกค้า) ────────────────────────────────────────
// Owner-friendly configuration of the Business's matching rules. The owner never
// sees rule_type / operators / ids — only "where / what type / which words".
function ChipRow({ values, onRemove }: { values: string[]; onRemove: (v: string) => void }) {
  if (values.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {values.map((v) => (
        <span
          key={v}
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
          {v}
          <button
            type="button"
            onClick={() => onRemove(v)}
            aria-label={`ลบ ${v}`}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.muted }}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

function MatchingTab({
  businessId,
  profile,
  properties,
  onChange,
}: {
  businessId: string;
  profile: BusinessProfile | null;
  properties: Property[];
  onChange: () => Promise<void> | void;
}) {
  const [rules, setRules] = useState<MatchingRule[]>([]);
  const [config, setConfig] = useState<MatchingConfig>(EMPTY_CONFIG);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [areaInput, setAreaInput] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [sampleLead, setSampleLead] = useState('หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ');
  const [loaded, setLoaded] = useState(false);

  // Suggestions from PERSISTED facts (never saved without the owner pressing บันทึก).
  const suggestion = suggestConfig({
    province:
      properties.map((p) => p.location.province).find((x) => x && x.trim()) ??
      parseServiceArea(profile?.serviceArea).province ??
      null,
    areas: properties.map((p) => p.location.area).filter((a): a is string => Boolean(a)),
    propertyTypes: properties
      .map((p) => propertyTypeLabel(p.propertyType))
      .filter((t) => t && t !== '—'),
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.listRules(businessId).catch(() => ({ matchingRules: [] }));
      if (!active) return;
      setRules(res.matchingRules);
      const existing = rulesToConfig(res.matchingRules);
      // Prefill from persisted rules; if none yet, offer the suggestion (unsaved).
      setConfig(hasAnyCriterion(existing) ? existing : suggestion);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [businessId]);

  const status = matchingStatus(rules);

  function upd(patch: Partial<MatchingConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    if (saveState !== 'idle') {
      setSaveState('idle');
      setSaveMsg(null);
    }
  }
  function addArea() {
    const v = areaInput.trim();
    if (!v) return;
    if (isDuplicateToken(config.areas, v)) {
      setSaveMsg(MATCHING_SAVE_MESSAGES.duplicate);
      return;
    }
    upd({ areas: [...config.areas, v] });
    setAreaInput('');
  }
  function addKeyword() {
    const v = kwInput.trim();
    if (!v) return;
    if (isDuplicateToken([...config.keywords, ...config.types], v)) {
      setSaveMsg(MATCHING_SAVE_MESSAGES.duplicate);
      return;
    }
    upd({ keywords: [...config.keywords, v] });
    setKwInput('');
  }
  function toggleType(t: string) {
    upd({
      types: config.types.includes(t) ? config.types.filter((x) => x !== t) : [...config.types, t],
    });
  }

  async function save() {
    if (!hasAnyCriterion(config)) {
      setSaveState('invalid');
      setSaveMsg(MATCHING_SAVE_MESSAGES.empty);
      return;
    }
    setSaveState('saving');
    setSaveMsg(MATCHING_SAVE_MESSAGES.saving);
    try {
      const desired = configToDesiredRules(config);
      const plan = reconcile(rules, desired);
      for (const c of plan.toCreate) {
        await api.createRule(businessId, {
          ruleType: c.ruleType,
          ruleValue: c.ruleValue,
          priority: 0,
          status: 'active',
        });
      }
      for (const idToReactivate of plan.toReactivate) {
        await api.updateRule(businessId, idToReactivate, { status: 'active' });
      }
      for (const idToDeactivate of plan.toDeactivate) {
        await api.updateRule(businessId, idToDeactivate, { status: 'disabled' });
      }
      const res = await api.listRules(businessId);
      setRules(res.matchingRules);
      setConfig(rulesToConfig(res.matchingRules));
      await onChange();
      setSaveState('saved');
      setSaveMsg(MATCHING_SAVE_MESSAGES.saved);
    } catch {
      setSaveState('error');
      setSaveMsg(matchingSaveError());
    }
  }

  const preview = previewMatch(config, sampleLead);
  const activeRules = rules.filter((r) => r.status === 'active');

  return (
    <Section title="การจับคู่ลูกค้า">
      <p style={{ fontSize: '0.9rem', color: colors.muted, marginTop: 0 }}>
        ตั้งค่าว่าลูกค้าแบบไหนเหมาะกับธุรกิจของคุณ
        <br />
        ระบบจะใช้ข้อมูลนี้เลือกธุรกิจ ก่อนเลือกที่พักที่เหมาะสม
      </p>

      <Card>
        <strong>การจับคู่: </strong>
        {status === 'ACTIVE' ? (
          <span style={{ color: colors.ok }}>🟢 เปิดใช้งาน</span>
        ) : (
          <span style={{ color: colors.muted }}>⚪ ยังไม่ได้ตั้งค่า</span>
        )}
        {status === 'UNSET' && (
          <p style={{ color: colors.danger, marginBottom: 0 }}>
            ยังไม่ได้ตั้งค่าการจับคู่ ระบบจึงยังไม่สามารถเลือกธุรกิจนี้จาก Lead ได้
          </p>
        )}
      </Card>

      <Field label="คุณรับลูกค้าจากพื้นที่ไหน?">
        <span
          style={{ display: 'block', fontSize: '0.8rem', color: colors.muted, marginBottom: 4 }}
        >
          เมื่อลูกค้าระบุพื้นที่เหล่านี้ ระบบจะพิจารณาธุรกิจของคุณ
        </span>
        <label style={{ fontSize: '0.85rem' }}>จังหวัด</label>
        <Select value={config.province} onChange={(e) => upd({ province: e.target.value })}>
          <option value="">— เลือกจังหวัด —</option>
          {THAI_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <label style={{ fontSize: '0.85rem' }}>พื้นที่หลัก / พื้นที่เพิ่มเติม</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Input
            value={areaInput}
            placeholder="เช่น บางแสน"
            onChange={(e) => setAreaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addArea();
              }
            }}
            style={{ flex: 1, minWidth: 160 }}
          />
          <Button onClick={addArea}>+ เพิ่มพื้นที่</Button>
        </div>
        <ChipRow
          values={config.areas}
          onRemove={(v) => upd({ areas: config.areas.filter((x) => x !== v) })}
        />
      </Field>

      <Field label="ธุรกิจของคุณให้บริการที่พักประเภทไหน?">
        {suggestion.types.length > 0 && (
          <span
            style={{ display: 'block', fontSize: '0.8rem', color: colors.muted, marginBottom: 4 }}
          >
            พบจากที่พักของคุณ: {suggestion.types.join(', ')}
          </span>
        )}
        {TYPE_OPTIONS.map((t) => (
          <Toggle
            key={t}
            checked={config.types.includes(t)}
            onChange={() => toggleType(t)}
            label={t}
          />
        ))}
      </Field>

      <Field label="ลูกค้ามักใช้คำอะไรเวลาหาที่พักแบบคุณ?">
        <span
          style={{ display: 'block', fontSize: '0.8rem', color: colors.muted, marginBottom: 4 }}
        >
          ใส่เฉพาะคำที่เกี่ยวข้องกับธุรกิจจริงของคุณ
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Input
            value={kwInput}
            placeholder="เช่น บ้านพักบางแสน"
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            style={{ flex: 1, minWidth: 160 }}
          />
          <Button onClick={addKeyword}>+ เพิ่มคำ</Button>
        </div>
        <ChipRow
          values={config.keywords}
          onRemove={(v) => upd({ keywords: config.keywords.filter((x) => x !== v) })}
        />
      </Field>

      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>ตัวอย่างการจับคู่</summary>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: '0.85rem' }}>Lead ตัวอย่าง</label>
          <Input value={sampleLead} onChange={(e) => setSampleLead(e.target.value)} />
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
            {preview.length === 0 ? (
              <li style={{ color: colors.muted }}>ยังไม่มีเกณฑ์การจับคู่</li>
            ) : (
              preview.map((l) => (
                <li key={l.label} style={{ color: l.ok ? colors.ok : colors.muted }}>
                  {l.ok ? '✓' : '·'} {l.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </details>

      {loaded && activeRules.length > 0 && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>ข้อมูลขั้นสูง</summary>
          <ul style={{ marginTop: 8 }}>
            {activeRules.map((r) => (
              <li key={r.id} style={{ fontSize: '0.85rem', color: colors.muted }}>
                {dedupeTokens([r.ruleValue])[0]}
              </li>
            ))}
          </ul>
        </details>
      )}

      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saveState === 'saving'}>
          บันทึกการจับคู่
        </Button>
        <SaveStatus state={saveState} message={saveMsg} />
      </StickyBar>
    </Section>
  );
}

// ── Response Strategy (กลยุทธ์การตอบ Lead) ─────────────────────────────────────
// What the system does on Business MATCH + NO_PROPERTY_MATCH. A response POLICY:
// it never turns a mismatched Property into a MATCH and never fabricates facts.
function ResponseStrategyTab({
  businessId,
  policies,
  onChange,
  onGoPolicies,
}: {
  businessId: string;
  policies: BusinessPolicies | null;
  onChange: () => Promise<void> | void;
  onGoPolicies: () => void;
}) {
  const [strategy, setStrategy] = useState<NoPropertyMatchStrategyValue>(
    policies?.noPropertyMatchStrategy ?? 'HUMAN_REVIEW',
  );
  const [imageMode, setImageMode] = useState<string>(
    policies?.imageResponseMode ?? 'HUMAN_REVIEW_ONLY',
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  if (!policies) {
    return (
      <Section title="กลยุทธ์การตอบ Lead">
        <Card>
          <p style={{ marginTop: 0 }}>กรุณาตั้งค่านโยบายธุรกิจก่อน จึงจะตั้งกลยุทธ์การตอบได้</p>
          <Button kind="primary" onClick={onGoPolicies}>
            ไปตั้งค่านโยบาย
          </Button>
        </Card>
      </Section>
    );
  }

  async function save() {
    setSaveState('saving');
    setSaveMsg('กำลังบันทึก...');
    try {
      // Preserve all other policy fields; change only the response strategy.
      await api.putBusinessPolicies(businessId, {
        ...policies!,
        noPropertyMatchStrategy: strategy,
        imageResponseMode: imageMode as BusinessPolicies['imageResponseMode'],
      });
      await onChange();
      setSaveState('saved');
      setSaveMsg('บันทึกเรียบร้อย');
    } catch {
      setSaveState('error');
      setSaveMsg('ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง');
    }
  }

  return (
    <Section title="กลยุทธ์การตอบ Lead">
      <Field label={RESPONSE_STRATEGY_QUESTION}>
        <RadioCards
          name="response-strategy"
          options={RESPONSE_STRATEGY_OPTIONS}
          value={strategy}
          onChange={(v) => {
            setStrategy(v);
            if (saveState !== 'idle') {
              setSaveState('idle');
              setSaveMsg(null);
            }
          }}
        />
      </Field>

      <Card>
        <strong>ℹ️ {RESPONSE_STRATEGY_SAFETY_NOTE}</strong>
      </Card>

      <Field label="เสนอที่พักใกล้เคียง (กำลังพัฒนา)">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: colors.muted }}>
          <input type="checkbox" disabled checked={false} readOnly />
          อนุญาตให้เสนอที่พักใกล้เคียง — กำลังพัฒนา ยังไม่เปิดใช้งาน
        </label>
      </Field>

      <Field label="การแนบรูปภาพในคำตอบ">
        <Select
          value={imageMode}
          onChange={(e) => {
            setImageMode(e.target.value);
            if (saveState !== 'idle') {
              setSaveState('idle');
              setSaveMsg(null);
            }
          }}
        >
          {IMAGE_RESPONSE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.recommended ? ' · แนะนำ' : ''}
            </option>
          ))}
        </Select>
        <span style={{ display: 'block', fontSize: '0.8rem', color: colors.muted }}>
          {IMAGE_RESPONSE_OPTIONS.find((o) => o.value === imageMode)?.description}{' '}
          ระบบจะไม่โพสต์รูปออกภายนอกในขั้นนี้
        </span>
      </Field>

      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          ทำไมระบบยังสร้าง Draft ทั้งที่ไม่มีบ้านตรง?
        </summary>
        <ul style={{ marginTop: 8 }}>
          {noMatchExplainLines(strategy).map((l) => (
            <li key={l} style={{ listStyle: 'none', color: colors.muted }}>
              {l}
            </li>
          ))}
        </ul>
      </details>

      <StickyBar>
        <Button kind="primary" onClick={save} disabled={saveState === 'saving'}>
          บันทึกกลยุทธ์
        </Button>
        <SaveStatus state={saveState} message={saveMsg} />
      </StickyBar>
    </Section>
  );
}
