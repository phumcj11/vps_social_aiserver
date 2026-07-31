import { eq, and, desc } from 'drizzle-orm';
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
} from './types';

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
}
