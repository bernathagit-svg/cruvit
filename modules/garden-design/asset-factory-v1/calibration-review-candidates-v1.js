/**
 * Locked calibration-batch-1 review-only candidates.
 * Not production Design Assets. Not consumed by Garden Design canvas.
 */
export const CALIBRATION_REVIEW_ONLY = true;
export const CALIBRATION_BATCH_1_RUN_ID = 'design-asset-calibration-batch-1';
export const CALIBRATION_BATCH_1_CACHE_BUST = '20260919c';
export const CALIBRATION_BATCH_1_DIR = 'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1';
export const CALIBRATION_BATCH_1_LIVE_BASE = 'assets/plants/batch-1-candidates/calibration-batch-1/';

export const OWNER_VISUAL_VERDICTS = Object.freeze(['GOOD', 'NEEDS_BLEND', 'REJECT']);
export const OWNER_VISUAL_QA_STORAGE_KEY = 'cruvit:calibration-batch-1-owner-visual-qa';

export const CALIBRATION_BATCH_1_CANDIDATES = Object.freeze([
  { rank: 1, canonicalSlug: 'mango', file: 'mango-mature-vegetative-v1.png' },
  { rank: 2, canonicalSlug: 'lavender', file: 'lavender-mature-vegetative-v1.png' },
  { rank: 3, canonicalSlug: 'pineapple', file: 'pineapple-mature-vegetative-v1.png' },
  { rank: 4, canonicalSlug: 'banana', file: 'banana-mature-vegetative-v1.png' },
  { rank: 5, canonicalSlug: 'areca-palm', file: 'areca-palm-mature-vegetative-v1.png' },
  { rank: 6, canonicalSlug: 'bougainvillea', file: 'bougainvillea-mature-vegetative-v1.png' },
  { rank: 7, canonicalSlug: 'aloe-vera', file: 'aloe-vera-mature-vegetative-v1.png' },
  { rank: 8, canonicalSlug: 'eggplant', file: 'eggplant-mature-vegetative-v1.png' }
]);

export function calibrationCandidateRepoPath(file) {
  return `${CALIBRATION_BATCH_1_DIR}/${file}`;
}

export function isCalibrationReviewOnlyPath(filePath) {
  const value = String(filePath || '').replace(/\\/g, '/');
  return value.includes('batch-1-candidates/calibration-batch-1/');
}

export function botanicalIdentityQaForCalibrationCandidate() {
  return 'UNKNOWN';
}

export function assetQaForCalibrationCandidate() {
  return 'UNKNOWN';
}

export function emptyOwnerVisualRecord(slug) {
  return {
    canonicalSlug: slug,
    OWNER_VISUAL_QA: null,
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    ASSET_QA: 'UNKNOWN',
    approvalStatus: 'candidate',
    fields: {
      PERSPECTIVE: false,
      GROUND_CONTACT: false,
      STICKER_LOOK: false,
      HALO: false,
      SHARPNESS_MATCH: false,
      COLOR_TONAL_MATCH: false,
      SCALE_REALISM: false,
      SILHOUETTE: false
    }
  };
}

export function loadOwnerVisualQa(storage) {
  try {
    const raw = storage && storage.getItem(OWNER_VISUAL_QA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOwnerVisualQa(storage, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  storage.setItem(OWNER_VISUAL_QA_STORAGE_KEY, JSON.stringify(state || {}));
  return true;
}

export function applyOwnerVisualVerdict(state, slug, verdict) {
  const next = { ...(state || {}) };
  const row = { ...(next[slug] || emptyOwnerVisualRecord(slug)) };
  row.OWNER_VISUAL_QA = OWNER_VISUAL_VERDICTS.includes(verdict) ? verdict : null;
  row.BOTANICAL_IDENTITY_QA = 'UNKNOWN';
  row.ASSET_QA = 'UNKNOWN';
  row.approvalStatus = 'candidate';
  next[slug] = row;
  return next;
}

export function applyOwnerVisualField(state, slug, field, checked) {
  const next = { ...(state || {}) };
  const row = { ...(next[slug] || emptyOwnerVisualRecord(slug)) };
  row.fields = { ...(row.fields || emptyOwnerVisualRecord(slug).fields), [field]: Boolean(checked) };
  row.BOTANICAL_IDENTITY_QA = 'UNKNOWN';
  row.ASSET_QA = 'UNKNOWN';
  row.approvalStatus = 'candidate';
  next[slug] = row;
  return next;
}
