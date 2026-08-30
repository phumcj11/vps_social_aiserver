'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../lib/api';

/**
 * Authenticated navigation (M10B — owner-first).
 *
 * Customers see a small, Thai, task-focused set of links plus a pending-review
 * badge. Operator-only tooling (Facebook / Groups / Collector / Opportunities /
 * AI Drafts / Actions / Operations) is shown ONLY to KMKT operators
 * (user.isOperator, from the OPERATIONS_OPERATOR_EMAILS allowlist). The operator
 * API routes are already 403-protected server-side; hiding the links keeps the
 * customer surface clean. The pending count reuses the tenant-scoped /reviews
 * query — no polling, fetched once on mount.
 */
export function Nav({ email }: { email?: string }) {
  const router = useRouter();
  const [isOperator, setIsOperator] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (active) setIsOperator(me.user.isOperator === true);
      } catch {
        /* not signed in / no session — leave defaults */
      }
      const count = await api.pendingReviewCount();
      if (active) setPending(count);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err;
    }
    router.push('/login');
  }

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        paddingBottom: '1rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid #ddd',
        flexWrap: 'wrap',
      }}
    >
      {/* Owner-facing (Thai-first) */}
      <a href="/dashboard">หน้าหลัก</a>
      <a href="/settings/businesses">ธุรกิจของฉัน</a>
      <a href="/settings/businesses/matches">ผลการจับคู่</a>
      <a href="/settings/reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        รายการรอตรวจสอบ
        {pending > 0 && (
          <span
            aria-label={`มี ${pending} รายการที่รอตรวจสอบ`}
            style={{
              background: '#b00020',
              color: '#fff',
              borderRadius: 999,
              padding: '0.05rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              minWidth: 20,
              textAlign: 'center',
            }}
          >
            {pending}
          </span>
        )}
      </a>
      <a href="/settings/workspace">ตั้งค่า</a>

      {/* Operator / advanced — only for KMKT operators */}
      {isOperator && (
        <>
          <span style={{ color: '#bbb' }}>|</span>
          <a href="/settings/facebook">Facebook</a>
          <a href="/settings/facebook/groups">Groups</a>
          <a href="/settings/collector">Collector</a>
          <a href="/settings/opportunities">Opportunities</a>
          <a href="/settings/ai-drafts">AI Drafts</a>
          <a href="/settings/actions">Actions</a>
          <a href="/settings/operations">Operations</a>
        </>
      )}

      <span style={{ marginLeft: 'auto', color: '#666' }}>{email ?? ''}</span>
      <button type="button" onClick={handleLogout}>
        ออกจากระบบ
      </button>
    </nav>
  );
}
