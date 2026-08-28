/**
 * Typed API client for the KMKT Social AI web app.
 *
 * All requests are sent with credentials so the HttpOnly session cookie is
 * included. The browser automatically sets the Origin header, which the API's
 * CSRF guard checks. No token is ever stored in JS/localStorage.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface User {
  id: string;
  email: string;
  status: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfile {
  businessId: string;
  category: string | null;
  description: string | null;
  sellingPoints: string[];
  serviceArea: string | null;
  contactInformation: string | null;
  responseTone: string | null;
  prohibitedClaims: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Knowledge {
  id: string;
  businessId: string;
  title: string;
  content: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchingRule {
  id: string;
  businessId: string;
  ruleType: string;
  ruleValue: string;
  priority: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePatch {
  category?: string;
  description?: string | null;
  sellingPoints?: string[];
  serviceArea?: string | null;
  contactInformation?: string | null;
  responseTone?: string | null;
  prohibitedClaims?: string[];
}

export const RULE_TYPES = [
  'province',
  'district',
  'keyword',
  'guest_count',
  'budget',
  'facility',
  'custom',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

// ── SPRINT 015/016 — Business + Property production data ──────────────────────
export type Environment = 'test' | 'production';
export type EntityStatus = 'active' | 'inactive' | 'archived';
export type ContactChannelType =
  'PHONE' | 'LINE_ID' | 'LINE_OA' | 'FACEBOOK_PAGE' | 'WEBSITE' | 'EMAIL' | 'OTHER';

export interface ContactChannel {
  id: string;
  businessId: string;
  type: ContactChannelType;
  value: string;
  label: string | null;
  enabled: boolean;
  approvedForDrafts: boolean;
  approvedForPublicResponse: boolean;
  ownerVerifiedAt: string | null;
}

export type AvailabilityPolicy =
  'MANUAL_CONFIRMATION' | 'OWNER_SYSTEM' | 'EXTERNAL_CALENDAR' | 'DO_NOT_MENTION';
export type PricingPolicy =
  'DO_NOT_MENTION' | 'STARTING_FROM' | 'FIXED_REFERENCE' | 'MANUAL_CONFIRMATION';
export type PromotionPolicy = 'NONE' | 'APPROVED_ONLY' | 'MANUAL_CONFIRMATION';
export type BookingPolicy = 'CONTACT_ONLY' | 'LINE' | 'PHONE' | 'WEBSITE' | 'MANUAL';

export type NoPropertyMatchStrategy = 'DO_NOT_RESPOND' | 'DRAFT_BUSINESS_ONLY' | 'HUMAN_REVIEW';
export type ImageResponseMode =
  'OFF' | 'MATCHED_PROPERTY_ONLY' | 'BUSINESS_FALLBACK' | 'HUMAN_REVIEW_ONLY';

export interface MediaAsset {
  id: string;
  businessId: string;
  propertyId: string | null;
  category: string;
  caption: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  approvedForDrafts: boolean;
  approvedForPublicResponse: boolean;
  ownerVerified: boolean;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  originalFilename: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
}
export interface MediaUpdate {
  category: string;
  caption: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  approvedForDrafts: boolean;
  approvedForPublicResponse: boolean;
  ownerVerified: boolean;
}

export interface BusinessPolicies {
  availabilityPolicy: AvailabilityPolicy;
  pricingPolicy: PricingPolicy;
  promotionPolicy: PromotionPolicy;
  bookingPolicy: BookingPolicy;
  cancellationInfoPolicy: string | null;
  prohibitedClaims: string[];
  escalationPolicy: string | null;
  responsibleOwner: string | null;
  operatingHours: string | null;
  responseSlaMinutes: number | null;
  noPropertyMatchStrategy: NoPropertyMatchStrategy;
  allowNearMatchSuggestions: boolean;
  imageResponseMode: ImageResponseMode;
}

export interface PropertyPolicyOverrides {
  availabilityPolicy: AvailabilityPolicy | null;
  pricingPolicy: PricingPolicy | null;
  promotionPolicy: PromotionPolicy | null;
  bookingPolicy: BookingPolicy | null;
  prohibitedClaims: string[] | null;
}

export interface Property {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  propertyType: string | null;
  status: EntityStatus;
  description: string | null;
  location: {
    province: string | null;
    district: string | null;
    subdistrict: string | null;
    area: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  capacity: {
    bedrooms: number | null;
    bathrooms: number | null;
    beds: number | null;
    maxGuests: number | null;
    extraGuestPolicy: string | null;
  };
  amenities: Record<string, boolean | string[]>;
  pricing: {
    startingPrice: number | null;
    priceDisplayMode: string;
    weekdayPrice: number | null;
    weekendPrice: number | null;
    holidayPolicy: string | null;
    securityDeposit: number | null;
    extraGuestPrice: number | null;
  };
  content: {
    sellingPoints: string[];
    importantNotes: string | null;
    prohibitedClaims: string[];
    responseNotes: string | null;
  };
  media: {
    coverImage: string | null;
    gallery: string[];
    videoUrl: string | null;
    mapUrl: string | null;
  };
  policyOverrides: PropertyPolicyOverrides;
  createdAt: string;
  updatedAt: string;
}

export interface ReadinessVerdict {
  ready: boolean;
  status: 'READY' | 'NOT_READY';
  missing: string[];
}

export interface EffectivePolicies {
  availabilityPolicy: AvailabilityPolicy;
  pricingPolicy: PricingPolicy;
  promotionPolicy: PromotionPolicy;
  bookingPolicy: BookingPolicy;
  prohibitedClaims: string[];
  inheritedFields: string[];
  overriddenFields: string[];
}

export interface BusinessAuditEvent {
  id: string;
  businessId: string | null;
  propertyId: string | null;
  eventType: string;
  actorEmail: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface FacebookStatus {
  connected: boolean;
  status: 'active' | 'disconnected' | 'blocked' | 'none';
  connectionState: string;
  displayName: string | null;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  sessionExpiresAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  userActionRequired: string | null;
  cleanupRequired: boolean;
}

export interface SourceGroupView {
  id: string;
  name: string | null;
  url: string;
  status: string;
  accessState: string;
  subscribed: boolean;
  subscriberCount: number;
}

export interface SourceSubscriptionsResponse {
  sourceConfigured: boolean;
  groups: SourceGroupView[];
}

export interface OperatorFacebookSources {
  sourceConfigured: boolean;
  readerEnabled: boolean;
  writeEnabled: boolean;
  account: {
    connected: boolean;
    status: string;
    connectionState: string;
    displayName: string | null;
    lastValidatedAt: string | null;
    userActionRequired: string | null;
  } | null;
  groups: SourceGroupView[];
}

export interface FacebookGroup {
  id: string;
  facebookGroupId: string | null;
  name: string | null;
  canonicalUrl: string;
  originalUrl: string;
  status: 'active' | 'disabled' | 'archived';
  accessState: string;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignedBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface CollectorRunSummary {
  runId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  groupsProcessed: number;
  postsCollected: number;
  errors: number;
  errorSummary: string | null;
  durationMs: number | null;
}

export interface CollectorStatus {
  run: CollectorRunSummary | null;
  totalSignals: number;
  running: boolean;
}

export interface Opportunity {
  id: string;
  signalId: string;
  decision: 'ACCEPT' | 'REJECT';
  status: 'NEW' | 'READY' | 'ARCHIVED';
  classifierVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunitySignal {
  id: string;
  groupId: string;
  facebookPostId: string | null;
  postUrl: string;
  authorName: string | null;
  authorProfile: string | null;
  message: string | null;
  mediaUrls: string[];
  createdTime: string | null;
  normalizedAt: string;
}

export interface OpportunityEvent {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface OpportunityStatistics {
  total: number;
  accepted: number;
  rejected: number;
  new: number;
  ready: number;
  archived: number;
  unclassifiedSignals: number;
}

export interface MatchReason {
  ruleType: string;
  ruleValue: string;
  matched: boolean;
}

export interface BusinessMatch {
  id: string;
  businessId: string;
  businessName: string | null;
  opportunityId: string;
  decision: 'MATCH' | 'NO_MATCH';
  reasons: MatchReason[];
  matcherVersion: string;
  matchedAt: string;
}

export interface MatchRunSummary {
  processedOpportunities: number;
  candidates: number;
  matches: number;
  noMatches: number;
  skipped: number;
}

export type AiDraftStatus = 'draft' | 'needs_review' | 'rejected' | 'superseded';

export interface DraftPolicyResult {
  decision: 'PASS' | 'NEEDS_REVIEW' | 'BLOCK';
  reasons: { code: string; detail: string }[];
}

export interface AiDraftSummary {
  id: string;
  businessMatchId: string;
  opportunityId: string;
  businessId: string;
  version: number;
  status: AiDraftStatus;
  contentPreview: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  policyResult: DraftPolicyResult | null;
  createdAt: string;
}

export interface AiDraft {
  id: string;
  businessMatchId: string;
  opportunityId: string;
  businessId: string;
  version: number;
  status: AiDraftStatus;
  content: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  policyResult: DraftPolicyResult | null;
  context: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiDraftEvent {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ReviewTask {
  id: string;
  businessMatchId: string;
  draftId: string;
  status: ReviewStatus;
  assignedTo: string | null;
  editedContent: string | null;
  editor: string | null;
  editedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  businessId: string | null;
  propertyId: string | null;
  propertyMatchId: string | null;
  contextHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyMatchSummary {
  id: string;
  opportunityId: string;
  businessMatchId: string;
  businessId: string;
  businessName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  decision: 'MATCH' | 'NO_MATCH';
  reasons: string[];
  rejected: {
    propertyId: string;
    propertyName: string;
    decision: 'MATCH' | 'NO_MATCH';
    reasons: string[];
  }[];
  requirement: Record<string, unknown>;
  matcherVersion: string;
  candidatesEvaluated: number;
  evaluatedAt: string;
}

export interface PropertyMatchFunnel {
  businessMatch: { MATCH: number; NO_MATCH: number };
  propertyMatch: { MATCH: number; NO_MATCH: number };
  candidatesEvaluated: number;
  propertiesReceivingMatches: number;
  businessMatchWithNoPropertyMatch: number;
  topNoMatchReasons: { reason: string; count: number }[];
}

export interface ReviewPresentation {
  reviewTaskId: string;
  status: ReviewStatus;
  business: { name: string };
  opportunity: { decision: string; message: string | null };
  draft: { content: string | null; version: number; status: string };
  editedContent: string | null;
  links: { facebookPostUrl: string | null; businessUrl: string | null };
}

export interface ReviewEvent {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export type ActionStatus =
  'queued' | 'blocked' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface ActionJob {
  id: string;
  reviewTaskId: string;
  aiDraftId: string;
  businessMatchId: string;
  actionType: string;
  status: ActionStatus;
  targetPlatform: string;
  targetUrl: string;
  approvedContent: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionStatistics {
  total: number;
  queued: number;
  blocked: number;
  processing: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface ActionPolicy {
  outcome: 'ALLOW' | 'BLOCK' | 'REJECT';
  reasons: { code: string; detail: string }[];
}

export interface ActionEvent {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ExecutionSession {
  id: string;
  actionJobId: string;
  attemptNumber: number;
  status: string;
  adapter: string;
  recoveryState: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  preflightVerifiedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  ambiguousAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEvidence {
  id: string;
  evidenceType: string;
  storageKey: string | null;
  evidenceHash: string | null;
  facebookCommentId: string | null;
  observedContent: string | null;
  observedAuthor: string | null;
  observedPostUrl: string | null;
  observedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ExecutionRecovery {
  disposition: 'SAFE_RETRY' | 'NO_RETRY' | 'MANUAL_INVESTIGATION';
  reasonCode: string;
  reasonDetail: string;
  requiresHuman: boolean;
}

export class ApiRequestError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const body = data as ErrorBody;
    throw new ApiRequestError(
      body.error?.message ?? 'Request failed',
      res.status,
      body.error?.code,
    );
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me', { method: 'GET' }),
  getWorkspace: () => request<{ workspace: Workspace }>('/workspaces/current', { method: 'GET' }),
  createWorkspace: (name: string) =>
    request<{ workspace: Workspace }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateWorkspace: (name: string) =>
    request<{ workspace: Workspace }>('/workspaces/current', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  // ── Businesses ─────────────────────────────────────────────────────────────
  listBusinesses: () => request<{ businesses: Business[] }>('/businesses', { method: 'GET' }),
  createBusiness: (name: string, category: string, description?: string) =>
    request<{ business: Business }>('/businesses', {
      method: 'POST',
      body: JSON.stringify({ name, category, description }),
    }),
  getBusiness: (id: string) =>
    request<{ business: Business }>(`/businesses/${id}`, { method: 'GET' }),
  updateBusiness: (id: string, patch: { name?: string; status?: string }) =>
    request<{ business: Business }>(`/businesses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Profile
  getProfile: (id: string) =>
    request<{ profile: BusinessProfile }>(`/businesses/${id}/profile`, { method: 'GET' }),
  updateProfile: (id: string, patch: ProfilePatch) =>
    request<{ profile: BusinessProfile }>(`/businesses/${id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Knowledge
  listKnowledge: (id: string) =>
    request<{ knowledge: Knowledge[] }>(`/businesses/${id}/knowledge`, { method: 'GET' }),
  createKnowledge: (id: string, input: { title: string; content?: string; status?: string }) =>
    request<{ knowledge: Knowledge }>(`/businesses/${id}/knowledge`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateKnowledge: (
    id: string,
    knowledgeId: string,
    patch: { title?: string; content?: string | null; status?: string },
  ) =>
    request<{ knowledge: Knowledge }>(`/businesses/${id}/knowledge/${knowledgeId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteKnowledge: (id: string, knowledgeId: string) =>
    request<{ ok: boolean }>(`/businesses/${id}/knowledge/${knowledgeId}`, { method: 'DELETE' }),

  // Matching rules (deterministic — NOT AI)
  listRules: (id: string) =>
    request<{ matchingRules: MatchingRule[] }>(`/businesses/${id}/matching-rules`, {
      method: 'GET',
    }),
  createRule: (
    id: string,
    input: { ruleType: string; ruleValue: string; priority: number; status?: string },
  ) =>
    request<{ matchingRule: MatchingRule }>(`/businesses/${id}/matching-rules`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateRule: (
    id: string,
    ruleId: string,
    patch: { ruleType?: string; ruleValue?: string; priority?: number; status?: string },
  ) =>
    request<{ matchingRule: MatchingRule }>(`/businesses/${id}/matching-rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteRule: (id: string, ruleId: string) =>
    request<{ ok: boolean }>(`/businesses/${id}/matching-rules/${ruleId}`, { method: 'DELETE' }),

  // ── Media Library (images) ──────────────────────────────────────────────────
  listMedia: (id: string) =>
    request<{ media: MediaAsset[] }>(`/businesses/${id}/media`, { method: 'GET' }),
  uploadMedia: async (
    id: string,
    file: File,
    fields: { category: string; propertyId?: string; caption?: string },
  ): Promise<{ media: MediaAsset }> => {
    const fd = new FormData();
    fd.append('category', fields.category);
    if (fields.propertyId) fd.append('propertyId', fields.propertyId);
    if (fields.caption) fd.append('caption', fields.caption);
    fd.append('file', file);
    // Do NOT set Content-Type — the browser sets the multipart boundary. Origin
    // is sent automatically (CSRF guard checks it); credentials carry the session.
    const res = await fetch(`${BASE}/businesses/${id}/media`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const body = data as ErrorBody;
      throw new ApiRequestError(
        body.error?.message ?? 'Upload failed',
        res.status,
        body.error?.code,
      );
    }
    return data as { media: MediaAsset };
  },
  updateMedia: (id: string, assetId: string, patch: Partial<MediaUpdate>) =>
    request<{ media: MediaAsset }>(`/businesses/${id}/media/${assetId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  // Fetch an auth-gated media file as an object URL (the file route needs the
  // session cookie; a bare cross-origin <img src> would not send it).
  fetchMediaBlobUrl: async (fileUrl: string): Promise<string> => {
    const res = await fetch(`${BASE}${fileUrl}`, { credentials: 'include' });
    if (!res.ok) throw new ApiRequestError('Image load failed', res.status);
    return URL.createObjectURL(await res.blob());
  },
  mediaSuggestion: (id: string, businessMatchId: string) =>
    request<{
      suggestion: MediaAsset | null;
      reasons: string[];
      imageResponseMode: string;
      publicResponseApproved: boolean;
    }>(
      `/businesses/${id}/media/suggestion?businessMatchId=${encodeURIComponent(businessMatchId)}`,
      {
        method: 'GET',
      },
    ),

  // ── Facebook connection ────────────────────────────────────────────────────
  getFacebookAccount: () =>
    request<{ account: FacebookStatus }>('/facebook/account', { method: 'GET' }),
  facebookConnectStart: () =>
    request<{ status: FacebookStatus }>('/facebook/connect/start', { method: 'POST' }),
  facebookConnectStatus: () =>
    request<{ status: FacebookStatus }>('/facebook/connect/status', { method: 'GET' }),
  facebookValidate: () =>
    request<{ status: FacebookStatus }>('/facebook/validate', { method: 'POST' }),
  facebookDisconnect: () =>
    request<{ status: FacebookStatus; cleanupFailed: boolean }>('/facebook/disconnect', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),

  // ── Facebook groups ────────────────────────────────────────────────────────
  listGroups: () => request<{ groups: FacebookGroup[] }>('/facebook/groups', { method: 'GET' }),
  addGroup: (url: string) =>
    request<{ group: FacebookGroup }>('/facebook/groups', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  getGroup: (id: string) =>
    request<{ group: FacebookGroup }>(`/facebook/groups/${id}`, { method: 'GET' }),
  setGroupStatus: (id: string, status: string) =>
    request<{ group: FacebookGroup }>(`/facebook/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  validateGroup: (id: string) =>
    request<{ group: FacebookGroup }>(`/facebook/groups/${id}/validate`, { method: 'POST' }),
  listGroupBusinesses: (id: string) =>
    request<{ businesses: AssignedBusiness[] }>(`/facebook/groups/${id}/businesses`, {
      method: 'GET',
    }),
  assignGroupBusiness: (id: string, businessId: string) =>
    request<{ ok: boolean }>(`/facebook/groups/${id}/businesses`, {
      method: 'POST',
      body: JSON.stringify({ businessId }),
    }),
  unassignGroupBusiness: (id: string, businessId: string) =>
    request<{ ok: boolean }>(`/facebook/groups/${id}/businesses/${businessId}`, {
      method: 'DELETE',
    }),
  listBusinessGroups: (businessId: string) =>
    request<{ groups: FacebookGroup[] }>(`/businesses/${businessId}/facebook-groups`, {
      method: 'GET',
    }),

  // ── SPRINT 016 — Business + Property production data ────────────────────────
  setBusinessEnvironment: (id: string, environment: Environment) =>
    request<{ environment: Environment }>(`/businesses/${id}/environment`, {
      method: 'PATCH',
      body: JSON.stringify({ environment }),
    }),
  getBusinessPolicies: (id: string) =>
    request<{ policies: BusinessPolicies | null }>(`/businesses/${id}/policies`, { method: 'GET' }),
  putBusinessPolicies: (id: string, policies: BusinessPolicies) =>
    request<{ policies: BusinessPolicies }>(`/businesses/${id}/policies`, {
      method: 'PUT',
      body: JSON.stringify(policies),
    }),
  listContacts: (id: string) =>
    request<{ contacts: ContactChannel[] }>(`/businesses/${id}/contacts`, { method: 'GET' }),
  createContact: (id: string, input: { type: ContactChannelType; value: string; label?: string }) =>
    request<{ contact: ContactChannel }>(`/businesses/${id}/contacts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateContact: (
    id: string,
    cid: string,
    patch: Partial<ContactChannel> & { ownerVerified?: boolean },
  ) =>
    request<{ contact: ContactChannel }>(`/businesses/${id}/contacts/${cid}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  listProperties: (id: string) =>
    request<{ properties: Property[] }>(`/businesses/${id}/properties`, { method: 'GET' }),
  createProperty: (
    id: string,
    input: { name: string; code?: string; propertyType?: string; description?: string },
  ) =>
    request<{ property: Property }>(`/businesses/${id}/properties`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getProperty: (id: string, pid: string) =>
    request<{ property: Property }>(`/businesses/${id}/properties/${pid}`, { method: 'GET' }),
  updateProperty: (id: string, pid: string, patch: Record<string, unknown>) =>
    request<{ property: Property }>(`/businesses/${id}/properties/${pid}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  archiveProperty: (id: string, pid: string) =>
    request<{ property: Property }>(`/businesses/${id}/properties/${pid}/archive`, {
      method: 'POST',
    }),
  putPropertyPolicies: (id: string, pid: string, overrides: PropertyPolicyOverrides) =>
    request<{ property: Property }>(`/businesses/${id}/properties/${pid}/policies`, {
      method: 'PUT',
      body: JSON.stringify(overrides),
    }),
  getBusinessReadiness: (id: string) =>
    request<{ readiness: ReadinessVerdict; environment: Environment; activePropertyCount: number }>(
      `/businesses/${id}/readiness`,
      { method: 'GET' },
    ),
  getPropertyReadiness: (id: string, pid: string) =>
    request<{ readiness: ReadinessVerdict; effectivePolicies?: EffectivePolicies }>(
      `/businesses/${id}/properties/${pid}/readiness`,
      { method: 'GET' },
    ),
  listBusinessAudit: (id: string) =>
    request<{ events: BusinessAuditEvent[] }>(`/businesses/${id}/audit`, { method: 'GET' }),

  // ── Collector ──────────────────────────────────────────────────────────────
  getCollectorStatus: () => request<CollectorStatus>('/collector/status', { method: 'GET' }),
  startCollector: () =>
    request<{ run: CollectorRunSummary }>('/collector/start', { method: 'POST' }),
  stopCollector: () =>
    request<{ run: CollectorRunSummary | null }>('/collector/stop', { method: 'POST' }),
  listCollectorRuns: () =>
    request<{ runs: CollectorRunSummary[] }>('/collector/runs', { method: 'GET' }),

  // ── Opportunities ──────────────────────────────────────────────────────────
  classifyOpportunities: () =>
    request<{ summary: { processed: number; accepted: number; rejected: number } }>(
      '/opportunities/classify',
      { method: 'POST' },
    ),
  getOpportunityStatistics: () =>
    request<{ statistics: OpportunityStatistics }>('/opportunities/statistics', { method: 'GET' }),
  listOpportunities: (filter?: { status?: string; decision?: string }) => {
    const q = new URLSearchParams();
    if (filter?.status) q.set('status', filter.status);
    if (filter?.decision) q.set('decision', filter.decision);
    const qs = q.toString();
    return request<{ opportunities: Opportunity[] }>(`/opportunities${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
  getOpportunity: (id: string) =>
    request<{
      opportunity: Opportunity;
      signal: OpportunitySignal | null;
      events: OpportunityEvent[];
    }>(`/opportunities/${id}`, { method: 'GET' }),
  setOpportunityStatus: (id: string, status: string) =>
    request<{ opportunity: Opportunity }>(`/opportunities/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ── Business matching (SPRINT 008) ─────────────────────────────────────────
  runBusinessMatching: () =>
    request<{ summary: MatchRunSummary }>('/business-matching/run', { method: 'POST' }),
  listBusinessMatches: (filter?: {
    opportunityId?: string;
    businessId?: string;
    decision?: string;
  }) => {
    const q = new URLSearchParams();
    if (filter?.opportunityId) q.set('opportunityId', filter.opportunityId);
    if (filter?.businessId) q.set('businessId', filter.businessId);
    if (filter?.decision) q.set('decision', filter.decision);
    const qs = q.toString();
    return request<{ matches: BusinessMatch[] }>(`/business-matches${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
  getBusinessMatch: (id: string) =>
    request<{
      match: BusinessMatch;
      business: { id: string; name: string; slug: string; status: string } | null;
      opportunity: Opportunity | null;
    }>(`/business-matches/${id}`, { method: 'GET' }),

  // ── AI drafts (SPRINT 009) — DRAFT ONLY; never sent to Facebook ────────────
  generateAiDraft: (businessMatchId: string) =>
    request<{ draft: AiDraft; created: boolean }>('/ai-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({ businessMatchId }),
    }),
  regenerateAiDraft: (id: string) =>
    request<{ draft: AiDraft; created: boolean }>(`/ai-drafts/${id}/regenerate`, {
      method: 'POST',
    }),
  rejectAiDraft: (id: string) =>
    request<{ draft: AiDraft }>(`/ai-drafts/${id}/reject`, { method: 'POST' }),
  listAiDrafts: (filter?: { businessMatchId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (filter?.businessMatchId) q.set('businessMatchId', filter.businessMatchId);
    if (filter?.status) q.set('status', filter.status);
    const qs = q.toString();
    return request<{ drafts: AiDraftSummary[] }>(`/ai-drafts${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
  getAiDraft: (id: string) =>
    request<{
      draft: AiDraft;
      events: AiDraftEvent[];
      match: {
        id: string;
        decision: string;
        reasons: MatchReason[];
        matcherVersion: string;
      } | null;
      opportunity: { id: string; decision: string; status: string } | null;
      business: { id: string; name: string; slug: string; status: string } | null;
    }>(`/ai-drafts/${id}`, { method: 'GET' }),
  listAiDraftsForMatch: (matchId: string) =>
    request<{ drafts: AiDraftSummary[] }>(`/business-matches/${matchId}/ai-drafts`, {
      method: 'GET',
    }),

  // ── Human Review (SPRINT 010) — decisions recorded only; never posts ───────
  enqueueReview: (draftId: string) =>
    request<{ review: ReviewTask; created: boolean }>('/reviews', {
      method: 'POST',
      body: JSON.stringify({ draftId }),
    }),
  listReviews: (filter?: { status?: string; businessMatchId?: string }) => {
    const q = new URLSearchParams();
    if (filter?.status) q.set('status', filter.status);
    if (filter?.businessMatchId) q.set('businessMatchId', filter.businessMatchId);
    const qs = q.toString();
    return request<{ reviews: ReviewTask[] }>(`/reviews${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
  getReview: (id: string) =>
    request<{
      review: ReviewTask;
      draft: { id: string; version: number; status: string; content: string | null } | null;
      match: { id: string; decision: string; reasons: MatchReason[] } | null;
      opportunity: { id: string; decision: string; status: string } | null;
      business: { id: string; name: string; slug: string; status: string } | null;
      presentation: ReviewPresentation | null;
      events: ReviewEvent[];
      // SPRINT 016B — Property-match review context + warnings.
      propertyMatch: {
        id: string;
        decision: 'MATCH' | 'NO_MATCH';
        propertyId: string | null;
        propertyName: string | null;
        reasons: string[];
        matcherVersion: string;
        candidatesEvaluated: number;
        requirement: Record<string, unknown>;
      } | null;
      property: {
        id: string;
        name: string;
        propertyType: string | null;
        area: string | null;
        maxGuests: number | null;
        bedrooms: number | null;
      } | null;
      warnings: string[];
      // SPRINT 017 — approved contact(s) the draft may use.
      approvedContacts: {
        type: ContactChannelType;
        value: string;
        label: string | null;
        approvedForDrafts: boolean;
        approvedForPublicResponse: boolean;
        ownerVerified: boolean;
      }[];
    }>(`/reviews/${id}`, { method: 'GET' }),
  listPropertyMatches: (filter?: { opportunityId?: string; decision?: string }) => {
    const q = new URLSearchParams();
    if (filter?.opportunityId) q.set('opportunityId', filter.opportunityId);
    if (filter?.decision) q.set('decision', filter.decision);
    const qs = q.toString();
    return request<{ matches: PropertyMatchSummary[] }>(`/property-matches${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
  getPropertyMatchingFunnel: () =>
    request<{ funnel: PropertyMatchFunnel }>('/property-matching/funnel', { method: 'GET' }),
  approveReview: (id: string, reason?: string) =>
    request<{ review: ReviewTask }>(`/reviews/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  rejectReview: (id: string, reason?: string) =>
    request<{ review: ReviewTask }>(`/reviews/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  editReview: (id: string, editedContent: string) =>
    request<{ review: ReviewTask }>(`/reviews/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ editedContent }),
    }),

  // ── Action Queue (SPRINT 011) — safe boundary; NEVER executes Facebook ─────
  createAction: (reviewTaskId: string, actionType = 'facebook_comment') =>
    request<{ action: ActionJob; policy: ActionPolicy }>('/actions', {
      method: 'POST',
      body: JSON.stringify({ reviewTaskId, actionType }),
    }),
  listActions: (filter?: { status?: string; reviewTaskId?: string }) => {
    const q = new URLSearchParams();
    if (filter?.status) q.set('status', filter.status);
    if (filter?.reviewTaskId) q.set('reviewTaskId', filter.reviewTaskId);
    const qs = q.toString();
    return request<{ actions: ActionJob[]; statistics: ActionStatistics }>(
      `/actions${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
    );
  },
  getAction: (id: string) =>
    request<{
      action: ActionJob;
      review: { id: string; status: string; draftId: string } | null;
      draft: { id: string; version: number; status: string } | null;
      match: { id: string; decision: string; businessId: string } | null;
      policyReasons: { code: string; detail: string }[];
      events: ActionEvent[];
    }>(`/actions/${id}`, { method: 'GET' }),
  cancelAction: (id: string) =>
    request<{ action: ActionJob }>(`/actions/${id}/cancel`, { method: 'POST' }),
  retryAction: (id: string) =>
    request<{ action: ActionJob }>(`/actions/${id}/retry`, { method: 'POST' }),
  recheckActionPolicy: (id: string) =>
    request<{ action: ActionJob; policy: ActionPolicy }>(`/actions/${id}/recheck-policy`, {
      method: 'POST',
    }),

  // Safe Execution (SPRINT 012). No "Execute Now"; under safe defaults this is
  // blocked. No control here enables writes or the kill switch.
  prepareExecution: (id: string) =>
    request<{ status: string; blockedReasons: string[] | null; session: ExecutionSession | null }>(
      `/actions/${id}/prepare-execution`,
      { method: 'POST' },
    ),
  listExecutionSessions: (id: string) =>
    request<{ sessions: ExecutionSession[] }>(`/actions/${id}/execution-sessions`, {
      method: 'GET',
    }),
  getExecutionSession: (sessionId: string) =>
    request<{ session: ExecutionSession; evidence: ExecutionEvidence[] }>(
      `/action-executions/${sessionId}`,
      { method: 'GET' },
    ),
  listExecutionEvidence: (sessionId: string) =>
    request<{ evidence: ExecutionEvidence[] }>(`/action-executions/${sessionId}/evidence`, {
      method: 'GET',
    }),
  cancelExecutionSession: (sessionId: string) =>
    request<{ session: ExecutionSession }>(`/action-executions/${sessionId}/cancel`, {
      method: 'POST',
    }),
  recoverExecutionSession: (sessionId: string) =>
    request<{ session: ExecutionSession; recovery: ExecutionRecovery }>(
      `/action-executions/${sessionId}/recover`,
      { method: 'POST' },
    ),

  // Operations (SPRINT 013) — operator-only. Returns safe status only.
  getOperationsStatus: () => request<OperationsStatus>('/operations/status', { method: 'GET' }),
  getOperationsMonitoring: () =>
    request<{ overall: string; checks: { name: string; level: string; value?: number }[] }>(
      '/operations/monitoring',
      { method: 'GET' },
    ),
  enableMaintenance: (reason: string) =>
    request<{ maintenance: OperationsModeState }>('/operations/maintenance/enable', {
      method: 'POST',
      body: JSON.stringify({ reason, confirm: true }),
    }),
  disableMaintenance: (reason: string) =>
    request<{ maintenance: OperationsModeState }>('/operations/maintenance/disable', {
      method: 'POST',
      body: JSON.stringify({ reason, confirm: true }),
    }),
  enableLockdown: (reason: string) =>
    request<{ lockdown: OperationsModeState }>('/operations/lockdown/enable', {
      method: 'POST',
      body: JSON.stringify({ reason, confirm: true }),
    }),
  disableLockdown: (reason: string) =>
    request<{ lockdown: OperationsModeState }>('/operations/lockdown/disable', {
      method: 'POST',
      body: JSON.stringify({ reason, confirm: true }),
    }),

  // ── MODEL C — source subscriptions (M4 operator + M5 customer) ─────────────
  getSourceSubscriptions: (businessId: string) =>
    request<SourceSubscriptionsResponse>(`/businesses/${businessId}/source-subscriptions`, {
      method: 'GET',
    }),
  setSourceSubscriptions: (businessId: string, groupIds: string[]) =>
    request<SourceSubscriptionsResponse>(`/businesses/${businessId}/source-subscriptions`, {
      method: 'PUT',
      body: JSON.stringify({ groupIds }),
    }),
  getOperatorFacebookSources: () =>
    request<OperatorFacebookSources>('/operator/facebook-sources', { method: 'GET' }),
};

export interface OperationsModeState {
  enabled: boolean;
  since: string | null;
  reason: string | null;
  operator: string | null;
}

export interface OperationsStatus {
  mode: string;
  readinessLevel: string;
  maintenance: OperationsModeState;
  lockdown: OperationsModeState;
  safety: {
    actionEngineEnabled: boolean;
    facebookWriteEnabled: boolean;
    facebookCommentEnabled: boolean;
    killSwitchOn: boolean;
    adapter: string;
    maintenance: boolean;
    lockdown: boolean;
  };
  system: {
    diskUsedPercent: number;
    diskFreeGb: number;
    ramAvailableMb: number;
    swapUsedPercent: number;
    loadAvg1: number;
  };
  queues: {
    actionJobs: Record<string, number>;
    executionSessions: Record<string, number>;
    stuckActionJobs: number;
    stuckCollectorRuns: number;
    ambiguousExecutions: number;
  };
  backups: { count: number; latest: { kind: string; createdAt: string; ageHours: number } | null };
  lastIncident: { at: string; action: string; operator: string; reason: string } | null;
}
