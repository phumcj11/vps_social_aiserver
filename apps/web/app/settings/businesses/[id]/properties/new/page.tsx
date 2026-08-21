'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiRequestError } from '../../../../../../lib/api';
import { Nav } from '../../../../../../components/Nav';
import {
  Page,
  Section,
  Field,
  Input,
  Textarea,
  Select,
  Button,
  colors,
  PROPERTY_TYPE_ORDER,
  PROPERTY_TYPE_LABELS,
} from '../../../ui';

export default function NewPropertyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [email, setEmail] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [propertyType, setPropertyType] = useState('');
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
      setErr('กรุณากรอกชื่อที่พัก');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { property } = await api.createProperty(id, {
        name: name.trim(),
        propertyType: propertyType || undefined,
        description: description || undefined,
      });
      router.push(`/settings/businesses/${id}/properties/${property.id}`);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'สร้างไม่สำเร็จ');
      setSaving(false);
    }
  }

  return (
    <Page>
      <Nav email={email} />
      <Link href={`/settings/businesses/${id}?tab=ที่พัก`} style={{ fontSize: '0.9rem' }}>
        ← กลับไปที่พัก
      </Link>
      <h1>เพิ่มที่พัก</h1>
      <Section>
        <Field label="ชื่อที่พัก">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น บ้านริมทะเลบางแสน"
          />
        </Field>
        <Field label="ประเภทที่พัก">
          <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            <option value="">— เลือก —</option>
            {PROPERTY_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="คำอธิบายสั้นๆ (ไม่บังคับ)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {err && <p style={{ color: colors.danger }}>{err}</p>}
        <Button kind="primary" onClick={create} disabled={saving}>
          สร้างและกรอกรายละเอียด
        </Button>
      </Section>
    </Page>
  );
}
