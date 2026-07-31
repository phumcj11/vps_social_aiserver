'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiRequestError, type ActionJob, type ActionEvent } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

const NOTICE = 'This action has not been executed on Facebook.';

interface ReviewRef {
  id: string;
  status: string;
  draftId: string;
}
interface MatchRef {
  id: string;
  decision: string;
  businessId: string;
}

function statusColor(s: string): string {
  if (s === 'succeeded') return '#0a7d28';
  if (s === 'failed' || s === 'cancelled') return '#b00020';
  if (s === 'blocked') return '#b26a00';
  return '#555';
}

export default function ActionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [action, setAction] = useState<ActionJob | null>(null);
  const [review, setReview] = useState<ReviewRef | null>(null);
  const [match, setMatch] = useState<MatchRef | null>(null);
  const [policyReasons, setPolicyReasons] = useState<{ code: string; detail: string }[]>([]);
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.getAction(id);
    setAction(res.action);
    setReview(res.review);
    setMatch(res.match);
    setPolicyReasons(res.policyReasons);
    setEvents(res.events);
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
  if (!action) return <main>Not found.</main>;

  const terminal = action.status === 'succeeded' || action.status === 'cancelled';

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <p>
        <a href="/settings/actions">← Action Queue</a>
      </p>
      <h1>Action Job</h1>
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
          Type {action.actionType} · Platform {action.targetPlatform} · Status{' '}
          <strong style={{ color: statusColor(action.status) }}>{action.status}</strong> · Attempts{' '}
          {action.attemptCount}/{action.maxAttempts}
          {action.lastErrorCode && <> · Last error: {action.lastErrorCode}</>}
        </p>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            disabled={busy || terminal}
            onClick={() => act(() => api.cancelAction(id))}
          >
            Cancel
          </button>
          {action.status === 'failed' && (
            <button type="button" disabled={busy} onClick={() => act(() => api.retryAction(id))}>
              Retry
            </button>
          )}
          {action.status === 'blocked' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.recheckActionPolicy(id))}
            >
              Recheck Policy
            </button>
          )}
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Approved content</h2>
        <blockquote
          style={{
            borderLeft: '3px solid #ccc',
            margin: '0.5rem 0',
            padding: '0.25rem 0.75rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {action.approvedContent}
        </blockquote>
        <p>
          Target URL:{' '}
          <a href={action.targetUrl} target="_blank" rel="noopener noreferrer">
            {action.targetUrl}
          </a>
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Policy result</h2>
        {policyReasons.length === 0 ? (
          <p>No policy reasons recorded.</p>
        ) : (
          <ul>
            {policyReasons.map((r, i) => (
              <li key={i} style={{ color: '#b26a00' }}>
                {r.code}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Source</h2>
        <ul>
          <li>
            Review Task:{' '}
            {review ? (
              <a href={`/settings/reviews/${review.id}`}>{review.status}</a>
            ) : (
              '(unavailable)'
            )}
          </li>
          <li>AI Draft: {action.aiDraftId}</li>
          <li>
            Business Match:{' '}
            {match ? (
              <a href={`/settings/business-matches/${match.id}`}>{match.decision}</a>
            ) : (
              '(unavailable)'
            )}
          </li>
        </ul>
      </section>

      <section>
        <h2>Status history</h2>
        {events.length === 0 ? (
          <p>No events.</p>
        ) : (
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.event}</strong> — {new Date(e.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
