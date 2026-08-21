'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiRequestError,
  type ReviewTask,
  type ReviewEvent,
  type ReviewPresentation,
  type ActionJob,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';

interface DraftView {
  id: string;
  version: number;
  status: string;
  content: string | null;
}
interface BizView {
  id: string;
  name: string;
  slug: string;
  status: string;
}
interface OppView {
  id: string;
  decision: string;
  status: string;
}

function statusColor(s: string): string {
  if (s === 'APPROVED') return '#0a7d28';
  if (s === 'REJECTED') return '#b00020';
  if (s === 'EXPIRED') return '#777';
  return '#b26a00';
}

/** Map a deterministic Property-match reason code to Thai. */
function reasonThai(reason: string): string {
  const [code, detail] = reason.split(':').map((s) => s.trim());
  const label: Record<string, string> = {
    AREA_MATCH: 'พื้นที่ตรงกัน',
    CAPACITY_MATCH: 'รองรับจำนวนคนได้',
    BEDROOMS_MATCH: 'จำนวนห้องนอนพอ',
    TYPE_MATCH: 'ประเภทที่พักตรง',
    PRIVATE_POOL_MATCH: 'มีสระส่วนตัว',
    BEACH_MATCH: 'ติด/ใกล้ทะเล',
    RIVER_MATCH: 'ริมแม่น้ำ',
    AMENITY_MATCH: 'มีสิ่งอำนวยความสะดวกที่ขอ',
  };
  const base = label[code ?? ''] ?? reason;
  return detail ? `${base} (${detail})` : base;
}

/** Map a contact channel type to Thai for the review contact card. */
function contactTypeThai(type: string): string {
  const map: Record<string, string> = {
    PHONE: 'โทรศัพท์',
    LINE_ID: 'LINE ID',
    LINE_OA: 'LINE OA',
    FACEBOOK_PAGE: 'เพจ Facebook',
    WEBSITE: 'เว็บไซต์',
    EMAIL: 'อีเมล',
    OTHER: 'ช่องทาง',
  };
  return map[type] ?? type;
}

/** Map a reviewer warning code to Thai. */
function warningThai(code: string): string {
  const label: Record<string, string> = {
    NO_PROPERTY_MATCH: 'ไม่พบที่พักที่ตรงกับคำขอ',
    AVAILABILITY_UNVERIFIED: 'ห้องว่างยังไม่ได้ยืนยัน',
    PRICE_UNAVAILABLE: 'ราคายังไม่พร้อมให้ระบุ',
    CAPACITY_UNSUPPORTED: 'จำนวนผู้เข้าพักไม่มีข้อมูลรองรับ',
    CONTACT_NOT_APPROVED: 'ช่องทางติดต่อยังไม่ได้อนุมัติ',
    PROMOTION_UNSUPPORTED: 'โปรโมชั่นไม่มีข้อมูลรองรับ',
    AMENITY_UNSUPPORTED: 'สิ่งอำนวยความสะดวกที่ขอไม่มีในที่พัก',
  };
  return label[code] ?? code;
}

export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [review, setReview] = useState<ReviewTask | null>(null);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [business, setBusiness] = useState<BizView | null>(null);
  const [opportunity, setOpportunity] = useState<OppView | null>(null);
  const [presentation, setPresentation] = useState<ReviewPresentation | null>(null);
  const [propertyMatch, setPropertyMatch] =
    useState<Awaited<ReturnType<typeof api.getReview>>['propertyMatch']>(null);
  const [property, setProperty] =
    useState<Awaited<ReturnType<typeof api.getReview>>['property']>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [approvedContacts, setApprovedContacts] = useState<
    Awaited<ReturnType<typeof api.getReview>>['approvedContacts']
  >([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [actionJob, setActionJob] = useState<ActionJob | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.getReview(id);
    setReview(res.review);
    setDraft(res.draft);
    setBusiness(res.business);
    setOpportunity(res.opportunity);
    setPresentation(res.presentation);
    setPropertyMatch(res.propertyMatch);
    setProperty(res.property);
    setWarnings(res.warnings);
    setApprovedContacts(res.approvedContacts);
    setEvents(res.events);
    setEditText(res.review.editedContent ?? res.draft?.content ?? '');
    // Show an existing Action Job for this review, if any.
    try {
      const list = await api.listActions({ reviewTaskId: id });
      setActionJob(list.actions[0] ?? null);
    } catch {
      setActionJob(null);
    }
  }

  async function createAction() {
    setActionMsg(null);
    setBusy(true);
    try {
      await api.createAction(id);
      await load();
    } catch (err) {
      setActionMsg(err instanceof ApiRequestError ? err.message : 'Could not create action.');
    } finally {
      setBusy(false);
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
      try {
        await load();
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          router.push('/settings/reviews');
          return;
        }
        throw err;
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (!review) return <main>Not found.</main>;

  const pending = review.status === 'PENDING';

  return (
    <main style={{ maxWidth: 760 }}>
      <Nav email={email} />
      <p>
        <a href="/settings/reviews">← Review Queue</a>
      </p>
      <h1>Review</h1>
      <p
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d58c',
          padding: '0.5rem 0.75rem',
          borderRadius: 4,
          color: '#5c4500',
        }}
      >
        This is a human review of an AI-assisted draft. A decision is recorded here only — nothing
        is posted to Facebook.
      </p>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>การจับคู่ที่พัก (Property Match)</h2>
        {propertyMatch && propertyMatch.decision === 'MATCH' && property ? (
          <div
            style={{
              border: '1px solid #cfe8d4',
              background: '#f3faf4',
              borderRadius: 8,
              padding: '0.75rem',
            }}
          >
            <p style={{ margin: '0 0 0.25rem' }}>
              ธุรกิจ: <strong>{business?.name ?? '—'}</strong>
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              ที่พักที่จับคู่: <strong>{property.name}</strong>
              {property.area ? ` · ${property.area}` : ''}
              {property.maxGuests != null ? ` · รองรับ ${property.maxGuests} คน` : ''}
            </p>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>เพราะ:</p>
            <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.2rem' }}>
              {propertyMatch.reasons
                .filter((r) => r.includes('_MATCH'))
                .map((r) => (
                  <li key={r} style={{ color: '#0a7d28' }}>
                    ✓ {reasonThai(r)}
                  </li>
                ))}
            </ul>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
              ประเมิน {propertyMatch.candidatesEvaluated} ที่พัก · เวอร์ชัน{' '}
              {propertyMatch.matcherVersion}
            </p>
          </div>
        ) : (
          <div
            style={{
              border: '1px solid #f0d58c',
              background: '#fff8e1',
              borderRadius: 8,
              padding: '0.75rem',
              color: '#5c4500',
            }}
          >
            ไม่พบที่พักที่ตรงกับคำขอนี้ (NO_PROPERTY_MATCH) — ตอบได้เฉพาะระดับธุรกิจ
            ห้ามอ้างถึงที่พักเฉพาะ
          </div>
        )}
        {warnings.length > 0 && (
          <div style={{ marginTop: '0.6rem' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#b26a00' }}>คำเตือน:</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {warnings.map((w) => (
                <li key={w} style={{ color: '#b26a00' }}>
                  ⚠ {warningThai(w)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SPRINT 017 — the exact approved contact the draft may use (question 7). */}
        <div style={{ marginTop: '0.6rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>ช่องทางติดต่อที่จะใช้</p>
          {approvedContacts.length === 0 ? (
            <div style={{ color: '#b26a00' }}>⚠ ยังไม่มีช่องทางติดต่อที่ได้รับอนุญาต</div>
          ) : (
            approvedContacts.map((c) => (
              <div
                key={`${c.type}-${c.value}`}
                style={{
                  border: '1px solid #cfe8d4',
                  background: '#f3faf4',
                  borderRadius: 8,
                  padding: '0.5rem 0.6rem',
                  marginBottom: 6,
                }}
              >
                <strong>
                  {contactTypeThai(c.type)} {c.value}
                </strong>
                {c.label ? <span style={{ color: '#666' }}> · {c.label}</span> : null}
                <div style={{ fontSize: '0.85rem', color: '#0a7d28' }}>
                  ✓ อนุญาตใช้ใน Draft
                  {c.approvedForPublicResponse ? ' · ✓ อนุญาตใช้ตอบสาธารณะ' : ''}
                  {c.ownerVerified ? ' · ✓ เจ้าของยืนยันแล้ว' : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Decision</h2>
        <p>
          Status: <strong style={{ color: statusColor(review.status) }}>{review.status}</strong>
          {review.decidedBy && <> · Decided by {review.decidedBy}</>}
          {review.decisionReason && <> · Reason: {review.decisionReason}</>}
        </p>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {pending ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={busy} onClick={() => act(() => api.approveReview(id))}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => act(() => api.rejectReview(id))}>
              Reject
            </button>
          </div>
        ) : (
          <p style={{ color: '#666' }}>This review is closed.</p>
        )}
      </section>

      {review.status === 'APPROVED' && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2>Action</h2>
          <p
            style={{
              background: '#fff8e1',
              border: '1px solid #f0d58c',
              padding: '0.5rem 0.75rem',
              borderRadius: 4,
              color: '#5c4500',
            }}
          >
            This action has not been executed on Facebook.
          </p>
          {actionMsg && <p style={{ color: '#b00020' }}>{actionMsg}</p>}
          {actionJob ? (
            <p>
              Action Job:{' '}
              <a href={`/settings/actions/${actionJob.id}`}>
                {actionJob.actionType} — <strong>{actionJob.status}</strong>
              </a>
            </p>
          ) : (
            <button type="button" disabled={busy} onClick={createAction}>
              {busy ? 'Creating…' : 'Create Action Job'}
            </button>
          )}
        </section>
      )}

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Business</h2>
        <p>
          {business ? (
            <a href={`/businesses/${business.id}`}>{business.name}</a>
          ) : (
            (presentation?.business.name ?? '(unknown)')
          )}
        </p>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Opportunity</h2>
        <p>
          {opportunity ? (
            <>
              Decision {opportunity.decision} · Status {opportunity.status}
            </>
          ) : (
            '(unavailable)'
          )}
        </p>
        <p>Post: {presentation?.opportunity.message ?? '(none)'}</p>
        {presentation?.links.facebookPostUrl && (
          <p>
            <a href={presentation.links.facebookPostUrl} target="_blank" rel="noopener noreferrer">
              Open Facebook Post →
            </a>
          </p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Draft</h2>
        {draft ? (
          <blockquote
            style={{
              borderLeft: '3px solid #ccc',
              margin: '0.5rem 0',
              padding: '0.25rem 0.75rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {draft.content ?? '(no content)'}
          </blockquote>
        ) : (
          <p>(draft unavailable)</p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Edited Draft</h2>
        {review.editedContent ? (
          <blockquote
            style={{
              borderLeft: '3px solid #0a7d28',
              margin: '0.5rem 0',
              padding: '0.25rem 0.75rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {review.editedContent}
          </blockquote>
        ) : (
          <p style={{ color: '#666' }}>No edit yet.</p>
        )}
        {pending && (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              style={{ width: '100%' }}
            />
            <button
              type="button"
              disabled={busy || editText.trim().length === 0}
              onClick={() => act(() => api.editReview(id, editText))}
            >
              Save edit (still needs approval)
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Decision History</h2>
        {events.length === 0 ? (
          <p>No events.</p>
        ) : (
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.event}</strong> — {new Date(e.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
