'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type Opportunity,
  type OpportunityStatistics,
} from '../../../lib/api';
import { Nav } from '../../../components/Nav';

function decisionColor(d: string): string {
  return d === 'ACCEPT' ? '#0a7d28' : '#b00020';
}

export default function OpportunitiesDashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [stats, setStats] = useState<OpportunityStatistics | null>(null);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ status?: string; decision?: string }>({});

  async function refresh(f: { status?: string; decision?: string } = filter) {
    try {
      const [s, l] = await Promise.all([api.getOpportunityStatistics(), api.listOpportunities(f)]);
      setStats(s.statistics);
      setItems(l.opportunities);
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
      await refresh({});
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function onClassify() {
    setError(null);
    setBusy(true);
    try {
      await api.classifyOpportunities();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not classify.');
    } finally {
      setBusy(false);
    }
  }

  async function applyFilter(f: { status?: string; decision?: string }) {
    setFilter(f);
    await refresh(f);
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 820 }}>
      <Nav email={email} />
      <h1>Opportunities</h1>
      <p style={{ color: '#666' }}>
        Deterministic classification of Signals — no AI, no business matching. An Opportunity simply
        means &ldquo;this Signal deserves further processing&rdquo;.
      </p>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          <section style={{ marginBottom: '1.5rem' }}>
            <h2>Statistics</h2>
            {stats && (
              <ul>
                <li>
                  Accepted: <strong style={{ color: '#0a7d28' }}>{stats.accepted}</strong> ·
                  Rejected: <strong style={{ color: '#b00020' }}>{stats.rejected}</strong>
                </li>
                <li>
                  Ready: <strong>{stats.ready}</strong> · Archived:{' '}
                  <strong>{stats.archived}</strong> · New: {stats.new}
                </li>
                <li>Total opportunities: {stats.total}</li>
                <li>Unclassified Signals: {stats.unclassifiedSignals}</li>
              </ul>
            )}
            {error && <p style={{ color: '#b00020' }}>{error}</p>}
            <button type="button" disabled={busy} onClick={onClassify}>
              {busy ? 'Classifying…' : 'Classify NEW Signals'}
            </button>
          </section>

          <section>
            <h2>Opportunities</h2>
            <div
              style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
            >
              <button type="button" onClick={() => applyFilter({})}>
                All
              </button>
              <button type="button" onClick={() => applyFilter({ decision: 'ACCEPT' })}>
                Accepted
              </button>
              <button type="button" onClick={() => applyFilter({ decision: 'REJECT' })}>
                Rejected
              </button>
              <button type="button" onClick={() => applyFilter({ status: 'READY' })}>
                Ready
              </button>
              <button type="button" onClick={() => applyFilter({ status: 'ARCHIVED' })}>
                Archived
              </button>
            </div>
            {items.length === 0 ? (
              <p>No opportunities.</p>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th>Decision</th>
                    <th>Status</th>
                    <th>Classifier</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={o.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ color: decisionColor(o.decision) }}>{o.decision}</td>
                      <td>{o.status}</td>
                      <td>{o.classifierVersion}</td>
                      <td>{new Date(o.createdAt).toLocaleString()}</td>
                      <td>
                        <a href={`/settings/opportunities/${o.id}`}>Open</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
