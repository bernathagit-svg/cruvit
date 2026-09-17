/**
 * Garden Media / Images / Identity V1 — pure contracts (no DOM / network / Storage I/O).
 *
 * USER/GARDEN MEDIA authority is distinct from CATALOG plant images.
 * Acquire once → validate → store (object storage) → link → reuse.
 * Do NOT store raw image bytes/base64 in Postgres.
 *
 * CRITICAL: Postgres FK cascade does NOT delete Supabase Storage objects.
 */
import { USER_PRIVATE_MEDIA_STORAGE_BUCKET } from '../catalog-media/garden-design-asset-contract-v1.js';
import { PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES } from '../plant-doctor/plant-doctor-image-mime-v1.js';

export const GARDEN_MEDIA_V1_VERSION = '1.0.0-storage-harden';
export const GARDEN_MEDIA_SCHEMA = 'garden_media_v1';

/** Planned private Supabase Storage bucket — must NOT be public. */
export const GARDEN_MEDIA_STORAGE_BUCKET = USER_PRIVATE_MEDIA_STORAGE_BUCKET; // user-garden-media

export const GARDEN_MEDIA_SUPPORTED_MIMES = PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES;

/** Soft cap for V1 uploads (bytes). */
export const GARDEN_MEDIA_MAX_BYTES = 8 * 1024 * 1024; // 8388608

/**
 * Locked V1 object path (deterministic, owner-scoped):
 *   {user_id}/{garden_profile_id}/{garden_media_id}/{filename}
 * First segment MUST equal authenticated owner (auth.uid).
 * Second segment MUST be a garden_profiles.id owned by that user.
 */
export const GARDEN_MEDIA_STORAGE_PATH_PATTERN =
  '{user_id}/{garden_profile_id}/{garden_media_id}/{filename}';

export const GARDEN_MEDIA_BUCKET_CONFIG = Object.freeze({
  id: 'user-garden-media',
  name: 'user-garden-media',
  public: false,
  file_size_limit: 8388608,
  allowed_mime_types: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
});

/**
 * Mirrors PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1.sql (contract, not applied).
 * V1: SELECT/INSERT/DELETE only — no UPDATE (immutable objects; new observation = new object).
 */
export const GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1 = Object.freeze({
  bucketId: 'user-garden-media',
  public: false,
  anonymousAccess: false,
  allowUpdate: false,
  operations: Object.freeze(['select', 'insert', 'delete']),
  pathChecks: Object.freeze({
    firstSegmentEqualsAuthUid: true,
    secondSegmentMustBeOwnedGardenUuid: true,
    forbidArbitraryGardenIdsUnderUserFolder: true
  })
});

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
  'design_output',
  'progress_photo'
]);

export const MEDIA_IDENTITY_SOURCES = Object.freeze([
  'user_assigned',
  'inherited_from_known_plant_context',
  'identifier_confirmed',
  'doctor_context',
  'uncertain',
  'none'
]);

export const MEDIA_IDENTITY_CONFIDENCE = Object.freeze(['none', 'low', 'medium', 'high']);

export const MEDIA_VALIDATION_STATES = Object.freeze([
  'pending',
  'validated',
  'rejected',
  'deleted',
  'cleanup_pending'
]);

const SAFE_FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inSet(list, value) {
  return list.includes(String(value || '').trim());
}

function asPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

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

export function sanitizeGardenMediaFilename(name, mimeType) {
  const raw = String(name || 'image').trim();
  const base = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'image';
  let out = base.slice(0, 120);
  const mime = String(mimeType || '').toLowerCase();
  const ext =
    mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/jpeg' ? '.jpg' : '';
  if (ext && !out.toLowerCase().endsWith(ext) && !/\.(jpe?g|png|webp)$/i.test(out)) {
    out = `${out}${ext}`;
  }
  if (!SAFE_FILENAME_RE.test(out)) throw new Error('unsafe_media_filename');
  return out;
}

/**
 * Build locked storage object path. mediaId must be known before upload
 * (client-generated UUID recommended, then INSERT with same id).
 */
export function buildGardenMediaStoragePath(input = {}) {
  const userId = String(input.userId || input.user_id || '').trim();
  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  const mediaId = String(input.mediaId || input.garden_media_id || input.id || '').trim();
  const filename = sanitizeGardenMediaFilename(
    input.filename || input.fileName || 'image',
    input.mimeType || input.mime_type
  );
  if (!UUID_RE.test(userId)) throw new Error('user_id_required_uuid');
  if (!UUID_RE.test(gardenProfileId)) throw new Error('garden_profile_id_required_uuid');
  if (!UUID_RE.test(mediaId)) throw new Error('garden_media_id_required_uuid');
  return `${userId}/${gardenProfileId}/${mediaId}/${filename}`;
}

/** Validate path binds to owner + garden + media id (no cross-user prefix). */
export function assertGardenMediaStoragePath(input = {}) {
  const path = String(input.storagePath || input.storage_path || '').trim();
  const userId = String(input.userId || input.user_id || '').trim();
  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  const mediaId = String(input.mediaId || input.garden_media_id || input.id || '').trim();
  if (!path || path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    throw new Error('invalid_storage_path');
  }
  const parts = path.split('/');
  if (parts.length !== 4) throw new Error('storage_path_must_be_owner_garden_media_filename');
  const [pUser, pGarden, pMedia, filename] = parts;
  if (userId && pUser !== userId) throw new Error('storage_path_owner_mismatch');
  if (gardenProfileId && pGarden !== gardenProfileId) throw new Error('storage_path_garden_mismatch');
  if (mediaId && pMedia !== mediaId) throw new Error('storage_path_media_id_mismatch');
  if (!SAFE_FILENAME_RE.test(filename)) throw new Error('unsafe_media_filename');
  return {
    userId: pUser,
    gardenProfileId: pGarden,
    mediaId: pMedia,
    filename,
    storagePath: path,
    firstSegmentIsOwner: true
  };
}

/**
 * Prefix for listing/deleting all objects for one Garden (Storage cleanup).
 * Does NOT delete automatically — app/ops must call Storage API.
 */
export function buildGardenMediaStoragePrefix(userId, gardenProfileId) {
  const u = String(userId || '').trim();
  const g = String(gardenProfileId || '').trim();
  if (!UUID_RE.test(u) || !UUID_RE.test(g)) throw new Error('garden_storage_prefix_ids_required');
  return `${u}/${g}/`;
}

/**
 * STORAGE CLEANUP CONTRACT V1
 * Postgres FK cascade NEVER deletes Supabase Storage objects.
 */
export const GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT = Object.freeze({
  version: '1.0.0',
  postgresFkCascadeDeletesStorageObjects: false,
  orphanStorageObjectsForbidden: true,
  deleteIndividualMediaAsset: Object.freeze({
    preferredSequence: Object.freeze([
      'delete_storage_object',
      'if_success_delete_garden_media_row'
    ]),
    onStorageDeleteFailure: Object.freeze({
      keepGardenMediaRow: true,
      setValidationState: 'cleanup_pending',
      recordCleanupErrorInMetadata: true,
      allowSilentOrphan: false,
      doNotUseDeletedForCleanupFailure: true
    })
  }),
  createMediaAsset: Object.freeze({
    forbiddenNormalFlow: 'upload_object_then_insert_garden_media_row',
    preferredSequence: Object.freeze([
      'client_generate_garden_media_id',
      'insert_garden_media_pending_with_final_storage_path',
      'upload_storage_object',
      'update_validation_state_validated'
    ]),
    onUploadFailure: Object.freeze({
      preferred: 'delete_pending_garden_media_row',
      alternateBoundedState: 'cleanup_pending',
      doNotUseDeletedForUploadFailure: true,
      allowSilentStorageOrphan: false
    })
  }),
  deleteGarden: Object.freeze({
    // Storage first (or concurrent job), then DB cascade of garden_media rows
    preferredSequence: Object.freeze([
      'list_storage_objects_under_user_id_garden_profile_id_prefix',
      'delete_all_listed_storage_objects',
      'delete_garden_profile_row_db_cascades_garden_media_rows'
    ]),
    note: 'DB ON DELETE CASCADE on garden_media does NOT remove Storage objects.'
  }),
  deletePlant: Object.freeze({
    gardenMediaRowRemains: true,
    gardenPlantId: 'SET NULL',
    storageObjectRemains: true
  }),
  deleteArea: Object.freeze({
    gardenMediaRowRemains: true,
    gardenAreaId: 'SET NULL',
    storageObjectRemains: true
  }),
  coverMediaFk: Object.freeze({
    nullable: true,
    onDelete: 'SET NULL',
    circularCascadeSafe: true,
    // plant delete → cover_media_id N/A (plant gone); media.garden_plant_id SET NULL
    // media delete → plants.cover_media_id SET NULL
    sameGardenRequired: true
  })
});

/** @deprecated Prefer GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT — kept for read-model stability. */
export const GARDEN_MEDIA_DELETION_POLICY = Object.freeze({
  gardenDelete:
    'storage_objects_must_be_deleted_explicitly_then_db_cascade_media_rows; FK_alone_does_not_delete_storage',
  plantDeleteOrArchive: 'set_null_garden_plant_id_keep_media_and_object',
  areaDelete: 'set_null_garden_area_id_keep_media_and_object',
  mediaDelete: 'delete_storage_object_then_db_row_or_mark_cleanup_pending_if_storage_fails',
  orphanStorageForbidden: true,
  postgresFkDeletesStorage: false
});

export function normalizeGardenMediaRecord(input = {}, options = {}) {
  const src = asPlainObject(input) || {};
  const strict = options.strictWrite === true;

  const gardenProfileId = String(src.gardenProfileId || src.garden_profile_id || '').trim();
  const userId = String(src.userId || src.user_id || '').trim();
  const mediaId = String(src.id || src.mediaId || src.garden_media_id || '').trim() || null;
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

  const forbiddenBlob =
    src.bytes != null ||
    src.base64 != null ||
    src.dataUrl != null ||
    src.data_url != null ||
    (typeof src.storagePath === 'string' && src.storagePath.startsWith('data:'));
  if (forbiddenBlob) throw new Error('raw_image_bytes_forbidden_in_media_record');

  const storageBucket = String(src.storageBucket || src.storage_bucket || GARDEN_MEDIA_STORAGE_BUCKET).trim();
  let storagePath = String(src.storagePath || src.storage_path || '').trim();
  if (strict && !storagePath && mediaId && userId && gardenProfileId) {
    storagePath = buildGardenMediaStoragePath({
      userId,
      gardenProfileId,
      mediaId,
      filename: src.filename || src.fileName,
      mimeType
    });
  }
  if (strict && !storagePath) throw new Error('storage_path_required');
  if (storagePath) {
    assertGardenMediaStoragePath({
      storagePath,
      userId: userId || undefined,
      gardenProfileId: gardenProfileId || undefined,
      mediaId: mediaId || undefined
    });
  }
  if (storageBucket !== GARDEN_MEDIA_STORAGE_BUCKET && strict) {
    throw new Error('invalid_storage_bucket');
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
  // V1 create default = pending (DB row before Storage upload). Display rows use validated.
  const validationState = inSet(MEDIA_VALIDATION_STATES, src.validationState || src.validation_state)
    ? String(src.validationState || src.validation_state).trim()
    : strict
      ? 'pending'
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
  delete metadata.base64;
  delete metadata.bytes;
  delete metadata.dataUrl;

  return {
    schema: GARDEN_MEDIA_SCHEMA,
    contractVersion: GARDEN_MEDIA_V1_VERSION,
    id: mediaId,
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
    isCatalogImage: false,
    isDesignAsset: false,
    botanicalIdentificationProof: false,
    climateAuthority: false
  };
}

export function buildGardenMediaWritePayload(input = {}) {
  return normalizeGardenMediaRecord(input, { strictWrite: true });
}

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

export function assertCoverMediaSameGarden(input = {}) {
  const plantGarden = String(input.plantGardenProfileId || input.plant_garden_profile_id || '').trim();
  const mediaGarden = String(input.mediaGardenProfileId || input.media_garden_profile_id || '').trim();
  const plantId = String(input.plantId || input.garden_plant_id || '').trim();
  const mediaPlantId = String(input.mediaPlantId || input.media_garden_plant_id || '').trim();
  if (!plantGarden || !mediaGarden) throw new Error('garden_ids_required');
  if (plantGarden !== mediaGarden) throw new Error('cross_garden_cover_media_link_forbidden');
  if (mediaPlantId && plantId && mediaPlantId !== plantId) {
    throw new Error('cover_media_plant_mismatch');
  }
  return true;
}

export function assertMediaOwnedByUser(mediaRow, userId) {
  const owner = String(mediaRow?.user_id || mediaRow?.userId || '').trim();
  const uid = String(userId || '').trim();
  if (!owner || !uid || owner !== uid) throw new Error('cross_user_media_access_forbidden');
  return true;
}

/**
 * Storage RLS mirror (pure): owner folder + owned garden second segment.
 * ownedGardenIds = gardens belonging to auth user (from garden_profiles).
 */
export function assertOwnedGardenStoragePathAccess(input = {}) {
  const authUserId = String(input.authUserId || input.userId || '').trim();
  const ownedGardenIds = new Set(
    (input.ownedGardenIds || input.owned_garden_ids || []).map((x) => String(x).trim()).filter(Boolean)
  );
  const parsed = assertGardenMediaStoragePath({
    storagePath: input.storagePath || input.storage_path || input.name,
    userId: authUserId,
    gardenProfileId: undefined,
    mediaId: undefined
  });
  if (parsed.userId !== authUserId) throw new Error('cross_user_storage_path_denied');
  if (!UUID_RE.test(parsed.gardenProfileId)) throw new Error('storage_path_garden_not_uuid');
  if (!ownedGardenIds.has(parsed.gardenProfileId)) {
    throw new Error('storage_path_garden_not_owned');
  }
  return { ...parsed, ownedGardenVerified: true };
}

/**
 * Preferred V1 create lifecycle — DB authority first, then Storage upload.
 * Forbidden normal flow: upload object → insert garden_media.
 */
export function planCreateMediaAsset(input = {}) {
  const userId = String(input.userId || input.user_id || '').trim();
  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  const mediaId = String(input.mediaId || input.id || '').trim();
  if (!UUID_RE.test(userId) || !UUID_RE.test(gardenProfileId) || !UUID_RE.test(mediaId)) {
    throw new Error('create_media_requires_uuids');
  }
  const storagePath =
    String(input.storagePath || input.storage_path || '').trim() ||
    buildGardenMediaStoragePath({
      userId,
      gardenProfileId,
      mediaId,
      filename: input.filename || input.fileName,
      mimeType: input.mimeType || input.mime_type
    });
  assertGardenMediaStoragePath({ storagePath, userId, gardenProfileId, mediaId });

  return {
    bucket: GARDEN_MEDIA_STORAGE_BUCKET,
    forbiddenNormalFlow: 'upload_object_then_insert_garden_media_row',
    storageObjectUpdateAllowed: false,
    steps: [
      { op: 'client.generate_uuid', as: 'garden_media.id', id: mediaId },
      {
        op: 'db.insert',
        table: 'garden_media',
        id: mediaId,
        storage_path: storagePath,
        validation_state: 'pending'
      },
      { op: 'storage.upload', path: storagePath, onlyIf: 'pending_row_ok' },
      {
        op: 'db.update',
        table: 'garden_media',
        id: mediaId,
        set: { validation_state: 'validated' },
        onlyIf: 'storage_upload_ok'
      }
    ],
    onUploadFailure: {
      preferred: [
        { op: 'storage.remove_if_exists', path: storagePath },
        { op: 'db.delete', table: 'garden_media', id: mediaId }
      ],
      alternateBoundedState: 'cleanup_pending',
      doNotUseValidationState: 'deleted',
      allowSilentStorageOrphan: false
    }
  };
}

/** Pure policy: sequence for deleting one media asset (no I/O). */
export function planDeleteMediaAsset(input = {}) {
  const storagePath = String(input.storagePath || input.storage_path || '').trim();
  const mediaId = String(input.mediaId || input.id || '').trim();
  if (!storagePath || !mediaId) throw new Error('media_delete_requires_path_and_id');
  return {
    bucket: GARDEN_MEDIA_STORAGE_BUCKET,
    storageObjectUpdateAllowed: false,
    steps: [
      { op: 'storage.remove', path: storagePath },
      { op: 'db.delete', table: 'garden_media', id: mediaId, onlyIf: 'storage_remove_ok' }
    ],
    onStorageFailure: {
      op: 'db.update',
      table: 'garden_media',
      id: mediaId,
      set: { validation_state: 'cleanup_pending', metadata_cleanup_error: true }
    },
    postgresFkDeletesStorage: false
  };
}

/** Pure policy: Garden delete must clean Storage before/with DB delete. */
export function planDeleteGardenMediaStorage(input = {}) {
  const userId = String(input.userId || input.user_id || '').trim();
  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  const prefix = buildGardenMediaStoragePrefix(userId, gardenProfileId);
  return {
    bucket: GARDEN_MEDIA_STORAGE_BUCKET,
    prefix,
    steps: [
      { op: 'storage.list', prefix },
      { op: 'storage.remove_all_listed' },
      { op: 'db.delete', table: 'garden_profiles', id: gardenProfileId }
    ],
    note: 'garden_media rows cascade from garden_profiles; Storage objects do NOT.',
    postgresFkDeletesStorage: false
  };
}

export function appendMediaHistory(existingIds = [], newMediaId) {
  const id = String(newMediaId || '').trim();
  if (!id) throw new Error('media_id_required');
  const prev = (existingIds || []).map((x) => String(x)).filter(Boolean);
  if (prev.includes(id)) return prev.slice();
  return [...prev, id];
}

export function shouldReuseStorageObjectForChecksum(input = {}) {
  const existing = input.existingMediaRow;
  const sha = String(input.contentSha256 || '').trim().toLowerCase();
  if (!existing || !sha) return false;
  const existingSha = String(existing.content_sha256 || existing.contentSha256 || '').trim().toLowerCase();
  if (!existingSha || existingSha !== sha) return false;
  return true;
}

export function buildGardenMediaReadModel(row = {}) {
  const n = normalizeGardenMediaRecord(row, { strictWrite: false });
  return {
    version: GARDEN_MEDIA_V1_VERSION,
    mediaId: row.id || row.mediaId || n.id || null,
    ...n,
    authority: GARDEN_MEDIA_AUTHORITY,
    deletionPolicy: GARDEN_MEDIA_DELETION_POLICY,
    storageCleanupContract: GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT,
    pathPattern: GARDEN_MEDIA_STORAGE_PATH_PATTERN,
    bucketConfig: GARDEN_MEDIA_BUCKET_CONFIG,
    storageObjectPolicies: GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1,
    delivery: {
      privateByDefault: true,
      publicBucketForbidden: true,
      signedUrlRequired: true,
      anonymousPublicAccess: false
    }
  };
}

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
