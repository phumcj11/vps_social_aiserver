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
}
