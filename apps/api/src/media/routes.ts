import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Store, BusinessRecord } from '../store/types';
import type { BusinessPropertyStore } from '../business-property/store';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { createAuthenticate, createCsrfGuard, noStore } from '../lib/http';
import { errors } from '../lib/errors';
import { newId } from '../lib/tokens';
import {
  MEDIA_CATEGORIES,
  DEFAULT_IMAGE_RESPONSE_MODE,
  type MediaAsset,
  type MediaCategory,
} from './types';
import { validateImage } from './image-validation';
import { buildMediaStorageKey, writeMediaFile, readMediaFile } from './storage';
import { selectMedia } from './selection';

export interface MediaDeps {
  store: Store;
  bpStore: BusinessPropertyStore;
  env: ApiEnv;
  logger: Logger;
  /** Base dir for storage/ (defaults to process.cwd()). */
  baseDir?: string;
}

/** Owner-safe projection — never leaks the raw storage path. */
function publicMedia(a: MediaAsset, businessId: string) {
  return {
    id: a.id,
    businessId: a.businessId,
    propertyId: a.propertyId,
    category: a.category,
    caption: a.caption,
    status: a.status,
    approvedForDrafts: a.approvedForDrafts,
    approvedForPublicResponse: a.approvedForPublicResponse,
    ownerVerified: a.ownerVerified,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    originalFilename: a.originalFilename,
    // Controlled file URL — served by an auth+ownership-checked route, not a path.
    fileUrl: `/businesses/${businessId}/media/${a.id}/file`,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function isCategory(v: unknown): v is MediaCategory {
  return typeof v === 'string' && (MEDIA_CATEGORIES as readonly string[]).includes(v);
}

export function registerMediaRoutes(app: FastifyInstance, deps: MediaDeps): void {
  const { store, bpStore, env, logger } = deps;
  const baseDir = deps.baseDir ?? process.cwd();
  const authenticate = createAuthenticate(store, env);
  const csrfGuard = createCsrfGuard(env);

  async function loadOwnedBusiness(
    req: FastifyRequest,
    businessId: string,
  ): Promise<BusinessRecord> {
    const ws = await store.getWorkspaceByOwner(req.authUser!.id);
    if (!ws) throw errors.conflict('workspace_required', 'Create a workspace first');
    const business = await store.getBusinessById(businessId);
    if (!business || business.workspaceId !== ws.id) {
      throw errors.notFound('business_not_found', 'Business not found');
    }
    return business;
  }

  async function loadOwnedAsset(
    req: FastifyRequest,
    businessId: string,
    assetId: string,
  ): Promise<{ business: BusinessRecord; asset: MediaAsset }> {
    const business = await loadOwnedBusiness(req, businessId);
    const asset = await bpStore.getMediaAssetById(assetId);
    if (!asset || asset.businessId !== business.id || asset.workspaceId !== business.workspaceId) {
      throw errors.notFound('media_not_found', 'Media asset not found');
    }
    return { business, asset };
  }

  // ── Upload (multipart) ──────────────────────────────────────────────────────
  app.post(
    '/businesses/:id/media',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id } = req.params as { id: string };
      const business = await loadOwnedBusiness(req, id);

      if (!req.isMultipart || !req.isMultipart()) {
        throw errors.validation('Expected a multipart image upload');
      }

      let bytes: Buffer | null = null;
      let filename = 'upload';
      let declaredMime = '';
      let category: MediaCategory = 'other';
      let propertyId: string | null = null;
      let caption: string | null = null;

      try {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            filename = part.filename || 'upload';
            declaredMime = part.mimetype || '';
            bytes = await part.toBuffer(); // bounded by the multipart fileSize limit
            if (part.file.truncated) throw errors.validation('Image exceeds the size limit');
          } else {
            const v = typeof part.value === 'string' ? part.value : '';
            if (part.fieldname === 'category' && isCategory(v)) category = v;
            else if (part.fieldname === 'propertyId') propertyId = v || null;
            else if (part.fieldname === 'caption') caption = v || null;
          }
        }
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'FST_REQ_FILE_TOO_LARGE'
        ) {
          throw errors.validation('Image exceeds the size limit');
        }
        throw err;
      }

      if (!bytes) throw errors.validation('No image file was provided');

      // Property ownership when a propertyId is supplied.
      if (propertyId) {
        const p = await bpStore.getPropertyById(propertyId);
        if (!p || p.businessId !== business.id || p.workspaceId !== business.workspaceId) {
          throw errors.notFound('property_not_found', 'Property not found');
        }
      }

      // Trust the bytes, not the filename/declared type.
      const v = validateImage(bytes, declaredMime);
      if (!v.ok) throw errors.validation(`Invalid image (${v.code})`);

      const assetId = newId();
      const storageKey = buildMediaStorageKey({
        workspaceId: business.workspaceId,
        businessId: business.id,
        assetId,
        mime: v.mime,
      });
      await writeMediaFile(baseDir, storageKey, bytes);

      const asset = await bpStore.createMediaAsset({
        id: assetId,
        workspaceId: business.workspaceId,
        businessId: business.id,
        propertyId,
        storageKey,
        originalFilename: filename.slice(0, 300),
        mimeType: v.mime,
        sizeBytes: bytes.length,
        category,
        caption: caption?.slice(0, 300) ?? null,
        width: v.width,
        height: v.height,
      });
      logger.info('media.upload', { userId: req.authUser!.id, businessId: id, assetId });
      reply.code(201);
      return { media: publicMedia(asset, id) };
    },
  );

  // ── List ─────────────────────────────────────────────────────────────────────
  app.get('/businesses/:id/media', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const items = await bpStore.listMediaByBusiness(id);
    return { media: items.map((a) => publicMedia(a, id)) };
  });

  // ── Update (category / caption / status / approvals / verification) ───────────
  app.patch(
    '/businesses/:id/media/:assetId',
    { preHandler: [csrfGuard, authenticate] },
    async (req, reply) => {
      noStore(reply);
      const { id, assetId } = req.params as { id: string; assetId: string };
      await loadOwnedAsset(req, id, assetId);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Parameters<BusinessPropertyStore['updateMediaAsset']>[1] = {};
      if (body.category !== undefined) {
        if (!isCategory(body.category)) throw errors.validation('Invalid category');
        patch.category = body.category;
      }
      if (body.caption !== undefined)
        patch.caption = typeof body.caption === 'string' ? body.caption.slice(0, 300) : null;
      if (body.status !== undefined) {
        if (body.status !== 'ACTIVE' && body.status !== 'ARCHIVED')
          throw errors.validation('Invalid status');
        patch.status = body.status;
      }
      for (const k of [
        'approvedForDrafts',
        'approvedForPublicResponse',
        'ownerVerified',
      ] as const) {
        if (body[k] !== undefined) {
          if (typeof body[k] !== 'boolean') throw errors.validation(`Invalid ${k}`);
          patch[k] = body[k] as boolean;
        }
      }
      const updated = await bpStore.updateMediaAsset(assetId, patch);
      return { media: publicMedia(updated!, id) };
    },
  );

  // ── File serve (auth + ownership; never exposes the path) ─────────────────────
  app.get(
    '/businesses/:id/media/:assetId/file',
    { preHandler: authenticate },
    async (req, reply) => {
      noStore(reply);
      const { id, assetId } = req.params as { id: string; assetId: string };
      const { asset } = await loadOwnedAsset(req, id, assetId);
      const bytes = await readMediaFile(baseDir, asset.storageKey);
      reply.header('Content-Type', asset.mimeType);
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(bytes);
    },
  );

  // ── Deterministic suggestion for a Business match (read-only; no mutation) ────
  app.get('/businesses/:id/media/suggestion', { preHandler: authenticate }, async (req, reply) => {
    noStore(reply);
    const { id } = req.params as { id: string };
    await loadOwnedBusiness(req, id);
    const { businessMatchId } = req.query as { businessMatchId?: string };
    if (!businessMatchId) throw errors.validation('businessMatchId is required');

    const match = await store.getBusinessMatchById(businessMatchId);
    if (!match || match.businessId !== id)
      throw errors.notFound('match_not_found', 'Match not found');

    const propertyMatch = await store.getPropertyMatchByBusinessMatch(businessMatchId);
    const requirement =
      (propertyMatch?.reasons?.requirement as { requestedAmenities?: unknown } | undefined) ??
      undefined;
    const requestedAmenities = Array.isArray(requirement?.requestedAmenities)
      ? (requirement!.requestedAmenities as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [];

    const policies = await bpStore.getBusinessPolicies(id);
    const imageResponseMode = policies?.imageResponseMode ?? DEFAULT_IMAGE_RESPONSE_MODE;

    const candidates = await bpStore.listSelectableMediaByBusiness(id);
    const result = selectMedia(candidates, {
      imageResponseMode,
      propertyMatch: propertyMatch
        ? { decision: propertyMatch.decision, propertyId: propertyMatch.propertyId }
        : null,
      requestedAmenities,
    });
    return {
      suggestion: result.selected ? publicMedia(result.selected, id) : null,
      reasons: result.reasons,
      imageResponseMode,
      // Public publishing is gated separately and never happens in this feature.
      publicResponseApproved: result.selected?.approvedForPublicResponse ?? false,
    };
  });
}
