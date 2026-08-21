'use client';

import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../lib/api';

/**
 * Simple authenticated navigation: Dashboard, Workspace Settings, Logout.
 * Rendered on protected pages only.
 */
export function Nav({ email }: { email?: string }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await api.logout();
    } catch (err) {
      // Logout is idempotent server-side; ignore expected auth errors.
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
      <a href="/settings/reviews">รายการรอตรวจ</a>
      {/* Operator / advanced */}
      <a href="/settings/facebook">Facebook</a>
      <a href="/settings/facebook/groups">Groups</a>
      <a href="/settings/collector">Collector</a>
      <a href="/settings/opportunities">Opportunities</a>
      <a href="/settings/ai-drafts">AI Drafts</a>
      <a href="/settings/actions">Actions</a>
      <a href="/settings/operations">Operations</a>
      <a href="/settings/workspace">ตั้งค่า Workspace</a>
      <span style={{ marginLeft: 'auto', color: '#666' }}>{email ?? ''}</span>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </nav>
  );
}
