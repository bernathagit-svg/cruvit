/**
 * Calibration review host controller. Waits for auth + active garden readiness
 * before resolving the signed Garden source photo. No polling. No generation.
 */
import {
  CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED,
  buildCalibrationSourceInjectMessage,
  summarizeCalibrationSourceForLog
} from './calibration-garden-source-host-v1.js';

export const CALIBRATION_REVIEW_UI_STATUS = Object.freeze({
  LOADING_GARDEN_CONTEXT: 'LOADING_GARDEN_CONTEXT',
  LOADING_GARDEN_PHOTO: 'LOADING_GARDEN_PHOTO',
  REAL_GARDEN_SOURCE_LOADED: 'REAL_GARDEN_SOURCE_LOADED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  NO_ACTIVE_GARDEN: 'NO_ACTIVE_GARDEN',
  DESIGN_SELECTION_REQUIRED: 'DESIGN_SELECTION_REQUIRED',
  SOURCE_PHOTO_UNAVAILABLE: 'SOURCE_PHOTO_UNAVAILABLE',
  SIGNED_URL_FAILED: 'SIGNED_URL_FAILED'
});

export const CALIBRATION_REVIEW_STATUS_LABEL = Object.freeze({
  LOADING_GARDEN_CONTEXT: 'Loading Garden context…',
  LOADING_GARDEN_PHOTO: 'Loading Garden photo…',
  REAL_GARDEN_SOURCE_LOADED: 'Real Garden photo loaded.',
  AUTH_REQUIRED: 'AUTH_REQUIRED — sign in to load the saved Garden photo.',
  NO_ACTIVE_GARDEN: 'NO_ACTIVE_GARDEN — select an active garden.',
  DESIGN_SELECTION_REQUIRED:
    'DESIGN_SELECTION_REQUIRED — select the active Garden Design. Latest is not chosen automatically.',
  SOURCE_PHOTO_UNAVAILABLE: 'SOURCE_PHOTO_UNAVAILABLE — saved Garden Design source photo was not found.',
  SIGNED_URL_FAILED: 'SIGNED_URL_FAILED — could not create a temporary signed URL.'
});

const SOURCE_UNAVAILABLE = new Set([
  'source_media_id_missing',
  'EMPTY_SERVER_DESIGN',
  'SAVED_GARDEN_PHOTO_UNAVAILABLE',
  'copy-to-repo-forbidden'
]);
const SIGNED_URL_FAIL = new Set(['signed_url_missing', 'signed_url_not_safe']);

export function mapCalibrationReviewUiStatus(resolved = {}, readiness = {}) {
  if (resolved && resolved.ok === true && resolved.code === 'READY' && resolved.sourceMediaUrl) {
    return CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED;
  }
  const code = String((resolved && resolved.code) || '');
  if (code === CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED) {
    return CALIBRATION_REVIEW_UI_STATUS.DESIGN_SELECTION_REQUIRED;
  }
  if (SIGNED_URL_FAIL.has(code)) return CALIBRATION_REVIEW_UI_STATUS.SIGNED_URL_FAILED;
  if (SOURCE_UNAVAILABLE.has(code)) return CALIBRATION_REVIEW_UI_STATUS.SOURCE_PHOTO_UNAVAILABLE;
  if (code === 'AUTH_OR_GARDEN_REQUIRED' || code === 'AUTH_REQUIRED') {
    if (readiness.authenticated === true && !readiness.gardenProfileId) {
      return CALIBRATION_REVIEW_UI_STATUS.NO_ACTIVE_GARDEN;
    }
    return CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED;
  }
  if (code === 'NO_ACTIVE_GARDEN') return CALIBRATION_REVIEW_UI_STATUS.NO_ACTIVE_GARDEN;
  if (!code) return CALIBRATION_REVIEW_UI_STATUS.SOURCE_PHOTO_UNAVAILABLE;
  return CALIBRATION_REVIEW_UI_STATUS.SOURCE_PHOTO_UNAVAILABLE;
}

export function createCalibrationReviewHostController(deps = {}) {
  const getReadiness = typeof deps.getReadiness === 'function' ? deps.getReadiness : () => ({ status: 'RESTORING' });
  const loadSource = typeof deps.loadSource === 'function' ? deps.loadSource : async () => ({ ok: false, code: 'SOURCE_PHOTO_UNAVAILABLE' });
  const setStatus = typeof deps.setStatus === 'function' ? deps.setStatus : () => {};
  const injectResolved = typeof deps.injectResolved === 'function' ? deps.injectResolved : () => {};
  let open = false;
  let cachedResolved = null;
  let frameLoaded = false;
  let loadCount = 0;
  let resolvedGardenId = null;
  let inflight = null;
  let uiStatus = null;

  function publish(status, resolved) {
    uiStatus = status;
    setStatus(status, CALIBRATION_REVIEW_STATUS_LABEL[status] || status, resolved || cachedResolved);
    if (resolved) {
      cachedResolved = resolved;
      injectResolved(resolved, status);
    } else {
      injectResolved(cachedResolved || { ok: false, code: status, paidAiCalls: 0, imageGenerationCalls: 0 }, status);
    }
  }

  function injectCacheIfFrameReady() {
    if (!frameLoaded || !cachedResolved) return;
    injectResolved(cachedResolved, uiStatus);
  }

  async function resolveSource() {
    const readiness = getReadiness() || {};
    if (readiness.status !== 'READY' || !readiness.gardenProfileId) return null;
    if (resolvedGardenId && resolvedGardenId === readiness.gardenProfileId && cachedResolved) {
      injectCacheIfFrameReady();
      return cachedResolved;
    }
    if (inflight) return inflight;
    publish(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_PHOTO);
    inflight = (async () => {
      loadCount += 1;
      const resolved = await loadSource(readiness);
      const status = mapCalibrationReviewUiStatus(resolved, readiness);
      resolvedGardenId = readiness.gardenProfileId;
      publish(status, resolved);
      return resolved;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    open() {
      open = true;
      cachedResolved = null;
      resolvedGardenId = null;
      const readiness = getReadiness() || {};
      if (readiness.status === 'READY') {
        return resolveSource();
      }
      if (readiness.status === 'SIGNED_OUT') {
        publish(CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED);
        return null;
      }
      if (readiness.status === 'NO_ACTIVE_GARDEN') {
        publish(CALIBRATION_REVIEW_UI_STATUS.NO_ACTIVE_GARDEN);
        return null;
      }
      publish(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_CONTEXT);
      return null;
    },
    close() {
      open = false;
    },
    noteFrameLoaded() {
      frameLoaded = true;
      injectCacheIfFrameReady();
    },
    onAuthSessionChanged(detail = {}) {
      if (!open) return null;
      if (detail.authenticated === true) {
        const readiness = getReadiness() || {};
        if (readiness.status === 'READY') return resolveSource();
        publish(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_CONTEXT);
        return null;
      }
      const readiness = getReadiness() || {};
      if (readiness.profilesHydrated === true && readiness.status === 'SIGNED_OUT') {
        cachedResolved = null;
        resolvedGardenId = null;
        publish(CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED);
      } else {
        publish(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_CONTEXT);
      }
      return null;
    },
    onGardenContextReady(detail = {}) {
      if (!open) return null;
      if (detail.authenticated !== true) {
        cachedResolved = null;
        resolvedGardenId = null;
        publish(CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED);
        return null;
      }
      if (!detail.gardenProfileId) {
        publish(CALIBRATION_REVIEW_UI_STATUS.NO_ACTIVE_GARDEN);
        return null;
      }
      return resolveSource();
    },
    getState() {
      return {
        open,
        uiStatus,
        loadCount,
        paidAiCalls: cachedResolved ? Number(cachedResolved.paidAiCalls || 0) : 0,
        imageGenerationCalls: 0,
        hasSignedUrl: !!(cachedResolved && cachedResolved.sourceMediaUrl),
        log: summarizeCalibrationSourceForLog(cachedResolved || {}),
        injectMessage: buildCalibrationSourceInjectMessage(cachedResolved || {}, uiStatus)
      };
    }
  };
}

const api = {
  CALIBRATION_REVIEW_UI_STATUS,
  CALIBRATION_REVIEW_STATUS_LABEL,
  mapCalibrationReviewUiStatus,
  createCalibrationReviewHostController
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitCalibrationReviewHost = api;
}
