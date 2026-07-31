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
} from './types';

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
}
