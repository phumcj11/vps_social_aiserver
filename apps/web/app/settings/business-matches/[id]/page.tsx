'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type BusinessMatch,
  type Opportunity,
  type AiDraft,
  type AiDraftSummary,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

interface MatchBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const DRAFT_NOTICE = 'This is an AI-assisted draft. It has not been sent to Facebook.';

function policyColor(decision?: string): string {
  if (decision === 'PASS') return '#0a7d28';
  if (decision === 'NEEDS_REVIEW') return '#b26a00';
  return '#b00020';
}

export default function BusinessMatchDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [match, setMatch] = useState<BusinessMatch | null>(null);
  const [business, setBusiness] = useState<MatchBusiness | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [current, setCurrent] = useState<AiDraft | null>(null);
  const [versions, setVersions] = useState<AiDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDrafts() {
    const res = await api.listAiDraftsForMatch(id);
    setVersions(res.drafts);
    // The list is ascending by version; the latest is the highest version.
    const latest = res.drafts.length ? res.drafts[res.drafts.length - 1] : null;
    if (latest) {
      const full = await api.getAiDraft(latest.id);
      setCurrent(full.draft);
    } else {
      setCurrent(null);
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
      try {
        const res = await api.getBusinessMatch(id);
        if (!active) return;
        setMatch(res.match);
        setBusiness(res.business);
        setOpportunity(res.opportunity);
        await loadDrafts();
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

  async function onGenerate() {
    setError(null);
    setBusy(true);
    try {
      await api.generateAiDraft(id);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not generate a draft.');
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerate() {
    if (!current) return;
    setBusy(true);
    try {
      await api.regenerateAiDraft(current.id);
      await loadDrafts();
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!current) return;
    setBusy(true);
    try {
      await api.rejectAiDraft(current.id);
      await loadDrafts();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (!match) return <main>Not found.</main>;

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      {opportunity && (
        <p>
          <a href={`/settings/opportunities/${opportunity.id}`}>← Opportunity</a>
        </p>
      )}
      <h1>Business Match</h1>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Decision</h2>
        <p>
          Business: <strong>{business ? business.name : match.businessId}</strong> · Decision:{' '}
          <strong style={{ color: match.decision === 'MATCH' ? '#0a7d28' : '#b00020' }}>
            {match.decision}
          </strong>{' '}
          · Matcher: {match.matcherVersion}
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Reasons</h2>
        {match.reasons.length === 0 ? (
          <p>No active rules for this business (NO_MATCH).</p>
        ) : (
          <ul>
            {match.reasons.map((r, i) => (
              <li key={i} style={{ color: r.matched ? '#0a7d28' : '#b00020' }}>
                {r.matched ? '✓' : '✗'} {r.ruleType}: {r.ruleValue}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>AI Draft</h2>
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
        {error && <p style={{ color: '#b00020' }}>{error}</p>}

        {match.decision !== 'MATCH' ? (
          <p>Drafts can only be generated for a MATCH.</p>
        ) : !current ? (
          <>
            <p>No draft yet.</p>
            <button type="button" disabled={busy} onClick={onGenerate}>
              {busy ? 'Generating…' : 'Generate Draft'}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#666' }}>
              Version {current.version} · Status <strong>{current.status}</strong> · Provider{' '}
              {current.provider} · Model {current.model} · Prompt {current.promptVersion} · Policy{' '}
              <strong style={{ color: policyColor(current.policyResult?.decision) }}>
                {current.policyResult?.decision ?? '—'}
              </strong>{' '}
              · {new Date(current.createdAt).toLocaleString()}
            </p>
            <blockquote
              style={{
                borderLeft: '3px solid #ccc',
                margin: '0.5rem 0',
                padding: '0.25rem 0.75rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {current.content ?? '(no content — see policy result)'}
            </blockquote>
            {current.policyResult && current.policyResult.reasons.length > 0 && (
              <ul>
                {current.policyResult.reasons.map((r, i) => (
                  <li key={i} style={{ color: policyColor(current.policyResult?.decision) }}>
                    {r.code}: {r.detail}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" disabled={busy} onClick={onRegenerate}>
                {busy ? 'Working…' : 'Regenerate'}
              </button>
              <button
                type="button"
                disabled={busy || current.status === 'rejected'}
                onClick={onReject}
              >
                Reject
              </button>
              <a href={`/settings/ai-drafts/${current.id}`}>Open full draft →</a>
            </div>

            <h3>Version history</h3>
            <ul>
              {versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.id}>
                    <a href={`/settings/ai-drafts/${v.id}`}>v{v.version}</a> — {v.status} ·{' '}
                    {v.policyResult?.decision ?? '—'}
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
