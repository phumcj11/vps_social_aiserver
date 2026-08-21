'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiRequestError, type Business, type Environment } from '../../../lib/api';
import { Nav } from '../../../components/Nav';
import { Page, Section, Card, Button, Badge, colors } from './ui';

interface Row {
  business: Business;
  environment: Environment;
  ready: boolean;
  missingCount: number;
  activeProperties: number;
}

type Filter = 'all' | 'production' | 'test' | 'ready' | 'not_ready' | 'active' | 'archived';

export default function BusinessesPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
        const { businesses } = await api.listBusinesses();
        const built = await Promise.all(
          businesses.map(async (business): Promise<Row> => {
            const r = await api.getBusinessReadiness(business.id).catch(() => null);
            return {
              business,
              environment: r?.environment ?? 'test',
              ready: r?.readiness.ready ?? false,
              missingCount: r?.readiness.missing.length ?? 0,
              activeProperties: r?.activePropertyCount ?? 0,
            };
          }),
        );
        if (active) setRows(built);
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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      switch (filter) {
        case 'production':
          return r.environment === 'production';
        case 'test':
          return r.environment === 'test';
        case 'ready':
          return r.ready;
        case 'not_ready':
          return !r.ready;
        case 'active':
          return r.business.status === 'active';
        case 'archived':
          return r.business.status === 'archived';
        default:
          return true;
      }
    });
  }, [rows, filter]);

  if (loading)
    return (
      <Page>
        <Nav email={email} />
        <p>กำลังโหลด…</p>
      </Page>
    );

  const FILTERS: Array<[Filter, string]> = [
    ['all', 'ทั้งหมด'],
    ['production', 'Production'],
    ['test', 'Test'],
    ['ready', 'READY'],
    ['not_ready', 'NOT_READY'],
    ['active', 'Active'],
    ['archived', 'Archived'],
  ];

  return (
    <Page>
      <Nav email={email} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h1>ธุรกิจของฉัน</h1>
        <Link href="/settings/businesses/new">
          <Button kind="primary">+ เพิ่มธุรกิจ</Button>
        </Link>
      </div>
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          margin: '0.75rem 0',
          overflowX: 'auto',
        }}
      >
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              border: `1px solid ${filter === f ? '#0a58ca' : colors.border}`,
              background: filter === f ? '#0a58ca' : '#fff',
              color: filter === f ? '#fff' : '#111',
              borderRadius: 999,
              padding: '0.3rem 0.7rem',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Section>
          <div style={{ textAlign: 'center', padding: '2rem 0', color: colors.muted }}>
            <p style={{ fontWeight: 600, color: '#111' }}>ยังไม่มีธุรกิจ</p>
            <p>เพิ่มธุรกิจแรกของคุณเพื่อเริ่มตั้งค่าระบบ</p>
            <Link href="/settings/businesses/new">
              <Button kind="primary">เพิ่มธุรกิจแรก</Button>
            </Link>
          </div>
        </Section>
      ) : (
        <Section>
          {filtered.map((r) => (
            <Card key={r.business.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{r.business.name}</strong>{' '}
                  <Badge
                    text={r.environment === 'production' ? 'Production' : 'Test'}
                    tone={r.environment === 'production' ? 'ok' : 'muted'}
                  />{' '}
                  {r.business.status === 'archived' ? <Badge text="Archived" tone="warn" /> : null}
                </div>
                <Badge
                  text={r.ready ? 'READY' : `NOT_READY (${r.missingCount})`}
                  tone={r.ready ? 'ok' : 'danger'}
                />
              </div>
              <p style={{ color: colors.muted, margin: '0.35rem 0', fontSize: '0.9rem' }}>
                ที่พักที่เปิดใช้งาน: {r.activeProperties} · อัปเดตล่าสุด{' '}
                {new Date(r.business.updatedAt).toLocaleDateString('th-TH')}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/settings/businesses/${r.business.id}`}>
                  <Button>ตั้งค่า</Button>
                </Link>
                <Link href={`/settings/businesses/${r.business.id}?tab=ที่พัก`}>
                  <Button>ดูที่พัก</Button>
                </Link>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p style={{ color: colors.muted }}>ไม่มีธุรกิจตรงกับตัวกรองนี้</p>
          )}
        </Section>
      )}
    </Page>
  );
}
