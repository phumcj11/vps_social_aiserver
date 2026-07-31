'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type ReviewTask } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

function statusColor(s: string): string {
  if (s === 'APPROVED') return '#0a7d28';
  if (s === 'REJECTED') return '#b00020';
  if (s === 'EXPIRED') return '#777';
  return '#b26a00';
}

export default function ReviewQueuePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [reviews, setReviews] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [filter, setFilter] = useState<string | undefined>();

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
    <main style={{ maxWidth: 860 }}>
      <Nav email={email} />
      <h1>Review Queue</h1>
      <p style={{ color: '#666' }}>
        Human review of AI drafts. A decision is recorded here only — nothing is posted to Facebook.
      </p>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          <div
            style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          >
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].map((s) => (
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
          {reviews.length === 0 ? (
            <p>No review tasks. Enqueue a draft from the AI Drafts page.</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Edited?</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ color: statusColor(r.status) }}>{r.status}</td>
                    <td>{r.assignedTo ?? '—'}</td>
                    <td>{r.editedContent ? 'yes' : 'no'}</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <a href={`/settings/reviews/${r.id}`}>Open</a>
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
