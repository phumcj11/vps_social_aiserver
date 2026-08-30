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
  type Environment,
} from '../../../../lib/api';
import { Nav } from '../../../../components/Nav';
import { MediaThumb } from '../../businesses/MediaManager';
import { mediaReasonThai, noMediaReasonThai } from '../../businesses/media-ui';
import {
  REVIEW_PAGE_TITLE,
  REVIEW_QUEUE_TITLE,
  REVIEW_SAFETY_NOTICE,
  REVIEW_SECTIONS,
  REVIEW_SAVE_LABEL,
  REVIEW_SAVE_OK,
  REVIEW_SAVE_ERROR,
  REVIEW_APPROVE_LABEL,
  REVIEW_REJECT_LABEL,
  REVIEW_DECISION_REMINDER,
  TEST_DATA_BADGE,
  reviewStatusThai,
  reviewEventThai,
  propertyReasonThai,
  contactTypeThai,
  draftPermissionLabel,
  publicPermissionLabel,
  NO_PROPERTY_MATCH_SUMMARY,
  NO_PROPERTY_MATCH_EXPLANATION,
  NO_PROPERTY_MATCH_SAFE_NOTE,
  CUSTOMER_NEEDS_TITLE,
  CANDIDATE_CLOSEST_BADGE,
  requirementLinesThai,
  candidateReasonThai,
  closestCandidateName,
} from '../review-ui';

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

// ── Small inline UI atoms (page-local; no global design system) ────────────────
const C = {
  ok: '#0a7d28',
  okBg: '#f3faf4',
  okBorder: '#cfe8d4',
  warn: '#b26a00',
  warnBg: '#fff8e1',
  warnBorder: '#f0d58c',
  danger: '#b00020',
  muted: '#666',
  border: '#e2e2e2',
};
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '1.1rem' }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>{title}</h2>
      {children}
    </section>
  );
}
function Card({
  tone = 'ok',
  children,
}: {
  tone?: 'ok' | 'warn' | 'plain';
  children: React.ReactNode;
}) {
  const bg = tone === 'ok' ? C.okBg : tone === 'warn' ? C.warnBg : '#fff';
  const bd = tone === 'ok' ? C.okBorder : tone === 'warn' ? C.warnBorder : C.border;
  return (
    <div style={{ border: `1px solid ${bd}`, background: bg, borderRadius: 8, padding: '0.75rem' }}>
      {children}
    </div>
  );
}

export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [email, setEmail] = useState<string | undefined>();
  const [review, setReview] = useState<ReviewTask | null>(null);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [business, setBusiness] = useState<BizView | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [opportunity, setOpportunity] = useState<OppView | null>(null);
  const [presentation, setPresentation] = useState<ReviewPresentation | null>(null);
  const [propertyMatch, setPropertyMatch] =
    useState<Awaited<ReturnType<typeof api.getReview>>['propertyMatch']>(null);
  const [property, setProperty] =
    useState<Awaited<ReturnType<typeof api.getReview>>['property']>(null);
  const [approvedContacts, setApprovedContacts] = useState<
    Awaited<ReturnType<typeof api.getReview>>['approvedContacts']
  >([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [mediaSuggestion, setMediaSuggestion] = useState<Awaited<
    ReturnType<typeof api.mediaSuggestion>
  > | null>(null);
  const [useImage, setUseImage] = useState(true);
  const [actionJob, setActionJob] = useState<ActionJob | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editText, setEditText] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
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
    setApprovedContacts(res.approvedContacts);
    setEvents(res.events);
    setEditText(res.review.editedContent ?? res.draft?.content ?? '');
    if (res.business?.id) {
      const r = await api.getBusinessReadiness(res.business.id).catch(() => null);
      setEnvironment(r?.environment ?? null);
    }
    // Deterministic media suggestion (read-only; never published).
    if (res.business?.id && res.match?.id) {
      const sug = await api.mediaSuggestion(res.business.id, res.match.id).catch(() => null);
      setMediaSuggestion(sug);
    }
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
      setActionMsg(err instanceof ApiRequestError ? err.message : 'ไม่สามารถสร้างงานได้');
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

  /** Decision actions (approve/reject) — decision only, never posts to Facebook. */
  async function decide(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'ไม่สามารถดำเนินการได้');
    } finally {
      setBusy(false);
    }
  }

  /** Save the edited text — SEPARATE from approval; saving never approves. */
  async function saveText() {
    setSaveMsg(null);
    setBusy(true);
    try {
      await api.editReview(id, editText);
      await load();
      setSaveMsg(`✓ ${REVIEW_SAVE_OK}`);
    } catch {
      setSaveMsg(REVIEW_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main style={{ padding: '1rem' }}>กำลังโหลด…</main>;
  if (!review) return <main style={{ padding: '1rem' }}>ไม่พบรายการ</main>;

  const pending = review.status === 'PENDING';
  const isTest = environment === 'test';
  const isMatch = propertyMatch?.decision === 'MATCH' && !!property;
  const propReasons = (propertyMatch?.reasons ?? [])
    .filter((r) => r.includes('_MATCH'))
    .map(propertyReasonThai)
    .filter(Boolean);
  // NO_PROPERTY_MATCH presentation (owner-facing explanation of why nothing was
  // auto-selected). Derived from data the matcher already stored — no recompute.
  const requirementLines = requirementLinesThai(propertyMatch?.requirement);
  const candidates = propertyMatch?.rejected ?? [];
  const closest = closestCandidateName(candidates);

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '0 0.75rem' }}>
      <Nav email={email} />
      <p style={{ margin: '0.5rem 0' }}>
        <a href="/settings/reviews">← {REVIEW_QUEUE_TITLE}</a>
      </p>

      {/* 1. Title + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: '0.2rem 0' }}>{REVIEW_PAGE_TITLE}</h1>
        <span
          style={{
            background: pending ? C.warn : C.ok,
            color: '#fff',
            borderRadius: 999,
            padding: '0.1rem 0.6rem',
            fontSize: '0.85rem',
          }}
        >
          {reviewStatusThai(review.status)}
        </span>
        {isTest && (
          <span
            style={{
              background: '#333',
              color: '#fff',
              borderRadius: 999,
              padding: '0.1rem 0.6rem',
              fontSize: '0.85rem',
            }}
          >
            {TEST_DATA_BADGE}
          </span>
        )}
      </div>

      {/* 2. Safety notice */}
      <div
        style={{
          background: C.warnBg,
          border: `1px solid ${C.warnBorder}`,
          borderRadius: 8,
          padding: '0.6rem 0.8rem',
          color: '#5c4500',
          fontWeight: 600,
          margin: '0.6rem 0 1.1rem',
        }}
      >
        {REVIEW_SAFETY_NOTICE}
      </div>

      {/* 3. Customer request */}
      <Section title={REVIEW_SECTIONS.customerRequest}>
        <Card tone="plain">
          <p style={{ margin: 0, fontSize: '1.05rem' }}>
            “{presentation?.opportunity.message ?? opportunity?.decision ?? '—'}”
          </p>
        </Card>
      </Section>

      {/* 4 + 5. Selected property + reasons */}
      {isMatch ? (
        <>
          <Section title={REVIEW_SECTIONS.selectedProperty}>
            <Card tone="ok">
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{property!.name}</p>
              <p style={{ margin: '0.15rem 0 0', color: C.muted }}>
                {business?.name ?? '—'}
                {property!.area ? ` · ${property!.area}` : ''}
                {property!.maxGuests != null ? ` · รองรับสูงสุด ${property!.maxGuests} คน` : ''}
              </p>
            </Card>
          </Section>
          {propReasons.length > 0 && (
            <Section title={REVIEW_SECTIONS.propertyReasons}>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {propReasons.map((r) => (
                  <li key={r} style={{ color: C.ok }}>
                    ✓ {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <Section title={REVIEW_SECTIONS.selectedProperty}>
          {/* NO_PROPERTY_MATCH — explain WHY nothing was auto-selected, in plain
              Thai, from data the matcher already stored. Suggested Property stays
              NONE; nothing here changes matcher/policy decisions. */}
          <Card tone="warn">
            <p style={{ margin: '0 0 0.3rem', fontWeight: 700 }}>⚠ {NO_PROPERTY_MATCH_SUMMARY}</p>

            {requirementLines.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ margin: '0 0 0.2rem', fontWeight: 600, fontSize: '0.9rem' }}>
                  {CUSTOMER_NEEDS_TITLE}
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
                  {requirementLines.map((r) => (
                    <li key={r.label}>
                      {r.label}: {r.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {candidates.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: 8 }}>
                {candidates.map((c, i) => {
                  const lines = c.reasons
                    .map(candidateReasonThai)
                    .filter((x): x is NonNullable<typeof x> => x !== null);
                  const isClosest = c.propertyName != null && c.propertyName === closest;
                  return (
                    <div
                      key={`${c.propertyName ?? 'candidate'}-${i}`}
                      style={{
                        border: `1px solid ${C.warnBorder}`,
                        background: '#fff',
                        borderRadius: 6,
                        padding: '0.5rem 0.6rem',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                      >
                        <strong>{c.propertyName ?? 'ที่พัก'}</strong>
                        {isClosest && (
                          <span
                            style={{
                              background: C.warn,
                              color: '#fff',
                              borderRadius: 999,
                              padding: '0.05rem 0.5rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            {CANDIDATE_CLOSEST_BADGE}
                          </span>
                        )}
                      </div>
                      {lines.length > 0 && (
                        <ul
                          style={{
                            margin: '0.3rem 0 0',
                            paddingLeft: '1.2rem',
                            fontSize: '0.88rem',
                          }}
                        >
                          {lines.map((l, j) => (
                            <li
                              key={j}
                              style={{
                                color: l.mark === '✓' ? C.ok : l.mark === '✗' ? C.danger : C.warn,
                              }}
                            >
                              {l.mark} {l.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
              {NO_PROPERTY_MATCH_EXPLANATION}
            </p>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: C.muted }}>
              {NO_PROPERTY_MATCH_SAFE_NOTE}
            </p>
          </Card>
        </Section>
      )}

      {/* 6. Contact channel (separate from image permissions) */}
      <Section title={REVIEW_SECTIONS.contact}>
        {approvedContacts.length === 0 ? (
          <p style={{ color: C.warn }}>⚠ ยังไม่มีช่องทางติดต่อที่ได้รับอนุญาต</p>
        ) : (
          approvedContacts.map((c) => (
            <Card key={`${c.type}-${c.value}`} tone="ok">
              <strong>
                {contactTypeThai(c.type)} {c.value}
              </strong>
              {c.label ? <span style={{ color: C.muted }}> · {c.label}</span> : null}
              <div style={{ fontSize: '0.85rem', color: C.ok, marginTop: 4 }}>
                ✓ อนุญาตให้ใช้ในข้อความ Draft
                {c.ownerVerified ? ' · ✓ เจ้าของยืนยันข้อมูลแล้ว' : ''}
              </div>
            </Card>
          ))
        )}
      </Section>

      {/* 7 + 8 + 9. Suggested image, reasons, permissions */}
      <Section title={REVIEW_SECTIONS.suggestedImage}>
        {mediaSuggestion?.suggestion ? (
          <Card tone="ok">
            <div
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', opacity: useImage ? 1 : 0.5 }}
            >
              <MediaThumb
                fileUrl={mediaSuggestion.suggestion.fileUrl}
                alt={mediaSuggestion.suggestion.caption ?? 'suggested image'}
              />
              <div style={{ flex: 1, minWidth: 220 }}>
                {mediaSuggestion.suggestion.caption ? (
                  <p style={{ margin: '0 0 0.35rem' }}>{mediaSuggestion.suggestion.caption}</p>
                ) : null}
                <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>
                  {REVIEW_SECTIONS.imageReasons}
                </p>
                <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.2rem' }}>
                  {mediaSuggestion.reasons.map((r) => (
                    <li key={r} style={{ color: C.ok }}>
                      ✓ {mediaReasonThai(r)}
                    </li>
                  ))}
                </ul>
                <div
                  style={{
                    borderTop: `1px solid ${C.okBorder}`,
                    paddingTop: 6,
                    fontSize: '0.9rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{REVIEW_SECTIONS.imagePermission}</div>
                  <div style={{ color: C.ok }}>{draftPermissionLabel()}</div>
                  <div style={{ color: mediaSuggestion.publicResponseApproved ? C.ok : C.danger }}>
                    {publicPermissionLabel(mediaSuggestion.publicResponseApproved)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" onClick={() => setUseImage(true)} disabled={useImage}>
                    ใช้รูปนี้
                  </button>
                  <button type="button" onClick={() => setUseImage(false)} disabled={!useImage}>
                    ไม่ใช้รูป
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <p style={{ color: C.muted }}>
            {mediaSuggestion
              ? `ไม่มีรูปที่แนะนำ — ${noMediaReasonThai(mediaSuggestion.reasons[0] ?? '')} (ข้อความยังใช้งานได้)`
              : '—'}
          </p>
        )}
      </Section>

      {/* 10. One draft experience */}
      <Section title={REVIEW_SECTIONS.draft}>
        {pending ? (
          <>
            <textarea
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                if (saveMsg) setSaveMsg(null);
              }}
              rows={5}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.5rem',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <button
                type="button"
                disabled={busy || editText.trim().length === 0}
                onClick={saveText}
              >
                {REVIEW_SAVE_LABEL}
              </button>
              {saveMsg && (
                <span style={{ color: saveMsg.startsWith('✓') ? C.ok : C.danger }}>{saveMsg}</span>
              )}
            </div>
          </>
        ) : (
          <Card tone="plain">
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {review.editedContent ?? draft?.content ?? '(ไม่มีข้อความ)'}
            </p>
          </Card>
        )}
      </Section>

      {/* 11. Decision */}
      <Section title={REVIEW_SECTIONS.decision}>
        {error && <p style={{ color: C.danger }}>{error}</p>}
        {pending ? (
          <>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(() => api.approveReview(id))}
                style={{
                  background: C.ok,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0.5rem 1rem',
                  fontSize: '1rem',
                }}
              >
                {REVIEW_APPROVE_LABEL}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(() => api.rejectReview(id))}
                style={{
                  background: '#fff',
                  color: C.danger,
                  border: `1px solid ${C.danger}`,
                  borderRadius: 6,
                  padding: '0.5rem 1rem',
                  fontSize: '1rem',
                }}
              >
                {REVIEW_REJECT_LABEL}
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: C.warn, margin: '0.5rem 0 0' }}>
              {REVIEW_DECISION_REMINDER}
            </p>
          </>
        ) : (
          <p style={{ color: C.muted }}>
            รายการนี้ปิดแล้ว ({reviewStatusThai(review.status)})
            {review.decidedBy ? ` · โดย ${review.decidedBy}` : ''}
          </p>
        )}
      </Section>

      {/* 12. History */}
      <Section title={REVIEW_SECTIONS.history}>
        {events.length === 0 ? (
          <p style={{ color: C.muted }}>ยังไม่มีประวัติ</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: C.muted }}>
            {events.map((e) => (
              <li key={e.id}>
                {reviewEventThai(e.event)} · {new Date(e.createdAt).toLocaleString('th-TH')}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 13. Advanced (internal codes/details kept out of the owner flow) */}
      <details style={{ marginTop: '0.5rem', color: C.muted }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{REVIEW_SECTIONS.advanced}</summary>
        <div style={{ fontSize: '0.85rem', marginTop: 8 }}>
          <p style={{ margin: '0 0 0.25rem' }}>สถานะ: {review.status}</p>
          {opportunity && (
            <p style={{ margin: '0 0 0.25rem' }}>
              Opportunity: decision {opportunity.decision} · status {opportunity.status}
            </p>
          )}
          {propertyMatch && (
            <p style={{ margin: '0 0 0.25rem' }}>
              Property match: {propertyMatch.decision} · ประเมิน {propertyMatch.candidatesEvaluated}{' '}
              ที่พัก · {propertyMatch.matcherVersion} · reasons [{propertyMatch.reasons.join(', ')}]
            </p>
          )}
          {mediaSuggestion && (
            <p style={{ margin: '0 0 0.25rem' }}>
              Media reasons: [{mediaSuggestion.reasons.join(', ')}] · mode{' '}
              {mediaSuggestion.imageResponseMode}
            </p>
          )}
          {business && (
            <p style={{ margin: '0 0 0.25rem' }}>
              Business: <a href={`/businesses/${business.id}`}>{business.name}</a>
            </p>
          )}
          {presentation?.links.facebookPostUrl && (
            <p style={{ margin: '0 0 0.25rem' }}>
              <a
                href={presentation.links.facebookPostUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open source post →
              </a>
            </p>
          )}
          {review.status === 'APPROVED' && (
            <div style={{ marginTop: 6 }}>
              <p style={{ margin: '0 0 0.25rem' }}>
                งานนี้ยังไม่ถูกดำเนินการบน Facebook (การเชื่อมต่อปิดอยู่)
              </p>
              {actionMsg && <p style={{ color: C.danger }}>{actionMsg}</p>}
              {actionJob ? (
                <a href={`/settings/actions/${actionJob.id}`}>
                  Action Job: {actionJob.actionType} — {actionJob.status}
                </a>
              ) : (
                <button type="button" disabled={busy} onClick={createAction}>
                  {busy ? 'กำลังสร้าง…' : 'สร้าง Action Job (ยังไม่โพสต์)'}
                </button>
              )}
            </div>
          )}
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.2rem' }}>
            {events.map((e) => (
              <li key={e.id}>
                {e.event} — {new Date(e.createdAt).toISOString()}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </main>
  );
}
