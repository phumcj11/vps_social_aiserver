'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type User, type Workspace } from '../../lib/api';
import { Nav } from '../../components/Nav';

const C = {
  ok: '#0a7d28',
  warn: '#b26a00',
  warnBg: '#fff8e1',
  warnBorder: '#f0d58c',
  muted: '#666',
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (!active) return;
        setUser(me.user);
      } catch {
        router.push('/login');
        return;
      }
      try {
        const ws = await api.getWorkspace();
        if (active) setWorkspace(ws.workspace);
      } catch (err) {
        if (!(err instanceof ApiRequestError)) throw err;
      }
      const count = await api.pendingReviewCount();
      if (active) {
        setPending(count);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) return <main style={{ padding: '1rem' }}>กำลังโหลด…</main>;

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '0 0.75rem' }}>
      <Nav email={user?.email} />
      <h1 style={{ margin: '0.2rem 0' }}>หน้าหลัก</h1>

      {!workspace ? (
        <section style={{ marginTop: '1rem' }}>
          <p>คุณยังไม่ได้สร้างพื้นที่ทำงาน</p>
          <button type="button" onClick={() => router.push('/settings/workspace')}>
            สร้างพื้นที่ทำงาน
          </button>
        </section>
      ) : (
        <>
          {/* Daily-operation card — the first question: are there Leads to handle? */}
          <section
            style={{
              marginTop: '1rem',
              border: `1px solid ${pending > 0 ? C.warnBorder : '#e2e2e2'}`,
              background: pending > 0 ? C.warnBg : '#fff',
              borderRadius: 10,
              padding: '1rem 1.1rem',
            }}
          >
            {pending > 0 ? (
              <>
                <div style={{ fontSize: '0.95rem', color: '#5c4500' }}>รอตรวจสอบ</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.15rem 0 0.6rem' }}>
                  {pending} รายการ
                </div>
                <a
                  href="/settings/reviews?status=PENDING"
                  style={{
                    display: 'inline-block',
                    background: C.warn,
                    color: '#fff',
                    borderRadius: 6,
                    padding: '0.5rem 1.1rem',
                    fontSize: '1rem',
                    textDecoration: 'none',
                    fontWeight: 700,
                  }}
                >
                  ตรวจสอบ Lead
                </a>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>ไม่มี Lead ที่รอตรวจสอบ</div>
                <p style={{ margin: '0.3rem 0 0', color: C.muted, fontSize: '0.9rem' }}>
                  เมื่อระบบพบลูกค้าที่เกี่ยวข้อง รายการจะปรากฏที่นี่
                </p>
              </>
            )}
          </section>

          <section style={{ marginTop: '1.25rem' }}>
            <p style={{ margin: '0 0 0.5rem' }}>
              ธุรกิจของคุณ: <strong>{workspace.name}</strong>
            </p>
            <a href="/settings/businesses">จัดการธุรกิจ →</a>
          </section>
        </>
      )}
    </main>
  );
}
