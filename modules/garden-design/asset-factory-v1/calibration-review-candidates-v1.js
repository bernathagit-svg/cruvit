/**
 * Locked calibration-batch-1 review-only candidates.
 * Not production Design Assets. Not consumed by Garden Design canvas.
 */
export const CALIBRATION_REVIEW_ONLY = true;
export const CALIBRATION_BATCH_1_RUN_ID = 'design-asset-calibration-batch-1';
export const CALIBRATION_BATCH_1_CACHE_BUST = '20260919d';
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

export const OWNER_VISUAL_QA_FIELDS = Object.freeze([
  'PERSPECTIVE',
  'GROUND_CONTACT',
  'STICKER_LOOK',
  'HALO',
  'SHARPNESS_MATCH',
  'COLOR_TONAL_MATCH',
  'SCALE_REALISM',
  'SILHOUETTE'
]);

export const PROMPT_CORRECTION_BY_FIELD = Object.freeze({
  PERSPECTIVE:
    'Strengthen ground-level / three-quarter camera wording. Keep the camera at planted-bed height, not aerial or flattened catalog view.',
  GROUND_CONTACT:
    'Enforce a natural planted base: the specimen meets soil; no floating cut and no detached pedestal.',
  STICKER_LOOK:
    'Change lighting, detail, and contrast guidance so the specimen matches outdoor ambient light; avoid hard studio rim, plastic sheen, and cutout-card edges.',
  HALO:
    'Remove fringe/halo; the edge must be photographic against transparency, with no glow matte.',
  SHARPNESS_MATCH:
    'Match outdoor photographic sharpness; avoid over-crisp generated microdetail or painterly blur.',
  COLOR_TONAL_MATCH:
    'Match outdoor color/tonal range of a real garden photo; no neon saturation or studio white balance.',
  SCALE_REALISM:
    'Adjust specimen architecture and framing to a planted landscape scale; avoid toy-miniature or giant-hero framing.',
  SILHOUETTE:
    'Keep a botanically typical silhouette for the declared form; do not simplify into a generic bush/tree blob.'
});

export function inGardenQaForSession(uiStatus) {
  return uiStatus === 'REAL_GARDEN_SOURCE_LOADED' ? 'UNKNOWN' : 'INVALID_FOR_THIS_SESSION';
}

export function checkedIssueFields(record) {
  const fields = (record && record.fields) || {};
  return OWNER_VISUAL_QA_FIELDS.filter((field) => fields[field] === true);
}

export function derivePromptCorrectionMap(jobs = []) {
  const byField = {};
  const byPlant = {};
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const fields = Array.isArray(job.checkedFields) ? job.checkedFields : [];
    if (!fields.length) continue;
    byPlant[job.canonicalSlug] = fields.slice();
    for (const field of fields) {
      if (!PROMPT_CORRECTION_BY_FIELD[field]) continue;
      if (!byField[field]) {
        byField[field] = {
          field,
          plantCount: 0,
          slugs: [],
          guidance: PROMPT_CORRECTION_BY_FIELD[field]
        };
      }
      byField[field].plantCount += 1;
      byField[field].slugs.push(job.canonicalSlug);
    }
  }
  return {
    regenerate: false,
    byField,
    byPlant
  };
}

export function buildOwnerFeedbackSummary(state = {}, options = {}) {
  const uiStatus = options.uiStatus || null;
  const inGardenQa = inGardenQaForSession(uiStatus);
  const jobs = CALIBRATION_BATCH_1_CANDIDATES.map((row) => {
    const record = state && state[row.canonicalSlug] ? state[row.canonicalSlug] : null;
    const verdict = record && OWNER_VISUAL_VERDICTS.includes(record.OWNER_VISUAL_QA)
      ? record.OWNER_VISUAL_QA
      : 'UNREVIEWED';
    return {
      canonicalSlug: row.canonicalSlug,
      OWNER_VISUAL_QA: verdict,
      checkedFields: checkedIssueFields(record),
      BOTANICAL_IDENTITY_QA: 'UNKNOWN',
      ASSET_QA: 'UNKNOWN',
      IN_GARDEN_QA: inGardenQa,
      approvalStatus: 'candidate'
    };
  });
  return {
    contract: 'calibration-batch-1-owner-feedback-v1',
    runId: CALIBRATION_BATCH_1_RUN_ID,
    reviewOnly: true,
    storageKey: OWNER_VISUAL_QA_STORAGE_KEY,
    capturedFrom: 'sessionStorage',
    capturedAt: options.capturedAt || null,
    uiStatus: uiStatus || 'UNKNOWN',
    OWNER_VISUAL_QA_VALID: true,
    IN_GARDEN_QA: inGardenQa,
    IN_GARDEN_QA_REASON:
      inGardenQa === 'INVALID_FOR_THIS_SESSION'
        ? 'Real Garden photo was not loaded this session (B/C/D panels had no signed Garden source). Do not score IN_GARDEN_QA PASS/FAIL from black backgrounds.'
        : 'Real Garden photo loaded; IN_GARDEN_QA stays UNKNOWN until a dedicated in-garden pass. Owner visual acceptance is not IN_GARDEN_QA PASS.',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    ASSET_QA: 'UNKNOWN',
    approvalStatus: 'candidate',
    writeProductionRegistry: false,
    jobs,
    promptCorrectionMap: derivePromptCorrectionMap(jobs)
  };
}
