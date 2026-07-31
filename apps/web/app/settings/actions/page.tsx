'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type ActionJob, type ActionStatistics } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

function statusColor(s: string): string {
  if (s === 'succeeded') return '#0a7d28';
  if (s === 'failed' || s === 'cancelled') return '#b00020';
  if (s === 'blocked') return '#b26a00';
  return '#555';
}

export default function ActionQueuePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [actions, setActions] = useState<ActionJob[]>([]);
  const [stats, setStats] = useState<ActionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [filter, setFilter] = useState<string | undefined>();

  async function refresh(status?: string) {
    try {
      const res = await api.listActions(status ? { status } : {});
      setActions(res.actions);
      setStats(res.statistics);
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
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function applyFilter(status?: string) {
    setFilter(status);
    await refresh(status);
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 900 }}>
      <Nav email={email} />
      <h1>Action Queue</h1>
      <p style={{ color: '#666' }}>
        A safe boundary between approved reviews and future execution. Nothing here is executed on
        Facebook — under current safety defaults every job is <strong>blocked</strong>.
      </p>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          {stats && (
            <p>
              Queued: <strong>{stats.queued}</strong> · Blocked:{' '}
              <strong style={{ color: '#b26a00' }}>{stats.blocked}</strong> · Failed:{' '}
              <strong>{stats.failed}</strong> · Succeeded:{' '}
              <strong style={{ color: '#0a7d28' }}>{stats.succeeded}</strong> · Cancelled:{' '}
              {stats.cancelled}
            </p>
          )}
          <div
            style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          >
            {['ALL', 'queued', 'blocked', 'failed', 'succeeded', 'cancelled'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applyFilter(s === 'ALL' ? undefined : s)}
                style={{ fontWeight: (filter ?? 'ALL') === s ? 'bold' : 'normal' }}
              >
                {s}
              </button>
            ))}
          </div>
          {actions.length === 0 ? (
            <p>No action jobs. Create one from an approved review.</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th>Type</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                    <td>{a.actionType}</td>
                    <td>{a.targetPlatform}</td>
                    <td style={{ color: statusColor(a.status) }}>{a.status}</td>
                    <td>
                      {a.attemptCount}/{a.maxAttempts}
                    </td>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>
                      <a href={`/settings/actions/${a.id}`}>Open</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
