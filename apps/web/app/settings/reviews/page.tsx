'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type ReviewTask } from '../../../lib/api';
import { Nav } from '../../../components/Nav';
import {
  REVIEW_QUEUE_PAGE_TITLE,
  REVIEW_QUEUE_SUBTITLE,
  REVIEW_QUEUE_CTA,
  REVIEW_QUEUE_TABS,
  reviewQueueEmptyThai,
  reviewStatusThai,
} from './review-ui';

const C = { ok: '#0a7d28', warn: '#b26a00', danger: '#b00020', muted: '#666', border: '#e2e2e2' };

function statusColor(s: string): string {
  if (s === 'APPROVED') return C.ok;
  if (s === 'REJECTED') return C.danger;
  if (s === 'EXPIRED') return C.muted;
  return C.warn; // PENDING
}

export default function ReviewQueuePage() {
  const router = useRouter();
  // Default to PENDING (the owner's daily task); allow ?status= to preselect a tab.
  const initial =
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('status')
      : null) ?? 'PENDING';
  const [email, setEmail] = useState<string | undefined>();
  const [reviews, setReviews] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [filter, setFilter] = useState<string | undefined>(initial);

  async function refresh(status?: string) {
    try {
      const res = await api.listReviews(status ? { status } : {});
      setReviews(res.reviews);
      setNeedsWorkspace(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'workspace_required')
        setNeedsWorkspace(true);
      else if (!(err instanceof ApiRequestError)) throw err;
    }
  }

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
      await refresh(initial);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [router, initial]);

  async function applyFilter(status?: string) {
    setFilter(status);
    await refresh(status);
  }

  if (loading) return <main style={{ padding: '1rem' }}>กำลังโหลด…</main>;

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '0 0.75rem' }}>
      <Nav email={email} />
      <h1 style={{ margin: '0.2rem 0' }}>{REVIEW_QUEUE_PAGE_TITLE}</h1>
      <p style={{ color: C.muted, margin: '0.2rem 0 1rem' }}>{REVIEW_QUEUE_SUBTITLE}</p>

      {needsWorkspace ? (
        <p>
          กรุณาสร้างพื้นที่ทำงานก่อน <a href="/settings/workspace">สร้างพื้นที่ทำงาน →</a>
        </p>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {REVIEW_QUEUE_TABS.map((t) => {
              const activeTab = (filter ?? undefined) === t.status;
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyFilter(t.status)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: 999,
                    border: `1px solid ${activeTab ? C.warn : C.border}`,
                    background: activeTab ? C.warn : '#fff',
                    color: activeTab ? '#fff' : '#333',
                    fontWeight: activeTab ? 700 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {reviews.length === 0 ? (
            (() => {
              const empty = reviewQueueEmptyThai(filter);
              return (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: '1.5rem',
                    textAlign: 'center',
                    color: C.muted,
                  }}
                >
                  <p style={{ margin: '0 0 0.3rem', fontWeight: 600, color: '#333' }}>
                    {empty.title}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{empty.hint}</p>
                </div>
              );
            })()
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {reviews.map((r) => {
                const pending = r.status === 'PENDING';
                return (
                  <a
                    key={r.id}
                    href={`/settings/reviews/${r.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      textDecoration: 'none',
                      color: 'inherit',
                      border: `1px solid ${pending ? '#f0d58c' : C.border}`,
                      background: pending ? '#fff8e1' : '#fff',
                      borderRadius: 8,
                      padding: '0.75rem 0.9rem',
                    }}
                  >
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <span
                          style={{
                            background: statusColor(r.status),
                            color: '#fff',
                            borderRadius: 999,
                            padding: '0.05rem 0.55rem',
                            fontSize: '0.78rem',
                          }}
                        >
                          {reviewStatusThai(r.status)}
                        </span>
                        {r.editedContent ? (
                          <span style={{ fontSize: '0.78rem', color: C.muted }}>· แก้ไขแล้ว</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: C.muted, marginTop: 4 }}>
                        เข้ามาเมื่อ {new Date(r.createdAt).toLocaleString('th-TH')}
                      </div>
                    </div>
                    <span
                      style={{
                        background: pending ? C.warn : '#fff',
                        color: pending ? '#fff' : C.warn,
                        border: `1px solid ${C.warn}`,
                        borderRadius: 6,
                        padding: '0.4rem 0.9rem',
                        fontSize: '0.95rem',
                        fontWeight: pending ? 700 : 400,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {REVIEW_QUEUE_CTA}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
