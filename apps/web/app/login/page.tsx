'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(email, password);
      router.push('/dashboard');
    } catch (err) {
      // Always show a generic message — never reveal which field was wrong.
      if (err instanceof ApiRequestError) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '0 0.75rem' }}>
      <h1>เข้าสู่ระบบ</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          อีเมล
          <input
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          รหัสผ่าน
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </label>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        ยังไม่มีบัญชี? <a href="/register">สร้างบัญชี</a>
      </p>
    </main>
  );
}
