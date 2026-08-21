import type {
  Store,
  UserRecord,
  SessionRecord,
  WorkspaceRecord,
  CreateUserInput,
  CreateSessionInput,
  CreateWorkspaceInput,
  BusinessRecord,
  BusinessProfileRecord,
  BusinessKnowledgeRecord,
  BusinessMatchingRuleRecord,
  CreateBusinessInput,
  ProfileSeed,
  UpdateBusinessInput,
  ProfilePatch,
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  CreateRuleInput,
  UpdateRuleInput,
  FacebookAccountRecord,
  FacebookConnectionState,
  FacebookAccountStatus,
  CreateFacebookConnectionInput,
  FacebookIdentityUpdate,
  AuditEventRecord,
  CreateAuditEventInput,
  FacebookGroupRecord,
  GroupAccessState,
  CreateFacebookGroupInput,
  UpdateFacebookGroupInput,
  GroupAccessUpdate,
  BusinessGroupAssignmentRecord,
  CreateGroupAssignmentInput,
  RawSignalRecord,
  CreateRawSignalInput,
  SignalRecord,
  CreateSignalInput,
  CollectorCheckpointRecord,
  UpsertCheckpointInput,
  CollectorRunRecord,
  UpdateCollectorRunInput,
  OpportunityRecord,
  OpportunityDecision,
  OpportunityStatus,
  CreateOpportunityInput,
  OpportunityEventRecord,
  CreateOpportunityEventInput,
  OpportunityStatistics,
  BusinessMatchRecord,
  CreateBusinessMatchInput,
  BusinessMatchFilter,
  PropertyMatchRecord,
  CreatePropertyMatchInput,
  PropertyMatchFilter,
  MatchingFunnelCounts,
  AiDraftRecord,
  AiDraftStatus,
  CreateAiDraftInput,
  AiDraftFilter,
  AiDraftEventRecord,
  CreateAiDraftEventInput,
  ReviewTaskRecord,
  CreateReviewTaskInput,
  UpdateReviewTaskInput,
  ReviewTaskFilter,
  ReviewEventRecord,
  CreateReviewEventInput,
  ActionJobRecord,
  ActionType,
  CreateActionJobInput,
  UpdateActionJobInput,
  ActionJobFilter,
  ActionEventRecord,
  CreateActionEventInput,
} from './types';
import type {
  ExecutionSessionRecord,
  CreateExecutionSessionInput,
  UpdateExecutionSessionInput,
  ExecutionEvidenceRecord,
  CreateExecutionEvidenceInput,
  IdempotencyRecord,
  CreateIdempotencyRecordInput,
  UpdateIdempotencyRecordInput,
  OperationalCountsInput,
  OperationalCounts,
} from './types';
import { ACTIVE_ACTION_STATUSES, ACTIVE_EXECUTION_STATUSES } from './types';

/**
 * In-memory Store implementation for tests. Not used at runtime.
 * Enforces the same uniqueness invariants as the database (unique email, unique
 * slug, one workspace per owner) so tests exercise real behaviour.
 */
export class InMemoryStore implements Store {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private workspaces = new Map<string, WorkspaceRecord>();
  private businesses = new Map<string, BusinessRecord>();
  private profiles = new Map<string, BusinessProfileRecord>(); // keyed by businessId
  private knowledge = new Map<string, BusinessKnowledgeRecord>();
  private rules = new Map<string, BusinessMatchingRuleRecord>();
  private facebookAccounts = new Map<string, FacebookAccountRecord>(); // keyed by id
  private auditEvents: AuditEventRecord[] = [];
  private facebookGroups = new Map<string, FacebookGroupRecord>(); // keyed by id
  private groupAssignments = new Map<string, BusinessGroupAssignmentRecord>(); // keyed by id
  private rawSignals = new Map<string, RawSignalRecord>(); // keyed by id
  private signals = new Map<string, SignalRecord>(); // keyed by id
  private checkpoints = new Map<string, CollectorCheckpointRecord>(); // keyed by groupId
  private collectorRuns = new Map<string, CollectorRunRecord>(); // keyed by id
  private opportunities = new Map<string, OpportunityRecord>(); // keyed by id
  private opportunityEvents: OpportunityEventRecord[] = [];
  private businessMatches = new Map<string, BusinessMatchRecord>(); // keyed by id
  private propertyMatches = new Map<string, PropertyMatchRecord>(); // keyed by id
  private aiDrafts = new Map<string, AiDraftRecord>(); // keyed by id
  private aiDraftEvents: AiDraftEventRecord[] = [];
  private reviewTasks = new Map<string, ReviewTaskRecord>(); // keyed by id
  private reviewEvents: ReviewEventRecord[] = [];
  private actionJobs = new Map<string, ActionJobRecord>(); // keyed by id
  private actionEvents: ActionEventRecord[] = [];
  private executionSessions = new Map<string, ExecutionSessionRecord>(); // keyed by id
  private executionSessionActiveKey = new Map<string, string>(); // activeKey → sessionId
  private executionEvidence: ExecutionEvidenceRecord[] = [];
  private idempotencyRecords = new Map<string, IdempotencyRecord>(); // keyed by id
  private idempotencyKeyIndex = new Map<string, string>(); // idemKey → recordId

  private now(): Date {
    return new Date();
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const email = input.email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === email) throw new Error('duplicate email');
    }
    const now = this.now();
    const user: UserRecord = {
      id: input.id,
      email,
      passwordHash: input.passwordHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const target = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === target) return { ...u };
    }
    return null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const now = this.now();
    const session: SessionRecord = {
      id: input.id,
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const s of this.sessions.values()) {
      if (s.sessionTokenHash === tokenHash) return { ...s };
    }
    return null;
  }

  async touchSession(id: string, lastSeenAt: Date): Promise<void> {
    const s = this.sessions.get(id);
    if (s) s.lastSeenAt = lastSeenAt;
  }

  async revokeSession(id: string, revokedAt: Date): Promise<void> {
    const s = this.sessions.get(id);
    if (s) s.revokedAt = revokedAt;
  }

  async revokeAllUserSessions(userId: string, revokedAt: Date): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) s.revokedAt = revokedAt;
    }
  }

  async getWorkspaceByOwner(ownerUserId: string): Promise<WorkspaceRecord | null> {
    for (const w of this.workspaces.values()) {
      if (w.ownerUserId === ownerUserId) return { ...w };
    }
    return null;
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    for (const w of this.workspaces.values()) {
      if (w.slug === slug) return true;
    }
    return false;
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    for (const w of this.workspaces.values()) {
      if (w.ownerUserId === input.ownerUserId) throw new Error('owner already has a workspace');
      if (w.slug === input.slug) throw new Error('duplicate slug');
    }
    const now = this.now();
    const workspace: WorkspaceRecord = {
      id: input.id,
      ownerUserId: input.ownerUserId,
      name: input.name,
      slug: input.slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.set(workspace.id, workspace);
    return { ...workspace };
  }

  async updateWorkspaceName(id: string, name: string): Promise<WorkspaceRecord | null> {
    const w = this.workspaces.get(id);
    if (!w) return null;
    w.name = name;
    w.updatedAt = this.now();
    return { ...w };
  }

  // ── Businesses ─────────────────────────────────────────────────────────────

  async createBusiness(input: CreateBusinessInput, profile: ProfileSeed): Promise<BusinessRecord> {
    for (const b of this.businesses.values()) {
      if (b.slug === input.slug) throw new Error('duplicate slug');
      if (b.workspaceId === input.workspaceId && b.name === input.name) {
        throw new Error('duplicate business name in workspace');
      }
    }
    const now = this.now();
    const business: BusinessRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.businesses.set(business.id, business);
    this.profiles.set(business.id, {
      businessId: business.id,
      category: profile.category,
      description: profile.description,
      sellingPoints: [],
      serviceArea: null,
      contactInformation: null,
      responseTone: null,
      prohibitedClaims: [],
      createdAt: now,
      updatedAt: now,
    });
    return { ...business };
  }

  async listBusinessesByWorkspace(workspaceId: string): Promise<BusinessRecord[]> {
    return [...this.businesses.values()]
      .filter((b) => b.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((b) => ({ ...b }));
  }

  async getBusinessById(id: string): Promise<BusinessRecord | null> {
    const b = this.businesses.get(id);
    return b ? { ...b } : null;
  }

  async isBusinessSlugTaken(slug: string): Promise<boolean> {
    for (const b of this.businesses.values()) if (b.slug === slug) return true;
    return false;
  }

  async isBusinessNameTakenInWorkspace(workspaceId: string, name: string): Promise<boolean> {
    for (const b of this.businesses.values()) {
      if (b.workspaceId === workspaceId && b.name === name) return true;
    }
    return false;
  }

  async updateBusiness(id: string, input: UpdateBusinessInput): Promise<BusinessRecord | null> {
    const b = this.businesses.get(id);
    if (!b) return null;
    if (input.name !== undefined) b.name = input.name;
    if (input.slug !== undefined) b.slug = input.slug;
    if (input.status !== undefined) b.status = input.status;
    b.updatedAt = this.now();
    return { ...b };
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfileByBusiness(businessId: string): Promise<BusinessProfileRecord | null> {
    const p = this.profiles.get(businessId);
    return p ? { ...p } : null;
  }

  async updateProfile(
    businessId: string,
    patch: ProfilePatch,
  ): Promise<BusinessProfileRecord | null> {
    const p = this.profiles.get(businessId);
    if (!p) return null;
    if (patch.category !== undefined) p.category = patch.category;
    if (patch.description !== undefined) p.description = patch.description;
    if (patch.sellingPoints !== undefined) p.sellingPoints = [...patch.sellingPoints];
    if (patch.serviceArea !== undefined) p.serviceArea = patch.serviceArea;
    if (patch.contactInformation !== undefined) p.contactInformation = patch.contactInformation;
    if (patch.responseTone !== undefined) p.responseTone = patch.responseTone;
    if (patch.prohibitedClaims !== undefined) p.prohibitedClaims = [...patch.prohibitedClaims];
    p.updatedAt = this.now();
    return { ...p };
  }

  // ── Knowledge ──────────────────────────────────────────────────────────────

  async listKnowledge(businessId: string): Promise<BusinessKnowledgeRecord[]> {
    return [...this.knowledge.values()]
      .filter((k) => k.businessId === businessId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((k) => ({ ...k }));
  }

  async getKnowledgeById(id: string): Promise<BusinessKnowledgeRecord | null> {
    const k = this.knowledge.get(id);
    return k ? { ...k } : null;
  }

  async createKnowledge(input: CreateKnowledgeInput): Promise<BusinessKnowledgeRecord> {
    const now = this.now();
    const record: BusinessKnowledgeRecord = {
      id: input.id,
      businessId: input.businessId,
      title: input.title,
      content: input.content,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.knowledge.set(record.id, record);
    return { ...record };
  }

  async updateKnowledge(
    id: string,
    input: UpdateKnowledgeInput,
  ): Promise<BusinessKnowledgeRecord | null> {
    const k = this.knowledge.get(id);
    if (!k) return null;
    if (input.title !== undefined) k.title = input.title;
    if (input.content !== undefined) k.content = input.content;
    if (input.status !== undefined) k.status = input.status;
    k.updatedAt = this.now();
    return { ...k };
  }

  async deleteKnowledge(id: string): Promise<void> {
    this.knowledge.delete(id);
  }

  // ── Matching rules ─────────────────────────────────────────────────────────

  async listRules(businessId: string): Promise<BusinessMatchingRuleRecord[]> {
    return [...this.rules.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  async getRuleById(id: string): Promise<BusinessMatchingRuleRecord | null> {
    const r = this.rules.get(id);
    return r ? { ...r } : null;
  }

  async createRule(input: CreateRuleInput): Promise<BusinessMatchingRuleRecord> {
    const now = this.now();
    const record: BusinessMatchingRuleRecord = {
      id: input.id,
      businessId: input.businessId,
      ruleType: input.ruleType,
      ruleValue: input.ruleValue,
      priority: input.priority,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.rules.set(record.id, record);
    return { ...record };
  }

  async updateRule(id: string, input: UpdateRuleInput): Promise<BusinessMatchingRuleRecord | null> {
    const r = this.rules.get(id);
    if (!r) return null;
    if (input.ruleType !== undefined) r.ruleType = input.ruleType;
    if (input.ruleValue !== undefined) r.ruleValue = input.ruleValue;
    if (input.priority !== undefined) r.priority = input.priority;
    if (input.status !== undefined) r.status = input.status;
    r.updatedAt = this.now();
    return { ...r };
  }

  async deleteRule(id: string): Promise<void> {
    this.rules.delete(id);
  }

  // ── Facebook connection ────────────────────────────────────────────────────

  async getFacebookAccountByWorkspace(workspaceId: string): Promise<FacebookAccountRecord | null> {
    for (const a of this.facebookAccounts.values()) {
      if (a.workspaceId === workspaceId) return { ...a };
    }
    return null;
  }

  async createFacebookConnection(
    input: CreateFacebookConnectionInput,
  ): Promise<FacebookAccountRecord> {
    for (const a of this.facebookAccounts.values()) {
      if (a.workspaceId === input.workspaceId) {
        throw new Error('workspace already has a facebook account');
      }
    }
    const now = this.now();
    const record: FacebookAccountRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      platform: 'facebook',
      displayName: null,
      facebookUserId: null,
      status: 'active',
      connectionState: 'connecting',
      profilePath: input.profilePath,
      connectedAt: null,
      lastValidatedAt: null,
      sessionExpiresAt: null,
      disconnectedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.facebookAccounts.set(record.id, record);
    return { ...record };
  }

  async updateFacebookConnectionState(
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
  ): Promise<FacebookAccountRecord | null> {
    const a = this.facebookAccounts.get(id);
    if (!a) return null;
    a.connectionState = connectionState;
    if (fields?.status !== undefined) a.status = fields.status;
    if (fields?.lastErrorCode !== undefined) a.lastErrorCode = fields.lastErrorCode;
    if (fields?.lastErrorMessage !== undefined) a.lastErrorMessage = fields.lastErrorMessage;
    if (fields?.connectedAt !== undefined) a.connectedAt = fields.connectedAt;
    if (fields?.lastValidatedAt !== undefined) a.lastValidatedAt = fields.lastValidatedAt;
    if (fields?.sessionExpiresAt !== undefined) a.sessionExpiresAt = fields.sessionExpiresAt;
    a.updatedAt = this.now();
    return { ...a };
  }

  async updateFacebookIdentity(
    id: string,
    identity: FacebookIdentityUpdate,
  ): Promise<FacebookAccountRecord | null> {
    const a = this.facebookAccounts.get(id);
    if (!a) return null;
    a.displayName = identity.displayName;
    a.facebookUserId = identity.facebookUserId;
    a.sessionExpiresAt = identity.sessionExpiresAt;
    a.connectionState = 'connected';
    a.status = 'active';
    a.connectedAt = this.now();
    a.lastValidatedAt = this.now();
    a.lastErrorCode = null;
    a.lastErrorMessage = null;
    a.updatedAt = this.now();
    return { ...a };
  }

  async markFacebookReconnectRequired(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<FacebookAccountRecord | null> {
    return this.updateFacebookConnectionState(id, 'reconnect_required', {
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    });
  }

  async markFacebookCheckpointRequired(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<FacebookAccountRecord | null> {
    return this.updateFacebookConnectionState(id, 'checkpoint_required', {
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    });
  }

  async disconnectFacebookAccount(id: string): Promise<FacebookAccountRecord | null> {
    const a = this.facebookAccounts.get(id);
    if (!a) return null;
    a.connectionState = 'disconnected';
    a.status = 'disconnected';
    a.disconnectedAt = this.now();
    a.sessionExpiresAt = null;
    a.updatedAt = this.now();
    return { ...a };
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  async createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord> {
    const record: AuditEventRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: this.now(),
    };
    this.auditEvents.push(record);
    return { ...record };
  }

  async listAuditEventsByWorkspace(workspaceId: string, limit = 100): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((e) => e.workspaceId === workspaceId)
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e }));
  }

  async listAuditEventsByType(eventType: string, limit = 100): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((e) => e.eventType === eventType)
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e }));
  }

  // ── Facebook groups ────────────────────────────────────────────────────────

  async createFacebookGroup(input: CreateFacebookGroupInput): Promise<FacebookGroupRecord> {
    for (const g of this.facebookGroups.values()) {
      if (g.workspaceId === input.workspaceId && g.canonicalUrl === input.canonicalUrl) {
        throw new Error('duplicate group url in workspace');
      }
      if (
        input.facebookGroupId &&
        g.workspaceId === input.workspaceId &&
        g.facebookGroupId === input.facebookGroupId
      ) {
        throw new Error('duplicate group id in workspace');
      }
    }
    const now = this.now();
    const record: FacebookGroupRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      facebookGroupId: input.facebookGroupId,
      name: null,
      canonicalUrl: input.canonicalUrl,
      originalUrl: input.originalUrl,
      status: 'active',
      accessState: 'unknown',
      lastValidatedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.facebookGroups.set(record.id, record);
    return { ...record };
  }

  async listFacebookGroupsByWorkspace(workspaceId: string): Promise<FacebookGroupRecord[]> {
    return [...this.facebookGroups.values()]
      .filter((g) => g.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((g) => ({ ...g }));
  }

  async getFacebookGroupById(id: string): Promise<FacebookGroupRecord | null> {
    const g = this.facebookGroups.get(id);
    return g ? { ...g } : null;
  }

  async isGroupCanonicalUrlTaken(workspaceId: string, canonicalUrl: string): Promise<boolean> {
    for (const g of this.facebookGroups.values()) {
      if (g.workspaceId === workspaceId && g.canonicalUrl === canonicalUrl) return true;
    }
    return false;
  }

  async updateFacebookGroup(
    id: string,
    input: UpdateFacebookGroupInput,
  ): Promise<FacebookGroupRecord | null> {
    const g = this.facebookGroups.get(id);
    if (!g) return null;
    if (input.name !== undefined) g.name = input.name;
    if (input.status !== undefined) g.status = input.status;
    if (input.facebookGroupId !== undefined) g.facebookGroupId = input.facebookGroupId;
    g.updatedAt = this.now();
    return { ...g };
  }

  async updateFacebookGroupAccessState(
    id: string,
    accessState: GroupAccessState,
    fields?: GroupAccessUpdate,
  ): Promise<FacebookGroupRecord | null> {
    const g = this.facebookGroups.get(id);
    if (!g) return null;
    g.accessState = accessState;
    if (fields?.lastValidatedAt !== undefined) g.lastValidatedAt = fields.lastValidatedAt;
    if (fields?.lastErrorCode !== undefined) g.lastErrorCode = fields.lastErrorCode;
    if (fields?.lastErrorMessage !== undefined) g.lastErrorMessage = fields.lastErrorMessage;
    if (fields?.name !== undefined) g.name = fields.name;
    if (fields?.facebookGroupId !== undefined) g.facebookGroupId = fields.facebookGroupId;
    g.updatedAt = this.now();
    return { ...g };
  }

  // ── Business ↔ group assignment ────────────────────────────────────────────

  async assignGroupToBusiness(
    input: CreateGroupAssignmentInput,
  ): Promise<BusinessGroupAssignmentRecord> {
    for (const a of this.groupAssignments.values()) {
      if (a.businessId === input.businessId && a.facebookGroupId === input.facebookGroupId) {
        throw new Error('duplicate assignment');
      }
    }
    const now = this.now();
    const record: BusinessGroupAssignmentRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      facebookGroupId: input.facebookGroupId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.groupAssignments.set(record.id, record);
    return { ...record };
  }

  async getGroupAssignment(
    businessId: string,
    facebookGroupId: string,
  ): Promise<BusinessGroupAssignmentRecord | null> {
    for (const a of this.groupAssignments.values()) {
      if (a.businessId === businessId && a.facebookGroupId === facebookGroupId) return { ...a };
    }
    return null;
  }

  async unassignGroupFromBusiness(businessId: string, facebookGroupId: string): Promise<void> {
    for (const [key, a] of this.groupAssignments) {
      if (a.businessId === businessId && a.facebookGroupId === facebookGroupId) {
        this.groupAssignments.delete(key);
      }
    }
  }

  async listBusinessesForGroup(groupId: string): Promise<BusinessRecord[]> {
    const businessIds = [...this.groupAssignments.values()]
      .filter((a) => a.facebookGroupId === groupId)
      .map((a) => a.businessId);
    return businessIds
      .map((id) => this.businesses.get(id))
      .filter((b): b is BusinessRecord => b !== undefined)
      .map((b) => ({ ...b }));
  }

  async listGroupsForBusiness(businessId: string): Promise<FacebookGroupRecord[]> {
    const groupIds = [...this.groupAssignments.values()]
      .filter((a) => a.businessId === businessId)
      .map((a) => a.facebookGroupId);
    return groupIds
      .map((id) => this.facebookGroups.get(id))
      .filter((g): g is FacebookGroupRecord => g !== undefined)
      .map((g) => ({ ...g }));
  }

  // ── Collector: raw signals ─────────────────────────────────────────────────

  async createRawSignal(input: CreateRawSignalInput): Promise<RawSignalRecord> {
    for (const r of this.rawSignals.values()) {
      if (r.workspaceId === input.workspaceId && r.postUrl === input.postUrl) {
        throw new Error('duplicate raw signal url');
      }
    }
    const record: RawSignalRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      facebookPostId: input.facebookPostId,
      postUrl: input.postUrl,
      rawHtml: input.rawHtml,
      rawJson: input.rawJson,
      contentHash: input.contentHash,
      collectedAt: this.now(),
    };
    this.rawSignals.set(record.id, record);
    return { ...record };
  }

  async rawSignalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean> {
    for (const r of this.rawSignals.values()) {
      if (r.workspaceId === workspaceId && r.postUrl === postUrl) return true;
    }
    return false;
  }

  // ── Collector: normalized signals ──────────────────────────────────────────

  async createSignal(input: CreateSignalInput): Promise<SignalRecord> {
    for (const s of this.signals.values()) {
      if (s.workspaceId === input.workspaceId && s.postUrl === input.postUrl) {
        throw new Error('duplicate signal url');
      }
    }
    const record: SignalRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      facebookPostId: input.facebookPostId,
      postUrl: input.postUrl,
      authorName: input.authorName,
      authorProfile: input.authorProfile,
      message: input.message,
      mediaUrls: [...input.mediaUrls],
      createdTime: input.createdTime,
      normalizedHash: input.normalizedHash,
      normalizedAt: this.now(),
    };
    this.signals.set(record.id, record);
    return { ...record };
  }

  async signalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean> {
    for (const s of this.signals.values()) {
      if (s.workspaceId === workspaceId && s.postUrl === postUrl) return true;
    }
    return false;
  }

  async signalExistsByFacebookPostId(
    workspaceId: string,
    facebookPostId: string,
  ): Promise<boolean> {
    for (const s of this.signals.values()) {
      if (s.workspaceId === workspaceId && s.facebookPostId === facebookPostId) return true;
    }
    return false;
  }

  async signalExistsByHash(workspaceId: string, normalizedHash: string): Promise<boolean> {
    for (const s of this.signals.values()) {
      if (s.workspaceId === workspaceId && s.normalizedHash === normalizedHash) return true;
    }
    return false;
  }

  async countSignalsByWorkspace(workspaceId: string): Promise<number> {
    let n = 0;
    for (const s of this.signals.values()) if (s.workspaceId === workspaceId) n += 1;
    return n;
  }

  // ── Collector: checkpoints ─────────────────────────────────────────────────

  async getCheckpointByGroup(groupId: string): Promise<CollectorCheckpointRecord | null> {
    const c = this.checkpoints.get(groupId);
    return c ? { ...c } : null;
  }

  async upsertCheckpoint(input: UpsertCheckpointInput): Promise<CollectorCheckpointRecord> {
    const now = this.now();
    const existing = this.checkpoints.get(input.groupId);
    const record: CollectorCheckpointRecord = {
      id: existing?.id ?? input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      lastPostId: input.lastPostId,
      lastPostUrl: input.lastPostUrl,
      lastScan: input.lastScan,
      lastCursor: input.lastCursor,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.checkpoints.set(input.groupId, record);
    return { ...record };
  }

  // ── Collector: runs ────────────────────────────────────────────────────────

  async createCollectorRun(id: string, workspaceId: string): Promise<CollectorRunRecord> {
    const now = this.now();
    const record: CollectorRunRecord = {
      id,
      workspaceId,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      groupsProcessed: 0,
      postsCollected: 0,
      duplicatesSkipped: 0,
      errors: 0,
      errorSummary: null,
      createdAt: now,
    };
    this.collectorRuns.set(id, record);
    return { ...record };
  }

  async updateCollectorRun(
    id: string,
    input: UpdateCollectorRunInput,
  ): Promise<CollectorRunRecord | null> {
    const r = this.collectorRuns.get(id);
    if (!r) return null;
    if (input.status !== undefined) r.status = input.status;
    if (input.finishedAt !== undefined) r.finishedAt = input.finishedAt;
    if (input.groupsProcessed !== undefined) r.groupsProcessed = input.groupsProcessed;
    if (input.postsCollected !== undefined) r.postsCollected = input.postsCollected;
    if (input.duplicatesSkipped !== undefined) r.duplicatesSkipped = input.duplicatesSkipped;
    if (input.errors !== undefined) r.errors = input.errors;
    if (input.errorSummary !== undefined) r.errorSummary = input.errorSummary;
    return { ...r };
  }

  async getCollectorRunById(id: string): Promise<CollectorRunRecord | null> {
    const r = this.collectorRuns.get(id);
    return r ? { ...r } : null;
  }

  async getLatestCollectorRun(workspaceId: string): Promise<CollectorRunRecord | null> {
    const runs = [...this.collectorRuns.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return runs[0] ? { ...runs[0] } : null;
  }

  async listCollectorRuns(workspaceId: string, limit = 50): Promise<CollectorRunRecord[]> {
    return [...this.collectorRuns.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  // ── Signals (read access for classification) ───────────────────────────────

  async getSignalById(id: string): Promise<SignalRecord | null> {
    const s = this.signals.get(id);
    return s ? { ...s } : null;
  }

  async listUnclassifiedSignals(workspaceId: string, limit = 500): Promise<SignalRecord[]> {
    const classified = new Set([...this.opportunities.values()].map((o) => o.signalId));
    return [...this.signals.values()]
      .filter((s) => s.workspaceId === workspaceId && !classified.has(s.id))
      .sort((a, b) => a.normalizedAt.getTime() - b.normalizedAt.getTime())
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  // ── Opportunities ──────────────────────────────────────────────────────────

  async createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
    for (const o of this.opportunities.values()) {
      if (o.signalId === input.signalId) throw new Error('duplicate opportunity for signal');
    }
    const now = this.now();
    const record: OpportunityRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      signalId: input.signalId,
      decision: input.decision,
      status: input.status,
      classifierVersion: input.classifierVersion,
      createdAt: now,
      updatedAt: now,
    };
    this.opportunities.set(record.id, record);
    return { ...record };
  }

  async getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    const o = this.opportunities.get(id);
    return o ? { ...o } : null;
  }

  async getOpportunityBySignal(signalId: string): Promise<OpportunityRecord | null> {
    for (const o of this.opportunities.values()) {
      if (o.signalId === signalId) return { ...o };
    }
    return null;
  }

  async listOpportunitiesByWorkspace(
    workspaceId: string,
    filter: { status?: OpportunityStatus; decision?: OpportunityDecision; limit?: number } = {},
  ): Promise<OpportunityRecord[]> {
    return [...this.opportunities.values()]
      .filter(
        (o) =>
          o.workspaceId === workspaceId &&
          (filter.status === undefined || o.status === filter.status) &&
          (filter.decision === undefined || o.decision === filter.decision),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit ?? 200)
      .map((o) => ({ ...o }));
  }

  async updateOpportunityStatus(
    id: string,
    status: OpportunityStatus,
  ): Promise<OpportunityRecord | null> {
    const o = this.opportunities.get(id);
    if (!o) return null;
    o.status = status;
    o.updatedAt = this.now();
    return { ...o };
  }

  async updateOpportunityDecision(
    id: string,
    input: { decision: OpportunityDecision; status: OpportunityStatus; classifierVersion: string },
  ): Promise<OpportunityRecord | null> {
    const o = this.opportunities.get(id);
    if (!o) return null;
    o.decision = input.decision;
    o.status = input.status;
    o.classifierVersion = input.classifierVersion;
    o.updatedAt = this.now();
    return { ...o };
  }

  async opportunityExistsForSignalHash(
    workspaceId: string,
    normalizedHash: string,
  ): Promise<boolean> {
    for (const o of this.opportunities.values()) {
      if (o.workspaceId !== workspaceId) continue;
      const s = this.signals.get(o.signalId);
      if (s && s.normalizedHash === normalizedHash) return true;
    }
    return false;
  }

  async getOpportunityStatistics(workspaceId: string): Promise<OpportunityStatistics> {
    const list = [...this.opportunities.values()].filter((o) => o.workspaceId === workspaceId);
    const total = list.length;
    const accepted = list.filter((o) => o.decision === 'ACCEPT').length;
    const rejected = list.filter((o) => o.decision === 'REJECT').length;
    const newCount = list.filter((o) => o.status === 'NEW').length;
    const ready = list.filter((o) => o.status === 'READY').length;
    const archived = list.filter((o) => o.status === 'ARCHIVED').length;
    const unclassifiedSignals = (await this.listUnclassifiedSignals(workspaceId, 100000)).length;
    return { total, accepted, rejected, new: newCount, ready, archived, unclassifiedSignals };
  }

  // ── Opportunity events ─────────────────────────────────────────────────────

  async createOpportunityEvent(
    input: CreateOpportunityEventInput,
  ): Promise<OpportunityEventRecord> {
    const record: OpportunityEventRecord = {
      id: input.id,
      opportunityId: input.opportunityId,
      event: input.event,
      payload: input.payload,
      createdAt: this.now(),
    };
    this.opportunityEvents.push(record);
    return { ...record };
  }

  async listOpportunityEvents(opportunityId: string): Promise<OpportunityEventRecord[]> {
    return this.opportunityEvents
      .filter((e) => e.opportunityId === opportunityId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }

  // ── Business matches (SPRINT 008) ──────────────────────────────────────────

  private cloneMatch(m: BusinessMatchRecord): BusinessMatchRecord {
    return { ...m, reasons: m.reasons.map((r) => ({ ...r })) };
  }

  async createBusinessMatch(input: CreateBusinessMatchInput): Promise<BusinessMatchRecord> {
    for (const m of this.businessMatches.values()) {
      if (m.opportunityId === input.opportunityId && m.businessId === input.businessId) {
        throw new Error('duplicate business match for opportunity and business');
      }
    }
    const record: BusinessMatchRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      opportunityId: input.opportunityId,
      decision: input.decision,
      reasons: input.reasons.map((r) => ({ ...r })),
      matcherVersion: input.matcherVersion,
      matchedAt: this.now(),
    };
    this.businessMatches.set(record.id, record);
    return this.cloneMatch(record);
  }

  async getBusinessMatchById(id: string): Promise<BusinessMatchRecord | null> {
    const m = this.businessMatches.get(id);
    return m ? this.cloneMatch(m) : null;
  }

  async businessMatchExists(opportunityId: string, businessId: string): Promise<boolean> {
    for (const m of this.businessMatches.values()) {
      if (m.opportunityId === opportunityId && m.businessId === businessId) return true;
    }
    return false;
  }

  async listBusinessMatchesByWorkspace(
    workspaceId: string,
    filter: BusinessMatchFilter = {},
  ): Promise<BusinessMatchRecord[]> {
    return [...this.businessMatches.values()]
      .filter(
        (m) =>
          m.workspaceId === workspaceId &&
          (filter.opportunityId === undefined || m.opportunityId === filter.opportunityId) &&
          (filter.businessId === undefined || m.businessId === filter.businessId) &&
          (filter.decision === undefined || m.decision === filter.decision),
      )
      .sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime())
      .slice(0, filter.limit ?? 500)
      .map((m) => this.cloneMatch(m));
  }

  // ── Property matches (SPRINT 016B) ─────────────────────────────────────────

  private clonePropertyMatch(m: PropertyMatchRecord): PropertyMatchRecord {
    return {
      ...m,
      reasons: {
        reasons: [...m.reasons.reasons],
        rejected: m.reasons.rejected.map((r) => ({ ...r, reasons: [...r.reasons] })),
        requirement: { ...m.reasons.requirement },
      },
    };
  }

  async createPropertyMatch(input: CreatePropertyMatchInput): Promise<PropertyMatchRecord> {
    for (const m of this.propertyMatches.values()) {
      if (m.businessMatchId === input.businessMatchId) {
        throw new Error('duplicate property match for business match');
      }
    }
    const now = this.now();
    const record: PropertyMatchRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      opportunityId: input.opportunityId,
      businessMatchId: input.businessMatchId,
      businessId: input.businessId,
      propertyId: input.propertyId,
      decision: input.decision,
      reasons: {
        reasons: [...input.reasons.reasons],
        rejected: input.reasons.rejected.map((r) => ({ ...r, reasons: [...r.reasons] })),
        requirement: { ...input.reasons.requirement },
      },
      matcherVersion: input.matcherVersion,
      candidatesEvaluated: input.candidatesEvaluated,
      evaluatedAt: now,
      createdAt: now,
    };
    this.propertyMatches.set(record.id, record);
    return this.clonePropertyMatch(record);
  }

  async getPropertyMatchById(id: string): Promise<PropertyMatchRecord | null> {
    const m = this.propertyMatches.get(id);
    return m ? this.clonePropertyMatch(m) : null;
  }

  async getPropertyMatchByBusinessMatch(
    businessMatchId: string,
  ): Promise<PropertyMatchRecord | null> {
    for (const m of this.propertyMatches.values()) {
      if (m.businessMatchId === businessMatchId) return this.clonePropertyMatch(m);
    }
    return null;
  }

  async listPropertyMatchesByWorkspace(
    workspaceId: string,
    filter: PropertyMatchFilter = {},
  ): Promise<PropertyMatchRecord[]> {
    return [...this.propertyMatches.values()]
      .filter(
        (m) =>
          m.workspaceId === workspaceId &&
          (filter.opportunityId === undefined || m.opportunityId === filter.opportunityId) &&
          (filter.businessId === undefined || m.businessId === filter.businessId) &&
          (filter.businessMatchId === undefined || m.businessMatchId === filter.businessMatchId) &&
          (filter.propertyId === undefined || m.propertyId === filter.propertyId) &&
          (filter.decision === undefined || m.decision === filter.decision),
      )
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
      .slice(0, filter.limit ?? 500)
      .map((m) => this.clonePropertyMatch(m));
  }

  async getMatchingFunnelCounts(workspaceId: string): Promise<MatchingFunnelCounts> {
    const bms = [...this.businessMatches.values()].filter((m) => m.workspaceId === workspaceId);
    const pms = [...this.propertyMatches.values()].filter((m) => m.workspaceId === workspaceId);
    const businessMatch = {
      MATCH: bms.filter((m) => m.decision === 'MATCH').length,
      NO_MATCH: bms.filter((m) => m.decision === 'NO_MATCH').length,
    };
    const propertyMatch = {
      MATCH: pms.filter((m) => m.decision === 'MATCH').length,
      NO_MATCH: pms.filter((m) => m.decision === 'NO_MATCH').length,
    };
    const candidatesEvaluated = pms.reduce((sum, m) => sum + m.candidatesEvaluated, 0);
    const propertiesReceivingMatches = new Set(
      pms.filter((m) => m.decision === 'MATCH' && m.propertyId).map((m) => m.propertyId),
    ).size;
    const reasonTally = new Map<string, number>();
    for (const m of pms.filter((x) => x.decision === 'NO_MATCH')) {
      for (const reason of m.reasons.reasons) {
        const code = (reason.split(':')[0] ?? reason).trim();
        reasonTally.set(code, (reasonTally.get(code) ?? 0) + 1);
      }
    }
    const topNoMatchReasons = [...reasonTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 10);
    return {
      businessMatch,
      propertyMatch,
      candidatesEvaluated,
      propertiesReceivingMatches,
      businessMatchWithNoPropertyMatch: propertyMatch.NO_MATCH,
      topNoMatchReasons,
    };
  }

  // ── AI drafts (SPRINT 009) ─────────────────────────────────────────────────

  private cloneDraft(d: AiDraftRecord): AiDraftRecord {
    return {
      ...d,
      inputSnapshot: d.inputSnapshot ? structuredClone(d.inputSnapshot) : null,
      policyResult: d.policyResult
        ? {
            decision: d.policyResult.decision,
            reasons: d.policyResult.reasons.map((r) => ({ ...r })),
          }
        : null,
    };
  }

  async createAiDraft(input: CreateAiDraftInput): Promise<AiDraftRecord> {
    for (const d of this.aiDrafts.values()) {
      if (d.businessMatchId === input.businessMatchId && d.version === input.version) {
        throw new Error('duplicate ai draft version for business match');
      }
    }
    const now = this.now();
    const record: AiDraftRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessMatchId: input.businessMatchId,
      opportunityId: input.opportunityId,
      businessId: input.businessId,
      version: input.version,
      status: input.status,
      content: input.content,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      inputSnapshot: input.inputSnapshot ? structuredClone(input.inputSnapshot) : null,
      policyResult: input.policyResult
        ? {
            decision: input.policyResult.decision,
            reasons: input.policyResult.reasons.map((r) => ({ ...r })),
          }
        : null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.aiDrafts.set(record.id, record);
    return this.cloneDraft(record);
  }

  async getAiDraftById(id: string): Promise<AiDraftRecord | null> {
    const d = this.aiDrafts.get(id);
    return d ? this.cloneDraft(d) : null;
  }

  async listAiDraftsByWorkspace(
    workspaceId: string,
    filter: AiDraftFilter = {},
  ): Promise<AiDraftRecord[]> {
    return [...this.aiDrafts.values()]
      .filter(
        (d) =>
          d.workspaceId === workspaceId &&
          (filter.businessMatchId === undefined || d.businessMatchId === filter.businessMatchId) &&
          (filter.status === undefined || d.status === filter.status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.version - a.version)
      .slice(0, filter.limit ?? 500)
      .map((d) => this.cloneDraft(d));
  }

  async listAiDraftsForMatch(businessMatchId: string): Promise<AiDraftRecord[]> {
    return [...this.aiDrafts.values()]
      .filter((d) => d.businessMatchId === businessMatchId)
      .sort((a, b) => a.version - b.version)
      .map((d) => this.cloneDraft(d));
  }

  async getLatestAiDraftForMatch(businessMatchId: string): Promise<AiDraftRecord | null> {
    const all = [...this.aiDrafts.values()]
      .filter((d) => d.businessMatchId === businessMatchId)
      .sort((a, b) => b.version - a.version);
    return all[0] ? this.cloneDraft(all[0]) : null;
  }

  async updateAiDraftStatus(id: string, status: AiDraftStatus): Promise<AiDraftRecord | null> {
    const d = this.aiDrafts.get(id);
    if (!d) return null;
    d.status = status;
    d.updatedAt = this.now();
    return this.cloneDraft(d);
  }

  async createAiDraftEvent(input: CreateAiDraftEventInput): Promise<AiDraftEventRecord> {
    const record: AiDraftEventRecord = {
      id: input.id,
      aiDraftId: input.aiDraftId,
      event: input.event,
      payload: input.payload,
      createdAt: this.now(),
    };
    this.aiDraftEvents.push(record);
    return { ...record };
  }

  async listAiDraftEvents(aiDraftId: string): Promise<AiDraftEventRecord[]> {
    return this.aiDraftEvents
      .filter((e) => e.aiDraftId === aiDraftId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }

  // ── Review tasks (SPRINT 010) ──────────────────────────────────────────────

  async createReviewTask(input: CreateReviewTaskInput): Promise<ReviewTaskRecord> {
    for (const t of this.reviewTasks.values()) {
      if (t.draftId === input.draftId) throw new Error('duplicate review task for draft');
    }
    const now = this.now();
    const record: ReviewTaskRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessMatchId: input.businessMatchId,
      draftId: input.draftId,
      status: 'PENDING',
      assignedTo: input.assignedTo,
      editedContent: null,
      editor: null,
      editedAt: null,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      businessId: input.businessId ?? null,
      propertyId: input.propertyId ?? null,
      propertyMatchId: input.propertyMatchId ?? null,
      contextHash: input.contextHash ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.reviewTasks.set(record.id, record);
    return { ...record };
  }

  async getReviewTaskById(id: string): Promise<ReviewTaskRecord | null> {
    const t = this.reviewTasks.get(id);
    return t ? { ...t } : null;
  }

  async getReviewTaskByDraft(draftId: string): Promise<ReviewTaskRecord | null> {
    for (const t of this.reviewTasks.values()) {
      if (t.draftId === draftId) return { ...t };
    }
    return null;
  }

  async listReviewTasksByWorkspace(
    workspaceId: string,
    filter: ReviewTaskFilter = {},
  ): Promise<ReviewTaskRecord[]> {
    return [...this.reviewTasks.values()]
      .filter(
        (t) =>
          t.workspaceId === workspaceId &&
          (filter.status === undefined || t.status === filter.status) &&
          (filter.businessMatchId === undefined || t.businessMatchId === filter.businessMatchId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit ?? 500)
      .map((t) => ({ ...t }));
  }

  async updateReviewTask(
    id: string,
    input: UpdateReviewTaskInput,
  ): Promise<ReviewTaskRecord | null> {
    const t = this.reviewTasks.get(id);
    if (!t) return null;
    if (input.status !== undefined) t.status = input.status;
    if (input.assignedTo !== undefined) t.assignedTo = input.assignedTo;
    if (input.editedContent !== undefined) t.editedContent = input.editedContent;
    if (input.editor !== undefined) t.editor = input.editor;
    if (input.editedAt !== undefined) t.editedAt = input.editedAt;
    if (input.decidedBy !== undefined) t.decidedBy = input.decidedBy;
    if (input.decidedAt !== undefined) t.decidedAt = input.decidedAt;
    if (input.decisionReason !== undefined) t.decisionReason = input.decisionReason;
    t.updatedAt = this.now();
    return { ...t };
  }

  async createReviewEvent(input: CreateReviewEventInput): Promise<ReviewEventRecord> {
    const record: ReviewEventRecord = {
      id: input.id,
      reviewTaskId: input.reviewTaskId,
      event: input.event,
      payload: input.payload,
      createdAt: this.now(),
    };
    this.reviewEvents.push(record);
    return { ...record };
  }

  async listReviewEvents(reviewTaskId: string): Promise<ReviewEventRecord[]> {
    return this.reviewEvents
      .filter((e) => e.reviewTaskId === reviewTaskId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }

  // ── Action jobs (SPRINT 011) ───────────────────────────────────────────────

  async createActionJob(input: CreateActionJobInput): Promise<ActionJobRecord> {
    // DB-level guarantee (mirrored here): at most one row with a given non-null
    // active_dedup_key — enforces one ACTIVE job per (review task, action type).
    if (input.activeDedupKey !== null) {
      for (const j of this.actionJobs.values()) {
        if (j.activeDedupKey !== null && j.activeDedupKey === input.activeDedupKey) {
          throw new Error('duplicate active action job (active_dedup_key unique)');
        }
      }
    }
    const now = this.now();
    const record: ActionJobRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      reviewTaskId: input.reviewTaskId,
      aiDraftId: input.aiDraftId,
      businessMatchId: input.businessMatchId,
      actionType: input.actionType,
      status: input.status,
      targetPlatform: input.targetPlatform,
      targetUrl: input.targetUrl,
      approvedContent: input.approvedContent,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      blockedAt: input.blockedAt,
      lastErrorCode: null,
      lastErrorMessage: null,
      targetPostKey: input.targetPostKey,
      activeDedupKey: input.activeDedupKey,
      successIdempotencyKey: null,
      executionState: 'none',
      ambiguousAt: null,
      verificationRequired: false,
      lastExecutionSessionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.actionJobs.set(record.id, record);
    return { ...record };
  }

  async getActionJobById(id: string): Promise<ActionJobRecord | null> {
    const j = this.actionJobs.get(id);
    return j ? { ...j } : null;
  }

  async listActionJobsByWorkspace(
    workspaceId: string,
    filter: ActionJobFilter = {},
  ): Promise<ActionJobRecord[]> {
    return [...this.actionJobs.values()]
      .filter(
        (j) =>
          j.workspaceId === workspaceId &&
          (filter.status === undefined || j.status === filter.status) &&
          (filter.reviewTaskId === undefined || j.reviewTaskId === filter.reviewTaskId) &&
          (filter.actionType === undefined || j.actionType === filter.actionType),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit ?? 500)
      .map((j) => ({ ...j }));
  }

  async listActiveActionJobsForReview(
    reviewTaskId: string,
    actionType: ActionType,
  ): Promise<ActionJobRecord[]> {
    return [...this.actionJobs.values()]
      .filter(
        (j) =>
          j.reviewTaskId === reviewTaskId &&
          j.actionType === actionType &&
          ACTIVE_ACTION_STATUSES.includes(j.status),
      )
      .map((j) => ({ ...j }));
  }

  async updateActionJob(id: string, input: UpdateActionJobInput): Promise<ActionJobRecord | null> {
    const j = this.actionJobs.get(id);
    if (!j) return null;
    if (input.status !== undefined) j.status = input.status;
    if (input.attemptCount !== undefined) j.attemptCount = input.attemptCount;
    if (input.scheduledAt !== undefined) j.scheduledAt = input.scheduledAt;
    if (input.startedAt !== undefined) j.startedAt = input.startedAt;
    if (input.completedAt !== undefined) j.completedAt = input.completedAt;
    if (input.cancelledAt !== undefined) j.cancelledAt = input.cancelledAt;
    if (input.blockedAt !== undefined) j.blockedAt = input.blockedAt;
    if (input.lastErrorCode !== undefined) j.lastErrorCode = input.lastErrorCode;
    if (input.lastErrorMessage !== undefined) j.lastErrorMessage = input.lastErrorMessage;
    if (input.activeDedupKey !== undefined) {
      // Honour the nullable-unique guarantee on updates too.
      if (input.activeDedupKey !== null) {
        for (const other of this.actionJobs.values()) {
          if (
            other.id !== id &&
            other.activeDedupKey !== null &&
            other.activeDedupKey === input.activeDedupKey
          ) {
            throw new Error('duplicate active action job (active_dedup_key unique)');
          }
        }
      }
      j.activeDedupKey = input.activeDedupKey;
    }
    if (input.successIdempotencyKey !== undefined) {
      if (input.successIdempotencyKey !== null) {
        for (const other of this.actionJobs.values()) {
          if (
            other.id !== id &&
            other.successIdempotencyKey !== null &&
            other.successIdempotencyKey === input.successIdempotencyKey
          ) {
            throw new Error('duplicate successful comment (success_idempotency_key unique)');
          }
        }
      }
      j.successIdempotencyKey = input.successIdempotencyKey;
    }
    if (input.executionState !== undefined) j.executionState = input.executionState;
    if (input.ambiguousAt !== undefined) j.ambiguousAt = input.ambiguousAt;
    if (input.verificationRequired !== undefined)
      j.verificationRequired = input.verificationRequired;
    if (input.lastExecutionSessionId !== undefined) {
      j.lastExecutionSessionId = input.lastExecutionSessionId;
    }
    j.updatedAt = this.now();
    return { ...j };
  }

  async createActionEvent(input: CreateActionEventInput): Promise<ActionEventRecord> {
    const record: ActionEventRecord = {
      id: input.id,
      actionJobId: input.actionJobId,
      event: input.event,
      payload: input.payload,
      createdAt: this.now(),
    };
    this.actionEvents.push(record);
    return { ...record };
  }

  async listActionEvents(actionJobId: string): Promise<ActionEventRecord[]> {
    return this.actionEvents
      .filter((e) => e.actionJobId === actionJobId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }

  // ── Execution sessions (SPRINT 012) ────────────────────────────────────────

  async createExecutionSession(
    input: CreateExecutionSessionInput,
  ): Promise<ExecutionSessionRecord> {
    // A new session is created ACTIVE (activeKey = actionJobId); enforce one.
    if (this.executionSessionActiveKey.has(input.actionJobId)) {
      throw new Error('active execution session already exists for action job');
    }
    for (const s of this.executionSessions.values()) {
      if (s.actionJobId === input.actionJobId && s.attemptNumber === input.attemptNumber) {
        throw new Error('duplicate execution session attempt for action job');
      }
    }
    const now = this.now();
    const record: ExecutionSessionRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      actionJobId: input.actionJobId,
      attemptNumber: input.attemptNumber,
      status: 'created',
      adapter: input.adapter,
      browserProfileKey: input.browserProfileKey,
      startedAt: null,
      preflightVerifiedAt: null,
      submitStartedAt: null,
      submittedAt: null,
      verificationStartedAt: null,
      verifiedAt: null,
      ambiguousAt: null,
      failedAt: null,
      cancelledAt: null,
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
      recoveryState: null,
      createdAt: now,
      updatedAt: now,
    };
    this.executionSessions.set(record.id, record);
    this.executionSessionActiveKey.set(input.actionJobId, record.id);
    return { ...record };
  }

  async getExecutionSessionById(id: string): Promise<ExecutionSessionRecord | null> {
    const s = this.executionSessions.get(id);
    return s ? { ...s } : null;
  }

  async listExecutionSessionsForJob(actionJobId: string): Promise<ExecutionSessionRecord[]> {
    return [...this.executionSessions.values()]
      .filter((s) => s.actionJobId === actionJobId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map((s) => ({ ...s }));
  }

  async getActiveExecutionSessionForJob(
    actionJobId: string,
  ): Promise<ExecutionSessionRecord | null> {
    const id = this.executionSessionActiveKey.get(actionJobId);
    if (!id) return null;
    const s = this.executionSessions.get(id);
    return s ? { ...s } : null;
  }

  async updateExecutionSession(
    id: string,
    input: UpdateExecutionSessionInput,
  ): Promise<ExecutionSessionRecord | null> {
    const s = this.executionSessions.get(id);
    if (!s) return null;
    if (input.status !== undefined) s.status = input.status;
    for (const key of [
      'startedAt',
      'preflightVerifiedAt',
      'submitStartedAt',
      'submittedAt',
      'verificationStartedAt',
      'verifiedAt',
      'ambiguousAt',
      'failedAt',
      'cancelledAt',
      'finishedAt',
    ] as const) {
      if (input[key] !== undefined) s[key] = input[key]!;
    }
    if (input.errorCode !== undefined) s.errorCode = input.errorCode;
    if (input.errorMessage !== undefined) s.errorMessage = input.errorMessage;
    if (input.recoveryState !== undefined) s.recoveryState = input.recoveryState;
    // activeKey maintenance: when a session leaves the active set, release it.
    if (input.status !== undefined && !ACTIVE_EXECUTION_STATUSES.includes(input.status)) {
      if (this.executionSessionActiveKey.get(s.actionJobId) === s.id) {
        this.executionSessionActiveKey.delete(s.actionJobId);
      }
    }
    s.updatedAt = this.now();
    return { ...s };
  }

  async createExecutionEvidence(
    input: CreateExecutionEvidenceInput,
  ): Promise<ExecutionEvidenceRecord> {
    const record: ExecutionEvidenceRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      actionJobId: input.actionJobId,
      executionSessionId: input.executionSessionId,
      evidenceType: input.evidenceType,
      storageKey: input.storageKey,
      evidenceHash: input.evidenceHash,
      facebookCommentId: input.facebookCommentId,
      observedContent: input.observedContent,
      observedAuthor: input.observedAuthor,
      observedPostUrl: input.observedPostUrl,
      observedAt: input.observedAt,
      metadata: input.metadata,
      createdAt: this.now(),
    };
    this.executionEvidence.push(record);
    return { ...record };
  }

  async listExecutionEvidenceForSession(sessionId: string): Promise<ExecutionEvidenceRecord[]> {
    return this.executionEvidence
      .filter((e) => e.executionSessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }

  // ── Idempotency records (SPRINT 012) ───────────────────────────────────────

  async createIdempotencyRecord(input: CreateIdempotencyRecordInput): Promise<IdempotencyRecord> {
    if (this.idempotencyKeyIndex.has(input.idemKey)) {
      throw new Error('duplicate idempotency reservation (idem_key unique)');
    }
    const now = this.now();
    const record: IdempotencyRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      targetPostKey: input.targetPostKey,
      actionType: input.actionType,
      actionJobId: input.actionJobId,
      executionSessionId: input.executionSessionId,
      status: 'reserved',
      facebookCommentId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.idempotencyRecords.set(record.id, record);
    this.idempotencyKeyIndex.set(input.idemKey, record.id);
    return { ...record };
  }

  async getIdempotencyRecord(
    workspaceId: string,
    businessId: string,
    targetPostKey: string,
    actionType: ActionType,
  ): Promise<IdempotencyRecord | null> {
    // Only a LIVE reservation (idemKey present) counts; released rows are freed.
    const liveKey = `${workspaceId}:${businessId}:${targetPostKey}:${actionType}`;
    const id = this.idempotencyKeyIndex.get(liveKey);
    if (!id) return null;
    const r = this.idempotencyRecords.get(id);
    return r ? { ...r } : null;
  }

  async updateIdempotencyRecord(
    id: string,
    input: UpdateIdempotencyRecordInput,
  ): Promise<IdempotencyRecord | null> {
    const r = this.idempotencyRecords.get(id);
    if (!r) return null;
    if (input.status !== undefined) r.status = input.status;
    if (input.facebookCommentId !== undefined) r.facebookCommentId = input.facebookCommentId;
    if (input.executionSessionId !== undefined) r.executionSessionId = input.executionSessionId;
    // idemKey → null releases the live slot (allows a new reservation).
    if (input.idemKey !== undefined) {
      const liveKey = `${r.workspaceId}:${r.businessId}:${r.targetPostKey}:${r.actionType}`;
      if (input.idemKey === null) this.idempotencyKeyIndex.delete(liveKey);
    }
    r.updatedAt = this.now();
    return { ...r };
  }

  async getOperationalCounts(input: OperationalCountsInput): Promise<OperationalCounts> {
    const aj = {
      total: 0,
      queued: 0,
      blocked: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    };
    let stuckActionJobs = 0;
    const actionCutoff = input.now.getTime() - input.actionProcessingStaleMs;
    for (const j of this.actionJobs.values()) {
      aj.total += 1;
      aj[j.status] += 1;
      if (
        j.status === 'processing' &&
        (j.startedAt?.getTime() ?? input.now.getTime()) < actionCutoff
      ) {
        stuckActionJobs += 1;
      }
    }
    const es = { total: 0, active: 0, ambiguous: 0, failed: 0, verified: 0 };
    for (const s of this.executionSessions.values()) {
      es.total += 1;
      if (ACTIVE_EXECUTION_STATUSES.includes(s.status)) es.active += 1;
      if (s.status === 'ambiguous') es.ambiguous += 1;
      if (s.status === 'failed') es.failed += 1;
      if (s.status === 'verified') es.verified += 1;
    }
    let stuckCollectorRuns = 0;
    const collectorCutoff = input.now.getTime() - input.collectorRunningStaleMs;
    for (const run of this.collectorRuns.values()) {
      if (run.status === 'running' && run.startedAt.getTime() < collectorCutoff)
        stuckCollectorRuns += 1;
    }
    return { actionJobs: aj, executionSessions: es, stuckActionJobs, stuckCollectorRuns };
  }
}
