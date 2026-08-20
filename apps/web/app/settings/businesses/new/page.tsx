'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiRequestError } from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';
import { Page, Section, Card, Field, Input, Textarea, Button, colors } from '../ui';

/**
 * Onboarding entry (SPRINT 016 Phase E/J). Creates a real Business, then routes
 * the owner into the tabbed detail hub where they complete profile, contacts,
 * policies, properties, matching, and readiness — no SQL / seed / CLI required.
 * New businesses start in the 'test' environment and are never production-ready
 * until the owner explicitly promotes and passes readiness.
 */
export default function NewBusinessPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((m) => setEmail(m.user.email))
      .catch(() => router.push('/login'));
  }, [router]);

  async function create() {
    if (!name.trim()) {
      setErr('กรุณากรอกชื่อธุรกิจ');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { business } = await api.createBusiness(
        name.trim(),
        category.trim() || 'other',
        description.trim() || undefined,
      );
      router.push(`/settings/businesses/${business.id}`);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'สร้างไม่สำเร็จ');
      setSaving(false);
    }
  }

  return (
    <Page>
      <Nav email={email} />
      <Link href="/settings/businesses" style={{ fontSize: '0.9rem' }}>
        ← ธุรกิจของฉัน
      </Link>
      <h1>เพิ่มธุรกิจ</h1>
      <Card>
        <p style={{ margin: 0, color: colors.muted, fontSize: '0.9rem' }}>
          หลังจากสร้างแล้ว ระบบจะพาไปกรอกข้อมูลธุรกิจ ช่องทางติดต่อ นโยบาย ที่พัก
          และตรวจสอบความพร้อมใช้งานทีละขั้นตอน ธุรกิจใหม่จะเริ่มเป็นแบบ{' '}
          <strong>ทดสอบ (Test)</strong> จนกว่าจะพร้อมและเปลี่ยนเป็น Production เอง
        </p>
      </Card>
      <Section>
        <Field label="ชื่อธุรกิจ *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น บางแสนพูลวิลล่า"
          />
        </Field>
        <Field label="หมวดหมู่">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="เช่น ที่พัก / บ้านพักตากอากาศ"
          />
        </Field>
        <Field label="คำอธิบายธุรกิจ">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {err && <p style={{ color: colors.danger }}>{err}</p>}
        <Button kind="primary" onClick={create} disabled={saving}>
          สร้างธุรกิจและเริ่มตั้งค่า
        </Button>
      </Section>
    </Page>
  );
}
