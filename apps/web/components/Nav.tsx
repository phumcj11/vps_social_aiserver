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
      }}
    >
      <a href="/dashboard">Dashboard</a>
      <a href="/businesses">Businesses</a>
      <a href="/settings/facebook">Facebook</a>
      <a href="/settings/facebook/groups">Groups</a>
      <a href="/settings/collector">Collector</a>
      <a href="/settings/workspace">Workspace Settings</a>
      <span style={{ marginLeft: 'auto', color: '#666' }}>{email ?? ''}</span>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </nav>
  );
}
