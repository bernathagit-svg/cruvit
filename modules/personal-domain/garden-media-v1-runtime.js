/**
 * Garden Media V1 runtime — create / signed delivery / delete.
 * Pure I/O helpers + orchestration. No Identifier / Design / Smart Rec.
 *
 * Create lifecycle (locked):
 *   generate id → insert pending → upload → mark validated → optional cover
 * Never upload-first. Never store base64 in Postgres.
 */
import {
  sniffImageMimeFromBase64,
  PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES
} from '../plant-doctor/plant-doctor-image-mime-v1.js';
import {
  GARDEN_MEDIA_STORAGE_BUCKET,
  GARDEN_MEDIA_MAX_BYTES,
  GARDEN_MEDIA_SUPPORTED_MIMES,
  buildGardenMediaStoragePath,
  sanitizeGardenMediaFilename,
  planCreateMediaAsset,
  planDeleteMediaAsset,
  isHeicMime,
  rejectUnsupportedMime,
  mayPromoteUserMediaToCatalogImage
} from './garden-media-v1-contract.js';

export const GARDEN_MEDIA_SIGNED_URL_TTL_SEC = 3600;

const MEDIA_ROW_SELECT =
  'id,garden_profile_id,user_id,garden_plant_id,garden_area_id,storage_bucket,storage_path,mime_type,byte_size,width,height,source_module,purpose,identity_source,identity_confidence,validation_state,content_sha256,captured_at,metadata,client_instance_id,created_at,updated_at';

/** @type {Map<string, { url: string, expiresAt: number }>} */
const signedUrlCache = new Map();

export function clearGardenMediaSignedUrlCache() {
  signedUrlCache.clear();
}

/**
 * Sniff MIME from File magic bytes (do not trust extension alone).
 */
export async function sniffImageMimeFromFile(file) {
  if (!file || typeof file.slice !== 'function') return null;
  const name = String(file.name || '').toLowerCase();
  const declared = String(file.type || '').toLowerCase();
  if (isHeicMime(declared) || /\.(heic|heif)$/.test(name)) {
    const err = new Error('heic_unsupported_in_v1');
    err.code = 'HEIC_UNSUPPORTED';
    throw err;
  }
  const buf = await file.slice(0, 32).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let b64;
  if (typeof btoa === 'function') {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    b64 = btoa(s);
  } else if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(bytes).toString('base64');
  } else {
    return null;
  }
  return sniffImageMimeFromBase64(b64);
}

/**
 * Validate file for Garden Media V1 upload. Returns { mimeType, byteSize, filename }.
 */
export async function validateGardenMediaFile(file) {
  if (!file) throw Object.assign(new Error('file_required'), { code: 'FILE_REQUIRED' });
  const byteSize = Number(file.size);
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw Object.assign(new Error('byte_size_required'), { code: 'BYTE_SIZE_REQUIRED' });
  }
  if (byteSize > GARDEN_MEDIA_MAX_BYTES) {
    throw Object.assign(new Error('media_too_large'), { code: 'MEDIA_TOO_LARGE' });
  }
  const declared = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (isHeicMime(declared) || /\.(heic|heif)$/.test(name)) {
    throw Object.assign(new Error('heic_unsupported_in_v1'), { code: 'HEIC_UNSUPPORTED' });
  }
  let sniffed;
  try {
    sniffed = await sniffImageMimeFromFile(file);
  } catch (err) {
    if (err?.code === 'HEIC_UNSUPPORTED') throw err;
    sniffed = null;
  }
  const mimeType = sniffed || declared;
  try {
    rejectUnsupportedMime(mimeType);
  } catch (err) {
    throw Object.assign(new Error(err.message || 'unsupported_media_mime'), {
      code: 'UNSUPPORTED_MIME',
      declared,
      sniffed
    });
  }
  // Prefer sniffed bytes over declared label when both present and disagree
  const finalMime = sniffed || mimeType;
  if (!GARDEN_MEDIA_SUPPORTED_MIMES.includes(finalMime)) {
    throw Object.assign(new Error('unsupported_media_mime'), { code: 'UNSUPPORTED_MIME' });
  }
  if (declared && sniffed && declared !== sniffed && !declared.startsWith('image/')) {
    throw Object.assign(new Error('mime_mismatch_rejected'), {
      code: 'MIME_MISMATCH',
      declared,
      sniffed
    });
  }
  // Reject clearly wrong declared types (e.g. application/pdf) even if sniff somehow fails
  if (declared && declared !== finalMime && !PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES.includes(declared) && declared !== 'image/jpg') {
    if (declared.startsWith('application/') || declared === 'image/gif' || declared === 'image/svg+xml') {
      throw Object.assign(new Error('mime_mismatch_rejected'), {
        code: 'MIME_MISMATCH',
        declared,
        sniffed
      });
    }
  }
  return {
    mimeType: finalMime,
    byteSize,
    filename: sanitizeGardenMediaFilename(file.name || 'photo', finalMime)
  };
}

function newMediaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto_random_uuid_unavailable');
}

/**
 * Preferred create lifecycle. Never upload-first.
 */
export async function createGardenMediaForPlant(input = {}) {
  const {
    supabase,
    userId,
    gardenProfileId,
    gardenPlantId = null,
    gardenAreaId = null,
    file,
    setAsCover = true,
    sourceModule = 'my_garden',
    purpose = 'plant_profile'
  } = input;

  if (!supabase) throw new Error('supabase_required');
  if (!userId || !gardenProfileId) throw new Error('user_and_garden_required');
  if (mayPromoteUserMediaToCatalogImage()) throw new Error('catalog_promotion_forbidden');

  const validated = await validateGardenMediaFile(file);
  const mediaId = String(input.mediaId || '').trim() || newMediaId();
  const storagePath = buildGardenMediaStoragePath({
    userId,
    gardenProfileId,
    mediaId,
    filename: validated.filename,
    mimeType: validated.mimeType
  });

  // Contract plan (for tests / observability)
  const plan = planCreateMediaAsset({
    userId,
    gardenProfileId,
    mediaId,
    storagePath,
    mimeType: validated.mimeType
  });

  const row = {
    id: mediaId,
    garden_profile_id: gardenProfileId,
    user_id: userId,
    garden_plant_id: gardenPlantId || null,
    garden_area_id: gardenAreaId || null,
    storage_bucket: GARDEN_MEDIA_STORAGE_BUCKET,
    storage_path: storagePath,
    mime_type: validated.mimeType,
    byte_size: validated.byteSize,
    source_module: sourceModule,
    purpose,
    identity_source: gardenPlantId ? 'user_assigned' : 'none',
    identity_confidence: gardenPlantId ? 'medium' : 'none',
    validation_state: 'pending',
    metadata: {},
    captured_at: new Date().toISOString()
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('garden_media')
    .insert(row)
    .select(MEDIA_ROW_SELECT)
    .single();
  if (insertErr) throw insertErr;

  try {
    const { error: uploadErr } = await supabase.storage
      .from(GARDEN_MEDIA_STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: validated.mimeType,
        upsert: false,
        cacheControl: '3600'
      });
    if (uploadErr) throw Object.assign(new Error(uploadErr.message || 'storage_upload_failed'), { cause: uploadErr });

    const { data: validatedRow, error: updateErr } = await supabase
      .from('garden_media')
      .update({ validation_state: 'validated', updated_at: new Date().toISOString() })
      .eq('id', mediaId)
      .select(MEDIA_ROW_SELECT)
      .single();
    if (updateErr) throw updateErr;

    if (setAsCover && gardenPlantId) {
      const { error: coverErr } = await supabase
        .from('garden_plants')
        .update({ cover_media_id: mediaId })
        .eq('id', gardenPlantId)
        .eq('garden_profile_id', gardenProfileId);
      if (coverErr) throw coverErr;
    }

    return {
      media: validatedRow || { ...inserted, validation_state: 'validated' },
      storagePath,
      plan,
      coverSet: !!(setAsCover && gardenPlantId)
    };
  } catch (uploadFailure) {
    // Cleanup: remove partial object + pending row (or cleanup_pending)
    try {
      await supabase.storage.from(GARDEN_MEDIA_STORAGE_BUCKET).remove([storagePath]);
    } catch (_) {
      /* best effort */
    }
    const { error: delErr } = await supabase.from('garden_media').delete().eq('id', mediaId);
    if (delErr) {
      await supabase
        .from('garden_media')
        .update({
          validation_state: 'cleanup_pending',
          metadata: { cleanup_error: true, reason: 'upload_failed', message: String(uploadFailure?.message || uploadFailure) },
          updated_at: new Date().toISOString()
        })
        .eq('id', mediaId);
      const err = new Error('upload_failed_cleanup_pending');
      err.code = 'CLEANUP_PENDING';
      err.cause = uploadFailure;
      throw err;
    }
    throw uploadFailure;
  }
}

export async function listGardenMediaForPlant(input = {}) {
  const { supabase, gardenProfileId, gardenPlantId, includePending = false } = input;
  if (!supabase || !gardenProfileId || !gardenPlantId) return [];
  let q = supabase
    .from('garden_media')
    .select(MEDIA_ROW_SELECT)
    .eq('garden_profile_id', gardenProfileId)
    .eq('garden_plant_id', gardenPlantId)
    .order('created_at', { ascending: false });
  if (!includePending) {
    q = q.eq('validation_state', 'validated');
  } else {
    q = q.in('validation_state', ['validated', 'pending', 'cleanup_pending']);
  }
  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getGardenMediaSignedUrl(input = {}) {
  const { supabase, storagePath, mediaId = null, ttlSec = GARDEN_MEDIA_SIGNED_URL_TTL_SEC } = input;
  if (!supabase || !storagePath) throw new Error('signed_url_requires_client_and_path');
  const cacheKey = mediaId || storagePath;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) {
    return { signedUrl: cached.url, fromCache: true, expiresAt: cached.expiresAt };
  }
  const { data, error } = await supabase.storage
    .from(GARDEN_MEDIA_STORAGE_BUCKET)
    .createSignedUrl(storagePath, ttlSec);
  if (error) throw error;
  const url = data?.signedUrl || '';
  if (!url) throw new Error('signed_url_empty');
  const expiresAt = now + ttlSec * 1000;
  signedUrlCache.set(cacheKey, { url, expiresAt });
  return { signedUrl: url, fromCache: false, expiresAt };
}

/**
 * Delete Storage object first, then DB row. On Storage failure → cleanup_pending.
 */
export async function deleteGardenMediaAsset(input = {}) {
  const { supabase, mediaRow, gardenProfileId } = input;
  if (!supabase || !mediaRow?.id || !mediaRow?.storage_path) {
    throw new Error('media_delete_requires_row');
  }
  const plan = planDeleteMediaAsset({
    mediaId: mediaRow.id,
    storagePath: mediaRow.storage_path
  });

  const { error: removeErr } = await supabase.storage
    .from(GARDEN_MEDIA_STORAGE_BUCKET)
    .remove([mediaRow.storage_path]);
  if (removeErr) {
    await supabase
      .from('garden_media')
      .update({
        validation_state: 'cleanup_pending',
        metadata: {
          ...(mediaRow.metadata && typeof mediaRow.metadata === 'object' ? mediaRow.metadata : {}),
          cleanup_error: true,
          reason: 'storage_delete_failed',
          message: String(removeErr.message || removeErr)
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', mediaRow.id);
    const err = new Error('storage_delete_failed_cleanup_pending');
    err.code = 'CLEANUP_PENDING';
    err.cause = removeErr;
    throw err;
  }

  const { error: delErr } = await supabase.from('garden_media').delete().eq('id', mediaRow.id);
  if (delErr) throw delErr;

  signedUrlCache.delete(mediaRow.id);
  signedUrlCache.delete(mediaRow.storage_path);

  // cover_media_id SET NULL via FK; optionally promote next photo
  if (gardenProfileId && mediaRow.garden_plant_id) {
    const remaining = await listGardenMediaForPlant({
      supabase,
      gardenProfileId,
      gardenPlantId: mediaRow.garden_plant_id
    });
    if (remaining[0]) {
      await supabase
        .from('garden_plants')
        .update({ cover_media_id: remaining[0].id })
        .eq('id', mediaRow.garden_plant_id)
        .eq('garden_profile_id', gardenProfileId)
        .eq('cover_media_id', mediaRow.id);
    }
  }

  return { ok: true, plan };
}

export async function setPlantCoverMedia(input = {}) {
  const { supabase, gardenProfileId, gardenPlantId, mediaId } = input;
  if (!supabase || !gardenProfileId || !gardenPlantId) throw new Error('cover_requires_ids');
  const { error } = await supabase
    .from('garden_plants')
    .update({ cover_media_id: mediaId || null })
    .eq('id', gardenPlantId)
    .eq('garden_profile_id', gardenProfileId);
  if (error) throw error;
  return true;
}

export async function resolveCoverSignedUrlForPlant(input = {}) {
  const { supabase, coverMediaId } = input;
  if (!supabase || !coverMediaId) return '';
  const cached = signedUrlCache.get(coverMediaId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;

  const { data, error } = await supabase
    .from('garden_media')
    .select('id,storage_path,validation_state')
    .eq('id', coverMediaId)
    .maybeSingle();
  if (error || !data || data.validation_state !== 'validated') return '';
  const signed = await getGardenMediaSignedUrl({
    supabase,
    storagePath: data.storage_path,
    mediaId: data.id
  });
  return signed.signedUrl;
}

export function gardenMediaUserErrorMessage(err) {
  const code = err?.code || '';
  const msg = String(err?.message || err || '');
  if (code === 'HEIC_UNSUPPORTED' || /heic/i.test(msg)) {
    return 'HEIC photos are not supported. Please use JPEG, PNG, or WebP.';
  }
  if (code === 'MEDIA_TOO_LARGE' || /media_too_large/i.test(msg)) {
    return 'This photo is larger than 8 MB. Please choose a smaller image.';
  }
  if (code === 'UNSUPPORTED_MIME' || code === 'MIME_MISMATCH' || /unsupported_media_mime|mime_mismatch/i.test(msg)) {
    return 'Please use a JPEG, PNG, or WebP image.';
  }
  if (code === 'CLEANUP_PENDING') {
    return 'Upload or cleanup did not finish cleanly. Please try again.';
  }
  return 'Could not save this photo. Please try another image.';
}
