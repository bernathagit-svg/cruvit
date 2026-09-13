/**
 * Garden Media / Images / Identity V1 — pure contracts (no DOM / network / Storage I/O).
 *
 * USER/GARDEN MEDIA authority is distinct from CATALOG plant images.
 * Acquire once → validate → store (object storage) → link → reuse.
 * Do NOT store raw image bytes/base64 in Postgres.
 *
 * Reuses planned private bucket name from garden-design-asset-contract-v1.js.
 * Reuses Plant Doctor MIME allow-list (jpeg/png/webp).
 */
import { USER_PRIVATE_MEDIA_STORAGE_BUCKET } from '../catalog-media/garden-design-asset-contract-v1.js';
import { PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES } from '../plant-doctor/plant-doctor-image-mime-v1.js';

export const GARDEN_MEDIA_V1_VERSION = '1.0.0-owner-review';
export const GARDEN_MEDIA_SCHEMA = 'garden_media_v1';

/** Planned private Supabase Storage bucket — must NOT be public. */
export const GARDEN_MEDIA_STORAGE_BUCKET = USER_PRIVATE_MEDIA_STORAGE_BUCKET; // user-garden-media

export const GARDEN_MEDIA_SUPPORTED_MIMES = PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES;

/** Soft cap for V1 uploads (bytes). */
export const GARDEN_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const GARDEN_MEDIA_AUTHORITY = Object.freeze({
  USER_GARDEN_MEDIA: 'garden_media',
  CATALOG_MEDIA: 'catalog_plants.media',
  DESIGN_PREPARED_ASSETS: 'catalog_design_assets',
  USER_MEDIA_IS_CATALOG: false,
  USER_MEDIA_MAY_AUTO_BECOME_CATALOG: false,
  USER_MEDIA_MAY_AUTO_BECOME_DESIGN_ASSET: false,
  STORE_BASE64_IN_POSTGRES: false
});

export const MEDIA_SOURCE_MODULES = Object.freeze([
  'my_garden',
  'plant_doctor',
  'plant_identifier',
  'garden_design',
  'garden_area',
  'import'
]);

export const MEDIA_PURPOSES = Object.freeze([
  'plant_profile',
  'diagnosis',
  'identification',
  'garden_overview',
  'area_reference',
  'design_source',
  'progress_photo'
]);

/** How plant association was established — not botanical ID proof. */
export const MEDIA_IDENTITY_SOURCES = Object.freeze([
  'user_assigned',
  'inherited_from_known_plant_context',
  'identifier_confirmed',
  'doctor_context',
  'uncertain',
  'none'
]);

export const MEDIA_IDENTITY_CONFIDENCE = Object.freeze([
  'none',
  'low',
  'medium',
  'high'
]);

export const MEDIA_VALIDATION_STATES = Object.freeze([
  'pending',
  'validated',
  'rejected',
  'deleted'
]);

function inSet(list, value) {
  return list.includes(String(value || '').trim());
}

function asPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Hard catalog boundary — user Garden media never becomes catalog portrait automatically.
 */
export function mayPromoteUserMediaToCatalogImage() {
  return false;
}

export function mayPromoteUserMediaToDesignAsset() {
  return false;
}

export function assertNotCatalogAuthority(mediaRow) {
  if (mediaRow?.authority === 'catalog' || mediaRow?.isCatalogImage === true) {
    throw new Error('user_garden_media_is_not_catalog');
  }
  return true;
}

/**
 * Normalize durable media metadata for write (no bytes).
 */
export function normalizeGardenMediaRecord(input = {}, options = {}) {
  const src = asPlainObject(input) || {};
  const strict = options.strictWrite === true;

  const gardenProfileId = String(src.gardenProfileId || src.garden_profile_id || '').trim();
  const userId = String(src.userId || src.user_id || '').trim();
  if (strict && !gardenProfileId) throw new Error('garden_profile_id_required');
  if (strict && !userId) throw new Error('user_id_required');

  const mimeType = String(src.mimeType || src.mime_type || '')
    .trim()
    .toLowerCase();
  if (strict && !GARDEN_MEDIA_SUPPORTED_MIMES.includes(mimeType)) {
    throw new Error('unsupported_media_mime');
  }

  const byteSize = Number(src.byteSize ?? src.byte_size);
  if (strict && (!Number.isFinite(byteSize) || byteSize <= 0)) {
    throw new Error('byte_size_required');
  }
  if (Number.isFinite(byteSize) && byteSize > GARDEN_MEDIA_MAX_BYTES) {
    throw new Error('media_too_large');
  }

  // Reject accidental base64 / data-URL persistence into metadata
  const forbiddenBlob =
    src.bytes != null ||
    src.base64 != null ||
    src.dataUrl != null ||
    src.data_url != null ||
    (typeof src.storagePath === 'string' && src.storagePath.startsWith('data:'));
  if (forbiddenBlob) throw new Error('raw_image_bytes_forbidden_in_media_record');

  const storageBucket = String(src.storageBucket || src.storage_bucket || GARDEN_MEDIA_STORAGE_BUCKET).trim();
  const storagePath = String(src.storagePath || src.storage_path || '').trim();
  if (strict && !storagePath) throw new Error('storage_path_required');
  if (storageBucket !== GARDEN_MEDIA_STORAGE_BUCKET) {
    // V1: only the private user-garden-media bucket
    if (strict) throw new Error('invalid_storage_bucket');
  }

  const sourceModule = inSet(MEDIA_SOURCE_MODULES, src.sourceModule || src.source_module)
    ? String(src.sourceModule || src.source_module).trim()
    : 'my_garden';
  const purpose = inSet(MEDIA_PURPOSES, src.purpose)
    ? String(src.purpose).trim()
    : 'plant_profile';
  const identitySource = inSet(MEDIA_IDENTITY_SOURCES, src.identitySource || src.identity_source)
    ? String(src.identitySource || src.identity_source).trim()
    : src.gardenPlantId || src.garden_plant_id
      ? 'user_assigned'
      : 'none';
  const identityConfidence = inSet(
    MEDIA_IDENTITY_CONFIDENCE,
    src.identityConfidence || src.identity_confidence
  )
    ? String(src.identityConfidence || src.identity_confidence).trim()
    : identitySource === 'none'
      ? 'none'
      : 'medium';
  const validationState = inSet(MEDIA_VALIDATION_STATES, src.validationState || src.validation_state)
    ? String(src.validationState || src.validation_state).trim()
    : 'validated';

  const gardenPlantId =
    src.gardenPlantId === null || src.garden_plant_id === null
      ? null
      : String(src.gardenPlantId || src.garden_plant_id || '').trim() || null;
  const gardenAreaId =
    src.gardenAreaId === null || src.garden_area_id === null
      ? null
      : String(src.gardenAreaId || src.garden_area_id || '').trim() || null;

  let width = null;
  let height = null;
  if (Number.isFinite(Number(src.width)) && Number(src.width) > 0) width = Math.round(Number(src.width));
  if (Number.isFinite(Number(src.height)) && Number(src.height) > 0) height = Math.round(Number(src.height));

  const contentSha256 = String(src.contentSha256 || src.content_sha256 || '')
    .trim()
    .toLowerCase();
  const shaOk = !contentSha256 || /^[a-f0-9]{64}$/.test(contentSha256);

  const metadata = asPlainObject(src.metadata) || {};
  // Strip any nested byte payloads if present
  delete metadata.base64;
  delete metadata.bytes;
  delete metadata.dataUrl;

  return {
    schema: GARDEN_MEDIA_SCHEMA,
    contractVersion: GARDEN_MEDIA_V1_VERSION,
    userId: userId || null,
    gardenProfileId: gardenProfileId || null,
    gardenPlantId,
    gardenAreaId,
    storageBucket: GARDEN_MEDIA_STORAGE_BUCKET,
    storagePath: storagePath || null,
    mimeType: mimeType || null,
    byteSize: Number.isFinite(byteSize) ? byteSize : null,
    width,
    height,
    sourceModule,
    purpose,
    identitySource,
    identityConfidence,
    validationState,
    contentSha256: shaOk && contentSha256 ? contentSha256 : null,
    capturedAt: src.capturedAt || src.captured_at || null,
    clientInstanceId: String(src.clientInstanceId || src.client_instance_id || '').trim() || null,
    metadata,
    // Explicit non-authorities
    isCatalogImage: false,
    isDesignAsset: false,
    botanicalIdentificationProof: false,
    climateAuthority: false
  };
}

export function buildGardenMediaWritePayload(input = {}) {
  return normalizeGardenMediaRecord(input, { strictWrite: true });
}

/**
 * Same-garden link guards (app-level; DB triggers mirror these).
 */
export function assertMediaPlantSameGarden(input = {}) {
  const mediaGarden = String(input.mediaGardenProfileId || input.media_garden_profile_id || '').trim();
  const plantGarden = String(input.plantGardenProfileId || input.plant_garden_profile_id || '').trim();
  if (!mediaGarden || !plantGarden) throw new Error('garden_ids_required');
  if (mediaGarden !== plantGarden) throw new Error('cross_garden_media_plant_link_forbidden');
  return true;
}

export function assertMediaAreaSameGarden(input = {}) {
  const mediaGarden = String(input.mediaGardenProfileId || input.media_garden_profile_id || '').trim();
  const areaGarden = String(input.areaGardenProfileId || input.area_garden_profile_id || '').trim();
  if (!mediaGarden || !areaGarden) throw new Error('garden_ids_required');
  if (mediaGarden !== areaGarden) throw new Error('cross_garden_media_area_link_forbidden');
  return true;
}

export function assertMediaOwnedByUser(mediaRow, userId) {
  const owner = String(mediaRow?.user_id || mediaRow?.userId || '').trim();
  const uid = String(userId || '').trim();
  if (!owner || !uid || owner !== uid) throw new Error('cross_user_media_access_forbidden');
  return true;
}

/**
 * History rule: new observation = new asset. Never overwrite prior asset id.
 */
export function appendMediaHistory(existingIds = [], newMediaId) {
  const id = String(newMediaId || '').trim();
  if (!id) throw new Error('media_id_required');
  const prev = (existingIds || []).map((x) => String(x)).filter(Boolean);
  if (prev.includes(id)) return prev.slice();
  return [...prev, id];
}

/**
 * Optional soft dedupe hint — identical checksum may reuse storage object,
 * but does NOT block a new observational link/history entry when purpose differs.
 */
export function shouldReuseStorageObjectForChecksum(input = {}) {
  const existing = input.existingMediaRow;
  const sha = String(input.contentSha256 || '').trim().toLowerCase();
  if (!existing || !sha) return false;
  const existingSha = String(existing.content_sha256 || existing.contentSha256 || '').trim().toLowerCase();
  if (!existingSha || existingSha !== sha) return false;
  // Same garden + same bytes → may reuse storage_path; caller still inserts link/history as needed
  return true;
}

/**
 * Deletion semantics (pure policy description for callers/tests).
 */
export const GARDEN_MEDIA_DELETION_POLICY = Object.freeze({
  gardenDelete: 'cascade_delete_media_rows_and_storage_objects',
  plantDeleteOrArchive: 'set_null_garden_plant_id_keep_media_for_garden_history',
  areaDelete: 'set_null_garden_area_id_keep_media',
  mediaDelete: 'delete_db_row_and_storage_object_or_mark_deleted_if_storage_fails',
  orphanStorageForbidden: true
});

/**
 * Stable read model for future Doctor / Identifier / Design / Smart Rec (no personalization).
 */
export function buildGardenMediaReadModel(row = {}) {
  const n = normalizeGardenMediaRecord(row, { strictWrite: false });
  return {
    version: GARDEN_MEDIA_V1_VERSION,
    mediaId: row.id || row.mediaId || null,
    ...n,
    authority: GARDEN_MEDIA_AUTHORITY,
    deletionPolicy: GARDEN_MEDIA_DELETION_POLICY,
    delivery: {
      privateByDefault: true,
      publicBucketForbidden: true,
      signedUrlRequired: true
    }
  };
}

/**
 * Future module contract stubs (no integration executed).
 */
export function buildFutureModuleMediaContracts() {
  return {
    plantDoctor: {
      mayReuseStoredMediaId: true,
      mustReuploadEveryTime: false,
      imageIsTemporaryToday: true
    },
    plantIdentifier: {
      mayPersistScanAsGardenMedia: true,
      identitySourceOnPersist: 'identifier_confirmed',
      notBotanicalGlobalTruth: true
    },
    gardenDesign: {
      mayReferenceGardenMediaAsDesignSource: true,
      purpose: 'design_source',
      neverAutoPromoteToCatalogDesignAsset: true
    },
    smartRecommendations: {
      mayConsumeMediaContextLater: true,
      personalizationStarted: false
    }
  };
}

/** HEIC/HEIF: unsupported in V1 unless stack can normalize (currently cannot safely). */
export function isHeicMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m === 'image/heic' || m === 'image/heif' || m === 'image/heic-sequence';
}

export function rejectUnsupportedMime(mime) {
  const m = String(mime || '').trim().toLowerCase();
  if (isHeicMime(m)) throw new Error('heic_unsupported_in_v1');
  if (!GARDEN_MEDIA_SUPPORTED_MIMES.includes(m)) throw new Error('unsupported_media_mime');
  return m;
}
