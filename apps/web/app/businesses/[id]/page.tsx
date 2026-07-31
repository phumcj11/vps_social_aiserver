'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  RULE_TYPES,
  type Business,
  type BusinessProfile,
  type Knowledge,
  type MatchingRule,
  type FacebookGroup,
} from '../../../lib/api';
import { Nav } from '../../../components/Nav';

type Tab = 'profile' | 'knowledge' | 'rules' | 'groups';

const linesToArray = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

export default function BusinessDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
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
        const res = await api.getBusiness(id);
        if (active) setBusiness(res.business);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          router.push('/businesses');
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
  if (!business) return <main>Not found.</main>;

  return (
    <main style={{ maxWidth: 720 }}>
      <Nav email={email} />
      <p>
        <a href="/businesses">← Businesses</a>
      </p>
      <h1>{business.name}</h1>
      <p style={{ color: '#666' }}>
        status: {business.status} · slug: {business.slug}
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          borderBottom: '1px solid #ddd',
          marginBottom: '1rem',
        }}
      >
        {(['profile', 'knowledge', 'rules', 'groups'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #333' : '2px solid transparent',
              padding: '0.5rem 0',
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {t === 'profile'
              ? 'Profile'
              : t === 'knowledge'
                ? 'Knowledge'
                : t === 'rules'
                  ? 'Matching Rules'
                  : 'Facebook Groups'}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab business={business} onBusinessChange={setBusiness} />}
      {tab === 'knowledge' && <KnowledgeTab businessId={id} />}
      {tab === 'rules' && <RulesTab businessId={id} />}
      {tab === 'groups' && <GroupsTab businessId={id} />}
    </main>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────

function ProfileTab({
  business,
  onBusinessChange,
}: {
  business: Business;
  onBusinessChange: (b: Business) => void;
}) {
  const [name, setName] = useState(business.name);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [form, setForm] = useState({
    category: '',
    description: '',
    sellingPoints: '',
    serviceArea: '',
    contactInformation: '',
    responseTone: '',
    prohibitedClaims: '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.getProfile(business.id);
      if (!active) return;
      setProfile(res.profile);
      setForm({
        category: res.profile.category ?? '',
        description: res.profile.description ?? '',
        sellingPoints: res.profile.sellingPoints.join('\n'),
        serviceArea: res.profile.serviceArea ?? '',
        contactInformation: res.profile.contactInformation ?? '',
        responseTone: res.profile.responseTone ?? '',
        prohibitedClaims: res.profile.prohibitedClaims.join('\n'),
      });
    })();
    return () => {
      active = false;
    };
  }, [business.id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (name.trim().length === 0) {
      setMsg({ ok: false, text: 'Business name is required.' });
      return;
    }
    if (form.category.trim().length === 0) {
      setMsg({ ok: false, text: 'Category is required.' });
      return;
    }
    setSaving(true);
    try {
      if (name.trim() !== business.name) {
        const res = await api.updateBusiness(business.id, { name: name.trim() });
        onBusinessChange(res.business);
      }
      const res = await api.updateProfile(business.id, {
        category: form.category.trim(),
        description: form.description,
        sellingPoints: linesToArray(form.sellingPoints),
        serviceArea: form.serviceArea,
        contactInformation: form.contactInformation,
        responseTone: form.responseTone,
        prohibitedClaims: linesToArray(form.prohibitedClaims),
      });
      setProfile(res.profile);
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiRequestError ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p>Loading profile…</p>;

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
      {label}
      {node}
    </label>
  );
  const inputStyle = { display: 'block', width: '100%', padding: '0.5rem' } as const;

  return (
    <form onSubmit={onSave}>
      {field(
        'Business Name',
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />,
      )}
      {field(
        'Category',
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          style={inputStyle}
        />,
      )}
      {field(
        'Description',
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          style={inputStyle}
        />,
      )}
      {field(
        'Selling Points (one per line)',
        <textarea
          value={form.sellingPoints}
          onChange={(e) => setForm({ ...form, sellingPoints: e.target.value })}
          rows={3}
          style={inputStyle}
        />,
      )}
      {field(
        'Service Area',
        <textarea
          value={form.serviceArea}
          onChange={(e) => setForm({ ...form, serviceArea: e.target.value })}
          rows={2}
          style={inputStyle}
        />,
      )}
      {field(
        'Contact Information',
        <textarea
          value={form.contactInformation}
          onChange={(e) => setForm({ ...form, contactInformation: e.target.value })}
          rows={2}
          style={inputStyle}
        />,
      )}
      {field(
        'Response Tone',
        <input
          value={form.responseTone}
          onChange={(e) => setForm({ ...form, responseTone: e.target.value })}
          style={inputStyle}
        />,
      )}
      {field(
        'Prohibited Claims (one per line)',
        <textarea
          value={form.prohibitedClaims}
          onChange={(e) => setForm({ ...form, prohibitedClaims: e.target.value })}
          rows={3}
          style={inputStyle}
        />,
      )}
      {msg && <p style={{ color: msg.ok ? '#0a7d28' : '#b00020' }}>{msg.text}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

// ── Knowledge tab ──────────────────────────────────────────────────────────

function KnowledgeTab({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setItems((await api.listKnowledge(businessId)).knowledge);
  }
  useEffect(() => {
    void refresh();
  }, [businessId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 2) {
      setError('Title must be at least 2 characters.');
      return;
    }
    try {
      await api.createKnowledge(businessId, { title: title.trim(), content });
      setTitle('');
      setContent('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add knowledge.');
    }
  }

  async function toggleStatus(k: Knowledge) {
    await api.updateKnowledge(businessId, k.id, {
      status: k.status === 'active' ? 'archived' : 'active',
    });
    await refresh();
  }
  async function remove(k: Knowledge) {
    await api.deleteKnowledge(businessId, k.id);
    await refresh();
  }

  return (
    <section>
      <p style={{ color: '#666' }}>
        Structured business information (not AI memory). AI will consume this later.
      </p>
      <form onSubmit={onCreate} style={{ marginBottom: '1rem' }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <button type="submit">Add knowledge</button>
      </form>

      {items.length === 0 ? (
        <p>No knowledge items yet.</p>
      ) : (
        <ul>
          {items.map((k) => (
            <li key={k.id} style={{ marginBottom: '0.5rem' }}>
              <strong>{k.title}</strong> <span style={{ color: '#666' }}>({k.status})</span>
              {k.content ? <div style={{ color: '#444' }}>{k.content}</div> : null}
              <button
                type="button"
                onClick={() => toggleStatus(k)}
                style={{ marginRight: '0.5rem' }}
              >
                {k.status === 'active' ? 'Archive' : 'Activate'}
              </button>
              <button type="button" onClick={() => remove(k)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Matching rules tab ─────────────────────────────────────────────────────

function RulesTab({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<MatchingRule[]>([]);
  const [ruleType, setRuleType] = useState<string>('keyword');
  const [ruleValue, setRuleValue] = useState('');
  const [priority, setPriority] = useState('0');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setItems((await api.listRules(businessId)).matchingRules);
  }
  useEffect(() => {
    void refresh();
  }, [businessId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = Number(priority);
    if (!Number.isInteger(p)) {
      setError('Priority must be an integer.');
      return;
    }
    if (ruleValue.trim().length === 0) {
      setError('Rule value is required.');
      return;
    }
    try {
      await api.createRule(businessId, { ruleType, ruleValue: ruleValue.trim(), priority: p });
      setRuleValue('');
      setPriority('0');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add rule.');
    }
  }

  async function remove(r: MatchingRule) {
    await api.deleteRule(businessId, r.id);
    await refresh();
  }

  return (
    <section>
      <p style={{ color: '#666' }}>
        Deterministic matching rules (not AI). AI matching comes in a later sprint.
      </p>
      <form onSubmit={onCreate} style={{ marginBottom: '1rem' }}>
        <select
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        >
          {RULE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          placeholder="Rule value"
          value={ruleValue}
          onChange={(e) => setRuleValue(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        />
        <input
          type="number"
          placeholder="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{ padding: '0.5rem', width: 90, marginRight: '0.5rem' }}
        />
        <button type="submit">Add rule</button>
      </form>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {items.length === 0 ? (
        <p>No matching rules yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Type</th>
              <th>Value</th>
              <th>Priority</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{r.ruleType}</td>
                <td>{r.ruleValue}</td>
                <td>{r.priority}</td>
                <td>{r.status}</td>
                <td>
                  <button type="button" onClick={() => remove(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Facebook Groups tab ─────────────────────────────────────────────────────

function GroupsTab({ businessId }: { businessId: string }) {
  const [assigned, setAssigned] = useState<FacebookGroup[]>([]);
  const [all, setAll] = useState<FacebookGroup[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [a, g] = await Promise.all([api.listBusinessGroups(businessId), api.listGroups()]);
    setAssigned(a.groups);
    setAll(g.groups);
  }
  useEffect(() => {
    void refresh().catch(() => setError('Could not load groups.'));
  }, [businessId]);

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    try {
      await api.assignGroupBusiness(selected, businessId);
      setSelected('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not assign group.');
    }
  }

  async function onUnassign(groupId: string) {
    await api.unassignGroupBusiness(groupId, businessId);
    await refresh();
  }

  const assignedIds = new Set(assigned.map((g) => g.id));
  const available = all.filter((g) => !assignedIds.has(g.id));

  return (
    <section>
      <p style={{ color: '#666' }}>
        Facebook Groups this business monitors. A group may be assigned to several businesses.
      </p>
      {assigned.length === 0 ? (
        <p>No groups assigned yet.</p>
      ) : (
        <ul>
          {assigned.map((g) => (
            <li key={g.id} style={{ marginBottom: '0.5rem' }}>
              <a href={g.canonicalUrl} target="_blank" rel="noopener noreferrer">
                {g.name ?? g.canonicalUrl}
              </a>{' '}
              <span style={{ color: '#666' }}>(access: {g.accessState})</span>{' '}
              <button type="button" onClick={() => onUnassign(g.id)}>
                Unassign
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAssign} style={{ marginTop: '0.5rem' }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        >
          <option value="">Select a group…</option>
          {available.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name ?? g.canonicalUrl}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!selected}>
          Assign Group
        </button>
      </form>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
      <p style={{ marginTop: '0.75rem' }}>
        <a href="/settings/facebook/groups">Manage all Facebook Groups →</a>
      </p>
    </section>
  );
}
