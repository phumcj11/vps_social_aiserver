'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiRequestError, type PropertyMatchSummary } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';
import { Page, Section, Card, Badge, colors } from '../ui';

/**
 * Owner-facing Match Summary (SPRINT 017 Phase H). Plain-Thai view of the
 * deterministic Property matches: what the Lead asked for, which Property the
 * system recommends and why, and which were not chosen. Uses the existing
 * /property-matches read model — no change to the matching algorithm.
 */

function reasonThai(reason: string): string {
  const [code, detail] = reason.split(':').map((s) => s.trim());
  const label: Record<string, string> = {
    AREA_MATCH: 'อยู่พื้นที่ที่ต้องการ',
    CAPACITY_MATCH: 'รองรับจำนวนคนได้',
    BEDROOMS_MATCH: 'จำนวนห้องนอนพอ',
    TYPE_MATCH: 'ประเภทที่พักตรง',
    PRIVATE_POOL_MATCH: 'มีสระส่วนตัว',
    BEACH_MATCH: 'ติด/ใกล้ทะเล',
    RIVER_MATCH: 'ริมแม่น้ำ',
    AMENITY_MATCH: 'มีสิ่งอำนวยความสะดวกที่ขอ',
    AREA_MISMATCH: 'อยู่คนละพื้นที่',
    CAPACITY_MISMATCH: 'รองรับคนได้ไม่พอ',
    NO_PROPERTY_MATCH: 'ไม่มีที่พักที่ตรงกับคำขอ',
  };
  const base = label[code ?? ''] ?? reason;
  return detail ? `${base} (${detail})` : base;
}

function leadSummary(req: Record<string, unknown>): string {
  const parts: string[] = [];
  if (req.area) parts.push(String(req.area));
  if (req.guests) parts.push(`${req.guests} คน`);
  if (req.needsPrivatePool) parts.push('สระส่วนตัว');
  const amenities = req.requestedAmenities;
  if (Array.isArray(amenities) && amenities.length > 0) parts.push(amenities.join(', '));
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function OwnerMatchesPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [matches, setMatches] = useState<PropertyMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const { matches } = await api.listPropertyMatches();
        if (active) setMatches(matches);
      } catch (err) {
        if (err instanceof ApiRequestError) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (loading)
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
      <h1>ผลการจับคู่ที่พัก</h1>
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {matches.length === 0 ? (
        <Section>
          <Card>
            <strong>ยังไม่มีข้อมูลการจับคู่</strong>
            <p style={{ color: colors.muted, margin: '0.35rem 0 0' }}>
              ระบบจะแสดงผลเมื่อมี Lead ที่ผ่านการวิเคราะห์และจับคู่กับที่พักของคุณ
            </p>
          </Card>
        </Section>
      ) : (
        <Section>
          {matches.map((m) => (
            <Card key={m.id}>
              <div style={{ fontSize: '0.85rem', color: colors.muted }}>Lead ต้องการ</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{leadSummary(m.requirement)}</div>

              {m.decision === 'MATCH' && m.propertyName ? (
                <>
                  <div>
                    ระบบแนะนำ: <strong>{m.propertyName}</strong> <Badge text="แนะนำ" tone="ok" />
                  </div>
                  <ul style={{ margin: '0.35rem 0', paddingLeft: '1.2rem' }}>
                    {m.reasons
                      .filter((r) => r.includes('_MATCH'))
                      .map((r) => (
                        <li key={r} style={{ color: '#0a7d28' }}>
                          ✓ {reasonThai(r)}
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <div style={{ color: colors.warn }}>ไม่มีที่พักที่ตรงกับคำขอนี้</div>
              )}

              {m.rejected.length > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer', color: colors.muted }}>
                    ไม่เลือก ({m.rejected.length})
                  </summary>
                  <ul style={{ margin: '0.35rem 0', paddingLeft: '1.2rem' }}>
                    {m.rejected.map((r) => (
                      <li key={r.propertyId} style={{ color: colors.muted }}>
                        {r.propertyName}
                        {r.reasons.filter((x) => x.includes('MISMATCH')).length > 0
                          ? ` — ${r.reasons
                              .filter((x) => x.includes('MISMATCH'))
                              .map(reasonThai)
                              .join(', ')}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div style={{ fontSize: '0.8rem', color: colors.muted, marginTop: 6 }}>
                {m.businessName ?? ''} · ประเมิน {m.candidatesEvaluated} ที่พัก
              </div>
            </Card>
          ))}
        </Section>
      )}
    </Page>
  );
}
