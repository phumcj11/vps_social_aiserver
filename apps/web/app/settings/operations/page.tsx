'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type OperationsStatus } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

const NOTICE =
  'Operator console. No secrets, paths, cookies, or customer content are shown. No Facebook contact happens here.';

function levelColor(on: boolean, danger = true): string {
  if (!on) return '#0a7d28';
  return danger ? '#b00020' : '#b26a00';
}

export default function OperationsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [status, setStatus] = useState<OperationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    const s = await api.getOperationsStatus();
    setStatus(s);
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
        if (err instanceof ApiRequestError && (err.status === 403 || err.status === 404)) {
          setForbidden(true);
        } else if (err instanceof ApiRequestError) {
          setError(err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function act(fn: (reason: string) => Promise<unknown>) {
    const reason = window.prompt('Reason (required, audited):');
    if (!reason || reason.trim().length < 3) return;
    setError(null);
    setBusy(true);
    try {
      await fn(reason);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (forbidden)
    return (
      <main style={{ maxWidth: 760 }}>
        <Nav email={email} />
        <h1>Operations</h1>
        <p>This console is restricted to configured operators.</p>
      </main>
    );
  if (!status) return <main>Unavailable.</main>;

  const s = status;
  return (
    <main style={{ maxWidth: 820 }}>
      <Nav email={email} />
      <h1>Operations</h1>
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
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>System mode</h2>
        <p>
          Mode <strong>{s.mode}</strong> · Readiness <strong>{s.readinessLevel}</strong>
        </p>
        <p>
          Maintenance{' '}
          <strong style={{ color: levelColor(s.maintenance.enabled, false) }}>
            {s.maintenance.enabled ? 'ON' : 'off'}
          </strong>{' '}
          · Lockdown{' '}
          <strong style={{ color: levelColor(s.lockdown.enabled) }}>
            {s.lockdown.enabled ? 'ON' : 'off'}
          </strong>
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act((r: string) =>
                s.maintenance.enabled ? api.disableMaintenance(r) : api.enableMaintenance(r),
              )
            }
          >
            {s.maintenance.enabled ? 'Disable maintenance' : 'Enable maintenance'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act((r: string) =>
                s.lockdown.enabled ? api.disableLockdown(r) : api.enableLockdown(r),
              )
            }
          >
            {s.lockdown.enabled ? 'Unlock incident' : 'Engage incident lockdown'}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Safety flags</h2>
        <ul>
          <li>Action engine: {String(s.safety.actionEngineEnabled)}</li>
          <li>Facebook write: {String(s.safety.facebookWriteEnabled)}</li>
          <li>Facebook comment: {String(s.safety.facebookCommentEnabled)}</li>
          <li>Kill switch: {String(s.safety.killSwitchOn)}</li>
          <li>Adapter: {s.safety.adapter}</li>
        </ul>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Resources</h2>
        <p>
          Disk {s.system.diskUsedPercent}% used ({s.system.diskFreeGb} GB free) · RAM{' '}
          {s.system.ramAvailableMb} MB free · Swap {s.system.swapUsedPercent}% · Load{' '}
          {s.system.loadAvg1}
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Queues</h2>
        <p>
          Stuck action jobs {s.queues.stuckActionJobs} · Stuck collector runs{' '}
          {s.queues.stuckCollectorRuns} · Ambiguous executions{' '}
          <strong style={{ color: levelColor(s.queues.ambiguousExecutions > 0, false) }}>
            {s.queues.ambiguousExecutions}
          </strong>
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Backups</h2>
        <p>
          {s.backups.count} backup(s).{' '}
          {s.backups.latest
            ? `Latest ${s.backups.latest.kind}, ${s.backups.latest.ageHours}h old.`
            : 'No backups found.'}
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Last incident</h2>
        {s.lastIncident ? (
          <p>
            {s.lastIncident.action} by {s.lastIncident.operator} at{' '}
            {new Date(s.lastIncident.at).toLocaleString()} — {s.lastIncident.reason}
          </p>
        ) : (
          <p>No incidents recorded.</p>
        )}
      </section>

      <section>
        <h2>Production Pilot (Level 1)</h2>
        <p style={{ color: '#5c4500' }}>
          Supervised production pilot — <strong>preparation only</strong>. Every draft is
          human-reviewed; every submit is explicitly authorized and preceded by prepare_only. There
          is <strong>no Execute-Now control</strong> here.
        </p>
        <ul>
          <li>
            Pilot level: <strong>LEVEL 1 — Supervised Production (readiness)</strong>
          </li>
          <li>
            Production writes:{' '}
            <strong style={{ color: levelColor(s.safety.facebookWriteEnabled) }}>
              {s.safety.facebookWriteEnabled ? 'ENABLED' : 'disabled'}
            </strong>{' '}
            · Kill switch:{' '}
            <strong style={{ color: levelColor(!s.safety.killSwitchOn) }}>
              {s.safety.killSwitchOn ? 'ON' : 'off'}
            </strong>{' '}
            · Adapter: {s.safety.adapter}
          </li>
          <li>
            Write window: <strong>CLOSED</strong> (default; opens only via the operator checklist)
          </li>
          <li>
            Daily limits: max 3 groups · 3 comments/day · 1/group · 1/business · 1 ambiguous → stop
            for the day
          </li>
          <li>Draft mode: mock/manual require a human rewrite; external_ai is not configured</li>
          <li>
            Production Business: NOT_READY until real Business data is supplied (test Businesses are
            never used)
          </li>
        </ul>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Live pilot counters (Signals, Opportunities, Reviews, Action Jobs, verified comments,
          write-window expiry, last verified backup) come from the Production Pilot observability
          read model. No cookies, credentials, or profile paths are ever shown.
        </p>
      </section>

      <section>
        <h2>Production Businesses &amp; Properties</h2>
        <p style={{ color: '#5c4500' }}>
          Self-service Business + Property management is available via the workspace API (Businesses
          → Properties → Profiles → Contacts → Policies → Readiness). A production Business is{' '}
          <strong>NOT_READY</strong> until real data is supplied and at least one active Property
          exists — test Businesses are never used for production comments.
        </p>
        <ul>
          <li>
            Environment: a Business is <strong>test</strong> by default; only{' '}
            <strong>production</strong> can be READY
          </li>
          <li>
            Readiness (Business + Property) is computed from persisted data, with detailed missing
            requirements
          </li>
          <li>
            Prices/availability are used only when explicitly entered and the policy permits — never
            invented
          </li>
        </ul>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          The mobile-first management screens and onboarding wizard ship in Sprint 016; the backend,
          persistence, readiness gates, and audit are in place now.
        </p>
      </section>
    </main>
  );
}
