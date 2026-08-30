import { eq, and, desc, sql, isNull, inArray, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  users,
  sessions,
  workspaces,
  businesses,
  businessProfiles,
  businessKnowledge,
  businessMatchingRules,
  facebookAccounts,
  auditEvents,
  facebookGroups,
  businessFacebookGroups,
  businessGroupSubscriptions,
  facebookRawSignals,
  facebookSignals,
  collectorCheckpoints,
  collectorRuns,
  opportunities,
  opportunityEvents,
  businessMatches,
  propertyMatches,
  aiDrafts,
  aiDraftEvents,
  reviewTasks,
  reviewEvents,
  actionJobs,
  actionEvents,
  actionExecutionSessions,
  actionExecutionEvidence,
  actionIdempotencyRecords,
} from '../db/schema';
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
  CollectorRunStatus,
  UpdateCollectorRunInput,
  OpportunityRecord,
  OpportunityDecision,
  OpportunityStatus,
  CreateOpportunityInput,
  OpportunityEventRecord,
  CreateOpportunityEventInput,
  OpportunityStatistics,
  BusinessMatchRecord,
  BusinessGroupSubscriptionRecord,
  CreateBusinessGroupSubscriptionInput,
  MatchDecision,
  MatchReason,
  CreateBusinessMatchInput,
  BusinessMatchFilter,
  PropertyMatchRecord,
  PropertyMatchReasons,
  PropertyMatchRejection,
  CreatePropertyMatchInput,
  PropertyMatchFilter,
  PropertyMatchDecision,
  MatchingFunnelCounts,
  AiDraftRecord,
  AiDraftStatus,
  CreateAiDraftInput,
  AiDraftFilter,
  AiDraftEventRecord,
  CreateAiDraftEventInput,
  DraftPolicyResult,
  ReviewTaskRecord,
  ReviewStatus,
  CreateReviewTaskInput,
  UpdateReviewTaskInput,
  ReviewTaskFilter,
  ReviewEventRecord,
  CreateReviewEventInput,
  ActionJobRecord,
  ActionType,
  ActionStatus,
  TargetPlatform,
  CreateActionJobInput,
  UpdateActionJobInput,
  ActionJobFilter,
  ActionEventRecord,
  CreateActionEventInput,
  ExecutionSessionRecord,
  ExecutionSessionStatus,
  ExecutionAdapterName,
  CreateExecutionSessionInput,
  UpdateExecutionSessionInput,
  ExecutionEvidenceRecord,
  EvidenceType,
  CreateExecutionEvidenceInput,
  IdempotencyRecord,
  IdempotencyStatus,
  CreateIdempotencyRecordInput,
  UpdateIdempotencyRecordInput,
  OperationalCountsInput,
  OperationalCounts,
} from './types';
import { ACTIVE_ACTION_STATUSES, ACTIVE_EXECUTION_STATUSES } from './types';

/** Parse a JSON-encoded string array column, tolerating null/invalid. */
function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * MySQL-backed Store using Drizzle ORM. All queries are parameterised by the
 * ORM (no string-built SQL), providing SQL-injection protection.
 */
export class DrizzleStore implements Store {
  constructor(private readonly db: Database) {}

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    await this.db.insert(users).values({
      id: input.id,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      status: 'active',
    });
    const created = await this.getUserById(input.id);
    if (!created) throw new Error('user creation failed');
    return created;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return rows[0] ? this.toUser(rows[0]) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? this.toUser(rows[0]) : null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const now = new Date();
    await this.db.insert(sessions).values({
      id: input.id,
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt,
      lastSeenAt: now,
    });
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, input.id)).limit(1);
    if (!rows[0]) throw new Error('session creation failed');
    return this.toSession(rows[0]);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionTokenHash, tokenHash))
      .limit(1);
    return rows[0] ? this.toSession(rows[0]) : null;
  }

  async touchSession(id: string, lastSeenAt: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt }).where(eq(sessions.id, id));
  }

  async revokeSession(id: string, revokedAt: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt }).where(eq(sessions.id, id));
  }

  async revokeAllUserSessions(userId: string, revokedAt: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt }).where(eq(sessions.userId, userId));
  }

  async getWorkspaceByOwner(ownerUserId: string): Promise<WorkspaceRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0] ? this.toWorkspace(rows[0]) : null;
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    return rows.length > 0;
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    await this.db.insert(workspaces).values({
      id: input.id,
      ownerUserId: input.ownerUserId,
      name: input.name,
      slug: input.slug,
      status: 'active',
    });
    const created = await this.getWorkspaceByOwner(input.ownerUserId);
    if (!created) throw new Error('workspace creation failed');
    return created;
  }

  async updateWorkspaceName(id: string, name: string): Promise<WorkspaceRecord | null> {
    await this.db.update(workspaces).set({ name }).where(eq(workspaces.id, id));
    const rows = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0] ? this.toWorkspace(rows[0]) : null;
  }

  private toUser(row: typeof users.$inferSelect): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toSession(row: typeof sessions.$inferSelect): SessionRecord {
    return {
      id: row.id,
      userId: row.userId,
      sessionTokenHash: row.sessionTokenHash,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      revokedAt: row.revokedAt,
    };
  }

  private toWorkspace(row: typeof workspaces.$inferSelect): WorkspaceRecord {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Businesses ─────────────────────────────────────────────────────────────

  async createBusiness(input: CreateBusinessInput, profile: ProfileSeed): Promise<BusinessRecord> {
    await this.db.transaction(async (tx) => {
      await tx.insert(businesses).values({
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        slug: input.slug,
        status: 'active',
      });
      await tx.insert(businessProfiles).values({
        id: profile.id,
        businessId: input.id,
        category: profile.category,
        description: profile.description,
        sellingPoints: JSON.stringify([]),
        prohibitedClaims: JSON.stringify([]),
      });
    });
    const created = await this.getBusinessById(input.id);
    if (!created) throw new Error('business creation failed');
    return created;
  }

  async listBusinessesByWorkspace(workspaceId: string): Promise<BusinessRecord[]> {
    const rows = await this.db
      .select()
      .from(businesses)
      .where(eq(businesses.workspaceId, workspaceId))
      .orderBy(businesses.createdAt);
    return rows.map((r) => this.toBusiness(r));
  }

  async getBusinessById(id: string): Promise<BusinessRecord | null> {
    const rows = await this.db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
    return rows[0] ? this.toBusiness(rows[0]) : null;
  }

  async isBusinessSlugTaken(slug: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);
    return rows.length > 0;
  }

  async isBusinessNameTakenInWorkspace(workspaceId: string, name: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.workspaceId, workspaceId), eq(businesses.name, name)))
      .limit(1);
    return rows.length > 0;
  }

  async updateBusiness(id: string, input: UpdateBusinessInput): Promise<BusinessRecord | null> {
    const patch: Partial<typeof businesses.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length > 0) {
      await this.db.update(businesses).set(patch).where(eq(businesses.id, id));
    }
    return this.getBusinessById(id);
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfileByBusiness(businessId: string): Promise<BusinessProfileRecord | null> {
    const rows = await this.db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.businessId, businessId))
      .limit(1);
    return rows[0] ? this.toProfile(rows[0]) : null;
  }

  async updateProfile(
    businessId: string,
    patch: ProfilePatch,
  ): Promise<BusinessProfileRecord | null> {
    const set: Partial<typeof businessProfiles.$inferInsert> = {};
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.sellingPoints !== undefined) set.sellingPoints = JSON.stringify(patch.sellingPoints);
    if (patch.serviceArea !== undefined) set.serviceArea = patch.serviceArea;
    if (patch.contactInformation !== undefined) set.contactInformation = patch.contactInformation;
    if (patch.responseTone !== undefined) set.responseTone = patch.responseTone;
    if (patch.prohibitedClaims !== undefined) {
      set.prohibitedClaims = JSON.stringify(patch.prohibitedClaims);
    }
    if (Object.keys(set).length > 0) {
      await this.db
        .update(businessProfiles)
        .set(set)
        .where(eq(businessProfiles.businessId, businessId));
    }
    return this.getProfileByBusiness(businessId);
  }

  // ── Knowledge ──────────────────────────────────────────────────────────────

  async listKnowledge(businessId: string): Promise<BusinessKnowledgeRecord[]> {
    const rows = await this.db
      .select()
      .from(businessKnowledge)
      .where(eq(businessKnowledge.businessId, businessId))
      .orderBy(businessKnowledge.createdAt);
    return rows.map((r) => this.toKnowledge(r));
  }

  async getKnowledgeById(id: string): Promise<BusinessKnowledgeRecord | null> {
    const rows = await this.db
      .select()
      .from(businessKnowledge)
      .where(eq(businessKnowledge.id, id))
      .limit(1);
    return rows[0] ? this.toKnowledge(rows[0]) : null;
  }

  async createKnowledge(input: CreateKnowledgeInput): Promise<BusinessKnowledgeRecord> {
    await this.db.insert(businessKnowledge).values({
      id: input.id,
      businessId: input.businessId,
      title: input.title,
      content: input.content,
      status: input.status,
    });
    const created = await this.getKnowledgeById(input.id);
    if (!created) throw new Error('knowledge creation failed');
    return created;
  }

  async updateKnowledge(
    id: string,
    input: UpdateKnowledgeInput,
  ): Promise<BusinessKnowledgeRecord | null> {
    const set: Partial<typeof businessKnowledge.$inferInsert> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.content !== undefined) set.content = input.content;
    if (input.status !== undefined) set.status = input.status;
    if (Object.keys(set).length > 0) {
      await this.db.update(businessKnowledge).set(set).where(eq(businessKnowledge.id, id));
    }
    return this.getKnowledgeById(id);
  }

  async deleteKnowledge(id: string): Promise<void> {
    await this.db.delete(businessKnowledge).where(eq(businessKnowledge.id, id));
  }

  // ── Matching rules ─────────────────────────────────────────────────────────

  async listRules(businessId: string): Promise<BusinessMatchingRuleRecord[]> {
    const rows = await this.db
      .select()
      .from(businessMatchingRules)
      .where(eq(businessMatchingRules.businessId, businessId))
      .orderBy(desc(businessMatchingRules.priority), businessMatchingRules.createdAt);
    return rows.map((r) => this.toRule(r));
  }

  async getRuleById(id: string): Promise<BusinessMatchingRuleRecord | null> {
    const rows = await this.db
      .select()
      .from(businessMatchingRules)
      .where(eq(businessMatchingRules.id, id))
      .limit(1);
    return rows[0] ? this.toRule(rows[0]) : null;
  }

  async createRule(input: CreateRuleInput): Promise<BusinessMatchingRuleRecord> {
    await this.db.insert(businessMatchingRules).values({
      id: input.id,
      businessId: input.businessId,
      ruleType: input.ruleType,
      ruleValue: input.ruleValue,
      priority: input.priority,
      status: input.status,
    });
    const created = await this.getRuleById(input.id);
    if (!created) throw new Error('rule creation failed');
    return created;
  }

  async updateRule(id: string, input: UpdateRuleInput): Promise<BusinessMatchingRuleRecord | null> {
    const set: Partial<typeof businessMatchingRules.$inferInsert> = {};
    if (input.ruleType !== undefined) set.ruleType = input.ruleType;
    if (input.ruleValue !== undefined) set.ruleValue = input.ruleValue;
    if (input.priority !== undefined) set.priority = input.priority;
    if (input.status !== undefined) set.status = input.status;
    if (Object.keys(set).length > 0) {
      await this.db.update(businessMatchingRules).set(set).where(eq(businessMatchingRules.id, id));
    }
    return this.getRuleById(id);
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.delete(businessMatchingRules).where(eq(businessMatchingRules.id, id));
  }

  // ── Mappers ──────────────────────────────────────────────────────────────

  private toBusiness(row: typeof businesses.$inferSelect): BusinessRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toProfile(row: typeof businessProfiles.$inferSelect): BusinessProfileRecord {
    return {
      businessId: row.businessId,
      category: row.category,
      description: row.description,
      sellingPoints: parseStringArray(row.sellingPoints),
      serviceArea: row.serviceArea,
      contactInformation: row.contactInformation,
      responseTone: row.responseTone,
      prohibitedClaims: parseStringArray(row.prohibitedClaims),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toKnowledge(row: typeof businessKnowledge.$inferSelect): BusinessKnowledgeRecord {
    return {
      id: row.id,
      businessId: row.businessId,
      title: row.title,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toRule(row: typeof businessMatchingRules.$inferSelect): BusinessMatchingRuleRecord {
    return {
      id: row.id,
      businessId: row.businessId,
      ruleType: row.ruleType,
      ruleValue: row.ruleValue,
      priority: row.priority,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Facebook connection ────────────────────────────────────────────────────

  async getFacebookAccountByWorkspace(workspaceId: string): Promise<FacebookAccountRecord | null> {
    const rows = await this.db
      .select()
      .from(facebookAccounts)
      .where(eq(facebookAccounts.workspaceId, workspaceId))
      .limit(1);
    return rows[0] ? this.toFacebook(rows[0]) : null;
  }

  async createFacebookConnection(
    input: CreateFacebookConnectionInput,
  ): Promise<FacebookAccountRecord> {
    await this.db.insert(facebookAccounts).values({
      id: input.id,
      workspaceId: input.workspaceId,
      platform: 'facebook',
      profilePath: input.profilePath,
      status: 'active',
      connectionState: 'connecting',
    });
    const created = await this.getFacebookAccountById(input.id);
    if (!created) throw new Error('facebook connection creation failed');
    return created;
  }

  private async getFacebookAccountById(id: string): Promise<FacebookAccountRecord | null> {
    const rows = await this.db
      .select()
      .from(facebookAccounts)
      .where(eq(facebookAccounts.id, id))
      .limit(1);
    return rows[0] ? this.toFacebook(rows[0]) : null;
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
    const set: Partial<typeof facebookAccounts.$inferInsert> = { connectionState };
    if (fields?.status !== undefined) set.status = fields.status;
    if (fields?.lastErrorCode !== undefined) set.lastErrorCode = fields.lastErrorCode;
    if (fields?.lastErrorMessage !== undefined) set.lastErrorMessage = fields.lastErrorMessage;
    if (fields?.connectedAt !== undefined) set.connectedAt = fields.connectedAt;
    if (fields?.lastValidatedAt !== undefined) set.lastValidatedAt = fields.lastValidatedAt;
    if (fields?.sessionExpiresAt !== undefined) set.sessionExpiresAt = fields.sessionExpiresAt;
    await this.db.update(facebookAccounts).set(set).where(eq(facebookAccounts.id, id));
    return this.getFacebookAccountById(id);
  }

  async updateFacebookIdentity(
    id: string,
    identity: FacebookIdentityUpdate,
  ): Promise<FacebookAccountRecord | null> {
    const now = new Date();
    await this.db
      .update(facebookAccounts)
      .set({
        displayName: identity.displayName,
        facebookUserId: identity.facebookUserId,
        sessionExpiresAt: identity.sessionExpiresAt,
        connectionState: 'connected',
        status: 'active',
        connectedAt: now,
        lastValidatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(eq(facebookAccounts.id, id));
    return this.getFacebookAccountById(id);
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
    await this.db
      .update(facebookAccounts)
      .set({
        connectionState: 'disconnected',
        status: 'disconnected',
        disconnectedAt: new Date(),
        sessionExpiresAt: null,
      })
      .where(eq(facebookAccounts.id, id));
    return this.getFacebookAccountById(id);
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  async createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord> {
    await this.db.insert(auditEvents).values({
      id: input.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventType: input.eventType,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return {
      id: input.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: new Date(),
    };
  }

  async listAuditEventsByWorkspace(workspaceId: string, limit = 100): Promise<AuditEventRecord[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
    return rows.map((r) => this.toAudit(r));
  }

  async listAuditEventsByType(eventType: string, limit = 100): Promise<AuditEventRecord[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, eventType))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
    return rows.map((r) => this.toAudit(r));
  }

  private toFacebook(row: typeof facebookAccounts.$inferSelect): FacebookAccountRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      platform: row.platform,
      displayName: row.displayName,
      facebookUserId: row.facebookUserId,
      status: row.status as FacebookAccountStatus,
      connectionState: row.connectionState as FacebookConnectionState,
      profilePath: row.profilePath,
      connectedAt: row.connectedAt,
      lastValidatedAt: row.lastValidatedAt,
      sessionExpiresAt: row.sessionExpiresAt,
      disconnectedAt: row.disconnectedAt,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Facebook groups ────────────────────────────────────────────────────────

  async createFacebookGroup(input: CreateFacebookGroupInput): Promise<FacebookGroupRecord> {
    await this.db.insert(facebookGroups).values({
      id: input.id,
      workspaceId: input.workspaceId,
      facebookGroupId: input.facebookGroupId,
      canonicalUrl: input.canonicalUrl,
      originalUrl: input.originalUrl,
      status: 'active',
      accessState: 'unknown',
    });
    const created = await this.getFacebookGroupById(input.id);
    if (!created) throw new Error('group creation failed');
    return created;
  }

  async listFacebookGroupsByWorkspace(workspaceId: string): Promise<FacebookGroupRecord[]> {
    const rows = await this.db
      .select()
      .from(facebookGroups)
      .where(eq(facebookGroups.workspaceId, workspaceId))
      .orderBy(facebookGroups.createdAt);
    return rows.map((r) => this.toGroup(r));
  }

  async getFacebookGroupById(id: string): Promise<FacebookGroupRecord | null> {
    const rows = await this.db
      .select()
      .from(facebookGroups)
      .where(eq(facebookGroups.id, id))
      .limit(1);
    return rows[0] ? this.toGroup(rows[0]) : null;
  }

  async isGroupCanonicalUrlTaken(workspaceId: string, canonicalUrl: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: facebookGroups.id })
      .from(facebookGroups)
      .where(
        and(
          eq(facebookGroups.workspaceId, workspaceId),
          eq(facebookGroups.canonicalUrl, canonicalUrl),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async updateFacebookGroup(
    id: string,
    input: UpdateFacebookGroupInput,
  ): Promise<FacebookGroupRecord | null> {
    const set: Partial<typeof facebookGroups.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.status !== undefined) set.status = input.status;
    if (input.facebookGroupId !== undefined) set.facebookGroupId = input.facebookGroupId;
    if (Object.keys(set).length > 0) {
      await this.db.update(facebookGroups).set(set).where(eq(facebookGroups.id, id));
    }
    return this.getFacebookGroupById(id);
  }

  async updateFacebookGroupAccessState(
    id: string,
    accessState: GroupAccessState,
    fields?: GroupAccessUpdate,
  ): Promise<FacebookGroupRecord | null> {
    const set: Partial<typeof facebookGroups.$inferInsert> = { accessState };
    if (fields?.lastValidatedAt !== undefined) set.lastValidatedAt = fields.lastValidatedAt;
    if (fields?.lastErrorCode !== undefined) set.lastErrorCode = fields.lastErrorCode;
    if (fields?.lastErrorMessage !== undefined) set.lastErrorMessage = fields.lastErrorMessage;
    if (fields?.name !== undefined) set.name = fields.name;
    if (fields?.facebookGroupId !== undefined) set.facebookGroupId = fields.facebookGroupId;
    await this.db.update(facebookGroups).set(set).where(eq(facebookGroups.id, id));
    return this.getFacebookGroupById(id);
  }

  // ── Business ↔ group assignment ────────────────────────────────────────────

  async assignGroupToBusiness(
    input: CreateGroupAssignmentInput,
  ): Promise<BusinessGroupAssignmentRecord> {
    await this.db.insert(businessFacebookGroups).values({
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      facebookGroupId: input.facebookGroupId,
      status: 'active',
    });
    const created = await this.getGroupAssignment(input.businessId, input.facebookGroupId);
    if (!created) throw new Error('assignment creation failed');
    return created;
  }

  async getGroupAssignment(
    businessId: string,
    facebookGroupId: string,
  ): Promise<BusinessGroupAssignmentRecord | null> {
    const rows = await this.db
      .select()
      .from(businessFacebookGroups)
      .where(
        and(
          eq(businessFacebookGroups.businessId, businessId),
          eq(businessFacebookGroups.facebookGroupId, facebookGroupId),
        ),
      )
      .limit(1);
    return rows[0] ? this.toAssignment(rows[0]) : null;
  }

  async unassignGroupFromBusiness(businessId: string, facebookGroupId: string): Promise<void> {
    await this.db
      .delete(businessFacebookGroups)
      .where(
        and(
          eq(businessFacebookGroups.businessId, businessId),
          eq(businessFacebookGroups.facebookGroupId, facebookGroupId),
        ),
      );
  }

  async listBusinessesForGroup(groupId: string): Promise<BusinessRecord[]> {
    const rows = await this.db
      .select({ b: businesses })
      .from(businessFacebookGroups)
      .innerJoin(businesses, eq(businesses.id, businessFacebookGroups.businessId))
      .where(eq(businessFacebookGroups.facebookGroupId, groupId));
    return rows.map((r) => this.toBusiness(r.b));
  }

  async listGroupsForBusiness(businessId: string): Promise<FacebookGroupRecord[]> {
    const rows = await this.db
      .select({ g: facebookGroups })
      .from(businessFacebookGroups)
      .innerJoin(facebookGroups, eq(facebookGroups.id, businessFacebookGroups.facebookGroupId))
      .where(eq(businessFacebookGroups.businessId, businessId));
    return rows.map((r) => this.toGroup(r.g));
  }

  private toGroup(row: typeof facebookGroups.$inferSelect): FacebookGroupRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      facebookGroupId: row.facebookGroupId,
      name: row.name,
      canonicalUrl: row.canonicalUrl,
      originalUrl: row.originalUrl,
      status: row.status as FacebookGroupRecord['status'],
      accessState: row.accessState as GroupAccessState,
      lastValidatedAt: row.lastValidatedAt,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAssignment(
    row: typeof businessFacebookGroups.$inferSelect,
  ): BusinessGroupAssignmentRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessId: row.businessId,
      facebookGroupId: row.facebookGroupId,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Collector: raw signals ─────────────────────────────────────────────────

  async createRawSignal(input: CreateRawSignalInput): Promise<RawSignalRecord> {
    await this.db.insert(facebookRawSignals).values({
      id: input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      facebookPostId: input.facebookPostId,
      postUrl: input.postUrl,
      rawHtml: input.rawHtml,
      rawJson: input.rawJson,
      contentHash: input.contentHash,
    });
    const rows = await this.db
      .select()
      .from(facebookRawSignals)
      .where(eq(facebookRawSignals.id, input.id))
      .limit(1);
    if (!rows[0]) throw new Error('raw signal creation failed');
    return this.toRawSignal(rows[0]);
  }

  async rawSignalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: facebookRawSignals.id })
      .from(facebookRawSignals)
      .where(
        and(
          eq(facebookRawSignals.workspaceId, workspaceId),
          eq(facebookRawSignals.postUrl, postUrl),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  // ── Collector: normalized signals ──────────────────────────────────────────

  async createSignal(input: CreateSignalInput): Promise<SignalRecord> {
    await this.db.insert(facebookSignals).values({
      id: input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      facebookPostId: input.facebookPostId,
      postUrl: input.postUrl,
      authorName: input.authorName,
      authorProfile: input.authorProfile,
      message: input.message,
      mediaUrls: JSON.stringify(input.mediaUrls),
      createdTime: input.createdTime,
      normalizedHash: input.normalizedHash,
    });
    const rows = await this.db
      .select()
      .from(facebookSignals)
      .where(eq(facebookSignals.id, input.id))
      .limit(1);
    if (!rows[0]) throw new Error('signal creation failed');
    return this.toSignal(rows[0]);
  }

  async signalExistsByUrl(workspaceId: string, postUrl: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: facebookSignals.id })
      .from(facebookSignals)
      .where(
        and(eq(facebookSignals.workspaceId, workspaceId), eq(facebookSignals.postUrl, postUrl)),
      )
      .limit(1);
    return rows.length > 0;
  }

  async signalExistsByFacebookPostId(
    workspaceId: string,
    facebookPostId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: facebookSignals.id })
      .from(facebookSignals)
      .where(
        and(
          eq(facebookSignals.workspaceId, workspaceId),
          eq(facebookSignals.facebookPostId, facebookPostId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async signalExistsByHash(workspaceId: string, normalizedHash: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: facebookSignals.id })
      .from(facebookSignals)
      .where(
        and(
          eq(facebookSignals.workspaceId, workspaceId),
          eq(facebookSignals.normalizedHash, normalizedHash),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async countSignalsByWorkspace(workspaceId: string): Promise<number> {
    const rows = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(facebookSignals)
      .where(eq(facebookSignals.workspaceId, workspaceId));
    return Number(rows[0]?.c ?? 0);
  }

  // ── Collector: checkpoints ─────────────────────────────────────────────────

  async getCheckpointByGroup(groupId: string): Promise<CollectorCheckpointRecord | null> {
    const rows = await this.db
      .select()
      .from(collectorCheckpoints)
      .where(eq(collectorCheckpoints.groupId, groupId))
      .limit(1);
    return rows[0] ? this.toCheckpoint(rows[0]) : null;
  }

  async upsertCheckpoint(input: UpsertCheckpointInput): Promise<CollectorCheckpointRecord> {
    const existing = await this.getCheckpointByGroup(input.groupId);
    if (existing) {
      await this.db
        .update(collectorCheckpoints)
        .set({
          lastPostId: input.lastPostId,
          lastPostUrl: input.lastPostUrl,
          lastScan: input.lastScan,
          lastCursor: input.lastCursor,
        })
        .where(eq(collectorCheckpoints.groupId, input.groupId));
    } else {
      await this.db.insert(collectorCheckpoints).values({
        id: input.id,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        lastPostId: input.lastPostId,
        lastPostUrl: input.lastPostUrl,
        lastScan: input.lastScan,
        lastCursor: input.lastCursor,
      });
    }
    const created = await this.getCheckpointByGroup(input.groupId);
    if (!created) throw new Error('checkpoint upsert failed');
    return created;
  }

  // ── Collector: runs ────────────────────────────────────────────────────────

  async createCollectorRun(id: string, workspaceId: string): Promise<CollectorRunRecord> {
    await this.db.insert(collectorRuns).values({
      id,
      workspaceId,
      status: 'running',
      groupsProcessed: 0,
      postsCollected: 0,
      errors: 0,
    });
    const created = await this.getCollectorRunById(id);
    if (!created) throw new Error('run creation failed');
    return created;
  }

  async updateCollectorRun(
    id: string,
    input: UpdateCollectorRunInput,
  ): Promise<CollectorRunRecord | null> {
    const set: Partial<typeof collectorRuns.$inferInsert> = {};
    if (input.status !== undefined) set.status = input.status;
    if (input.finishedAt !== undefined) set.finishedAt = input.finishedAt;
    if (input.groupsProcessed !== undefined) set.groupsProcessed = input.groupsProcessed;
    if (input.postsCollected !== undefined) set.postsCollected = input.postsCollected;
    if (input.duplicatesSkipped !== undefined) set.duplicatesSkipped = input.duplicatesSkipped;
    if (input.errors !== undefined) set.errors = input.errors;
    if (input.errorSummary !== undefined) set.errorSummary = input.errorSummary;
    if (Object.keys(set).length > 0) {
      await this.db.update(collectorRuns).set(set).where(eq(collectorRuns.id, id));
    }
    return this.getCollectorRunById(id);
  }

  async getCollectorRunById(id: string): Promise<CollectorRunRecord | null> {
    const rows = await this.db
      .select()
      .from(collectorRuns)
      .where(eq(collectorRuns.id, id))
      .limit(1);
    return rows[0] ? this.toRun(rows[0]) : null;
  }

  async getLatestCollectorRun(workspaceId: string): Promise<CollectorRunRecord | null> {
    const rows = await this.db
      .select()
      .from(collectorRuns)
      .where(eq(collectorRuns.workspaceId, workspaceId))
      .orderBy(desc(collectorRuns.startedAt))
      .limit(1);
    return rows[0] ? this.toRun(rows[0]) : null;
  }

  async listCollectorRuns(workspaceId: string, limit = 50): Promise<CollectorRunRecord[]> {
    const rows = await this.db
      .select()
      .from(collectorRuns)
      .where(eq(collectorRuns.workspaceId, workspaceId))
      .orderBy(desc(collectorRuns.startedAt))
      .limit(limit);
    return rows.map((r) => this.toRun(r));
  }

  private toRawSignal(row: typeof facebookRawSignals.$inferSelect): RawSignalRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      groupId: row.groupId,
      facebookPostId: row.facebookPostId,
      postUrl: row.postUrl,
      rawHtml: row.rawHtml,
      rawJson: row.rawJson,
      contentHash: row.contentHash,
      collectedAt: row.collectedAt,
    };
  }

  private toSignal(row: typeof facebookSignals.$inferSelect): SignalRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      groupId: row.groupId,
      facebookPostId: row.facebookPostId,
      postUrl: row.postUrl,
      authorName: row.authorName,
      authorProfile: row.authorProfile,
      message: row.message,
      mediaUrls: parseStringArray(row.mediaUrls),
      createdTime: row.createdTime,
      normalizedHash: row.normalizedHash,
      normalizedAt: row.normalizedAt,
    };
  }

  private toCheckpoint(row: typeof collectorCheckpoints.$inferSelect): CollectorCheckpointRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      groupId: row.groupId,
      lastPostId: row.lastPostId,
      lastPostUrl: row.lastPostUrl,
      lastScan: row.lastScan,
      lastCursor: row.lastCursor,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toRun(row: typeof collectorRuns.$inferSelect): CollectorRunRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      status: row.status as CollectorRunStatus,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      groupsProcessed: row.groupsProcessed,
      postsCollected: row.postsCollected,
      duplicatesSkipped: row.duplicatesSkipped,
      errors: row.errors,
      errorSummary: row.errorSummary,
      createdAt: row.createdAt,
    };
  }

  private toAudit(row: typeof auditEvents.$inferSelect): AuditEventRecord {
    let payload: Record<string, unknown> | null = null;
    if (row.payload) {
      try {
        const parsed: unknown = JSON.parse(row.payload);
        payload = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        payload = null;
      }
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      eventType: row.eventType,
      payload,
      createdAt: row.createdAt,
    };
  }

  // ── Signals (read access for classification) ───────────────────────────────

  async getSignalById(id: string): Promise<SignalRecord | null> {
    const rows = await this.db
      .select()
      .from(facebookSignals)
      .where(eq(facebookSignals.id, id))
      .limit(1);
    return rows[0] ? this.toSignal(rows[0]) : null;
  }

  async listUnclassifiedSignals(workspaceId: string, limit = 500): Promise<SignalRecord[]> {
    const rows = await this.db
      .select({ s: facebookSignals })
      .from(facebookSignals)
      .leftJoin(opportunities, eq(opportunities.signalId, facebookSignals.id))
      .where(and(eq(facebookSignals.workspaceId, workspaceId), isNull(opportunities.id)))
      .orderBy(facebookSignals.normalizedAt)
      .limit(limit);
    return rows.map((r) => this.toSignal(r.s));
  }

  // ── Opportunities ──────────────────────────────────────────────────────────

  async createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
    await this.db.insert(opportunities).values({
      id: input.id,
      workspaceId: input.workspaceId,
      signalId: input.signalId,
      decision: input.decision,
      status: input.status,
      classifierVersion: input.classifierVersion,
      sourceOpportunityId: input.sourceOpportunityId ?? null,
    });
    const created = await this.getOpportunityById(input.id);
    if (!created) throw new Error('opportunity creation failed');
    return created;
  }

  async getProjectedOpportunity(
    sourceOpportunityId: string,
    workspaceId: string,
  ): Promise<OpportunityRecord | null> {
    const rows = await this.db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.sourceOpportunityId, sourceOpportunityId),
          eq(opportunities.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return rows[0] ? this.toOpportunity(rows[0]) : null;
  }

  async getOpportunityById(id: string): Promise<OpportunityRecord | null> {
    const rows = await this.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .limit(1);
    return rows[0] ? this.toOpportunity(rows[0]) : null;
  }

  async getOpportunityBySignal(signalId: string): Promise<OpportunityRecord | null> {
    const rows = await this.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.signalId, signalId))
      .limit(1);
    return rows[0] ? this.toOpportunity(rows[0]) : null;
  }

  async listOpportunitiesByWorkspace(
    workspaceId: string,
    filter: { status?: OpportunityStatus; decision?: OpportunityDecision; limit?: number } = {},
  ): Promise<OpportunityRecord[]> {
    const conds = [eq(opportunities.workspaceId, workspaceId)];
    if (filter.status) conds.push(eq(opportunities.status, filter.status));
    if (filter.decision) conds.push(eq(opportunities.decision, filter.decision));
    const rows = await this.db
      .select()
      .from(opportunities)
      .where(and(...conds))
      .orderBy(desc(opportunities.createdAt))
      .limit(filter.limit ?? 200);
    return rows.map((r) => this.toOpportunity(r));
  }

  async updateOpportunityStatus(
    id: string,
    status: OpportunityStatus,
  ): Promise<OpportunityRecord | null> {
    await this.db.update(opportunities).set({ status }).where(eq(opportunities.id, id));
    return this.getOpportunityById(id);
  }

  async updateOpportunityDecision(
    id: string,
    input: { decision: OpportunityDecision; status: OpportunityStatus; classifierVersion: string },
  ): Promise<OpportunityRecord | null> {
    await this.db
      .update(opportunities)
      .set({
        decision: input.decision,
        status: input.status,
        classifierVersion: input.classifierVersion,
      })
      .where(eq(opportunities.id, id));
    return this.getOpportunityById(id);
  }

  async opportunityExistsForSignalHash(
    workspaceId: string,
    normalizedHash: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: opportunities.id })
      .from(opportunities)
      .innerJoin(facebookSignals, eq(facebookSignals.id, opportunities.signalId))
      .where(
        and(
          eq(opportunities.workspaceId, workspaceId),
          eq(facebookSignals.normalizedHash, normalizedHash),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getOpportunityStatistics(workspaceId: string): Promise<OpportunityStatistics> {
    const rows = await this.db
      .select({
        total: sql<number>`count(*)`,
        accepted: sql<number>`sum(case when ${opportunities.decision} = 'ACCEPT' then 1 else 0 end)`,
        rejected: sql<number>`sum(case when ${opportunities.decision} = 'REJECT' then 1 else 0 end)`,
        newCount: sql<number>`sum(case when ${opportunities.status} = 'NEW' then 1 else 0 end)`,
        ready: sql<number>`sum(case when ${opportunities.status} = 'READY' then 1 else 0 end)`,
        archived: sql<number>`sum(case when ${opportunities.status} = 'ARCHIVED' then 1 else 0 end)`,
      })
      .from(opportunities)
      .where(eq(opportunities.workspaceId, workspaceId));
    const r = rows[0];
    const unclassified = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(facebookSignals)
      .leftJoin(opportunities, eq(opportunities.signalId, facebookSignals.id))
      .where(and(eq(facebookSignals.workspaceId, workspaceId), isNull(opportunities.id)));
    return {
      total: Number(r?.total ?? 0),
      accepted: Number(r?.accepted ?? 0),
      rejected: Number(r?.rejected ?? 0),
      new: Number(r?.newCount ?? 0),
      ready: Number(r?.ready ?? 0),
      archived: Number(r?.archived ?? 0),
      unclassifiedSignals: Number(unclassified[0]?.c ?? 0),
    };
  }

  // ── Opportunity events ─────────────────────────────────────────────────────

  async createOpportunityEvent(
    input: CreateOpportunityEventInput,
  ): Promise<OpportunityEventRecord> {
    await this.db.insert(opportunityEvents).values({
      id: input.id,
      opportunityId: input.opportunityId,
      event: input.event,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return {
      id: input.id,
      opportunityId: input.opportunityId,
      event: input.event,
      payload: input.payload,
      createdAt: new Date(),
    };
  }

  async listOpportunityEvents(opportunityId: string): Promise<OpportunityEventRecord[]> {
    const rows = await this.db
      .select()
      .from(opportunityEvents)
      .where(eq(opportunityEvents.opportunityId, opportunityId))
      .orderBy(opportunityEvents.createdAt);
    return rows.map((r) => this.toOpportunityEvent(r));
  }

  private toOpportunity(row: typeof opportunities.$inferSelect): OpportunityRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      signalId: row.signalId,
      decision: row.decision as OpportunityDecision,
      status: row.status as OpportunityStatus,
      classifierVersion: row.classifierVersion,
      sourceOpportunityId: row.sourceOpportunityId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toOpportunityEvent(row: typeof opportunityEvents.$inferSelect): OpportunityEventRecord {
    let payload: Record<string, unknown> | null = null;
    if (row.payload) {
      try {
        const parsed: unknown = JSON.parse(row.payload);
        payload = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        payload = null;
      }
    }
    return {
      id: row.id,
      opportunityId: row.opportunityId,
      event: row.event,
      payload,
      createdAt: row.createdAt,
    };
  }

  // ── Business matches (SPRINT 008) ──────────────────────────────────────────

  async createBusinessMatch(input: CreateBusinessMatchInput): Promise<BusinessMatchRecord> {
    await this.db.insert(businessMatches).values({
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      opportunityId: input.opportunityId,
      decision: input.decision,
      reasons: JSON.stringify(input.reasons),
      matcherVersion: input.matcherVersion,
    });
    const created = await this.getBusinessMatchById(input.id);
    if (!created) throw new Error('business match creation failed');
    return created;
  }

  async getBusinessMatchById(id: string): Promise<BusinessMatchRecord | null> {
    const rows = await this.db
      .select()
      .from(businessMatches)
      .where(eq(businessMatches.id, id))
      .limit(1);
    return rows[0] ? this.toBusinessMatch(rows[0]) : null;
  }

  async businessMatchExists(opportunityId: string, businessId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: businessMatches.id })
      .from(businessMatches)
      .where(
        and(
          eq(businessMatches.opportunityId, opportunityId),
          eq(businessMatches.businessId, businessId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async listBusinessMatchesByWorkspace(
    workspaceId: string,
    filter: BusinessMatchFilter = {},
  ): Promise<BusinessMatchRecord[]> {
    const conds = [eq(businessMatches.workspaceId, workspaceId)];
    if (filter.opportunityId) conds.push(eq(businessMatches.opportunityId, filter.opportunityId));
    if (filter.businessId) conds.push(eq(businessMatches.businessId, filter.businessId));
    if (filter.decision) conds.push(eq(businessMatches.decision, filter.decision));
    const rows = await this.db
      .select()
      .from(businessMatches)
      .where(and(...conds))
      .orderBy(desc(businessMatches.matchedAt))
      .limit(filter.limit ?? 500);
    return rows.map((r) => this.toBusinessMatch(r));
  }

  // ── Central Scanner subscriptions (MODEL C) ────────────────────────────────

  async createBusinessGroupSubscription(
    input: CreateBusinessGroupSubscriptionInput,
  ): Promise<BusinessGroupSubscriptionRecord> {
    await this.db.insert(businessGroupSubscriptions).values({
      id: input.id,
      sourceGroupId: input.sourceGroupId,
      businessId: input.businessId,
      enabled: input.enabled ?? true,
    });
    const rows = await this.db
      .select()
      .from(businessGroupSubscriptions)
      .where(eq(businessGroupSubscriptions.id, input.id))
      .limit(1);
    if (!rows[0]) throw new Error('subscription creation failed');
    return this.toSubscription(rows[0]);
  }

  async businessGroupSubscriptionExists(
    sourceGroupId: string,
    businessId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: businessGroupSubscriptions.id })
      .from(businessGroupSubscriptions)
      .where(
        and(
          eq(businessGroupSubscriptions.sourceGroupId, sourceGroupId),
          eq(businessGroupSubscriptions.businessId, businessId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async listEnabledSubscriptionsForSourceGroup(
    sourceGroupId: string,
  ): Promise<BusinessGroupSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(businessGroupSubscriptions)
      .where(
        and(
          eq(businessGroupSubscriptions.sourceGroupId, sourceGroupId),
          eq(businessGroupSubscriptions.enabled, true),
        ),
      )
      .orderBy(businessGroupSubscriptions.createdAt);
    return rows.map((r) => this.toSubscription(r));
  }

  async setBusinessGroupSubscriptionEnabled(
    id: string,
    enabled: boolean,
  ): Promise<BusinessGroupSubscriptionRecord | null> {
    await this.db
      .update(businessGroupSubscriptions)
      .set({ enabled })
      .where(eq(businessGroupSubscriptions.id, id));
    const rows = await this.db
      .select()
      .from(businessGroupSubscriptions)
      .where(eq(businessGroupSubscriptions.id, id))
      .limit(1);
    return rows[0] ? this.toSubscription(rows[0]) : null;
  }

  async listSubscriptionsForBusiness(
    businessId: string,
  ): Promise<BusinessGroupSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(businessGroupSubscriptions)
      .where(eq(businessGroupSubscriptions.businessId, businessId))
      .orderBy(businessGroupSubscriptions.createdAt);
    return rows.map((r) => this.toSubscription(r));
  }

  async getBusinessGroupSubscription(
    sourceGroupId: string,
    businessId: string,
  ): Promise<BusinessGroupSubscriptionRecord | null> {
    const rows = await this.db
      .select()
      .from(businessGroupSubscriptions)
      .where(
        and(
          eq(businessGroupSubscriptions.sourceGroupId, sourceGroupId),
          eq(businessGroupSubscriptions.businessId, businessId),
        ),
      )
      .limit(1);
    return rows[0] ? this.toSubscription(rows[0]) : null;
  }

  async countEnabledSubscribersForSourceGroup(sourceGroupId: string): Promise<number> {
    const rows = await this.db
      .select({ id: businessGroupSubscriptions.id })
      .from(businessGroupSubscriptions)
      .where(
        and(
          eq(businessGroupSubscriptions.sourceGroupId, sourceGroupId),
          eq(businessGroupSubscriptions.enabled, true),
        ),
      );
    return rows.length;
  }

  private toSubscription(
    row: typeof businessGroupSubscriptions.$inferSelect,
  ): BusinessGroupSubscriptionRecord {
    return {
      id: row.id,
      sourceGroupId: row.sourceGroupId,
      businessId: row.businessId,
      enabled: !!row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toBusinessMatch(row: typeof businessMatches.$inferSelect): BusinessMatchRecord {
    let reasons: MatchReason[] = [];
    if (row.reasons) {
      try {
        const parsed: unknown = JSON.parse(row.reasons);
        if (Array.isArray(parsed)) {
          reasons = parsed.filter(
            (r): r is MatchReason =>
              !!r &&
              typeof r === 'object' &&
              typeof (r as MatchReason).ruleType === 'string' &&
              typeof (r as MatchReason).ruleValue === 'string' &&
              typeof (r as MatchReason).matched === 'boolean',
          );
        }
      } catch {
        reasons = [];
      }
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessId: row.businessId,
      opportunityId: row.opportunityId,
      decision: row.decision as MatchDecision,
      reasons,
      matcherVersion: row.matcherVersion,
      matchedAt: row.matchedAt,
    };
  }

  // ── Property matches (SPRINT 016B) ─────────────────────────────────────────

  async createPropertyMatch(input: CreatePropertyMatchInput): Promise<PropertyMatchRecord> {
    await this.db.insert(propertyMatches).values({
      id: input.id,
      workspaceId: input.workspaceId,
      opportunityId: input.opportunityId,
      businessMatchId: input.businessMatchId,
      businessId: input.businessId,
      propertyId: input.propertyId,
      decision: input.decision,
      reasons: JSON.stringify(input.reasons),
      matcherVersion: input.matcherVersion,
      candidatesEvaluated: input.candidatesEvaluated,
    });
    const created = await this.getPropertyMatchById(input.id);
    if (!created) throw new Error('property match creation failed');
    return created;
  }

  async getPropertyMatchById(id: string): Promise<PropertyMatchRecord | null> {
    const rows = await this.db
      .select()
      .from(propertyMatches)
      .where(eq(propertyMatches.id, id))
      .limit(1);
    return rows[0] ? this.toPropertyMatch(rows[0]) : null;
  }

  async getPropertyMatchByBusinessMatch(
    businessMatchId: string,
  ): Promise<PropertyMatchRecord | null> {
    const rows = await this.db
      .select()
      .from(propertyMatches)
      .where(eq(propertyMatches.businessMatchId, businessMatchId))
      .limit(1);
    return rows[0] ? this.toPropertyMatch(rows[0]) : null;
  }

  async listPropertyMatchesByWorkspace(
    workspaceId: string,
    filter: PropertyMatchFilter = {},
  ): Promise<PropertyMatchRecord[]> {
    const conds = [eq(propertyMatches.workspaceId, workspaceId)];
    if (filter.opportunityId) conds.push(eq(propertyMatches.opportunityId, filter.opportunityId));
    if (filter.businessId) conds.push(eq(propertyMatches.businessId, filter.businessId));
    if (filter.businessMatchId)
      conds.push(eq(propertyMatches.businessMatchId, filter.businessMatchId));
    if (filter.propertyId) conds.push(eq(propertyMatches.propertyId, filter.propertyId));
    if (filter.decision) conds.push(eq(propertyMatches.decision, filter.decision));
    const rows = await this.db
      .select()
      .from(propertyMatches)
      .where(and(...conds))
      .orderBy(desc(propertyMatches.evaluatedAt))
      .limit(filter.limit ?? 500);
    return rows.map((r) => this.toPropertyMatch(r));
  }

  async getMatchingFunnelCounts(workspaceId: string): Promise<MatchingFunnelCounts> {
    const bmRows = await this.db
      .select({ decision: businessMatches.decision, n: sql<number>`count(*)` })
      .from(businessMatches)
      .where(eq(businessMatches.workspaceId, workspaceId))
      .groupBy(businessMatches.decision);
    const pmRows = await this.db
      .select({
        decision: propertyMatches.decision,
        n: sql<number>`count(*)`,
        evaluated: sql<number>`coalesce(sum(${propertyMatches.candidatesEvaluated}), 0)`,
      })
      .from(propertyMatches)
      .where(eq(propertyMatches.workspaceId, workspaceId))
      .groupBy(propertyMatches.decision);
    const distinctRows = await this.db
      .select({ n: sql<number>`count(distinct ${propertyMatches.propertyId})` })
      .from(propertyMatches)
      .where(
        and(eq(propertyMatches.workspaceId, workspaceId), eq(propertyMatches.decision, 'MATCH')),
      );

    const businessMatch = { MATCH: 0, NO_MATCH: 0 };
    for (const r of bmRows) {
      if (r.decision === 'MATCH') businessMatch.MATCH = Number(r.n);
      else if (r.decision === 'NO_MATCH') businessMatch.NO_MATCH = Number(r.n);
    }
    const propertyMatch = { MATCH: 0, NEEDS_CONFIRMATION: 0, NO_MATCH: 0 };
    let candidatesEvaluated = 0;
    for (const r of pmRows) {
      candidatesEvaluated += Number(r.evaluated);
      if (r.decision === 'MATCH') propertyMatch.MATCH = Number(r.n);
      else if (r.decision === 'NEEDS_CONFIRMATION') propertyMatch.NEEDS_CONFIRMATION = Number(r.n);
      else if (r.decision === 'NO_MATCH') propertyMatch.NO_MATCH = Number(r.n);
    }

    // Top NO_MATCH reasons — parse the JSON reasons of NO_MATCH rows and tally.
    const noMatchRows = await this.db
      .select({ reasons: propertyMatches.reasons })
      .from(propertyMatches)
      .where(
        and(eq(propertyMatches.workspaceId, workspaceId), eq(propertyMatches.decision, 'NO_MATCH')),
      )
      .limit(1000);
    const reasonTally = new Map<string, number>();
    for (const row of noMatchRows) {
      for (const reason of this.parsePropertyReasons(row.reasons).reasons) {
        const code = (reason.split(':')[0] ?? reason).trim();
        reasonTally.set(code, (reasonTally.get(code) ?? 0) + 1);
      }
    }
    const topNoMatchReasons = Array.from(reasonTally.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 10);

    return {
      businessMatch,
      propertyMatch,
      candidatesEvaluated,
      propertiesReceivingMatches: Number(distinctRows[0]?.n ?? 0),
      // A Business MATCH funnels to exactly one property_match; NO_MATCH ones are the gap.
      businessMatchWithNoPropertyMatch: propertyMatch.NO_MATCH,
      topNoMatchReasons,
    };
  }

  private parsePropertyReasons(raw: string | null): PropertyMatchReasons {
    const empty: PropertyMatchReasons = { reasons: [], rejected: [], requirement: {} };
    if (!raw) return empty;
    try {
      const parsed = JSON.parse(raw) as Partial<PropertyMatchReasons>;
      const reasons = Array.isArray(parsed.reasons)
        ? parsed.reasons.filter((r): r is string => typeof r === 'string')
        : [];
      const rejected = Array.isArray(parsed.rejected)
        ? (parsed.rejected.filter(
            (r) =>
              !!r &&
              typeof r === 'object' &&
              typeof (r as PropertyMatchRejection).propertyId === 'string',
          ) as PropertyMatchRejection[])
        : [];
      const requirement =
        parsed.requirement && typeof parsed.requirement === 'object' ? parsed.requirement : {};
      return { reasons, rejected, requirement: requirement as Record<string, unknown> };
    } catch {
      return empty;
    }
  }

  private toPropertyMatch(row: typeof propertyMatches.$inferSelect): PropertyMatchRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      opportunityId: row.opportunityId,
      businessMatchId: row.businessMatchId,
      businessId: row.businessId,
      propertyId: row.propertyId ?? null,
      decision: row.decision as PropertyMatchDecision,
      reasons: this.parsePropertyReasons(row.reasons),
      matcherVersion: row.matcherVersion,
      candidatesEvaluated: row.candidatesEvaluated,
      evaluatedAt: row.evaluatedAt,
      createdAt: row.createdAt,
    };
  }

  // ── AI drafts (SPRINT 009) ─────────────────────────────────────────────────

  async createAiDraft(input: CreateAiDraftInput): Promise<AiDraftRecord> {
    await this.db.insert(aiDrafts).values({
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
      inputSnapshot: input.inputSnapshot ? JSON.stringify(input.inputSnapshot) : null,
      policyResult: input.policyResult ? JSON.stringify(input.policyResult) : null,
      createdBy: input.createdBy,
    });
    const created = await this.getAiDraftById(input.id);
    if (!created) throw new Error('ai draft creation failed');
    return created;
  }

  async getAiDraftById(id: string): Promise<AiDraftRecord | null> {
    const rows = await this.db.select().from(aiDrafts).where(eq(aiDrafts.id, id)).limit(1);
    return rows[0] ? this.toAiDraft(rows[0]) : null;
  }

  async listAiDraftsByWorkspace(
    workspaceId: string,
    filter: AiDraftFilter = {},
  ): Promise<AiDraftRecord[]> {
    const conds = [eq(aiDrafts.workspaceId, workspaceId)];
    if (filter.businessMatchId) conds.push(eq(aiDrafts.businessMatchId, filter.businessMatchId));
    if (filter.status) conds.push(eq(aiDrafts.status, filter.status));
    const rows = await this.db
      .select()
      .from(aiDrafts)
      .where(and(...conds))
      .orderBy(desc(aiDrafts.createdAt), desc(aiDrafts.version))
      .limit(filter.limit ?? 500);
    return rows.map((r) => this.toAiDraft(r));
  }

  async listAiDraftsForMatch(businessMatchId: string): Promise<AiDraftRecord[]> {
    const rows = await this.db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.businessMatchId, businessMatchId))
      .orderBy(aiDrafts.version);
    return rows.map((r) => this.toAiDraft(r));
  }

  async getLatestAiDraftForMatch(businessMatchId: string): Promise<AiDraftRecord | null> {
    const rows = await this.db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.businessMatchId, businessMatchId))
      .orderBy(desc(aiDrafts.version))
      .limit(1);
    return rows[0] ? this.toAiDraft(rows[0]) : null;
  }

  async updateAiDraftStatus(id: string, status: AiDraftStatus): Promise<AiDraftRecord | null> {
    await this.db.update(aiDrafts).set({ status }).where(eq(aiDrafts.id, id));
    return this.getAiDraftById(id);
  }

  async createAiDraftEvent(input: CreateAiDraftEventInput): Promise<AiDraftEventRecord> {
    await this.db.insert(aiDraftEvents).values({
      id: input.id,
      aiDraftId: input.aiDraftId,
      event: input.event,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return {
      id: input.id,
      aiDraftId: input.aiDraftId,
      event: input.event,
      payload: input.payload,
      createdAt: new Date(),
    };
  }

  async listAiDraftEvents(aiDraftId: string): Promise<AiDraftEventRecord[]> {
    const rows = await this.db
      .select()
      .from(aiDraftEvents)
      .where(eq(aiDraftEvents.aiDraftId, aiDraftId))
      .orderBy(aiDraftEvents.createdAt);
    return rows.map((r) => this.toAiDraftEvent(r));
  }

  private parseJsonObject(value: string | null): Record<string, unknown> | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private toAiDraft(row: typeof aiDrafts.$inferSelect): AiDraftRecord {
    const policyRaw = this.parseJsonObject(row.policyResult);
    let policyResult: DraftPolicyResult | null = null;
    if (policyRaw && typeof policyRaw.decision === 'string' && Array.isArray(policyRaw.reasons)) {
      policyResult = {
        decision: policyRaw.decision as DraftPolicyResult['decision'],
        reasons: (policyRaw.reasons as unknown[]).filter(
          (r): r is { code: string; detail: string } =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as { code: unknown }).code === 'string' &&
            typeof (r as { detail: unknown }).detail === 'string',
        ),
      };
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessMatchId: row.businessMatchId,
      opportunityId: row.opportunityId,
      businessId: row.businessId,
      version: row.version,
      status: row.status as AiDraftStatus,
      content: row.content,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      inputSnapshot: this.parseJsonObject(row.inputSnapshot),
      policyResult,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAiDraftEvent(row: typeof aiDraftEvents.$inferSelect): AiDraftEventRecord {
    return {
      id: row.id,
      aiDraftId: row.aiDraftId,
      event: row.event,
      payload: this.parseJsonObject(row.payload),
      createdAt: row.createdAt,
    };
  }

  // ── Review tasks (SPRINT 010) ──────────────────────────────────────────────

  async createReviewTask(input: CreateReviewTaskInput): Promise<ReviewTaskRecord> {
    await this.db.insert(reviewTasks).values({
      id: input.id,
      workspaceId: input.workspaceId,
      businessMatchId: input.businessMatchId,
      draftId: input.draftId,
      status: 'PENDING',
      assignedTo: input.assignedTo,
      businessId: input.businessId ?? null,
      propertyId: input.propertyId ?? null,
      propertyMatchId: input.propertyMatchId ?? null,
      contextHash: input.contextHash ?? null,
    });
    const created = await this.getReviewTaskById(input.id);
    if (!created) throw new Error('review task creation failed');
    return created;
  }

  async getReviewTaskById(id: string): Promise<ReviewTaskRecord | null> {
    const rows = await this.db.select().from(reviewTasks).where(eq(reviewTasks.id, id)).limit(1);
    return rows[0] ? this.toReviewTask(rows[0]) : null;
  }

  async getReviewTaskByDraft(draftId: string): Promise<ReviewTaskRecord | null> {
    const rows = await this.db
      .select()
      .from(reviewTasks)
      .where(eq(reviewTasks.draftId, draftId))
      .limit(1);
    return rows[0] ? this.toReviewTask(rows[0]) : null;
  }

  async listReviewTasksByWorkspace(
    workspaceId: string,
    filter: ReviewTaskFilter = {},
  ): Promise<ReviewTaskRecord[]> {
    const conds = [eq(reviewTasks.workspaceId, workspaceId)];
    if (filter.status) conds.push(eq(reviewTasks.status, filter.status));
    if (filter.businessMatchId) conds.push(eq(reviewTasks.businessMatchId, filter.businessMatchId));
    const rows = await this.db
      .select()
      .from(reviewTasks)
      .where(and(...conds))
      .orderBy(desc(reviewTasks.createdAt))
      .limit(filter.limit ?? 500);
    return rows.map((r) => this.toReviewTask(r));
  }

  async updateReviewTask(
    id: string,
    input: UpdateReviewTaskInput,
  ): Promise<ReviewTaskRecord | null> {
    const set: Partial<typeof reviewTasks.$inferInsert> = {};
    if (input.status !== undefined) set.status = input.status;
    if (input.assignedTo !== undefined) set.assignedTo = input.assignedTo;
    if (input.editedContent !== undefined) set.editedContent = input.editedContent;
    if (input.editor !== undefined) set.editor = input.editor;
    if (input.editedAt !== undefined) set.editedAt = input.editedAt;
    if (input.decidedBy !== undefined) set.decidedBy = input.decidedBy;
    if (input.decidedAt !== undefined) set.decidedAt = input.decidedAt;
    if (input.decisionReason !== undefined) set.decisionReason = input.decisionReason;
    if (Object.keys(set).length > 0) {
      await this.db.update(reviewTasks).set(set).where(eq(reviewTasks.id, id));
    }
    return this.getReviewTaskById(id);
  }

  async createReviewEvent(input: CreateReviewEventInput): Promise<ReviewEventRecord> {
    await this.db.insert(reviewEvents).values({
      id: input.id,
      reviewTaskId: input.reviewTaskId,
      event: input.event,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return {
      id: input.id,
      reviewTaskId: input.reviewTaskId,
      event: input.event,
      payload: input.payload,
      createdAt: new Date(),
    };
  }

  async listReviewEvents(reviewTaskId: string): Promise<ReviewEventRecord[]> {
    const rows = await this.db
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.reviewTaskId, reviewTaskId))
      .orderBy(reviewEvents.createdAt);
    return rows.map((r) => this.toReviewEvent(r));
  }

  private toReviewTask(row: typeof reviewTasks.$inferSelect): ReviewTaskRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessMatchId: row.businessMatchId,
      draftId: row.draftId,
      status: row.status as ReviewStatus,
      assignedTo: row.assignedTo,
      editedContent: row.editedContent,
      editor: row.editor,
      editedAt: row.editedAt,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt,
      decisionReason: row.decisionReason,
      businessId: row.businessId ?? null,
      propertyId: row.propertyId ?? null,
      propertyMatchId: row.propertyMatchId ?? null,
      contextHash: row.contextHash ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toReviewEvent(row: typeof reviewEvents.$inferSelect): ReviewEventRecord {
    return {
      id: row.id,
      reviewTaskId: row.reviewTaskId,
      event: row.event,
      payload: this.parseJsonObject(row.payload),
      createdAt: row.createdAt,
    };
  }

  // ── Action jobs (SPRINT 011) ───────────────────────────────────────────────

  async createActionJob(input: CreateActionJobInput): Promise<ActionJobRecord> {
    await this.db.insert(actionJobs).values({
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
      maxAttempts: input.maxAttempts,
      blockedAt: input.blockedAt,
      targetPostKey: input.targetPostKey,
      activeDedupKey: input.activeDedupKey,
    });
    const created = await this.getActionJobById(input.id);
    if (!created) throw new Error('action job creation failed');
    return created;
  }

  async getActionJobById(id: string): Promise<ActionJobRecord | null> {
    const rows = await this.db.select().from(actionJobs).where(eq(actionJobs.id, id)).limit(1);
    return rows[0] ? this.toActionJob(rows[0]) : null;
  }

  async listActionJobsByWorkspace(
    workspaceId: string,
    filter: ActionJobFilter = {},
  ): Promise<ActionJobRecord[]> {
    const conds = [eq(actionJobs.workspaceId, workspaceId)];
    if (filter.status) conds.push(eq(actionJobs.status, filter.status));
    if (filter.reviewTaskId) conds.push(eq(actionJobs.reviewTaskId, filter.reviewTaskId));
    if (filter.actionType) conds.push(eq(actionJobs.actionType, filter.actionType));
    const rows = await this.db
      .select()
      .from(actionJobs)
      .where(and(...conds))
      .orderBy(desc(actionJobs.createdAt))
      .limit(filter.limit ?? 500);
    return rows.map((r) => this.toActionJob(r));
  }

  async listActiveActionJobsForReview(
    reviewTaskId: string,
    actionType: ActionType,
  ): Promise<ActionJobRecord[]> {
    const rows = await this.db
      .select()
      .from(actionJobs)
      .where(
        and(
          eq(actionJobs.reviewTaskId, reviewTaskId),
          eq(actionJobs.actionType, actionType),
          inArray(actionJobs.status, ACTIVE_ACTION_STATUSES),
        ),
      );
    return rows.map((r) => this.toActionJob(r));
  }

  async updateActionJob(id: string, input: UpdateActionJobInput): Promise<ActionJobRecord | null> {
    const set: Partial<typeof actionJobs.$inferInsert> = {};
    if (input.status !== undefined) set.status = input.status;
    if (input.attemptCount !== undefined) set.attemptCount = input.attemptCount;
    if (input.scheduledAt !== undefined) set.scheduledAt = input.scheduledAt;
    if (input.startedAt !== undefined) set.startedAt = input.startedAt;
    if (input.completedAt !== undefined) set.completedAt = input.completedAt;
    if (input.cancelledAt !== undefined) set.cancelledAt = input.cancelledAt;
    if (input.blockedAt !== undefined) set.blockedAt = input.blockedAt;
    if (input.lastErrorCode !== undefined) set.lastErrorCode = input.lastErrorCode;
    if (input.lastErrorMessage !== undefined) set.lastErrorMessage = input.lastErrorMessage;
    if (input.activeDedupKey !== undefined) set.activeDedupKey = input.activeDedupKey;
    if (input.successIdempotencyKey !== undefined) {
      set.successIdempotencyKey = input.successIdempotencyKey;
    }
    if (input.executionState !== undefined) set.executionState = input.executionState;
    if (input.ambiguousAt !== undefined) set.ambiguousAt = input.ambiguousAt;
    if (input.verificationRequired !== undefined) {
      set.verificationRequired = input.verificationRequired;
    }
    if (input.lastExecutionSessionId !== undefined) {
      set.lastExecutionSessionId = input.lastExecutionSessionId;
    }
    if (Object.keys(set).length > 0) {
      await this.db.update(actionJobs).set(set).where(eq(actionJobs.id, id));
    }
    return this.getActionJobById(id);
  }

  async createActionEvent(input: CreateActionEventInput): Promise<ActionEventRecord> {
    await this.db.insert(actionEvents).values({
      id: input.id,
      actionJobId: input.actionJobId,
      event: input.event,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    });
    return {
      id: input.id,
      actionJobId: input.actionJobId,
      event: input.event,
      payload: input.payload,
      createdAt: new Date(),
    };
  }

  async listActionEvents(actionJobId: string): Promise<ActionEventRecord[]> {
    const rows = await this.db
      .select()
      .from(actionEvents)
      .where(eq(actionEvents.actionJobId, actionJobId))
      .orderBy(actionEvents.createdAt);
    return rows.map((r) => this.toActionEvent(r));
  }

  private toActionJob(row: typeof actionJobs.$inferSelect): ActionJobRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      reviewTaskId: row.reviewTaskId,
      aiDraftId: row.aiDraftId,
      businessMatchId: row.businessMatchId,
      actionType: row.actionType as ActionType,
      status: row.status as ActionStatus,
      targetPlatform: row.targetPlatform as TargetPlatform,
      targetUrl: row.targetUrl,
      approvedContent: row.approvedContent,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      scheduledAt: row.scheduledAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      blockedAt: row.blockedAt,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      targetPostKey: row.targetPostKey ?? '',
      activeDedupKey: row.activeDedupKey,
      successIdempotencyKey: row.successIdempotencyKey,
      executionState: row.executionState,
      ambiguousAt: row.ambiguousAt,
      verificationRequired: row.verificationRequired,
      lastExecutionSessionId: row.lastExecutionSessionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toActionEvent(row: typeof actionEvents.$inferSelect): ActionEventRecord {
    return {
      id: row.id,
      actionJobId: row.actionJobId,
      event: row.event,
      payload: this.parseJsonObject(row.payload),
      createdAt: row.createdAt,
    };
  }

  // ── Execution sessions / evidence / idempotency (SPRINT 012) ───────────────

  async createExecutionSession(
    input: CreateExecutionSessionInput,
  ): Promise<ExecutionSessionRecord> {
    // activeKey = actionJobId while active → DB-unique enforces one active session.
    await this.db.insert(actionExecutionSessions).values({
      id: input.id,
      workspaceId: input.workspaceId,
      actionJobId: input.actionJobId,
      attemptNumber: input.attemptNumber,
      status: 'created',
      adapter: input.adapter,
      browserProfileKey: input.browserProfileKey,
      activeKey: input.actionJobId,
    });
    const created = await this.getExecutionSessionById(input.id);
    if (!created) throw new Error('execution session creation failed');
    return created;
  }

  async getExecutionSessionById(id: string): Promise<ExecutionSessionRecord | null> {
    const rows = await this.db
      .select()
      .from(actionExecutionSessions)
      .where(eq(actionExecutionSessions.id, id))
      .limit(1);
    return rows[0] ? this.toExecutionSession(rows[0]) : null;
  }

  async listExecutionSessionsForJob(actionJobId: string): Promise<ExecutionSessionRecord[]> {
    const rows = await this.db
      .select()
      .from(actionExecutionSessions)
      .where(eq(actionExecutionSessions.actionJobId, actionJobId))
      .orderBy(actionExecutionSessions.attemptNumber);
    return rows.map((r) => this.toExecutionSession(r));
  }

  async getActiveExecutionSessionForJob(
    actionJobId: string,
  ): Promise<ExecutionSessionRecord | null> {
    const rows = await this.db
      .select()
      .from(actionExecutionSessions)
      .where(eq(actionExecutionSessions.activeKey, actionJobId))
      .limit(1);
    return rows[0] ? this.toExecutionSession(rows[0]) : null;
  }

  async updateExecutionSession(
    id: string,
    input: UpdateExecutionSessionInput,
  ): Promise<ExecutionSessionRecord | null> {
    const set: Partial<typeof actionExecutionSessions.$inferInsert> = {};
    if (input.status !== undefined) {
      set.status = input.status;
      // Release the active slot when the session becomes terminal.
      if (!ACTIVE_EXECUTION_STATUSES.includes(input.status)) set.activeKey = null;
    }
    if (input.startedAt !== undefined) set.startedAt = input.startedAt;
    if (input.preflightVerifiedAt !== undefined)
      set.preflightVerifiedAt = input.preflightVerifiedAt;
    if (input.submitStartedAt !== undefined) set.submitStartedAt = input.submitStartedAt;
    if (input.submittedAt !== undefined) set.submittedAt = input.submittedAt;
    if (input.verificationStartedAt !== undefined) {
      set.verificationStartedAt = input.verificationStartedAt;
    }
    if (input.verifiedAt !== undefined) set.verifiedAt = input.verifiedAt;
    if (input.ambiguousAt !== undefined) set.ambiguousAt = input.ambiguousAt;
    if (input.failedAt !== undefined) set.failedAt = input.failedAt;
    if (input.cancelledAt !== undefined) set.cancelledAt = input.cancelledAt;
    if (input.finishedAt !== undefined) set.finishedAt = input.finishedAt;
    if (input.errorCode !== undefined) set.errorCode = input.errorCode;
    if (input.errorMessage !== undefined) set.errorMessage = input.errorMessage;
    if (input.recoveryState !== undefined) set.recoveryState = input.recoveryState;
    if (input.activeKey !== undefined) set.activeKey = input.activeKey;
    if (Object.keys(set).length > 0) {
      await this.db
        .update(actionExecutionSessions)
        .set(set)
        .where(eq(actionExecutionSessions.id, id));
    }
    return this.getExecutionSessionById(id);
  }

  async createExecutionEvidence(
    input: CreateExecutionEvidenceInput,
  ): Promise<ExecutionEvidenceRecord> {
    await this.db.insert(actionExecutionEvidence).values({
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
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const rows = await this.db
      .select()
      .from(actionExecutionEvidence)
      .where(eq(actionExecutionEvidence.id, input.id))
      .limit(1);
    if (!rows[0]) throw new Error('execution evidence creation failed');
    return this.toExecutionEvidence(rows[0]);
  }

  async listExecutionEvidenceForSession(sessionId: string): Promise<ExecutionEvidenceRecord[]> {
    const rows = await this.db
      .select()
      .from(actionExecutionEvidence)
      .where(eq(actionExecutionEvidence.executionSessionId, sessionId))
      .orderBy(actionExecutionEvidence.createdAt);
    return rows.map((r) => this.toExecutionEvidence(r));
  }

  async createIdempotencyRecord(input: CreateIdempotencyRecordInput): Promise<IdempotencyRecord> {
    await this.db.insert(actionIdempotencyRecords).values({
      id: input.id,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      targetPostKey: input.targetPostKey,
      actionType: input.actionType,
      actionJobId: input.actionJobId,
      executionSessionId: input.executionSessionId,
      status: 'reserved',
      idemKey: input.idemKey,
    });
    const rows = await this.db
      .select()
      .from(actionIdempotencyRecords)
      .where(eq(actionIdempotencyRecords.id, input.id))
      .limit(1);
    if (!rows[0]) throw new Error('idempotency record creation failed');
    return this.toIdempotencyRecord(rows[0]);
  }

  async getIdempotencyRecord(
    workspaceId: string,
    businessId: string,
    targetPostKey: string,
    actionType: ActionType,
  ): Promise<IdempotencyRecord | null> {
    // A LIVE reservation is one whose idemKey is still set (not released).
    const liveKey = `${workspaceId}:${businessId}:${targetPostKey}:${actionType}`;
    const rows = await this.db
      .select()
      .from(actionIdempotencyRecords)
      .where(eq(actionIdempotencyRecords.idemKey, liveKey))
      .limit(1);
    return rows[0] ? this.toIdempotencyRecord(rows[0]) : null;
  }

  async updateIdempotencyRecord(
    id: string,
    input: UpdateIdempotencyRecordInput,
  ): Promise<IdempotencyRecord | null> {
    const set: Partial<typeof actionIdempotencyRecords.$inferInsert> = {};
    if (input.status !== undefined) set.status = input.status;
    if (input.facebookCommentId !== undefined) set.facebookCommentId = input.facebookCommentId;
    if (input.executionSessionId !== undefined) set.executionSessionId = input.executionSessionId;
    if (input.idemKey !== undefined) set.idemKey = input.idemKey;
    if (Object.keys(set).length > 0) {
      await this.db
        .update(actionIdempotencyRecords)
        .set(set)
        .where(eq(actionIdempotencyRecords.id, id));
    }
    const rows = await this.db
      .select()
      .from(actionIdempotencyRecords)
      .where(eq(actionIdempotencyRecords.id, id))
      .limit(1);
    return rows[0] ? this.toIdempotencyRecord(rows[0]) : null;
  }

  private toExecutionSession(
    row: typeof actionExecutionSessions.$inferSelect,
  ): ExecutionSessionRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      actionJobId: row.actionJobId,
      attemptNumber: row.attemptNumber,
      status: row.status as ExecutionSessionStatus,
      adapter: row.adapter as ExecutionAdapterName,
      browserProfileKey: row.browserProfileKey,
      startedAt: row.startedAt,
      preflightVerifiedAt: row.preflightVerifiedAt,
      submitStartedAt: row.submitStartedAt,
      submittedAt: row.submittedAt,
      verificationStartedAt: row.verificationStartedAt,
      verifiedAt: row.verifiedAt,
      ambiguousAt: row.ambiguousAt,
      failedAt: row.failedAt,
      cancelledAt: row.cancelledAt,
      finishedAt: row.finishedAt,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      recoveryState: row.recoveryState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toExecutionEvidence(
    row: typeof actionExecutionEvidence.$inferSelect,
  ): ExecutionEvidenceRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      actionJobId: row.actionJobId,
      executionSessionId: row.executionSessionId,
      evidenceType: row.evidenceType as EvidenceType,
      storageKey: row.storageKey,
      evidenceHash: row.evidenceHash,
      facebookCommentId: row.facebookCommentId,
      observedContent: row.observedContent,
      observedAuthor: row.observedAuthor,
      observedPostUrl: row.observedPostUrl,
      observedAt: row.observedAt,
      metadata: this.parseJsonObject(row.metadata),
      createdAt: row.createdAt,
    };
  }

  private toIdempotencyRecord(
    row: typeof actionIdempotencyRecords.$inferSelect,
  ): IdempotencyRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessId: row.businessId,
      targetPostKey: row.targetPostKey,
      actionType: row.actionType as ActionType,
      actionJobId: row.actionJobId,
      executionSessionId: row.executionSessionId,
      status: row.status as IdempotencyStatus,
      facebookCommentId: row.facebookCommentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getOperationalCounts(input: OperationalCountsInput): Promise<OperationalCounts> {
    const actionCutoff = new Date(input.now.getTime() - input.actionProcessingStaleMs);
    const collectorCutoff = new Date(input.now.getTime() - input.collectorRunningStaleMs);

    const jobRows = await this.db
      .select({ status: actionJobs.status, n: sql<number>`count(*)` })
      .from(actionJobs)
      .groupBy(actionJobs.status);
    const aj = {
      total: 0,
      queued: 0,
      blocked: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const r of jobRows) {
      const n = Number(r.n);
      aj.total += n;
      if (r.status in aj) (aj as Record<string, number>)[r.status] = n;
    }

    const sessRows = await this.db
      .select({ status: actionExecutionSessions.status, n: sql<number>`count(*)` })
      .from(actionExecutionSessions)
      .groupBy(actionExecutionSessions.status);
    const es = { total: 0, active: 0, ambiguous: 0, failed: 0, verified: 0 };
    for (const r of sessRows) {
      const n = Number(r.n);
      es.total += n;
      if (
        ACTIVE_EXECUTION_STATUSES.includes(r.status as (typeof ACTIVE_EXECUTION_STATUSES)[number])
      ) {
        es.active += n;
      }
      if (r.status === 'ambiguous') es.ambiguous += n;
      if (r.status === 'failed') es.failed += n;
      if (r.status === 'verified') es.verified += n;
    }

    const [stuckJobs] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(actionJobs)
      .where(and(eq(actionJobs.status, 'processing'), lt(actionJobs.startedAt, actionCutoff)));
    const [stuckRuns] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(collectorRuns)
      .where(
        and(eq(collectorRuns.status, 'running'), lt(collectorRuns.startedAt, collectorCutoff)),
      );

    return {
      actionJobs: aj,
      executionSessions: es,
      stuckActionJobs: Number(stuckJobs?.n ?? 0),
      stuckCollectorRuns: Number(stuckRuns?.n ?? 0),
    };
  }
}
