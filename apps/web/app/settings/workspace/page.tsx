'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, type User, type Workspace } from '../../../lib/api';
import { Nav } from '../../../components/Nav';

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (!active) return;
        setUser(me.user);
      } catch {
        router.push('/login');
        return;
      }
      try {
        const ws = await api.getWorkspace();
        if (active) {
          setWorkspace(ws.workspace);
          setName(ws.workspace.name);
        }
      } catch (err) {
        if (!(err instanceof ApiRequestError)) throw err;
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (name.trim().length === 0) {
      setError('กรุณากรอกชื่อพื้นที่ทำงาน');
      return;
    }
    setSaving(true);
    try {
      const result = workspace
        ? await api.updateWorkspace(name.trim())
        : await api.createWorkspace(name.trim());
      setWorkspace(result.workspace);
      setName(result.workspace.name);
      setSuccess(workspace ? 'บันทึกชื่อพื้นที่ทำงานแล้ว' : 'สร้างพื้นที่ทำงานแล้ว');
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={{ padding: '1rem' }}>กำลังโหลด…</main>;

  return (
    <main style={{ maxWidth: 480 }}>
      <Nav email={user?.email} />
      <h1>ตั้งค่าพื้นที่ทำงาน</h1>

      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          ชื่อพื้นที่ทำงาน
          <input
            type="text"
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>

        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {success && <p style={{ color: '#0a7d28' }}>{success}</p>}

        <button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : workspace ? 'บันทึก' : 'สร้างพื้นที่ทำงาน'}
        </button>
      </form>
    </main>
  );
}
