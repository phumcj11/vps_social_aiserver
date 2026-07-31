'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type User, type Workspace } from '../../lib/api';
import { Nav } from '../../components/Nav';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
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
        // 404 → no workspace yet (empty state). Anything else: leave null.
        if (!(err instanceof ApiRequestError)) throw err;
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) return <main>Loading…</main>;

  return (
    <main>
      <Nav email={user?.email} />
      <h1>Dashboard</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Workspace</h2>
        {workspace ? (
          <>
            <ul>
              <li>
                Name: <strong>{workspace.name}</strong>
              </li>
              <li>Status: {workspace.status}</li>
              <li>Slug: {workspace.slug}</li>
            </ul>
            <p>
              <a href="/businesses">Manage businesses →</a>
            </p>
          </>
        ) : (
          <div>
            <p>You have not created a workspace yet.</p>
            <button type="button" onClick={() => router.push('/settings/workspace')}>
              Create workspace
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
