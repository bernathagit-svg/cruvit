/**
 * Host-authoritative calibration Garden photo. Review harness consumes a
 * temporary signed URL only. No Storage credentials. No persistent URL logs.
 */
import {
  resolveSavedGardenDesignSourcePhoto,
  classifyCalibrationReviewReadiness
} from './garden-photo-review-path-v1.js';
import { GARDEN_MEDIA_SIGNED_URL_TTL_SEC } from '../../personal-domain/garden-media-v1-runtime.js';
import { MULTIPLE_DESIGNS_REQUIRE_SELECTION } from '../garden-design-owned-garden-v1.js';

export const CALIBRATION_GARDEN_SOURCE_VERSION = '1.0.0';
export const CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED = 'CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED';
export const CALIBRATION_SOURCE_MESSAGE_TYPE = 'cruvit:calibration-garden-source';
export const CALIBRATION_REVIEW_LIVE_PATH = 'modules/garden-design/calibration-review.html';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export function summarizeCalibrationSourceForLog(resolved = {}) {
  return {
    ok: resolved.ok === true,
    code: resolved.code || null,
    hasDesignId: Boolean(resolved.designId),
    hasSourceMediaId: Boolean(resolved.sourceMediaId),
    hasSignedUrl: Boolean(resolved.sourceMediaUrl),
    paidAiCalls: Number(resolved.paidAiCalls || 0),
    imageGenerationCalls: 0
  };
}

export function resolveCalibrationGardenSourceFromLoad(loadResult = {}) {
  const paidAiCalls = Number(loadResult.paidAiCalls || 0);
  const base = {
    ok: false,
    paidAiCalls,
    imageGenerationCalls: 0,
    designId: loadResult.designId || null,
    gardenProfileId: loadResult.gardenProfileId || null,
    gardenAreaId: loadResult.gardenAreaId || null,
    sourceMediaId: null,
    sourceMediaUrl: null,
    signedUrlExpiresSec: GARDEN_MEDIA_SIGNED_URL_TTL_SEC,
    copyToRepo: false
  };

  if (loadResult.code === MULTIPLE_DESIGNS_REQUIRE_SELECTION || loadResult.silentLatestForbidden === true) {
    return {
      ...base,
      code: CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED,
      designIds: loadResult.designIds || [],
      silentLatestForbidden: true,
      note: 'More than one Garden Design exists. Use the currently selected design or pick one. Do not guess latest.'
    };
  }
  if (loadResult.code === 'AUTH_OR_GARDEN_REQUIRED' || loadResult.ok === false && loadResult.code === 'AUTH_OR_GARDEN_REQUIRED') {
    return { ...base, code: 'AUTH_OR_GARDEN_REQUIRED' };
  }
  if (loadResult.ok === false) {
    return { ...base, code: loadResult.code || 'LOAD_FAILED' };
  }
  if (loadResult.code === 'EMPTY_SERVER_DESIGN') {
    return {
      ...base,
      code: 'EMPTY_SERVER_DESIGN',
      note: 'No persisted Garden Design in this garden/area.'
    };
  }
  if (loadResult.code !== 'LOADED') {
    return { ...base, code: loadResult.code || 'LOAD_FAILED' };
  }

  const photo = resolveSavedGardenDesignSourcePhoto({
    sourceMediaId: loadResult.sourceMediaId,
    sourceMediaUrl: loadResult.sourceMediaUrl,
    copyToRepo: false
  });
  if (photo.status !== 'READY') {
    return {
      ...base,
      code: photo.reason || 'SAVED_GARDEN_PHOTO_UNAVAILABLE',
      sourceMediaId: photo.sourceMediaId,
      note: photo.note
    };
  }
  return {
    ...base,
    ok: true,
    code: 'READY',
    designId: loadResult.designId,
    sourceMediaId: photo.sourceMediaId,
    sourceMediaUrl: photo.signedUrl,
    readiness: classifyCalibrationReviewReadiness(photo)
  };
}

export async function loadCalibrationGardenSourcePhoto(loadDesignFn, payload = {}) {
  if (typeof loadDesignFn !== 'function') {
    return resolveCalibrationGardenSourceFromLoad({ ok: false, code: 'PERSISTENCE_UNAVAILABLE', paidAiCalls: 0 });
  }
  const loaded = await loadDesignFn({
    gardenAreaId: payload.gardenAreaId == null ? null : payload.gardenAreaId,
    cachedDesignId: payload.cachedDesignId || null,
    explicitDesignId: payload.explicitDesignId || payload.designId || null
  });
  return resolveCalibrationGardenSourceFromLoad(loaded);
}

export function buildCalibrationSourceInjectMessage(resolved = {}, uiStatus = null) {
  return {
    type: CALIBRATION_SOURCE_MESSAGE_TYPE,
    ok: resolved.ok === true,
    code: resolved.code || null,
    uiStatus: uiStatus || resolved.uiStatus || null,
    designId: resolved.designId || null,
    sourceMediaId: resolved.sourceMediaId || null,
    sourceMediaUrl: resolved.ok === true ? resolved.sourceMediaUrl || null : null,
    paidAiCalls: 0,
    imageGenerationCalls: 0
  };
}

export function applyCalibrationSourceToReviewDocument(doc, sourceMediaUrl) {
  if (!doc) return { applied: false, reason: 'document_missing' };
  const url = asText(sourceMediaUrl);
  if (!/^https:\/\//i.test(url)) return { applied: false, reason: 'signed_url_missing' };
  const scenes = doc.querySelectorAll ? doc.querySelectorAll('.scene.real') : [];
  scenes.forEach((el) => {
    el.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
    el.classList.remove('is-blocked');
    const ghost = el.querySelector('.ghost');
    if (ghost) ghost.classList.remove('blocked');
  });
  const banner = doc.getElementById ? doc.getElementById('realGardenBanner') : null;
  if (banner) {
    banner.className = 'ok';
    banner.textContent =
      'Real saved Garden Design source photo loaded via temporary signed URL. Bytes were not copied into the repo.';
  }
  doc.querySelectorAll &&
    doc.querySelectorAll('[data-in-garden-status]').forEach((el) => {
      el.setAttribute('data-in-garden-status', 'UNKNOWN');
      if (el.classList.contains('empty')) {
        el.textContent = String(el.textContent || '').replace(/IN_GARDEN_QA = BLOCKED/, 'IN_GARDEN_QA = UNKNOWN');
      }
    });
  return { applied: true, sceneCount: scenes.length };
}

const api = {
  CALIBRATION_GARDEN_SOURCE_VERSION,
  CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED,
  CALIBRATION_SOURCE_MESSAGE_TYPE,
  CALIBRATION_REVIEW_LIVE_PATH,
  summarizeCalibrationSourceForLog,
  resolveCalibrationGardenSourceFromLoad,
  loadCalibrationGardenSourcePhoto,
  buildCalibrationSourceInjectMessage,
  applyCalibrationSourceToReviewDocument
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitCalibrationGardenSource = api;
}
