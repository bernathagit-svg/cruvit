/**
 * Calibration review must use the real persisted Garden Design source photo.
 * Never copy private garden_media bytes into the repo. No silent local fallback.
 */
import { GARDEN_MEDIA_STORAGE_BUCKET } from '../../personal-domain/garden-media-v1-contract.js';

export const SAVED_GARDEN_PHOTO_AUTHORITY = Object.freeze({
  designTable: 'garden_designs',
  designColumn: 'source_media_id',
  mediaTable: 'garden_media',
  storageBucket: GARDEN_MEDIA_STORAGE_BUCKET,
  hostLoadFields: Object.freeze(['sourceMediaId', 'sourceMediaUrl']),
  copyToRepo: false,
  networkInFactoryCli: false
});

export const LOCAL_SUPPLEMENTARY_BACKGROUNDS = Object.freeze([
  {
    id: 'hero-garden',
    file: 'homepage-v1/assets/hero-garden.jpg',
    label: 'Representative garden scene (homepage hero)',
    role: 'supplementary'
  },
  {
    id: 'my-garden-snapshot',
    file: 'homepage-v1/assets/my-garden-snapshot.png',
    label: 'My Garden product snapshot',
    role: 'supplementary'
  }
]);

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export function isTemporarySignedGardenMediaUrl(url) {
  const value = asText(url);
  if (!value) return false;
  if (!/^https:\/\//i.test(value)) return false;
  if (/^(file:|data:)/i.test(value)) return false;
  if (value.includes('homepage-v1/assets/')) return false;
  if (value.includes('modules/garden-design/assets/')) return false;
  return true;
}

/**
 * Resolve the required review background from an already-authenticated host load.
 * Does not call Storage. Does not write files. A missing or unsafe URL is BLOCKED.
 */
export function resolveSavedGardenDesignSourcePhoto(input = {}) {
  if (input.copyToRepo === true) {
    return {
      status: 'BLOCKED',
      available: false,
      role: 'required',
      reason: 'copy-to-repo-forbidden',
      sourceMediaId: input.sourceMediaId || null,
      signedUrl: null,
      note: 'Private garden photos must not be copied into the repository.'
    };
  }
  const sourceMediaId = asText(input.sourceMediaId);
  const signedUrl = asText(input.sourceMediaUrl || input.signedUrl);
  if (!sourceMediaId) {
    return {
      status: 'BLOCKED',
      available: false,
      role: 'required',
      reason: 'source_media_id_missing',
      sourceMediaId: null,
      signedUrl: null,
      note: 'garden_designs.source_media_id is required. Local stand-ins are not a substitute.'
    };
  }
  if (!isTemporarySignedGardenMediaUrl(signedUrl)) {
    return {
      status: 'BLOCKED',
      available: false,
      role: 'required',
      reason: signedUrl ? 'signed_url_not_safe' : 'signed_url_missing',
      sourceMediaId,
      signedUrl: null,
      note: 'Use the authenticated host signed URL from garden_media / user-garden-media. Do not fall back to repo files.'
    };
  }
  return {
    status: 'READY',
    available: true,
    role: 'required',
    reason: null,
    sourceMediaId,
    signedUrl,
    storageBucket: SAVED_GARDEN_PHOTO_AUTHORITY.storageBucket,
    copyToRepo: false
  };
}

export function classifyCalibrationReviewReadiness(photo = {}, options = {}) {
  const resolved =
    photo && photo.status
      ? photo
      : resolveSavedGardenDesignSourcePhoto(photo);
  const supplementary = LOCAL_SUPPLEMENTARY_BACKGROUNDS;
  if (resolved.status !== 'READY') {
    return {
      status: 'BLOCKED',
      realSavedGardenPhoto: resolved,
      supplementaryBackgrounds: supplementary,
      sufficientForInGardenQa: false,
      silentLocalFallback: false,
      note: 'IN_GARDEN_QA cannot PASS without the real saved Garden Design source photo. Supplementary local backgrounds are not enough.'
    };
  }
  return {
    status: 'READY',
    realSavedGardenPhoto: resolved,
    supplementaryBackgrounds: supplementary,
    sufficientForInGardenQa: true,
    silentLocalFallback: false,
    injectIntoReview: options.injectIntoReview !== false
  };
}
