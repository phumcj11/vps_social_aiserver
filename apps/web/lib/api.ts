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

  // ── Collector ──────────────────────────────────────────────────────────────
  getCollectorStatus: () => request<CollectorStatus>('/collector/status', { method: 'GET' }),
  startCollector: () =>
    request<{ run: CollectorRunSummary }>('/collector/start', { method: 'POST' }),
  stopCollector: () =>
    request<{ run: CollectorRunSummary | null }>('/collector/stop', { method: 'POST' }),
  listCollectorRuns: () =>
    request<{ runs: CollectorRunSummary[] }>('/collector/runs', { method: 'GET' }),
};
