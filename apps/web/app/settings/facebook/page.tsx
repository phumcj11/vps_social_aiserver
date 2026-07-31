'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type FacebookStatus } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

const CREDENTIAL_NOTICE =
  'You will enter your Facebook credentials directly in the browser. KMKT Social AI does not store your Facebook password.';

function stateLabel(s: FacebookStatus): { text: string; color: string } {
  switch (s.connectionState) {
    case 'connected':
      return { text: 'Connected', color: '#0a7d28' };
    case 'connecting':
      return { text: 'Connecting…', color: '#8a6d00' };
    case 'reconnect_required':
      return { text: 'Reconnect required', color: '#b00020' };
    case 'checkpoint_required':
      return { text: 'Checkpoint required', color: '#b00020' };
    case 'validation_failed':
      return { text: 'Validation failed', color: '#b00020' };
    case 'disconnected':
      return { text: 'Disconnected', color: '#666' };
    default:
      return { text: 'Not connected', color: '#666' };
  }
}

export default function FacebookSettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function refresh() {
    try {
      const res = await api.getFacebookAccount();
      setStatus(res.account);
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

  // While connecting, poll for the settled state.
  useEffect(() => {
    if (status?.connectionState !== 'connecting') return;
    const t = setInterval(async () => {
      try {
        const res = await api.facebookConnectStatus();
        setStatus(res.status);
      } catch {
        /* ignore transient errors while polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [status?.connectionState]);

  async function action(fn: () => Promise<{ status: FacebookStatus }>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      setStatus(res.status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.facebookDisconnect();
      setStatus(res.status);
      setConfirmDisconnect(false);
      if (res.cleanupFailed) {
        setError(
          'Profile cleanup failed — manual cleanup is required. Please contact your operator.',
        );
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main style={{ maxWidth: 640 }}>
      <Nav email={email} />
      <h1>Facebook Connection</h1>

      {needsWorkspace ? (
        <p>
          You need a workspace first. <a href="/settings/workspace">Create your workspace →</a>
        </p>
      ) : status ? (
        <>
          <p
            style={{
              background: '#f4f4f4',
              padding: '0.75rem',
              borderLeft: '4px solid #888',
              fontSize: '0.95rem',
            }}
          >
            {CREDENTIAL_NOTICE}
          </p>

          <section style={{ marginBottom: '1.5rem' }}>
            <h2>Status</h2>
            <p>
              Connection state:{' '}
              <strong style={{ color: stateLabel(status).color }}>{stateLabel(status).text}</strong>
            </p>
            <ul>
              <li>Account status: {status.status}</li>
              <li>Display name: {status.displayName ?? '(not available)'}</li>
              <li>Last validated: {status.lastValidatedAt ?? '(never)'}</li>
              <li>Connected at: {status.connectedAt ?? '(not connected)'}</li>
            </ul>
            {status.userActionRequired && (
              <p style={{ color: '#b00020' }}>Action required: {status.userActionRequired}</p>
            )}
            {status.lastErrorMessage && (
              <p style={{ color: '#b00020' }}>
                Last error: {status.lastErrorMessage}
                {status.lastErrorCode ? ` (${status.lastErrorCode})` : ''}
              </p>
            )}
            {status.connectionState === 'checkpoint_required' && (
              <p style={{ color: '#b00020' }}>
                Facebook presented a security checkpoint. Complete it in the browser, then
                reconnect.
              </p>
            )}
            {status.status === 'blocked' && (
              <p style={{ color: '#b00020' }}>This Facebook account appears to be blocked.</p>
            )}
            {status.cleanupRequired && (
              <p style={{ color: '#b00020' }}>
                Browser profile cleanup failed — manual cleanup is required.
              </p>
            )}
            {status.connectionState === 'connecting' && (
              <p style={{ color: '#8a6d00' }}>Connection in progress…</p>
            )}
          </section>

          {error && <p style={{ color: '#b00020' }}>{error}</p>}

          <section style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(status.connectionState === 'not_connected' ||
              status.connectionState === 'disconnected' ||
              status.status === 'none') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => action(async () => api.facebookConnectStart())}
              >
                Connect Facebook
              </button>
            )}

            {(status.connectionState === 'reconnect_required' ||
              status.connectionState === 'checkpoint_required' ||
              status.connectionState === 'validation_failed') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => action(async () => api.facebookConnectStart())}
              >
                Reconnect
              </button>
            )}

            {status.status !== 'none' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => action(async () => api.facebookValidate())}
              >
                Validate Session
              </button>
            )}

            {status.status !== 'none' && status.connectionState !== 'disconnected' && (
              <>
                {!confirmDisconnect ? (
                  <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </button>
                ) : (
                  <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                    Confirm disconnect?
                    <button type="button" disabled={busy} onClick={onDisconnect}>
                      Yes, disconnect
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <p>Unable to load Facebook connection status.</p>
      )}
    </main>
  );
}
