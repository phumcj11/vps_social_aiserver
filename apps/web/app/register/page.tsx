'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }
    if (password.length < 10) {
      setError('รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร');
      return;
    }

    setLoading(true);
    try {
      await api.register(email, password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(
          err.code === 'email_taken'
            ? 'อีเมลนี้มีบัญชีอยู่แล้ว'
            : 'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        );
      } else {
        setError('สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '0 0.75rem' }}>
      <h1>สร้างบัญชี</h1>
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
          รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)
          <input
            type="password"
            value={password}
            required
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          ยืนยันรหัสผ่าน
          <input
            type="password"
            value={confirm}
            required
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </label>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชี'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        มีบัญชีอยู่แล้ว? <a href="/login">เข้าสู่ระบบ</a>
      </p>
    </main>
  );
}
