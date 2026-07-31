'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type ReviewTask,
  type ReviewEvent,
  type ReviewPresentation,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

interface DraftView {
  id: string;
  version: number;
  status: string;
  content: string | null;
}
interface BizView {
  id: string;
  name: string;
  slug: string;
  status: string;
}
interface OppView {
  id: string;
  decision: string;
  status: string;
}

function statusColor(s: string): string {
  if (s === 'APPROVED') return '#0a7d28';
  if (s === 'REJECTED') return '#b00020';
  if (s === 'EXPIRED') return '#777';
  return '#b26a00';
}

export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [review, setReview] = useState<ReviewTask | null>(null);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [business, setBusiness] = useState<BizView | null>(null);
  const [opportunity, setOpportunity] = useState<OppView | null>(null);
  const [presentation, setPresentation] = useState<ReviewPresentation | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.getReview(id);
    setReview(res.review);
    setDraft(res.draft);
    setBusiness(res.business);
    setOpportunity(res.opportunity);
    setPresentation(res.presentation);
    setEvents(res.events);
    setEditText(res.review.editedContent ?? res.draft?.content ?? '');
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
          router.push('/settings/reviews');
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
  if (!review) return <main>Not found.</main>;

  const pending = review.status === 'PENDING';

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <p>
        <a href="/settings/reviews">← Review Queue</a>
      </p>
      <h1>Review</h1>
      <p
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d58c',
          padding: '0.5rem 0.75rem',
          borderRadius: 4,
          color: '#5c4500',
        }}
      >
        This is a human review of an AI-assisted draft. A decision is recorded here only — nothing
        is posted to Facebook.
      </p>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Decision</h2>
        <p>
          Status: <strong style={{ color: statusColor(review.status) }}>{review.status}</strong>
          {review.decidedBy && <> · Decided by {review.decidedBy}</>}
          {review.decisionReason && <> · Reason: {review.decisionReason}</>}
        </p>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {pending ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={busy} onClick={() => act(() => api.approveReview(id))}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => act(() => api.rejectReview(id))}>
              Reject
            </button>
          </div>
        ) : (
          <p style={{ color: '#666' }}>This review is closed.</p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Business</h2>
        <p>
          {business ? (
            <a href={`/businesses/${business.id}`}>{business.name}</a>
          ) : (
            (presentation?.business.name ?? '(unknown)')
          )}
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Opportunity</h2>
        <p>
          {opportunity ? (
            <>
              Decision {opportunity.decision} · Status {opportunity.status}
            </>
          ) : (
            '(unavailable)'
          )}
        </p>
        <p>Post: {presentation?.opportunity.message ?? '(none)'}</p>
        {presentation?.links.facebookPostUrl && (
          <p>
            <a href={presentation.links.facebookPostUrl} target="_blank" rel="noopener noreferrer">
              Open Facebook Post →
            </a>
          </p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Draft</h2>
        {draft ? (
          <blockquote
            style={{
              borderLeft: '3px solid #ccc',
              margin: '0.5rem 0',
              padding: '0.25rem 0.75rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {draft.content ?? '(no content)'}
          </blockquote>
        ) : (
          <p>(draft unavailable)</p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Edited Draft</h2>
        {review.editedContent ? (
          <blockquote
            style={{
              borderLeft: '3px solid #0a7d28',
              margin: '0.5rem 0',
              padding: '0.25rem 0.75rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {review.editedContent}
          </blockquote>
        ) : (
          <p style={{ color: '#666' }}>No edit yet.</p>
        )}
        {pending && (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              style={{ width: '100%' }}
            />
            <button
              type="button"
              disabled={busy || editText.trim().length === 0}
              onClick={() => act(() => api.editReview(id, editText))}
            >
              Save edit (still needs approval)
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Decision History</h2>
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
