import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  datetime,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
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
    // SPRINT 015 — a Business is 'test' by default; only a 'production' Business
    // can ever satisfy Production readiness. Additive, never destructive.
    environment: varchar('environment', { length: 20 }).notNull().default('test'),
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
 * ── Media Library (images) ───────────────────────────────────────────────────
 *
 * Owner-uploaded images for a Business or a specific Property. Images NEVER
 * establish a fact — they only illustrate a fact already stored elsewhere. The
 * bytes live outside the DB under storage/media/ (server-generated key); this
 * row holds only safe metadata + approval flags. No external publishing here.
 */
export const mediaAssets = mysqlTable(
  'media_assets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    propertyId: varchar('property_id', { length: 36 }), // null = business-level asset
    mediaType: varchar('media_type', { length: 20 }).notNull().default('IMAGE'),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    originalFilename: varchar('original_filename', { length: 300 }).notNull(),
    mimeType: varchar('mime_type', { length: 60 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    category: varchar('category', { length: 30 }).notNull().default('other'),
    caption: varchar('caption', { length: 300 }),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    approvedForDrafts: boolean('approved_for_drafts').notNull().default(false),
    approvedForPublicResponse: boolean('approved_for_public_response').notNull().default(false),
    ownerVerified: boolean('owner_verified').notNull().default(false),
    width: int('width'),
    height: int('height'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessIdx: index('media_assets_business_idx').on(table.businessId),
    propertyIdx: index('media_assets_property_idx').on(table.propertyId),
  }),
);
export type MediaAssetRow = typeof mediaAssets.$inferSelect;

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
 * ── MODEL C: Central Scanner cross-workspace routing (M1) ────────────────────
 *
 * A customer Business (in its own workspace) SUBSCRIBES to a SYSTEM-owned source
 * Facebook Group. The KMKT scanner reads each shared Group once; a qualifying
 * post's central Opportunity then fans out to every subscribed Business, each
 * receiving its own Business Match in ITS OWN workspace (routing/coordinator.ts).
 *
 * This is deliberately separate from `business_facebook_groups` (a customer's
 * OWN group in its OWN workspace) to avoid cross-workspace ownership ambiguity:
 * here `source_group_id` is owned by the source tenant, `business_id` by the
 * customer tenant. The Business already owns its workspace (`businesses.
 * workspace_id`), so no redundant `business_workspace_id` is stored. The scanner
 * account/session/profile NEVER appears here — only these two ids.
 */
export const businessGroupSubscriptions = mysqlTable(
  'business_group_subscriptions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    // The SYSTEM/source-tenant Facebook Group being subscribed to.
    sourceGroupId: varchar('source_group_id', { length: 36 }).notNull(),
    // The customer Business (owns its own workspace via businesses.workspace_id).
    businessId: varchar('business_id', { length: 36 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    // A Business subscribes to a given source Group at most once (routing
    // idempotency at the subscription layer).
    sourceGroupBusinessUnique: uniqueIndex('business_group_subscriptions_unique').on(
      table.sourceGroupId,
      table.businessId,
    ),
    sourceGroupIdx: index('business_group_subscriptions_source_group_idx').on(table.sourceGroupId),
    businessIdx: index('business_group_subscriptions_business_idx').on(table.businessId),
    // EXPLICIT short FK names — MySQL's identifier limit is 64 chars, and
    // drizzle's auto-generated names (…_source_group_id_facebook_groups_id_fk =
    // 66) exceeded it, so a real-MySQL apply of 0016 failed with ERROR 1059.
    // These names are stable, deterministic, and verified by the real-MySQL
    // migration test.
    sourceGroupFk: foreignKey({
      columns: [table.sourceGroupId],
      foreignColumns: [facebookGroups.id],
      name: 'bgs_source_group_fk',
    }),
    businessFk: foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: 'bgs_business_fk',
    }),
  }),
);

export type BusinessGroupSubscriptionRow = typeof businessGroupSubscriptions.$inferSelect;

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
    // Duplicate posts skipped idempotently (Pilot 0 fix) — NOT errors.
    duplicatesSkipped: int('duplicates_skipped').notNull().default(0),
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

/**
 * ── SPRINT 007: Opportunity Classification Engine ────────────────────────────
 *
 * The Classifier decides, deterministically, "Should this Signal become an
 * Opportunity?" — NO AI, NO ML, NO embeddings, NO confidence, NO score. It knows
 * NOTHING about Business, Telegram, comments, or matching. An Opportunity is
 * simply "this Signal deserves further processing".
 *
 * One Signal → at most one Opportunity (signal_id is unique).
 */
export const opportunities = mysqlTable(
  'opportunities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    // Unique → one Opportunity per Signal.
    signalId: varchar('signal_id', { length: 36 })
      .notNull()
      .references(() => facebookSignals.id),
    // ACCEPT | REJECT (classifier outcome — no confidence, no score).
    decision: varchar('decision', { length: 10 }).notNull(),
    // NEW | READY | ARCHIVED (lifecycle).
    status: varchar('status', { length: 20 }).notNull().default('NEW'),
    classifierVersion: varchar('classifier_version', { length: 40 }).notNull(),
    // MODEL C (M2b) — customer-safe projection linkage. NULL = a native
    // Opportunity (classified in this workspace). Non-NULL = an immutable
    // customer-workspace PROJECTION of a central source Opportunity (this value
    // is the source Opportunity's id, kept for server/operator audit only). It
    // is a plain audit pointer, not a hard cross-tenant FK, so a customer
    // projection never depends on reading the source tenant at request time.
    sourceOpportunityId: varchar('source_opportunity_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    signalUnique: uniqueIndex('opportunities_signal_unique').on(table.signalId),
    workspaceIdx: index('opportunities_workspace_idx').on(table.workspaceId),
    statusIdx: index('opportunities_status_idx').on(table.workspaceId, table.status),
    // At most one projection of a given source Opportunity per customer
    // workspace (idempotent routing). MySQL treats NULLs as distinct, so native
    // Opportunities (source_opportunity_id NULL) are never constrained here.
    sourceProjectionUnique: uniqueIndex('opportunities_source_projection_unique').on(
      table.sourceOpportunityId,
      table.workspaceId,
    ),
  }),
);

/** Append-only lifecycle events for an Opportunity. */
export const opportunityEvents = mysqlTable(
  'opportunity_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    opportunityId: varchar('opportunity_id', { length: 36 })
      .notNull()
      .references(() => opportunities.id),
    event: varchar('event', { length: 60 }).notNull(),
    // JSON-encoded safe payload (decision + reasons + status change). No secrets.
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    opportunityIdx: index('opportunity_events_opportunity_idx').on(table.opportunityId),
  }),
);

export type OpportunityRow = typeof opportunities.$inferSelect;
export type OpportunityEventRow = typeof opportunityEvents.$inferSelect;

/**
 * ── SPRINT 008: Business Candidate & Matching Engine ─────────────────────────
 *
 * Deterministic matching decides whether an Opportunity is relevant to a
 * particular Business, using ONLY that business's human-authored Business
 * Matching Rules (docs/25-business-matching-rules.md). NO AI, NO ML, NO
 * embeddings, NO vector/semantic search, NO score, NO confidence.
 *
 * Pipeline: Opportunity → Candidate Generator → Business Matcher → Business Match.
 * Candidates are the businesses assigned to the Opportunity's Signal's group
 * (BR-15). A Business Match records a deterministic decision (MATCH | NO_MATCH)
 * plus the reasons array (which rules were evaluated and whether each matched).
 *
 * One (Opportunity, Business) pair → at most one Business Match.
 */
export const businessMatches = mysqlTable(
  'business_matches',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    opportunityId: varchar('opportunity_id', { length: 36 })
      .notNull()
      .references(() => opportunities.id),
    // MATCH | NO_MATCH (deterministic — no confidence, no score).
    decision: varchar('decision', { length: 10 }).notNull(),
    // JSON-encoded reasons array: [{ ruleType, ruleValue, matched }]. No secrets.
    reasons: text('reasons'),
    matcherVersion: varchar('matcher_version', { length: 40 }).notNull(),
    matchedAt: timestamp('matched_at').notNull().defaultNow(),
  },
  (table) => ({
    // A given Opportunity is matched against a given Business at most once.
    opportunityBusinessUnique: uniqueIndex('business_matches_opportunity_business_unique').on(
      table.opportunityId,
      table.businessId,
    ),
    workspaceIdx: index('business_matches_workspace_idx').on(table.workspaceId),
    opportunityIdx: index('business_matches_opportunity_idx').on(table.opportunityId),
    businessIdx: index('business_matches_business_idx').on(table.businessId),
  }),
);

export type BusinessMatchRow = typeof businessMatches.$inferSelect;

/**
 * ── SPRINT 016B: Property Match ──────────────────────────────────────────────
 *
 * After a Business MATCH, the deterministic Property matcher evaluates the
 * Business's own active Properties against the Opportunity and persists ONE
 * result per Business Match: either the selected Property (MATCH) or a single
 * NO_MATCH row (property_id NULL) with reason NO_PROPERTY_MATCH. No embeddings,
 * no AI, no fabricated Property — deterministic reasons only.
 */
export const propertyMatches = mysqlTable(
  'property_matches',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    opportunityId: varchar('opportunity_id', { length: 36 })
      .notNull()
      .references(() => opportunities.id),
    businessMatchId: varchar('business_match_id', { length: 36 })
      .notNull()
      .references(() => businessMatches.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    // NULL when the decision is NO_MATCH (NO_PROPERTY_MATCH) — never a fabricated Property.
    propertyId: varchar('property_id', { length: 36 }).references(() => properties.id),
    // v2 (M9C): MATCH | NEEDS_CONFIRMATION | NO_MATCH (deterministic — no
    // confidence, no score). Widened to 20 to hold 'NEEDS_CONFIRMATION' (18).
    decision: varchar('decision', { length: 20 }).notNull(),
    // JSON-encoded { reasons: string[], rejected: [...], requirement: {...} }. No secrets.
    reasons: text('reasons'),
    matcherVersion: varchar('matcher_version', { length: 40 }).notNull(),
    // How many active Properties were evaluated for this Business Match.
    candidatesEvaluated: int('candidates_evaluated').notNull().default(0),
    evaluatedAt: timestamp('evaluated_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    // One Property evaluation result per Business Match (idempotent re-runs skip).
    businessMatchUnique: uniqueIndex('property_matches_business_match_unique').on(
      table.businessMatchId,
    ),
    workspaceIdx: index('property_matches_workspace_idx').on(table.workspaceId),
    opportunityIdx: index('property_matches_opportunity_idx').on(table.opportunityId),
    businessIdx: index('property_matches_business_idx').on(table.businessId),
    propertyIdx: index('property_matches_property_idx').on(table.propertyId),
    decisionIdx: index('property_matches_decision_idx').on(table.workspaceId, table.decision),
  }),
);

export type PropertyMatchRow = typeof propertyMatches.$inferSelect;

/**
 * ── SPRINT 009: AI Draft Engine ──────────────────────────────────────────────
 *
 * The AI Draft Engine turns a MATCH Business Match into a **draft comment
 * suggestion** for human review. The output is a DRAFT ONLY — it is NEVER sent
 * to Telegram, NEVER posted to Facebook, and NEVER triggers a write action.
 * Human approval remains mandatory (docs/09-ai-design.md, ADR-017).
 *
 * AI is DISABLED by default; the deterministic Mock provider is used for tests
 * and local use. Drafts are IMMUTABLE and VERSIONED (ADR-016): a business match
 * may have many versions; generating a new version supersedes older ones and
 * NEVER overwrites an existing draft. `input_snapshot` and `policy_result` store
 * only safe structured context — no secrets, cookies, profile paths, or
 * chain-of-thought.
 */
export const aiDrafts = mysqlTable(
  'ai_drafts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessMatchId: varchar('business_match_id', { length: 36 })
      .notNull()
      .references(() => businessMatches.id),
    opportunityId: varchar('opportunity_id', { length: 36 })
      .notNull()
      .references(() => opportunities.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    // Monotonic version per business match, starting at 1.
    version: int('version').notNull(),
    // draft | needs_review | rejected | superseded
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    content: text('content'),
    // Provider/model may be mock values when AI is disabled (default).
    provider: varchar('provider', { length: 40 }).notNull(),
    model: varchar('model', { length: 80 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 40 }).notNull(),
    // JSON — safe structured context only (no secrets, no chain-of-thought).
    inputSnapshot: text('input_snapshot'),
    // JSON — policy decision (PASS | NEEDS_REVIEW | BLOCK) + reasons.
    policyResult: text('policy_result'),
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    // One draft row per (business match, version) — immutable versioning.
    matchVersionUnique: uniqueIndex('ai_drafts_match_version_unique').on(
      table.businessMatchId,
      table.version,
    ),
    workspaceIdx: index('ai_drafts_workspace_idx').on(table.workspaceId),
    matchIdx: index('ai_drafts_match_idx').on(table.businessMatchId),
    statusIdx: index('ai_drafts_status_idx').on(table.workspaceId, table.status),
  }),
);

/** Append-only lifecycle events for an AI Draft (safe payloads only). */
export const aiDraftEvents = mysqlTable(
  'ai_draft_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    aiDraftId: varchar('ai_draft_id', { length: 36 })
      .notNull()
      .references(() => aiDrafts.id),
    event: varchar('event', { length: 60 }).notNull(),
    // JSON-encoded safe payload. No API keys, cookies, tokens, or chain-of-thought.
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    draftIdx: index('ai_draft_events_draft_idx').on(table.aiDraftId),
  }),
);

export type AiDraftRow = typeof aiDrafts.$inferSelect;
export type AiDraftEventRow = typeof aiDraftEvents.$inferSelect;

/**
 * ── SPRINT 010: Human Review Engine ──────────────────────────────────────────
 *
 * The Review Engine is the CORE human-in-the-loop step. An AI Draft becomes a
 * **Review Task** that a human approves, rejects, or edits. Telegram is ONLY the
 * first Review Adapter (presentation/notification) — it is NEVER the source of
 * truth and NEVER writes to the database. All decisions flow Telegram → Review
 * API → Coordinator → Repository. The engine works WITHOUT Telegram.
 *
 * This sprint has NO Facebook comment/message/write, NO Action Engine, NO auto
 * approval. Approving a Review Task records the human decision only — it does
 * not post anything.
 *
 * One Draft → one Review Task (draft_id is unique).
 */
export const reviewTasks = mysqlTable(
  'review_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessMatchId: varchar('business_match_id', { length: 36 })
      .notNull()
      .references(() => businessMatches.id),
    // Unique → one Review Task per AI Draft.
    draftId: varchar('draft_id', { length: 36 })
      .notNull()
      .references(() => aiDrafts.id),
    // PENDING | APPROVED | REJECTED | EXPIRED
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    assignedTo: varchar('assigned_to', { length: 36 }),
    // EDIT decision stores the revised comment text + who/when (still requires approval).
    editedContent: text('edited_content'),
    editor: varchar('editor', { length: 36 }),
    editedAt: datetime('edited_at'),
    // Terminal-decision provenance (approve/reject).
    decidedBy: varchar('decided_by', { length: 36 }),
    decidedAt: datetime('decided_at'),
    decisionReason: varchar('decision_reason', { length: 500 }),
    // SPRINT 016B — immutable snapshot of the Property-match context at creation.
    // These freeze which Business/Property/Property-Match the Draft was built on
    // so a later Property edit cannot silently mutate an existing Review.
    businessId: varchar('business_id', { length: 36 }),
    propertyId: varchar('property_id', { length: 36 }),
    propertyMatchId: varchar('property_match_id', { length: 36 }),
    contextHash: varchar('context_hash', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    draftUnique: uniqueIndex('review_tasks_draft_unique').on(table.draftId),
    workspaceIdx: index('review_tasks_workspace_idx').on(table.workspaceId),
    statusIdx: index('review_tasks_status_idx').on(table.workspaceId, table.status),
  }),
);

/** Append-only lifecycle events for a Review Task (safe payloads only). */
export const reviewEvents = mysqlTable(
  'review_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    reviewTaskId: varchar('review_task_id', { length: 36 })
      .notNull()
      .references(() => reviewTasks.id),
    event: varchar('event', { length: 60 }).notNull(),
    // JSON-encoded safe payload (decision, editor, reason, adapter ref). No secrets.
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index('review_events_task_idx').on(table.reviewTaskId),
  }),
);

export type ReviewTaskRow = typeof reviewTasks.$inferSelect;
export type ReviewEventRow = typeof reviewEvents.$inferSelect;

/**
 * ── SPRINT 011: Action Queue Engine ──────────────────────────────────────────
 *
 * A SAFE BOUNDARY between an approved Human Review decision and future platform
 * execution. This sprint does **NOT** execute Facebook actions and runs **NO**
 * Action Worker. Only an APPROVED Review Task may create an Action Job; the job
 * captures the approved (or edited) content and target immutably. Execution is
 * disabled by default and Facebook writes stay disabled and the global kill
 * switch stays on, so every job is created **BLOCKED** under current defaults.
 *
 * The row holds NO credentials, NO browser profile path, NO cookies. There is
 * NO screenshot table and NO Facebook comment-result table this sprint.
 */
export const actionJobs = mysqlTable(
  'action_jobs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    reviewTaskId: varchar('review_task_id', { length: 36 })
      .notNull()
      .references(() => reviewTasks.id),
    aiDraftId: varchar('ai_draft_id', { length: 36 })
      .notNull()
      .references(() => aiDrafts.id),
    businessMatchId: varchar('business_match_id', { length: 36 })
      .notNull()
      .references(() => businessMatches.id),
    // facebook_comment | facebook_message (only facebook_comment selectable in MVP UI).
    actionType: varchar('action_type', { length: 40 }).notNull(),
    // queued | blocked | processing | succeeded | failed | cancelled
    status: varchar('status', { length: 20 }).notNull().default('blocked'),
    // Fixed to 'facebook' for the MVP.
    targetPlatform: varchar('target_platform', { length: 20 }).notNull().default('facebook'),
    targetUrl: varchar('target_url', { length: 700 }).notNull(),
    // Immutable after creation — the approved (or edited) review content.
    approvedContent: text('approved_content').notNull(),
    attemptCount: int('attempt_count').notNull().default(0),
    maxAttempts: int('max_attempts').notNull().default(3),
    scheduledAt: datetime('scheduled_at'),
    startedAt: datetime('started_at'),
    completedAt: datetime('completed_at'),
    cancelledAt: datetime('cancelled_at'),
    blockedAt: datetime('blocked_at'),
    lastErrorCode: varchar('last_error_code', { length: 40 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    // ── SPRINT 012 execution safeguards ──────────────────────────────────────
    // Deterministic canonical post identity (hash), not the raw URL string.
    targetPostKey: varchar('target_post_key', { length: 128 }),
    // Nullable-unique key = "<review>:<type>" while ACTIVE (queued|blocked|
    // processing), NULL once terminal — DB-enforces one active job per pair.
    activeDedupKey: varchar('active_dedup_key', { length: 120 }),
    // Nullable-unique key set only on VERIFIED success — DB-enforces one
    // successful comment per (workspace, business, post, type).
    successIdempotencyKey: varchar('success_idempotency_key', { length: 200 }),
    // Execution phase, distinct from the queue status.
    // none | preparing | ready | executing | verified | ambiguous | failed
    executionState: varchar('execution_state', { length: 30 }).notNull().default('none'),
    ambiguousAt: datetime('ambiguous_at'),
    verificationRequired: boolean('verification_required').notNull().default(false),
    lastExecutionSessionId: varchar('last_execution_session_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    // DB-level: at most one ACTIVE job per (review_task, action_type).
    activeDedupUnique: uniqueIndex('action_jobs_active_dedup_unique').on(table.activeDedupKey),
    // DB-level: at most one VERIFIED successful comment per identity tuple.
    successUnique: uniqueIndex('action_jobs_success_unique').on(table.successIdempotencyKey),
    reviewTypeIdx: index('action_jobs_review_type_idx').on(table.reviewTaskId, table.actionType),
    workspaceIdx: index('action_jobs_workspace_idx').on(table.workspaceId),
    statusIdx: index('action_jobs_status_idx').on(table.workspaceId, table.status),
  }),
);

/**
 * ── SPRINT 012: Facebook Comment Adapter & Safe Execution Foundation ─────────
 *
 * An Execution Session is one attempt to execute an Action Job through the
 * Facebook Comment Adapter. It is append-only in identity; state transitions are
 * validated. An ambiguous session BLOCKS blind retries. No real Facebook write
 * happens this sprint — the fake adapter drives all sessions.
 */
export const actionExecutionSessions = mysqlTable(
  'action_execution_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    actionJobId: varchar('action_job_id', { length: 36 })
      .notNull()
      .references(() => actionJobs.id),
    attemptNumber: int('attempt_number').notNull(),
    // created|preflight|ready_to_submit|submitting|submitted|verifying|verified|
    // ambiguous|failed|cancelled|checkpoint_required|session_expired|account_restricted
    status: varchar('status', { length: 30 }).notNull().default('created'),
    // fake | playwright
    adapter: varchar('adapter', { length: 20 }).notNull(),
    // Controlled profile reference (key, never an absolute path).
    browserProfileKey: varchar('browser_profile_key', { length: 128 }),
    startedAt: datetime('started_at'),
    preflightVerifiedAt: datetime('preflight_verified_at'),
    submitStartedAt: datetime('submit_started_at'),
    submittedAt: datetime('submitted_at'),
    verificationStartedAt: datetime('verification_started_at'),
    verifiedAt: datetime('verified_at'),
    ambiguousAt: datetime('ambiguous_at'),
    failedAt: datetime('failed_at'),
    cancelledAt: datetime('cancelled_at'),
    finishedAt: datetime('finished_at'),
    errorCode: varchar('error_code', { length: 40 }),
    errorMessage: varchar('error_message', { length: 500 }),
    // SAFE_RETRY | NO_RETRY | MANUAL_INVESTIGATION (recovery classification).
    recoveryState: varchar('recovery_state', { length: 40 }),
    // Nullable-unique = action_job_id while the session is ACTIVE, NULL once
    // terminal — DB-enforces one active session per Action Job.
    activeKey: varchar('active_key', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    activeUnique: uniqueIndex('action_exec_sessions_active_unique').on(table.activeKey),
    jobUnique: uniqueIndex('action_exec_sessions_job_attempt_unique').on(
      table.actionJobId,
      table.attemptNumber,
    ),
    workspaceIdx: index('action_exec_sessions_workspace_idx').on(table.workspaceId),
    jobIdx: index('action_exec_sessions_job_idx').on(table.actionJobId),
  }),
);

/** Append-only, controlled evidence for an Execution Session. No secrets/cookies. */
export const actionExecutionEvidence = mysqlTable(
  'action_execution_evidence',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    actionJobId: varchar('action_job_id', { length: 36 })
      .notNull()
      .references(() => actionJobs.id),
    // FK added with an explicit short name in the table callback below — the
    // auto-generated name would exceed MySQL's 64-char identifier limit.
    executionSessionId: varchar('execution_session_id', { length: 36 }).notNull(),
    // pre_submit_snapshot|typed_content_snapshot|submit_snapshot|
    // post_submit_screenshot|comment_identity|verification_snapshot|failure_snapshot
    evidenceType: varchar('evidence_type', { length: 40 }).notNull(),
    // Controlled storage key (relative), never an absolute path.
    storageKey: varchar('storage_key', { length: 300 }),
    // SHA-256 of the file where file evidence exists.
    evidenceHash: varchar('evidence_hash', { length: 64 }),
    facebookCommentId: varchar('facebook_comment_id', { length: 100 }),
    observedContent: text('observed_content'),
    observedAuthor: varchar('observed_author', { length: 255 }),
    observedPostUrl: varchar('observed_post_url', { length: 700 }),
    observedAt: datetime('observed_at'),
    // JSON — safe structured metadata only (no cookies/tokens/paths/DOM/secrets).
    metadata: text('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    sessionFk: foreignKey({
      name: 'action_exec_evidence_session_fk',
      columns: [table.executionSessionId],
      foreignColumns: [actionExecutionSessions.id],
    }),
    sessionIdx: index('action_exec_evidence_session_idx').on(table.executionSessionId),
    jobIdx: index('action_exec_evidence_job_idx').on(table.actionJobId),
  }),
);

/**
 * The authoritative duplicate-comment guard: one reservation per
 * (workspace, business, target_post_key, action_type). A VERIFIED record
 * permanently blocks duplicates; an AMBIGUOUS record blocks automatic retry;
 * RELEASE frees the slot ONLY with explicit proof no comment was submitted
 * (the `idemKey` becomes NULL so a new reservation may be taken).
 */
export const actionIdempotencyRecords = mysqlTable(
  'action_idempotency_records',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    targetPostKey: varchar('target_post_key', { length: 128 }).notNull(),
    actionType: varchar('action_type', { length: 40 }).notNull(),
    actionJobId: varchar('action_job_id', { length: 36 })
      .notNull()
      .references(() => actionJobs.id),
    executionSessionId: varchar('execution_session_id', { length: 36 }),
    // reserved | submitted | verified | ambiguous | released
    status: varchar('status', { length: 20 }).notNull().default('reserved'),
    facebookCommentId: varchar('facebook_comment_id', { length: 100 }),
    // Nullable-unique = "<ws>:<biz>:<postKey>:<type>" while NOT released,
    // NULL when released — DB-enforces one live reservation per identity tuple.
    idemKey: varchar('idem_key', { length: 260 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    idemUnique: uniqueIndex('action_idempotency_idem_unique').on(table.idemKey),
    lookupIdx: index('action_idempotency_lookup_idx').on(
      table.workspaceId,
      table.businessId,
      table.targetPostKey,
      table.actionType,
    ),
    jobIdx: index('action_idempotency_job_idx').on(table.actionJobId),
  }),
);

export type ActionExecutionSessionRow = typeof actionExecutionSessions.$inferSelect;
export type ActionExecutionEvidenceRow = typeof actionExecutionEvidence.$inferSelect;
export type ActionIdempotencyRecordRow = typeof actionIdempotencyRecords.$inferSelect;

/** Append-only lifecycle events for an Action Job (safe payloads only). */
export const actionEvents = mysqlTable(
  'action_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    actionJobId: varchar('action_job_id', { length: 36 })
      .notNull()
      .references(() => actionJobs.id),
    event: varchar('event', { length: 60 }).notNull(),
    // JSON-encoded safe payload (status, reasons, attempt). No cookies, tokens,
    // credentials, browser profile paths, raw HTML, private keys, or AI secrets.
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    jobIdx: index('action_events_job_idx').on(table.actionJobId),
  }),
);

export type ActionJobRow = typeof actionJobs.$inferSelect;
export type ActionEventRow = typeof actionEvents.$inferSelect;

// ── SPRINT 015 — Production Business & Property ──────────────────────────────

export const properties = mysqlTable(
  'properties',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    name: varchar('name', { length: 200 }).notNull(),
    code: varchar('code', { length: 80 }),
    propertyType: varchar('property_type', { length: 80 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    description: text('description'),
    // Normalized high-value / queryable fields (matching + filters).
    province: varchar('province', { length: 120 }),
    district: varchar('district', { length: 120 }),
    area: varchar('area', { length: 120 }),
    maxGuests: int('max_guests'),
    bedrooms: int('bedrooms'),
    bathrooms: int('bathrooms'),
    beds: int('beds'),
    // Tri-state facts (M9B): NULLABLE boolean — true = YES (confirmed present),
    // false = NO (confirmed absent), NULL = UNKNOWN (owner has not provided).
    // The store maps these to the PropertyFact domain enum; nothing reads the
    // raw boolean via truthiness. Historical false was migrated to NULL/UNKNOWN.
    privatePool: boolean('private_pool'),
    nearBeach: boolean('near_beach'),
    beachfront: boolean('beachfront'),
    riverfront: boolean('riverfront'),
    // JSON-encoded variable attributes (amenities, pricing, content, media,
    // characteristics, location extras, availability, booking) — (de)serialized
    // in the store layer. Prices live here and are stored ONLY when entered.
    details: text('details'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    workspaceIdx: index('properties_workspace_idx').on(table.workspaceId),
    businessIdx: index('properties_business_idx').on(table.businessId),
    statusIdx: index('properties_status_idx').on(table.status),
    areaIdx: index('properties_area_idx').on(table.area),
    typeIdx: index('properties_type_idx').on(table.propertyType),
  }),
);

export const propertyPolicies = mysqlTable(
  'property_policies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    propertyId: varchar('property_id', { length: 36 })
      .notNull()
      .references(() => properties.id),
    // NULL = inherit the Business policy for that field.
    availabilityPolicy: varchar('availability_policy', { length: 40 }),
    pricingPolicy: varchar('pricing_policy', { length: 40 }),
    promotionPolicy: varchar('promotion_policy', { length: 40 }),
    bookingPolicy: varchar('booking_policy', { length: 40 }),
    prohibitedClaims: text('prohibited_claims'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    propertyUnique: uniqueIndex('property_policies_property_unique').on(table.propertyId),
  }),
);

export const businessContacts = mysqlTable(
  'business_contacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    type: varchar('type', { length: 20 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    label: varchar('label', { length: 120 }),
    enabled: boolean('enabled').notNull().default(true),
    approvedForDrafts: boolean('approved_for_drafts').notNull().default(false),
    approvedForPublicResponse: boolean('approved_for_public_response').notNull().default(false),
    ownerVerifiedAt: datetime('owner_verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessIdx: index('business_contacts_business_idx').on(table.businessId),
  }),
);

export const businessPolicies = mysqlTable(
  'business_policies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    businessId: varchar('business_id', { length: 36 })
      .notNull()
      .references(() => businesses.id),
    availabilityPolicy: varchar('availability_policy', { length: 40 }),
    pricingPolicy: varchar('pricing_policy', { length: 40 }),
    promotionPolicy: varchar('promotion_policy', { length: 40 }),
    bookingPolicy: varchar('booking_policy', { length: 40 }),
    cancellationInfoPolicy: text('cancellation_info_policy'),
    prohibitedClaims: text('prohibited_claims'),
    escalationPolicy: text('escalation_policy'),
    responsibleOwner: varchar('responsible_owner', { length: 200 }),
    operatingHours: varchar('operating_hours', { length: 200 }),
    responseSlaMinutes: int('response_sla_minutes'),
    // Response Strategy (additive): behavior on Business MATCH + NO_PROPERTY_MATCH.
    noPropertyMatchStrategy: varchar('no_property_match_strategy', { length: 40 }),
    allowNearMatchSuggestions: boolean('allow_near_match_suggestions').notNull().default(false),
    // Media Library (additive): whether/how an approved image may accompany a response.
    imageResponseMode: varchar('image_response_mode', { length: 40 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    businessUnique: uniqueIndex('business_policies_business_unique').on(table.businessId),
  }),
);

export const businessAuditEvents = mysqlTable(
  'business_audit_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    businessId: varchar('business_id', { length: 36 }),
    propertyId: varchar('property_id', { length: 36 }),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    actorEmail: varchar('actor_email', { length: 255 }),
    payload: text('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('business_audit_workspace_idx').on(table.workspaceId),
    businessIdx: index('business_audit_business_idx').on(table.businessId),
  }),
);

export type PropertyRow = typeof properties.$inferSelect;
export type PropertyPolicyRow = typeof propertyPolicies.$inferSelect;
export type BusinessContactRow = typeof businessContacts.$inferSelect;
export type BusinessPolicyRow = typeof businessPolicies.$inferSelect;
export type BusinessAuditEventRow = typeof businessAuditEvents.$inferSelect;
