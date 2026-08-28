'use client';

import { useEffect, useState } from 'react';
import { api, ApiRequestError, type OperatorFacebookSources } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';
import {
  OPERATOR_SOURCES_HEADING,
  OPERATOR_SOURCES_INTRO,
  OPERATOR_LOGIN_REQUIRED_NOTE,
  OPERATOR_NOT_AUTHORIZED,
  OPERATOR_NO_SOURCE_CONFIGURED,
  connectionStateThai,
  groupStatusThai,
  flagThai,
  sourceGroupLabel,
} from '../../businesses/source-ui';

/**
 * M4 — operator "Facebook Sources". KMKT/operator READ-side management view:
 * scanner account state (safe), source Groups, subscriber counts. No login/scan/
 * validate/write actions are exposed here.
 */
export default function FacebookSourcesPage() {
  const [email, setEmail] = useState<string | undefined>();
  const [data, setData] = useState<OperatorFacebookSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me().catch(() => null);
        if (active && me) setEmail(me.user.email);
        const res = await api.getOperatorFacebookSources();
        if (active) setData(res);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiRequestError && err.status === 403) setForbidden(true);
        else setError(err instanceof ApiRequestError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const acct = data?.account;

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24 }}>
      <Nav email={email} />
      <h1 style={{ fontSize: 24, margin: '16px 0 4px' }}>{OPERATOR_SOURCES_HEADING}</h1>
      <p style={{ color: '#555', margin: '0 0 20px' }}>{OPERATOR_SOURCES_INTRO}</p>

      {loading && <p style={{ color: '#666' }}>กำลังโหลด…</p>}
      {forbidden && (
        <p style={{ color: '#b00020', background: '#fdecea', padding: 12, borderRadius: 8 }}>
          {OPERATOR_NOT_AUTHORIZED}
        </p>
      )}
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {data && !data.sourceConfigured && (
        <p style={{ color: '#8a6d00', background: '#fff8e1', padding: 12, borderRadius: 8 }}>
          {OPERATOR_NO_SOURCE_CONFIGURED}
        </p>
      )}

      {data && data.sourceConfigured && (
        <>
          <section
            style={{ border: '1px solid #e2e2e2', borderRadius: 10, padding: 16, marginBottom: 20 }}
          >
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>บัญชีสแกน (KMKT)</h2>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 6 }}>
              <dt style={{ color: '#666' }}>สถานะการเชื่อมต่อ</dt>
              <dd style={{ margin: 0 }}>{connectionStateThai(acct?.connectionState)}</dd>
              <dt style={{ color: '#666' }}>ตรวจสอบล่าสุด</dt>
              <dd style={{ margin: 0 }}>{acct?.lastValidatedAt ?? '—'}</dd>
              <dt style={{ color: '#666' }}>โหมดอ่าน (Reader)</dt>
              <dd style={{ margin: 0 }}>{flagThai(data.readerEnabled)}</dd>
              <dt style={{ color: '#666' }}>โหมดเขียน (Write)</dt>
              <dd style={{ margin: 0 }}>{flagThai(data.writeEnabled)}</dd>
            </dl>
            {(!acct || acct.connectionState !== 'connected') && (
              <p style={{ color: '#8a6d00', marginTop: 12 }}>{OPERATOR_LOGIN_REQUIRED_NOTE}</p>
            )}
          </section>

          <section style={{ border: '1px solid #e2e2e2', borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>กลุ่มแหล่งข้อมูล (Source Groups)</h2>
            {data.groups.length === 0 ? (
              <p style={{ color: '#666' }}>ยังไม่มีกลุ่มแหล่งข้อมูล</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
                    <th style={{ padding: '6px 4px' }}>กลุ่ม</th>
                    <th style={{ padding: '6px 4px' }}>สถานะ</th>
                    <th style={{ padding: '6px 4px' }}>การเข้าถึง</th>
                    <th style={{ padding: '6px 4px' }}>ธุรกิจที่ติดตาม</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => (
                    <tr key={g.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '8px 4px' }}>{sourceGroupLabel(g)}</td>
                      <td style={{ padding: '8px 4px' }}>{groupStatusThai(g.status)}</td>
                      <td style={{ padding: '8px 4px' }}>{g.accessState}</td>
                      <td style={{ padding: '8px 4px' }}>{g.subscriberCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
