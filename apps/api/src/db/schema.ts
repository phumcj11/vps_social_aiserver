import {
  mysqlTable,
  varchar,
  text,
  int,
  datetime,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * KMKT Social AI — database schema (SPRINT 002: Authentication & Workspace).
 *
 * Only the three tables required for this sprint are defined: users, sessions,
 * and workspaces. NO Business tables exist yet (docs/06-domain-model.md entities
 * beyond these arrive in later sprints).
 *
 * Conventions:
 *   - Primary keys are application-generated UUIDs (varchar(36)) — no sequential
 *     integers exposed.
 *   - `status` fields are soft state; rows are never deleted in the MVP.
 *   - Every table carries safe timestamps.
 *   - Session tokens are NEVER stored raw — only their SHA-256 hash.
 */

export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    // SHA-256 hex of the opaque session token (64 chars). Raw token lives only
    // in the user's HttpOnly cookie, never in the database.
    sessionTokenHash: varchar('session_token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastSeenAt: datetime('last_seen_at'),
    revokedAt: datetime('revoked_at'),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('sessions_token_hash_unique').on(table.sessionTokenHash),
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
  }),
);

export const workspaces = mysqlTable(
  'workspaces',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    // Unique → enforces "one workspace per user" at the database level.
    ownerUserId: varchar('owner_user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    ownerUnique: uniqueIndex('workspaces_owner_unique').on(table.ownerUserId),
    slugUnique: uniqueIndex('workspaces_slug_unique').on(table.slug),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;

/**
 * ── SPRINT 003: Business Foundation ──────────────────────────────────────────
 *
 * The Business is the core domain concept (docs/06-domain-model.md). A Workspace
 * owns many Businesses; each Business owns one Profile and many Knowledge items
 * and Matching Rules. These are STRUCTURED BUSINESS DATA — not AI, not Facebook.
 * Matching Rules are deterministic; AI matching arrives in a later sprint.
 *
 * Businesses are never deleted (soft `status` only). Knowledge and Matching
 * Rules may be deleted.
 */

export const businesses = mysqlTable(
  'businesses',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('businesses_slug_unique').on(table.slug),
    // Business name is unique WITHIN a workspace (not globally).
    workspaceNameUnique: uniqueIndex('businesses_workspace_name_unique').on(
      table.workspaceId,
      table.name,
    ),
    workspaceIdx: index('businesses_workspace_idx').on(table.workspaceId),
  }),
);

export const businessProfiles = mysqlTable(
  'business_profiles',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    // One profile per business.
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    category: varchar('category', { length: 120 }),
    description: text('description'),
    // JSON-encoded string arrays, (de)serialised in the store layer.
    sellingPoints: text('selling_points'),
    serviceArea: text('service_area'),
    contactInformation: text('contact_information'),
    responseTone: varchar('response_tone', { length: 120 }),
    prohibitedClaims: text('prohibited_claims'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessUnique: uniqueIndex('business_profiles_business_unique').on(table.businessId),
  }),
);

export const businessKnowledge = mysqlTable(
  'business_knowledge',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessIdx: index('business_knowledge_business_idx').on(table.businessId),
  }),
);

export const businessMatchingRules = mysqlTable(
  'business_matching_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    ruleType: varchar('rule_type', { length: 40 }).notNull(),
    ruleValue: varchar('rule_value', { length: 255 }).notNull(),
    priority: int('priority').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessIdx: index('business_matching_rules_business_idx').on(table.businessId),
  }),
);

export type BusinessRow = typeof businesses.$inferSelect;
export type BusinessProfileRow = typeof businessProfiles.$inferSelect;
export type BusinessKnowledgeRow = typeof businessKnowledge.$inferSelect;
export type BusinessMatchingRuleRow = typeof businessMatchingRules.$inferSelect;

/**
 * ── SPRINT 004: Facebook Connection Foundation ───────────────────────────────
 *
 * Stores ONLY safe connection metadata for a workspace's single Facebook
 * account (docs/26-facebook-connection.md, ADR-005: one account per workspace).
 *
 * SECURITY — this table deliberately contains NO password, NO cookies, and NO
 * raw session token. The browser session lives only in the on-disk persistent
 * profile (docs/28-browser-profile-security.md); this row holds only its state
 * and a server-generated RELATIVE profile path (never accepted from the client).
 */
export const facebookAccounts = mysqlTable(
  'facebook_accounts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    // Unique → at most one Facebook account per workspace (MVP, ADR-005).
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    platform: varchar('platform', { length: 20 }).notNull().default('facebook'),
    displayName: varchar('display_name', { length: 255 }),
    facebookUserId: varchar('facebook_user_id', { length: 64 }),
    // active | disconnected | blocked
    status: varchar('status', { length: 20 }).notNull().default('active'),
    // not_connected | connecting | connected | reconnect_required |
    // checkpoint_required | validation_failed | disconnected
    connectionState: varchar('connection_state', { length: 30 }).notNull().default('not_connected'),
    // Server-generated RELATIVE path (e.g. "<workspaceId>/facebook"). Never
    // absolute, never client-supplied, never returned to the frontend.
    profilePath: varchar('profile_path', { length: 255 }).notNull(),
    connectedAt: datetime('connected_at'),
    lastValidatedAt: datetime('last_validated_at'),
    sessionExpiresAt: datetime('session_expires_at'),
    disconnectedAt: datetime('disconnected_at'),
    lastErrorCode: varchar('last_error_code', { length: 40 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    workspaceUnique: uniqueIndex('facebook_accounts_workspace_unique').on(table.workspaceId),
  }),
);

/**
 * Minimal append-only audit log (introduced in SPRINT 004). Records meaningful
 * actions with SAFE payloads only — never passwords, cookies, tokens, or
 * absolute profile paths.
 */
export const auditEvents = mysqlTable(
  'audit_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 }),
    userId: varchar('user_id', { length: 36 }),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    // JSON-encoded safe metadata (validated by the audit service to exclude secrets).
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('audit_events_workspace_idx').on(table.workspaceId),
    typeIdx: index('audit_events_type_idx').on(table.eventType),
  }),
);

export type FacebookAccountRow = typeof facebookAccounts.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;

/**
 * ── SPRINT 005: Facebook Groups Foundation ───────────────────────────────────
 *
 * A Facebook Group belongs to exactly one workspace and may be assigned to many
 * Businesses in that workspace (ADR-008). NO post/opportunity tables exist yet —
 * this sprint is group management + business assignment + access validation only.
 * Validation is connection-only (never reads posts, never scrolls, never writes).
 */
export const facebookGroups = mysqlTable(
  'facebook_groups',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    // Facebook's own group identifier (numeric or slug), when safely known.
    facebookGroupId: varchar('facebook_group_id', { length: 100 }),
    name: varchar('name', { length: 255 }),
    // Canonicalised URL (https://www.facebook.com/groups/<token>).
    canonicalUrl: varchar('canonical_url', { length: 500 }).notNull(),
    // The exact URL the user submitted (kept for reference/audit).
    originalUrl: varchar('original_url', { length: 1000 }).notNull(),
    // active | disabled | archived
    status: varchar('status', { length: 20 }).notNull().default('active'),
    // unknown | validating | accessible | inaccessible | login_required |
    // checkpoint_required | not_found | validation_failed
    accessState: varchar('access_state', { length: 30 }).notNull().default('unknown'),
    lastValidatedAt: datetime('last_validated_at'),
    lastErrorCode: varchar('last_error_code', { length: 40 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    // A given canonical URL is unique within a workspace (dedup), but the same
    // URL may exist in different workspaces.
    workspaceUrlUnique: uniqueIndex('facebook_groups_workspace_url_unique').on(
      table.workspaceId,
      table.canonicalUrl,
    ),
    // Unique per workspace when the platform id is known. MySQL treats NULLs as
    // distinct, so groups without a known id do not collide.
    workspaceFbIdUnique: uniqueIndex('facebook_groups_workspace_fbid_unique').on(
      table.workspaceId,
      table.facebookGroupId,
    ),
    workspaceIdx: index('facebook_groups_workspace_idx').on(table.workspaceId),
  }),
);

/**
 * Assignment of a Facebook Group to a Business (many-to-many within a workspace,
 * ADR-008). `workspaceId` is carried to make ownership checks explicit and to
 * keep the assignment inside a single workspace.
 */
export const businessFacebookGroups = mysqlTable(
  'business_facebook_groups',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    // References the internal facebook_groups.id (stable), not the platform id.
    facebookGroupId: varchar('facebook_group_id', { length: 36 })
      .notNull()
      .references(() => facebookGroups.id),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    // A business is assigned a given group at most once.
    businessGroupUnique: uniqueIndex('business_facebook_groups_unique').on(
      table.businessId,
      table.facebookGroupId,
    ),
    groupIdx: index('business_facebook_groups_group_idx').on(table.facebookGroupId),
    businessIdx: index('business_facebook_groups_business_idx').on(table.businessId),
  }),
);

export type FacebookGroupRow = typeof facebookGroups.$inferSelect;
export type BusinessFacebookGroupRow = typeof businessFacebookGroups.$inferSelect;

/**
 * ── SPRINT 006: Collector Engine (read-only) ─────────────────────────────────
 *
 * The Collector reads posts from Facebook Groups and stores them as SIGNALS.
 * A Signal is platform-independent (today a Facebook post; tomorrow a TikTok
 * video, Instagram reel, or LINE message — all Signals). The Collector knows
 * NOTHING about Business, AI, Telegram, comments, approval, matching, or
 * opportunities. It never writes to Facebook.
 */

/** Immutable raw capture — exactly what was collected, never mutated. */
export const facebookRawSignals = mysqlTable(
  'facebook_raw_signals',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    groupId: varchar('group_id', { length: 36 })
      .notNull()
      .references(() => facebookGroups.id),
    facebookPostId: varchar('facebook_post_id', { length: 100 }),
    postUrl: varchar('post_url', { length: 700 }).notNull(),
    rawHtml: text('raw_html'),
    rawJson: text('raw_json'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    collectedAt: timestamp('collected_at').notNull().defaultNow(),
  },
  (table) => ({
    // One immutable raw capture per post URL per workspace.
    workspaceUrlUnique: uniqueIndex('facebook_raw_signals_workspace_url_unique').on(
      table.workspaceId,
      table.postUrl,
    ),
    groupIdx: index('facebook_raw_signals_group_idx').on(table.groupId),
    hashIdx: index('facebook_raw_signals_hash_idx').on(table.contentHash),
  }),
);

/** Normalized, platform-neutral Signal derived from a raw capture. */
export const facebookSignals = mysqlTable(
  'facebook_signals',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    groupId: varchar('group_id', { length: 36 })
      .notNull()
      .references(() => facebookGroups.id),
    facebookPostId: varchar('facebook_post_id', { length: 100 }),
    postUrl: varchar('post_url', { length: 700 }).notNull(),
    authorName: varchar('author_name', { length: 255 }),
    authorProfile: varchar('author_profile', { length: 700 }),
    message: text('message'),
    mediaUrls: text('media_urls'), // JSON-encoded string[]
    createdTime: datetime('created_time'),
    normalizedHash: varchar('normalized_hash', { length: 64 }).notNull(),
    normalizedAt: timestamp('normalized_at').notNull().defaultNow(),
  },
  (table) => ({
    // Primary duplicate key: one Signal per post URL per workspace.
    workspaceUrlUnique: uniqueIndex('facebook_signals_workspace_url_unique').on(
      table.workspaceId,
      table.postUrl,
    ),
    fbPostIdx: index('facebook_signals_fb_post_idx').on(table.workspaceId, table.facebookPostId),
    hashIdx: index('facebook_signals_hash_idx').on(table.workspaceId, table.normalizedHash),
    groupIdx: index('facebook_signals_group_idx').on(table.groupId),
  }),
);

/** Per-group resume checkpoint. */
export const collectorCheckpoints = mysqlTable(
  'collector_checkpoints',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    groupId: varchar('group_id', { length: 36 })
      .notNull()
      .references(() => facebookGroups.id),
    lastPostId: varchar('last_post_id', { length: 100 }),
    lastPostUrl: varchar('last_post_url', { length: 700 }),
    lastScan: datetime('last_scan'),
    lastCursor: varchar('last_cursor', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    groupUnique: uniqueIndex('collector_checkpoints_group_unique').on(table.groupId),
  }),
);

/** Execution history for collector runs. */
export const collectorRuns = mysqlTable(
  'collector_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    // idle | running | paused | completed | failed
    status: varchar('status', { length: 20 }).notNull().default('running'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: datetime('finished_at'),
    groupsProcessed: int('groups_processed').notNull().default(0),
    postsCollected: int('posts_collected').notNull().default(0),
    errors: int('errors').notNull().default(0),
    // Safe, human-readable error/outcome classifications (no post text, no secrets).
    errorSummary: text('error_summary'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('collector_runs_workspace_idx').on(table.workspaceId),
  }),
);

export type FacebookRawSignalRow = typeof facebookRawSignals.$inferSelect;
export type FacebookSignalRow = typeof facebookSignals.$inferSelect;
export type CollectorCheckpointRow = typeof collectorCheckpoints.$inferSelect;
export type CollectorRunRow = typeof collectorRuns.$inferSelect;
