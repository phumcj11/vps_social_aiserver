'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type AiDraftSummary } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

function policyColor(decision?: string): string {
  if (decision === 'PASS') return '#0a7d28';
  if (decision === 'NEEDS_REVIEW') return '#b26a00';
  return '#b00020';
}

export default function AiDraftsListPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [drafts, setDrafts] = useState<AiDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);

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
        const res = await api.listAiDrafts();
        if (active) setDrafts(res.drafts);
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'workspace_required') {
          if (active) setNeedsWorkspace(true);
        } else if (!(err instanceof ApiRequestError)) {
          throw err;
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 900 }}>
      <Nav email={email} />
      <h1>AI Drafts</h1>
      <p style={{ color: '#666' }}>
        AI-assisted comment drafts for human review. Drafts are never sent to Facebook and always
        require human approval.
      </p>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : drafts.length === 0 ? (
        <p>No drafts yet. Generate one from a Business Match.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Version</th>
              <th>Status</th>
              <th>Policy</th>
              <th>Preview</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #eee' }}>
                <td>v{d.version}</td>
                <td>{d.status}</td>
                <td style={{ color: policyColor(d.policyResult?.decision) }}>
                  {d.policyResult?.decision ?? '—'}
                </td>
                <td>{d.contentPreview ?? '(none)'}</td>
                <td>{new Date(d.createdAt).toLocaleString()}</td>
                <td>
                  <a href={`/settings/ai-drafts/${d.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
