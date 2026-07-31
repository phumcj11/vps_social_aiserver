'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type Opportunity,
  type OpportunitySignal,
  type OpportunityEvent,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

interface Reason {
  code: string;
  passed: boolean;
}

function reasonsOf(events: OpportunityEvent[]): Reason[] {
  const created = events.find(
    (e) => e.event === 'OpportunityCreated' || e.event === 'OpportunityRejected',
  );
  const raw = created?.payload?.reasons;
  return Array.isArray(raw) ? (raw as Reason[]) : [];
}

export default function OpportunityDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [signal, setSignal] = useState<OpportunitySignal | null>(null);
  const [events, setEvents] = useState<OpportunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api.getOpportunity(id);
    setOpportunity(res.opportunity);
    setSignal(res.signal);
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
          router.push('/settings/opportunities');
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

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await api.setOpportunityStatus(id, status);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (!opportunity) return <main>Not found.</main>;

  const reasons = reasonsOf(events);

  return (
    <main style={{ maxWidth: 720 }}>
      <Nav email={email} />
      <p>
        <a href="/settings/opportunities">← Opportunities</a>
      </p>
      <h1>Opportunity</h1>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Decision</h2>
        <p>
          Decision:{' '}
          <strong style={{ color: opportunity.decision === 'ACCEPT' ? '#0a7d28' : '#b00020' }}>
            {opportunity.decision}
          </strong>{' '}
          · Status: <strong>{opportunity.status}</strong> · Classifier:{' '}
          {opportunity.classifierVersion}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            disabled={busy || opportunity.status === 'READY'}
            onClick={() => setStatus('READY')}
          >
            Mark Ready
          </button>
          <button
            type="button"
            disabled={busy || opportunity.status === 'ARCHIVED'}
            onClick={() => setStatus('ARCHIVED')}
          >
            Archive
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Reasons</h2>
        {reasons.length === 0 ? (
          <p>No reasons recorded.</p>
        ) : (
          <ul>
            {reasons.map((r) => (
              <li key={r.code} style={{ color: r.passed ? '#0a7d28' : '#b00020' }}>
                {r.passed ? '✓' : '✗'} {r.code}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Signal</h2>
        {signal ? (
          <ul>
            <li>Author: {signal.authorName ?? '(unknown)'}</li>
            <li>
              URL:{' '}
              <a href={signal.postUrl} target="_blank" rel="noopener noreferrer">
                {signal.postUrl}
              </a>
            </li>
            <li>Message: {signal.message ?? '(none)'}</li>
            <li>Media: {signal.mediaUrls.length}</li>
          </ul>
        ) : (
          <p>Signal not available.</p>
        )}
      </section>

      <section>
        <h2>Events</h2>
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
