'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiRequestError, type BusinessMatch, type Opportunity } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

interface MatchBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function BusinessMatchDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [match, setMatch] = useState<BusinessMatch | null>(null);
  const [business, setBusiness] = useState<MatchBusiness | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
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
        const res = await api.getBusinessMatch(id);
        if (!active) return;
        setMatch(res.match);
        setBusiness(res.business);
        setOpportunity(res.opportunity);
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

  if (loading) return <main>Loading…</main>;
  if (!match) return <main>Not found.</main>;

  return (
    <main style={{ maxWidth: 720 }}>
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

      <section>
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
    </main>
  );
}
