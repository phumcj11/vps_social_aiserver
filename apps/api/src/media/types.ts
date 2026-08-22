/**
 * Media Library domain types (pilot). Images only. Facts NEVER come from an
 * image — an image only illustrates a fact that already exists on the Business
 * or Property. No external publishing in this feature.
 */

export const MEDIA_CATEGORIES = [
  'cover',
  'exterior',
  'pool',
  'bedroom',
  'bathroom',
  'living_room',
  'karaoke',
  'kitchen',
  'view',
  'other',
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export type MediaStatus = 'ACTIVE' | 'ARCHIVED';

/** Allowed image MIME types for the pilot (SVG deliberately excluded). */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Whether/how an approved image may accompany a response. Safe pilot default is
 * HUMAN_REVIEW_ONLY: the system may SUGGEST an image but a human decides.
 */
export const IMAGE_RESPONSE_MODES = [
  'OFF',
  'MATCHED_PROPERTY_ONLY',
  'BUSINESS_FALLBACK',
  'HUMAN_REVIEW_ONLY',
] as const;
export type ImageResponseMode = (typeof IMAGE_RESPONSE_MODES)[number];
export const DEFAULT_IMAGE_RESPONSE_MODE: ImageResponseMode = 'HUMAN_REVIEW_ONLY';

export interface MediaAsset {
  id: string;
  workspaceId: string;
  businessId: string;
  propertyId: string | null; // null = business-level asset
  mediaType: 'IMAGE';
  storageKey: string; // opaque, server-generated relative key — never a path from the client
  originalFilename: string;
  mimeType: AllowedImageMime;
  sizeBytes: number;
  category: MediaCategory;
  caption: string | null;
  status: MediaStatus;
  approvedForDrafts: boolean;
  approvedForPublicResponse: boolean;
  ownerVerified: boolean;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMediaAssetInput {
  id: string;
  workspaceId: string;
  businessId: string;
  propertyId: string | null;
  storageKey: string;
  originalFilename: string;
  mimeType: AllowedImageMime;
  sizeBytes: number;
  category: MediaCategory;
  caption: string | null;
  width: number | null;
  height: number | null;
}

export interface UpdateMediaAssetPatch {
  category?: MediaCategory;
  caption?: string | null;
  status?: MediaStatus;
  approvedForDrafts?: boolean;
  approvedForPublicResponse?: boolean;
  ownerVerified?: boolean;
}
