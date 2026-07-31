'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type CollectorStatus,
  type CollectorRunSummary,
} from '../../../lib/api';
import { Nav } from '../../../components/Nav';

function statusColor(status: string): string {
  if (status === 'completed') return '#0a7d28';
  if (status === 'running') return '#8a6d00';
  if (status === 'failed') return '#b00020';
  return '#666';
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function CollectorDashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [status, setStatus] = useState<CollectorStatus | null>(null);
  const [runs, setRuns] = useState<CollectorRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [s, r] = await Promise.all([api.getCollectorStatus(), api.listCollectorRuns()]);
      setStatus(s);
      setRuns(r.runs);
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

  // Poll while a run is in progress.
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [status?.running]);

  async function onStart() {
    setError(null);
    setBusy(true);
    try {
      await api.startCollector();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start collector.');
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setError(null);
    setBusy(true);
    try {
      await api.stopCollector();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not stop collector.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;

  const run = status?.run ?? null;

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <h1>Collector</h1>
      <p style={{ color: '#666' }}>
        Read-only data collection. The Collector opens your Facebook Groups, reads posts, and stores
        them as Signals. It never comments, messages, likes, shares, joins, or writes.
      </p>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          <section style={{ marginBottom: '1.5rem' }}>
            <h2>Current status</h2>
            {run ? (
              <ul>
                <li>
                  Status:{' '}
                  <strong style={{ color: statusColor(run.status) }}>
                    {run.status}
                    {status?.running ? ' (running)' : ''}
                  </strong>
                </li>
                <li>Groups processed: {run.groupsProcessed}</li>
                <li>
                  Collected this run: {run.postsCollected} · Total Signals:{' '}
                  {status?.totalSignals ?? 0}
                </li>
                <li>Errors: {run.errors}</li>
                <li>Duration: {fmtDuration(run.durationMs)}</li>
                <li>Last scan (finished): {run.finishedAt ?? '(in progress)'}</li>
                {run.errorSummary && <li style={{ color: '#b00020' }}>Note: {run.errorSummary}</li>}
              </ul>
            ) : (
              <p>No collector run yet.</p>
            )}
          </section>

          {error && <p style={{ color: '#b00020' }}>{error}</p>}

          <section style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button type="button" disabled={busy || status?.running} onClick={onStart}>
              Start collection
            </button>
            <button type="button" disabled={busy || !status?.running} onClick={onStop}>
              Stop
            </button>
          </section>

          <section>
            <h2>Run history</h2>
            {runs.length === 0 ? (
              <p>No runs yet.</p>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Groups</th>
                    <th>Collected</th>
                    <th>Errors</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.runId} style={{ borderTop: '1px solid #eee' }}>
                      <td>{new Date(r.startedAt).toLocaleString()}</td>
                      <td style={{ color: statusColor(r.status) }}>{r.status}</td>
                      <td>{r.groupsProcessed}</td>
                      <td>{r.postsCollected}</td>
                      <td>{r.errors}</td>
                      <td>{fmtDuration(r.durationMs)}</td>
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
