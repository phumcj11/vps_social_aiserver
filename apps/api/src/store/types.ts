/**
 * Persistence abstraction for the API.
 *
 * The HTTP/business layer depends only on this interface, so it can run against
 * real MySQL (DrizzleStore) at runtime and an in-memory implementation in unit
 * tests — keeping tests fast and free of external services.
 */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export interface WorkspaceRecord {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
}

export interface CreateWorkspaceInput {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
}

// ── Business domain (SPRINT 003) ─────────────────────────────────────────────

export interface BusinessRecord {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessProfileRecord {
  businessId: string;
  category: string | null;
  description: string | null;
  sellingPoints: string[];
  serviceArea: string | null;
  contactInformation: string | null;
  responseTone: string | null;
  prohibitedClaims: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessKnowledgeRecord {
  id: string;
  businessId: string;
  title: string;
  content: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessMatchingRuleRecord {
  id: string;
  businessId: string;
  ruleType: string;
  ruleValue: string;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessInput {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
}

export interface ProfileSeed {
  id: string;
  category: string | null;
  description: string | null;
}

export interface UpdateBusinessInput {
  name?: string;
  slug?: string;
  status?: string;
}

export interface ProfilePatch {
  category?: string | null;
  description?: string | null;
  sellingPoints?: string[];
  serviceArea?: string | null;
  contactInformation?: string | null;
  responseTone?: string | null;
  prohibitedClaims?: string[];
}

export interface CreateKnowledgeInput {
  id: string;
  businessId: string;
  title: string;
  content: string | null;
  status: string;
}

export interface UpdateKnowledgeInput {
  title?: string;
  content?: string | null;
  status?: string;
}

export interface CreateRuleInput {
  id: string;
  businessId: string;
  ruleType: string;
  ruleValue: string;
  priority: number;
  status: string;
}

export interface UpdateRuleInput {
  ruleType?: string;
  ruleValue?: string;
  priority?: number;
  status?: string;
}

// ── Facebook connection (SPRINT 004) ─────────────────────────────────────────

export type FacebookConnectionState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'reconnect_required'
  | 'checkpoint_required'
  | 'validation_failed'
  | 'disconnected';

export type FacebookAccountStatus = 'active' | 'disconnected' | 'blocked';

export interface FacebookAccountRecord {
  id: string;
  workspaceId: string;
  platform: string;
  displayName: string | null;
  facebookUserId: string | null;
  status: FacebookAccountStatus;
  connectionState: FacebookConnectionState;
  profilePath: string;
  connectedAt: Date | null;
  lastValidatedAt: Date | null;
  sessionExpiresAt: Date | null;
  disconnectedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFacebookConnectionInput {
  id: string;
  workspaceId: string;
  profilePath: string;
}

export interface FacebookIdentityUpdate {
  displayName: string | null;
  facebookUserId: string | null;
  sessionExpiresAt: Date | null;
}

export interface AuditEventRecord {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateAuditEventInput {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
}

// ── Facebook groups (SPRINT 005) ─────────────────────────────────────────────

export type FacebookGroupStatus = 'active' | 'disabled' | 'archived';

export type GroupAccessState =
  | 'unknown'
  | 'validating'
  | 'accessible'
  | 'inaccessible'
  | 'login_required'
  | 'checkpoint_required'
  | 'not_found'
  | 'validation_failed';

export interface FacebookGroupRecord {
  id: string;
  workspaceId: string;
  facebookGroupId: string | null;
  name: string | null;
  canonicalUrl: string;
  originalUrl: string;
  status: FacebookGroupStatus;
  accessState: GroupAccessState;
  lastValidatedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFacebookGroupInput {
  id: string;
  workspaceId: string;
  facebookGroupId: string | null;
  canonicalUrl: string;
  originalUrl: string;
}

export interface UpdateFacebookGroupInput {
  name?: string | null;
  status?: FacebookGroupStatus;
  facebookGroupId?: string | null;
}

export interface GroupAccessUpdate {
  lastValidatedAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  name?: string | null;
  facebookGroupId?: string | null;
}

export interface BusinessGroupAssignmentRecord {
  id: string;
  workspaceId: string;
  businessId: string;
  facebookGroupId: string; // internal facebook_groups.id
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupAssignmentInput {
  id: string;
  workspaceId: string;
  businessId: string;
  facebookGroupId: string;
}

// ── Collector Engine (SPRINT 006) ────────────────────────────────────────────

export interface RawSignalRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  facebookPostId: string | null;
  postUrl: string;
  rawHtml: string | null;
  rawJson: string | null;
  contentHash: string;
  collectedAt: Date;
}

export interface CreateRawSignalInput {
  id: string;
  workspaceId: string;
  groupId: string;
  facebookPostId: string | null;
  postUrl: string;
  rawHtml: string | null;
  rawJson: string | null;
  contentHash: string;
}

export interface SignalRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  facebookPostId: string | null;
  postUrl: string;
  authorName: string | null;
  authorProfile: string | null;
  message: string | null;
  mediaUrls: string[];
  createdTime: Date | null;
  normalizedHash: string;
  normalizedAt: Date;
}

export interface CreateSignalInput {
  id: string;
  workspaceId: string;
  groupId: string;
  facebookPostId: string | null;
  postUrl: string;
  authorName: string | null;
  authorProfile: string | null;
  message: string | null;
  mediaUrls: string[];
  createdTime: Date | null;
  normalizedHash: string;
}

export interface CollectorCheckpointRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  lastPostId: string | null;
  lastPostUrl: string | null;
  lastScan: Date | null;
  lastCursor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertCheckpointInput {
  id: string;
  workspaceId: string;
  groupId: string;
  lastPostId: string | null;
  lastPostUrl: string | null;
  lastScan: Date | null;
  lastCursor: string | null;
}

export type CollectorRunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface CollectorRunRecord {
  id: string;
  workspaceId: string;
  status: CollectorRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  groupsProcessed: number;
  postsCollected: number;
  errors: number;
  errorSummary: string | null;
  createdAt: Date;
}

export interface UpdateCollectorRunInput {
  status?: CollectorRunStatus;
  finishedAt?: Date | null;
  groupsProcessed?: number;
  postsCollected?: number;
  errors?: number;
  errorSummary?: string | null;
}

// ── Opportunity Classification (SPRINT 007) ──────────────────────────────────

export type OpportunityDecision = 'ACCEPT' | 'REJECT';
export type OpportunityStatus = 'NEW' | 'READY' | 'ARCHIVED';

export interface OpportunityRecord {
  id: string;
  workspaceId: string;
  signalId: string;
  decision: OpportunityDecision;
  status: OpportunityStatus;
  classifierVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOpportunityInput {
  id: string;
  workspaceId: string;
  signalId: string;
  decision: OpportunityDecision;
  status: OpportunityStatus;
  classifierVersion: string;
}

export interface OpportunityEventRecord {
  id: string;
  opportunityId: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateOpportunityEventInput {
  id: string;
  opportunityId: string;
  event: string;
  payload: Record<string, unknown> | null;
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

// ── Business Candidate & Matching (SPRINT 008) ───────────────────────────────

export type MatchDecision = 'MATCH' | 'NO_MATCH';

/** A single evaluated matching rule and whether it matched the Signal. */
export interface MatchReason {
  ruleType: string;
  ruleValue: string;
  matched: boolean;
}

export interface BusinessMatchRecord {
  id: string;
  workspaceId: string;
  businessId: string;
  opportunityId: string;
  decision: MatchDecision;
  reasons: MatchReason[];
  matcherVersion: string;
  matchedAt: Date;
}

export interface CreateBusinessMatchInput {
  id: string;
  workspaceId: string;
  businessId: string;
  opportunityId: string;
  decision: MatchDecision;
  reasons: MatchReason[];
  matcherVersion: string;
}

export interface BusinessMatchFilter {
  opportunityId?: string;
  businessId?: string;
  decision?: MatchDecision;
  limit?: number;
}

export interface Store {
  // Users
  createUser(input: CreateUserInput): Promise<UserRecord>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;

  // Sessions
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(id: string, lastSeenAt: Date): Promise<void>;
  revokeSession(id: string, revokedAt: Date): Promise<void>;
  revokeAllUserSessions(userId: string, revokedAt: Date): Promise<void>;

  // Workspaces
  getWorkspaceByOwner(ownerUserId: string): Promise<WorkspaceRecord | null>;
  isSlugTaken(slug: string): Promise<boolean>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord>;
  updateWorkspaceName(id: string, name: string): Promise<WorkspaceRecord | null>;

  // Businesses (a business always creates its profile at the same time)
  createBusiness(input: CreateBusinessInput, profile: ProfileSeed): Promise<BusinessRecord>;
  listBusinessesByWorkspace(workspaceId: string): Promise<BusinessRecord[]>;
  getBusinessById(id: string): Promise<BusinessRecord | null>;
  isBusinessSlugTaken(slug: string): Promise<boolean>;
  isBusinessNameTakenInWorkspace(workspaceId: string, name: string): Promise<boolean>;
  updateBusiness(id: string, input: UpdateBusinessInput): Promise<BusinessRecord | null>;

  // Business profile (one per business)
  getProfileByBusiness(businessId: string): Promise<BusinessProfileRecord | null>;
  updateProfile(businessId: string, patch: ProfilePatch): Promise<BusinessProfileRecord | null>;

  // Business knowledge
  listKnowledge(businessId: string): Promise<BusinessKnowledgeRecord[]>;
  getKnowledgeById(id: string): Promise<BusinessKnowledgeRecord | null>;
  createKnowledge(input: CreateKnowledgeInput): Promise<BusinessKnowledgeRecord>;
  updateKnowledge(id: string, input: UpdateKnowledgeInput): Promise<BusinessKnowledgeRecord | null>;
  deleteKnowledge(id: string): Promise<void>;

  // Business matching rules (deterministic — NOT AI)
  listRules(businessId: string): Promise<BusinessMatchingRuleRecord[]>;
  getRuleById(id: string): Promise<BusinessMatchingRuleRecord | null>;
  createRule(input: CreateRuleInput): Promise<BusinessMatchingRuleRecord>;
  updateRule(id: string, input: UpdateRuleInput): Promise<BusinessMatchingRuleRecord | null>;
  deleteRule(id: string): Promise<void>;

  // Facebook connection (one account per workspace; no secrets stored)
  getFacebookAccountByWorkspace(workspaceId: string): Promise<FacebookAccountRecord | null>;
  createFacebookConnection(input: CreateFacebookConnectionInput): Promise<FacebookAccountRecord>;
  updateFacebookConnectionState(
    id: string,
    connectionState: FacebookConnectionState,
    fields?: {
      status?: FacebookAccountStatus;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
      connectedAt?: Date | null;
      lastValidatedAt?: Date | null;
      sessionExpiresAt?: Date | null;
    },
  ): Promise<FacebookAccountRecord | null>;
  updateFacebookIdentity(
    id: string,
    identity: FacebookIdentityUpdate,
  ): Promise<FacebookAccountRecord | null>;
  markFacebookReconnectRequired(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<FacebookAccountRecord | null>;
  markFacebookCheckpointRequired(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<FacebookAccountRecord | null>;
  disconnectFacebookAccount(id: string): Promise<FacebookAccountRecord | null>;

  // Audit
  createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord>;
  listAuditEventsByWorkspace(workspaceId: string, limit?: number): Promise<AuditEventRecord[]>;
  listAuditEventsByType(eventType: string, limit?: number): Promise<AuditEventRecord[]>;

  // Facebook groups
  createFacebookGroup(input: CreateFacebookGroupInput): Promise<FacebookGroupRecord>;
  listFacebookGroupsByWorkspace(workspaceId: string): Promise<FacebookGroupRecord[]>;
  getFacebookGroupById(id: string): Promise<FacebookGroupRecord | null>;
  isGroupCanonicalUrlTaken(workspaceId: string, canonicalUrl: string): Promise<boolean>;
  updateFacebookGroup(
    id: string,
    input: UpdateFacebookGroupInput,
  ): Promise<FacebookGroupRecord | null>;
  updateFacebookGroupAccessState(
    id: string,
    accessState: GroupAccessState,
    fields?: GroupAccessUpdate,
  ): Promise<FacebookGroupRecord | null>;

  // Business ↔ group assignment (many-to-many within a workspace)
  assignGroupToBusiness(input: CreateGroupAssignmentInput): Promise<BusinessGroupAssignmentRecord>;
  getGroupAssignment(
    businessId: string,
    facebookGroupId: string,
  ): Promise<BusinessGroupAssignmentRecord | null>;
  unassignGroupFromBusiness(businessId: string, facebookGroupId: string): Promise<void>;
  listBusinessesForGroup(groupId: string): Promise<BusinessRecord[]>;
  listGroupsForBusiness(businessId: string): Promise<FacebookGroupRecord[]>;

  // Collector — raw signals (immutable)
  createRawSignal(input: CreateRawSignalInput): Promise<RawSignalRecord>;
  rawSignalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean>;

  // Collector — normalized signals (duplicate detection: url → fb id → hash)
  createSignal(input: CreateSignalInput): Promise<SignalRecord>;
  signalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean>;
  signalExistsByFacebookPostId(workspaceId: string, facebookPostId: string): Promise<boolean>;
  signalExistsByHash(workspaceId: string, normalizedHash: string): Promise<boolean>;
  countSignalsByWorkspace(workspaceId: string): Promise<number>;

  // Collector — checkpoints
  getCheckpointByGroup(groupId: string): Promise<CollectorCheckpointRecord | null>;
  upsertCheckpoint(input: UpsertCheckpointInput): Promise<CollectorCheckpointRecord>;

  // Collector — runs
  createCollectorRun(id: string, workspaceId: string): Promise<CollectorRunRecord>;
  updateCollectorRun(
    id: string,
    input: UpdateCollectorRunInput,
  ): Promise<CollectorRunRecord | null>;
  getCollectorRunById(id: string): Promise<CollectorRunRecord | null>;
  getLatestCollectorRun(workspaceId: string): Promise<CollectorRunRecord | null>;
  listCollectorRuns(workspaceId: string, limit?: number): Promise<CollectorRunRecord[]>;

  // Signals (read access for classification)
  getSignalById(id: string): Promise<SignalRecord | null>;
  listUnclassifiedSignals(workspaceId: string, limit?: number): Promise<SignalRecord[]>;

  // Opportunities
  createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord>;
  getOpportunityById(id: string): Promise<OpportunityRecord | null>;
  getOpportunityBySignal(signalId: string): Promise<OpportunityRecord | null>;
  listOpportunitiesByWorkspace(
    workspaceId: string,
    filter?: { status?: OpportunityStatus; decision?: OpportunityDecision; limit?: number },
  ): Promise<OpportunityRecord[]>;
  updateOpportunityStatus(id: string, status: OpportunityStatus): Promise<OpportunityRecord | null>;
  opportunityExistsForSignalHash(workspaceId: string, normalizedHash: string): Promise<boolean>;
  getOpportunityStatistics(workspaceId: string): Promise<OpportunityStatistics>;

  // Opportunity events
  createOpportunityEvent(input: CreateOpportunityEventInput): Promise<OpportunityEventRecord>;
  listOpportunityEvents(opportunityId: string): Promise<OpportunityEventRecord[]>;

  // Business matching (SPRINT 008) — deterministic; one match per (opportunity, business)
  createBusinessMatch(input: CreateBusinessMatchInput): Promise<BusinessMatchRecord>;
  getBusinessMatchById(id: string): Promise<BusinessMatchRecord | null>;
  businessMatchExists(opportunityId: string, businessId: string): Promise<boolean>;
  listBusinessMatchesByWorkspace(
    workspaceId: string,
    filter?: BusinessMatchFilter,
  ): Promise<BusinessMatchRecord[]>;
}
