'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiRequestError, type AiDraft, type AiDraftEvent } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

const DRAFT_NOTICE = 'This is an AI-assisted draft. It has not been sent to Facebook.';

interface MatchSummary {
  id: string;
  decision: string;
  reasons: { ruleType: string; ruleValue: string; matched: boolean }[];
  matcherVersion: string;
}
interface OppSummary {
  id: string;
  decision: string;
  status: string;
}
interface BizSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface ContextView {
  business?: { name?: string; category?: string | null; serviceArea?: string | null };
  signal?: { message?: string | null; sourceUrl?: string };
  matchingReasons?: { ruleType: string; ruleValue: string; matched: boolean }[];
}

function policyColor(decision?: string): string {
  if (decision === 'PASS') return '#0a7d28';
  if (decision === 'NEEDS_REVIEW') return '#b26a00';
  return '#b00020';
}

export default function AiDraftDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [events, setEvents] = useState<AiDraftEvent[]>([]);
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [opportunity, setOpportunity] = useState<OppSummary | null>(null);
  const [business, setBusiness] = useState<BizSummary | null>(null);
  const [versions, setVersions] = useState<{ id: string; version: number; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

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
        const res = await api.getAiDraft(id);
        if (!active) return;
        setDraft(res.draft);
        setEvents(res.events);
        setMatch(res.match);
        setOpportunity(res.opportunity);
        setBusiness(res.business);
        const hist = await api.listAiDraftsForMatch(res.draft.businessMatchId);
        if (active)
          setVersions(hist.drafts.map((d) => ({ id: d.id, version: d.version, status: d.status })));
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          router.push('/settings/ai-drafts');
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

  if (loading) return <main>Loading…</main>;
  if (!draft) return <main>Not found.</main>;

  const ctx = (draft.context ?? {}) as ContextView;

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <p>
        <a href={`/settings/business-matches/${draft.businessMatchId}`}>← Business Match</a>
      </p>
      <h1>AI Draft · v{draft.version}</h1>
      <p
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d58c',
          padding: '0.5rem 0.75rem',
          borderRadius: 4,
          color: '#5c4500',
        }}
      >
        {DRAFT_NOTICE}
      </p>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Draft</h2>
        <p style={{ color: '#666' }}>
          Status <strong>{draft.status}</strong> · Provider {draft.provider} · Model {draft.model} ·
          Prompt {draft.promptVersion} · Policy{' '}
          <strong style={{ color: policyColor(draft.policyResult?.decision) }}>
            {draft.policyResult?.decision ?? '—'}
          </strong>
        </p>
        <blockquote
          style={{
            borderLeft: '3px solid #ccc',
            margin: '0.5rem 0',
            padding: '0.25rem 0.75rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {draft.content ?? '(no content — see policy result)'}
        </blockquote>
      </section>

      {draft.policyResult && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2>Policy result</h2>
          <p style={{ color: policyColor(draft.policyResult.decision) }}>
            {draft.policyResult.decision}
          </p>
          {draft.policyResult.reasons.length > 0 && (
            <ul>
              {draft.policyResult.reasons.map((r, i) => (
                <li key={i}>
                  {r.code}: {r.detail}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Business context</h2>
        <ul>
          <li>Business: {business?.name ?? ctx.business?.name ?? '(unknown)'}</li>
          <li>Category: {ctx.business?.category ?? '(none)'}</li>
          <li>Service area: {ctx.business?.serviceArea ?? '(none)'}</li>
        </ul>
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
        <p>Source message: {ctx.signal?.message ?? '(none)'}</p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Matching reasons</h2>
        {match && match.reasons.length > 0 ? (
          <ul>
            {match.reasons.map((r, i) => (
              <li key={i} style={{ color: r.matched ? '#0a7d28' : '#b00020' }}>
                {r.matched ? '✓' : '✗'} {r.ruleType}: {r.ruleValue}
              </li>
            ))}
          </ul>
        ) : (
          <p>(none)</p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Previous versions</h2>
        <ul>
          {versions
            .slice()
            .reverse()
            .map((v) => (
              <li key={v.id}>
                {v.id === draft.id ? (
                  <strong>v{v.version} (this)</strong>
                ) : (
                  <a href={`/settings/ai-drafts/${v.id}`}>v{v.version}</a>
                )}{' '}
                — {v.status}
              </li>
            ))}
        </ul>
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
