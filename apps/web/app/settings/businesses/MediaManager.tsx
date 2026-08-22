'use client';

import { useEffect, useState } from 'react';
import { api, ApiRequestError, type MediaAsset } from '../../../lib/api';
import { Section, Field, Input, Select, Button, colors, type SaveState, SaveStatus } from './ui';
import { MEDIA_CATEGORIES, mediaCategoryLabel } from './media-ui';

/** Auth-gated image thumbnail (fetches the file with credentials → object URL). */
export function MediaThumb({ fileUrl, alt }: { fileUrl: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    api
      .fetchMediaBlobUrl(fileUrl)
      .then((u) => {
        if (active) {
          objUrl = u;
          setUrl(u);
        } else URL.revokeObjectURL(u);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [fileUrl]);
  const box = {
    width: 96,
    height: 96,
    borderRadius: 8,
    objectFit: 'cover' as const,
    background: colors.cardBg,
    border: `1px solid ${colors.border}`,
  };
  if (failed)
    return (
      <div style={{ ...box, display: 'grid', placeItems: 'center', color: colors.muted }}>—</div>
    );
  if (!url)
    return (
      <div style={{ ...box, display: 'grid', placeItems: 'center', color: colors.muted }}>…</div>
    );
  return <img src={url} alt={alt} style={box} />;
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.9rem' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * One media asset with its OWN edit buffer + explicit "บันทึกรูปนี้" save. Category,
 * caption, and the three permissions persist together through the media PATCH.
 * Archive stays a separate action. approvedForDrafts / approvedForPublicResponse
 * are independent — a save never auto-enables public response.
 */
function MediaItem({
  businessId,
  asset,
  onChanged,
}: {
  businessId: string;
  asset: MediaAsset;
  onChanged: () => Promise<void> | void;
}) {
  const [category, setCategory] = useState(asset.category);
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [ownerVerified, setOwnerVerified] = useState(asset.ownerVerified);
  const [approvedForDrafts, setApprovedForDrafts] = useState(asset.approvedForDrafts);
  const [approvedForPublicResponse, setApprovedForPublicResponse] = useState(
    asset.approvedForPublicResponse,
  );
  const [state, setState] = useState<SaveState>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  function touch() {
    if (state !== 'idle') {
      setState('idle');
      setMsg(null);
    }
  }

  async function save() {
    setState('saving');
    setMsg('กำลังบันทึก...');
    try {
      await api.updateMedia(businessId, asset.id, {
        category,
        caption: caption.trim() ? caption.trim() : null,
        ownerVerified,
        approvedForDrafts,
        approvedForPublicResponse,
      });
      await onChanged();
      setState('saved');
      setMsg('บันทึกเรียบร้อย');
    } catch (e) {
      setState('error');
      setMsg(
        e instanceof ApiRequestError && (e.status === 400 || e.status === 422)
          ? 'กรุณาตรวจสอบข้อมูลรูปภาพ'
          : 'ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่อีกครั้ง',
      );
    }
  }

  async function toggleArchive() {
    await api
      .updateMedia(businessId, asset.id, {
        status: asset.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
      })
      .catch(() => null);
    await onChanged();
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '0.6rem',
        marginBottom: '0.6rem',
        opacity: asset.status === 'ARCHIVED' ? 0.55 : 1,
        flexWrap: 'wrap',
      }}
    >
      <MediaThumb fileUrl={asset.fileUrl} alt={asset.caption ?? asset.category} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <Field label="หมวดหมู่">
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              touch();
            }}
          >
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {mediaCategoryLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="คำอธิบาย (ไม่บังคับ)">
          <Input
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value);
              touch();
            }}
          />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 0' }}>
          <Check
            checked={ownerVerified}
            onChange={(v) => {
              setOwnerVerified(v);
              touch();
            }}
            label="ฉันยืนยันว่ารูปนี้ถูกต้อง"
          />
          <Check
            checked={approvedForDrafts}
            onChange={(v) => {
              setApprovedForDrafts(v);
              touch();
            }}
            label="อนุญาตให้ระบบใช้ประกอบ Draft"
          />
          <Check
            checked={approvedForPublicResponse}
            onChange={(v) => {
              setApprovedForPublicResponse(v);
              touch();
            }}
            label="อนุญาตให้ใช้ในการตอบสาธารณะ"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button kind="primary" onClick={save} disabled={state === 'saving'}>
            บันทึกรูปนี้
          </Button>
          <Button onClick={toggleArchive}>
            {asset.status === 'ACTIVE' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
          <SaveStatus state={state} message={msg} />
        </div>
      </div>
    </div>
  );
}

/**
 * Shared media manager for a Business (propertyId omitted → business-level) or a
 * Property (propertyId set). Upload creates the asset; each image is then edited
 * and saved individually. There is no page-level "save all" — every image owns
 * its save.
 */
export function MediaManager({
  businessId,
  propertyId,
  title,
  helper,
}: {
  businessId: string;
  propertyId?: string;
  title: string;
  helper: string;
}) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [category, setCategory] = useState<string>(propertyId ? 'pool' : 'cover');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await api.listMedia(businessId).catch(() => ({ media: [] }));
    const scoped = res.media.filter((m) =>
      propertyId ? m.propertyId === propertyId : m.propertyId === null,
    );
    setItems(scoped);
  }
  useEffect(() => {
    void load();
  }, [businessId, propertyId]);

  async function upload() {
    if (!file) {
      setMsg('กรุณาเลือกไฟล์รูป');
      return;
    }
    setBusy(true);
    setMsg('กำลังอัปโหลด...');
    try {
      await api.uploadMedia(businessId, file, {
        category,
        propertyId,
        caption: caption || undefined,
      });
      setFile(null);
      setCaption('');
      await load();
      setMsg('อัปโหลดเรียบร้อย');
    } catch (e) {
      setMsg(
        e instanceof ApiRequestError
          ? 'อัปโหลดไม่สำเร็จ กรุณาใช้ไฟล์ภาพ (JPEG/PNG/WebP) ขนาดไม่เกิน 10MB'
          : 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={title}>
      <p style={{ fontSize: '0.9rem', color: colors.muted, marginTop: 0 }}>{helper}</p>

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <strong>+ เพิ่มรูป</strong>
        <Field label="เลือกไฟล์ (JPEG / PNG / WebP, ไม่เกิน 10MB)">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="หมวดหมู่">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {mediaCategoryLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="คำอธิบาย (ไม่บังคับ)">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="เช่น สระว่ายน้ำส่วนตัว"
          />
        </Field>
        <Button kind="primary" onClick={upload} disabled={busy}>
          อัปโหลด
        </Button>
        {msg && <span style={{ marginLeft: 8, color: colors.muted }}>{msg}</span>}
      </div>

      {items.length === 0 ? (
        <p style={{ color: colors.muted }}>ยังไม่มีรูป</p>
      ) : (
        items.map((m) => (
          <MediaItem key={m.id} businessId={businessId} asset={m} onChanged={load} />
        ))
      )}
    </Section>
  );
}
