'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type ExecutionSession,
  type ExecutionEvidence,
  type ExecutionRecovery,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

const NOTICE = 'This is an execution audit record. No real Facebook comment is posted from here.';

const LIVE = new Set([
  'created',
  'preflight',
  'ready_to_submit',
  'submitting',
  'submitted',
  'verifying',
]);

function statusColor(s: string): string {
  if (s === 'verified') return '#0a7d28';
  if (s === 'failed' || s === 'cancelled') return '#b00020';
  if (
    s === 'ambiguous' ||
    s.endsWith('_required') ||
    s.endsWith('_expired') ||
    s.endsWith('_restricted')
  )
    return '#b26a00';
  return '#555';
}

export default function ExecutionSessionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [session, setSession] = useState<ExecutionSession | null>(null);
  const [evidence, setEvidence] = useState<ExecutionEvidence[]>([]);
  const [recovery, setRecovery] = useState<ExecutionRecovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.getExecutionSession(id);
    setSession(res.session);
    setEvidence(res.evidence);
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
      try {
        await load();
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          router.push('/settings/actions');
          return;
        }
        throw err;
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (!session) return <main>Not found.</main>;

  const live = LIVE.has(session.status);

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <p>
        <a href={`/settings/actions/${session.actionJobId}`}>← Action Job</a>
      </p>
      <h1>Execution Session</h1>
      <p
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d58c',
          padding: '0.5rem 0.75rem',
          borderRadius: 4,
          color: '#5c4500',
        }}
      >
        {NOTICE}
      </p>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Status</h2>
        <p>
          Attempt {session.attemptNumber} · Adapter {session.adapter} · Status{' '}
          <strong style={{ color: statusColor(session.status) }}>{session.status}</strong>
          {session.recoveryState && <> · Recovery: {session.recoveryState}</>}
          {session.errorCode && <> · Error: {session.errorCode}</>}
        </p>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            disabled={busy || !live}
            onClick={() => act(() => api.cancelExecutionSession(id))}
          >
            Cancel Session
          </button>
          <button
            type="button"
            disabled={busy || live}
            onClick={() =>
              act(async () => {
                const res = await api.recoverExecutionSession(id);
                setRecovery(res.recovery);
              })
            }
          >
            Classify Recovery
          </button>
        </div>
        {recovery && (
          <p style={{ color: '#5c4500' }}>
            Recovery: <strong>{recovery.disposition}</strong> — {recovery.reasonDetail}
            {recovery.requiresHuman && ' (human action required)'}
          </p>
        )}
      </section>

      <section>
        <h2>Evidence</h2>
        {evidence.length === 0 ? (
          <p>No evidence recorded.</p>
        ) : (
          <ul>
            {evidence.map((e) => (
              <li key={e.id}>
                <strong>{e.evidenceType}</strong>
                {e.facebookCommentId && <> · comment {e.facebookCommentId}</>}
                {e.evidenceHash && <> · hash {e.evidenceHash.slice(0, 12)}…</>}
                {' · '}
                {new Date(e.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
