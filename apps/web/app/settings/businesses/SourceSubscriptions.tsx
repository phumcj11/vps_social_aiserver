'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError, type SourceGroupView } from '../../../lib/api';
import {
  SOURCE_SECTION_HEADING,
  SOURCE_SECTION_DESCRIPTION,
  SOURCE_SECTION_HELPER,
  SOURCE_REVIEW_NOTE,
  SOURCE_SAVE_LABEL,
  SOURCE_SAVED_LABEL,
  SOURCE_EMPTY_STATE,
  sourceGroupLabel,
} from './source-ui';

/**
 * M5 — "กลุ่มที่ติดตาม": the owner chooses which KMKT source Facebook Groups may
 * produce Leads for THIS Business. The customer never connects Facebook. Save is
 * a full reconcile handled server-side (idempotent; never duplicates).
 */
export function SourceSubscriptions({ businessId }: { businessId: string }) {
  const [groups, setGroups] = useState<SourceGroupView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getSourceSubscriptions(businessId);
      setConfigured(res.sourceConfigured);
      setGroups(res.groups);
      setSelected(new Set(res.groups.filter((g) => g.subscribed).map((g) => g.id)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.setSourceSubscriptions(businessId, [...selected]);
      setGroups(res.groups);
      setSelected(new Set(res.groups.filter((g) => g.subscribed).map((g) => g.id)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #e2e2e2', paddingTop: 24 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>{SOURCE_SECTION_HEADING}</h2>
      <p style={{ margin: '0 0 4px', color: '#333' }}>{SOURCE_SECTION_DESCRIPTION}</p>
      <p style={{ margin: '0 0 4px', color: '#666', fontSize: 14 }}>{SOURCE_SECTION_HELPER}</p>
      <p style={{ margin: '0 0 16px', color: '#666', fontSize: 14 }}>{SOURCE_REVIEW_NOTE}</p>

      {loading ? (
        <p style={{ color: '#666' }}>กำลังโหลด…</p>
      ) : !configured || groups.length === 0 ? (
        <p style={{ color: '#8a6d00', background: '#fff8e1', padding: 12, borderRadius: 8 }}>
          {SOURCE_EMPTY_STATE}
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {groups.map((g) => (
              <li key={g.id} style={{ padding: '8px 0' }}>
                <label
                  style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggle(g.id)}
                  />
                  <span>{sourceGroupLabel(g)}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#1a1a1a',
              color: '#fff',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'กำลังบันทึก…' : SOURCE_SAVE_LABEL}
          </button>
          {saved && <span style={{ marginLeft: 12, color: '#0a7d28' }}>{SOURCE_SAVED_LABEL}</span>}
        </>
      )}
      {error && <p style={{ color: '#b00020', marginTop: 12 }}>{error}</p>}
    </section>
  );
}
