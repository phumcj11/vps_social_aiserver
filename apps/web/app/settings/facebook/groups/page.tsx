'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type FacebookGroup,
  type AssignedBusiness,
  type Business,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

function accessColor(state: string): string {
  if (state === 'accessible') return '#0a7d28';
  if (state === 'validating' || state === 'unknown') return '#8a6d00';
  return '#b00020';
}

export default function FacebookGroupsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [sessionOk, setSessionOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<AssignedBusiness[]>([]);
  const [assignBusinessId, setAssignBusinessId] = useState('');

  async function refresh() {
    try {
      const [g, b] = await Promise.all([api.listGroups(), api.listBusinesses()]);
      setGroups(g.groups);
      setBusinesses(b.businesses);
      setNeedsWorkspace(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'workspace_required')
        setNeedsWorkspace(true);
      else if (!(err instanceof ApiRequestError)) throw err;
    }
    try {
      const acc = await api.getFacebookAccount();
      setSessionOk(acc.account.connectionState === 'connected');
    } catch {
      setSessionOk(false);
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

  async function loadAssigned(groupId: string) {
    setSelected(groupId);
    const res = await api.listGroupBusinesses(groupId);
    setAssigned(res.businesses);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (url.trim().length === 0) {
      setError('A Facebook Group URL is required.');
      return;
    }
    try {
      await api.addGroup(url.trim());
      setUrl('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add group.');
    }
  }

  async function onValidate(id: string) {
    setError(null);
    try {
      await api.validateGroup(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Validation failed.');
    }
  }

  async function onStatus(id: string, status: string) {
    await api.setGroupStatus(id, status);
    await refresh();
  }

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !assignBusinessId) return;
    setError(null);
    try {
      await api.assignGroupBusiness(selected, assignBusinessId);
      setAssignBusinessId('');
      await loadAssigned(selected);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not assign.');
    }
  }

  async function onUnassign(businessId: string) {
    if (!selected) return;
    await api.unassignGroupBusiness(selected, businessId);
    await loadAssigned(selected);
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 800 }}>
      <Nav email={email} />
      <h1>Facebook Groups</h1>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          {!sessionOk && (
            <p style={{ color: '#b00020' }}>
              Your Facebook session is not connected.{' '}
              <a href="/settings/facebook">Connect / reconnect →</a> Validation requires a connected
              session.
            </p>
          )}

          <section style={{ marginBottom: '1.5rem' }}>
            <h2>Add a Group</h2>
            <form onSubmit={onAdd}>
              <input
                type="text"
                placeholder="https://www.facebook.com/groups/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ padding: '0.5rem', width: '60%', marginRight: '0.5rem' }}
              />
              <button type="submit">Add Group</button>
            </form>
            {error && <p style={{ color: '#b00020' }}>{error}</p>}
          </section>

          <section>
            <h2>Your Groups</h2>
            {groups.length === 0 ? (
              <p>No groups yet.</p>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th>Name / URL</th>
                    <th>Status</th>
                    <th>Access</th>
                    <th>Last validated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} style={{ borderTop: '1px solid #eee' }}>
                      <td>
                        <div>{g.name ?? '(name unknown)'}</div>
                        <a href={g.canonicalUrl} target="_blank" rel="noopener noreferrer">
                          {g.canonicalUrl}
                        </a>
                      </td>
                      <td>{g.status}</td>
                      <td style={{ color: accessColor(g.accessState) }}>{g.accessState}</td>
                      <td>{g.lastValidatedAt ?? '(never)'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => onValidate(g.id)}>
                          Validate
                        </button>{' '}
                        <button type="button" onClick={() => loadAssigned(g.id)}>
                          Businesses
                        </button>{' '}
                        {g.status !== 'disabled' ? (
                          <button type="button" onClick={() => onStatus(g.id, 'disabled')}>
                            Disable
                          </button>
                        ) : (
                          <button type="button" onClick={() => onStatus(g.id, 'active')}>
                            Enable
                          </button>
                        )}{' '}
                        {g.status !== 'archived' && (
                          <button type="button" onClick={() => onStatus(g.id, 'archived')}>
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {selected && (
            <section
              style={{ marginTop: '1.5rem', borderTop: '2px solid #ddd', paddingTop: '1rem' }}
            >
              <h2>Assigned Businesses</h2>
              {assigned.length === 0 ? (
                <p>No businesses assigned to this group.</p>
              ) : (
                <ul>
                  {assigned.map((b) => (
                    <li key={b.id}>
                      {b.name}{' '}
                      <button type="button" onClick={() => onUnassign(b.id)}>
                        Unassign
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={onAssign}>
                <select
                  value={assignBusinessId}
                  onChange={(e) => setAssignBusinessId(e.target.value)}
                  style={{ padding: '0.5rem', marginRight: '0.5rem' }}
                >
                  <option value="">Select a business…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={!assignBusinessId}>
                  Assign Business
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
