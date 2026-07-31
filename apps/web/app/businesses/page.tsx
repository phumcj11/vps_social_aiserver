'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type Business } from '../../lib/api';
import { Nav } from '../../components/Nav';

export default function BusinessesPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const res = await api.listBusinesses();
      setBusinesses(res.businesses);
      setNeedsWorkspace(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'workspace_required') {
        setNeedsWorkspace(true);
      } else if (!(err instanceof ApiRequestError)) {
        throw err;
      }
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (!active) return;
        setEmail(me.user.email);
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length === 0 || category.trim().length === 0) {
      setError('Business name and category are required.');
      return;
    }
    setCreating(true);
    try {
      await api.createBusiness(name.trim(), category.trim());
      setName('');
      setCategory('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create business.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 640 }}>
      <Nav email={email} />
      <h1>Businesses</h1>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : (
        <>
          <section style={{ marginBottom: '1.5rem' }}>
            <h2>Create a business</h2>
            <form onSubmit={onCreate}>
              <input
                type="text"
                placeholder="Business name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ padding: '0.5rem', marginRight: '0.5rem' }}
              />
              <input
                type="text"
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ padding: '0.5rem', marginRight: '0.5rem' }}
              />
              <button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </form>
            {error && <p style={{ color: '#b00020' }}>{error}</p>}
          </section>

          <section>
            <h2>Your businesses</h2>
            {businesses.length === 0 ? (
              <p>No businesses yet. Create your first one above.</p>
            ) : (
              <ul>
                {businesses.map((b) => (
                  <li key={b.id} style={{ marginBottom: '0.5rem' }}>
                    <a href={`/businesses/${b.id}`}>
                      <strong>{b.name}</strong>
                    </a>{' '}
                    <span style={{ color: '#666' }}>
                      ({b.status}) — {b.slug}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
