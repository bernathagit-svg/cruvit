/**
 * Locked calibration-batch-1 review-only candidates.
 * Not production Design Assets. Not consumed by Garden Design canvas.
 */
export const CALIBRATION_REVIEW_ONLY = true;
export const CALIBRATION_BATCH_1_RUN_ID = 'design-asset-calibration-batch-1';
export const CALIBRATION_BATCH_1_CACHE_BUST = '20260919k';
export const CALIBRATION_BATCH_1_DIR = 'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1';
export const CALIBRATION_BATCH_1_LIVE_BASE = 'assets/plants/batch-1-candidates/calibration-batch-1/';

export const OWNER_VISUAL_VERDICTS = Object.freeze(['GOOD', 'NEEDS_BLEND', 'REJECT']);
export const OWNER_VISUAL_QA_STORAGE_KEY = 'cruvit:calibration-batch-1-owner-visual-qa';
export const LEARNING_CLASS_STORAGE_KEY = 'cruvit:calibration-batch-1-learning-class';
export const LEARNING_EXPORT_STORAGE_KEY = 'cruvit:calibration-batch-1-round-1-learning';
export const LEARNING_CLASSES = Object.freeze(['BLEND_SOLVABLE', 'REGEN_REQUIRED', 'REJECT_IDENTITY']);
export const COMPOSITION_V2_CLASSES = Object.freeze(['RUNTIME_SCALE_SOLVABLE', 'RUNTIME_SOLVABLE', 'REGEN_REQUIRED']);

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
    ROUND_1_CLASS: null,
    COMPOSITION_V2_CLASS: null,
    TREE_SCALE_MULTIPLIER: null,
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
    'Do not try to solve sticker-look only in the prompt. Keep runtime integration (contact shadow, tonal adaptation, edge softening) as a separate responsibility.',
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
      candidateAssetId: row.file.replace(/\.png$/i, ''),
      OWNER_VISUAL_QA: verdict,
      checkedFields: checkedIssueFields(record),
      ROUND_1_CLASS: (record && record.ROUND_1_CLASS) || null,
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

export function applyLearningClass(state, slug, klass) {
  return applyRound1Class(state, slug, klass);
}

export function applyRound1Class(state, slug, klass) {
  const next = { ...(state || {}) };
  const row = { ...(next[slug] || emptyOwnerVisualRecord(slug)) };
  row.ROUND_1_CLASS = LEARNING_CLASSES.includes(klass) ? klass : null;
  row.BOTANICAL_IDENTITY_QA = 'UNKNOWN';
  row.ASSET_QA = 'UNKNOWN';
  row.approvalStatus = 'candidate';
  next[slug] = row;
  return next;
}

export function applyCompositionV2Class(state, slug, klass) {
  const next = { ...(state || {}) };
  const row = { ...(next[slug] || emptyOwnerVisualRecord(slug)) };
  row.COMPOSITION_V2_CLASS = COMPOSITION_V2_CLASSES.includes(klass) ? klass : null;
  row.BOTANICAL_IDENTITY_QA = 'UNKNOWN';
  row.ASSET_QA = 'UNKNOWN';
  row.approvalStatus = 'candidate';
  next[slug] = row;
  return next;
}

export function applyTreeScaleMultiplier(state, slug, value) {
  const next = { ...(state || {}) };
  const row = { ...(next[slug] || emptyOwnerVisualRecord(slug)) };
  const n = Number(value);
  row.TREE_SCALE_MULTIPLIER = Number.isFinite(n) ? n : null;
  row.approvalStatus = 'candidate';
  next[slug] = row;
  return next;
}

export function computeIssueFrequencies(state = {}) {
  const jobs = CALIBRATION_BATCH_1_CANDIDATES.map((row) => {
    const record = state && state[row.canonicalSlug] ? state[row.canonicalSlug] : null;
    return {
      canonicalSlug: row.canonicalSlug,
      checkedFields: checkedIssueFields(record)
    };
  });
  const counts = {};
  for (const field of OWNER_VISUAL_QA_FIELDS) {
    counts[field] = jobs.filter((job) => job.checkedFields.includes(field)).length;
  }
  const frequencies = {};
  for (const field of OWNER_VISUAL_QA_FIELDS) {
    frequencies[field] = counts[field] + '/8';
  }
  return { counts, frequencies, jobs };
}

export function reconcileOwnerFeedbackIntegrity(state = {}) {
  const summaryJobs = buildOwnerFeedbackSummary(state, { uiStatus: null }).jobs;
  const reviewed = summaryJobs.filter((job) => job.OWNER_VISUAL_QA !== 'UNREVIEWED');
  const computed = computeIssueFrequencies(state);
  const mismatches = [];
  for (const field of OWNER_VISUAL_QA_FIELDS) {
    const fromJobs = summaryJobs.filter((job) => job.checkedFields.includes(field)).length;
    if (fromJobs !== computed.counts[field]) {
      mismatches.push({ field, fromJobs, computed: computed.counts[field] });
    }
  }
  const missing = CALIBRATION_BATCH_1_CANDIDATES.filter((row) => {
    const rec = state && state[row.canonicalSlug];
    return !rec || !OWNER_VISUAL_VERDICTS.includes(rec.OWNER_VISUAL_QA);
  }).map((row) => row.canonicalSlug);
  const ok = missing.length === 0 && mismatches.length === 0 && reviewed.length === 8;
  return {
    ok,
    code: ok ? 'OWNER_FEEDBACK_INTEGRITY_OK' : 'OWNER_FEEDBACK_INTEGRITY_FAILED',
    missing,
    mismatches,
    reviewedCount: reviewed.length,
    frequencies: computed.frequencies,
    counts: computed.counts,
    jobs: summaryJobs.map((job) => ({
      canonicalSlug: job.canonicalSlug,
      candidateAssetId: job.candidateAssetId,
      OWNER_VISUAL_QA: job.OWNER_VISUAL_QA,
      checkedFields: job.checkedFields,
      ROUND_1_CLASS: (state[job.canonicalSlug] && state[job.canonicalSlug].ROUND_1_CLASS) || null
    }))
  };
}

export function buildRound1FinalSnapshot(state = {}, options = {}) {
  const integrity = reconcileOwnerFeedbackIntegrity(state);
  const capturedAt = options.capturedAt || new Date().toISOString();
  const inGardenQa = inGardenQaForSession(options.uiStatus);
  return {
    contract: 'owner-feedback-round-1-final',
    runId: CALIBRATION_BATCH_1_RUN_ID,
    storageKey: OWNER_VISUAL_QA_STORAGE_KEY,
    capturedFrom: 'sessionStorage',
    capturedAt,
    integrity: integrity.code,
    integrityOk: integrity.ok,
    frequencies: integrity.frequencies,
    approvedAssets: 0,
    writeProductionRegistry: false,
    regenerate: false,
    promptFactoryV2Finalized: false,
    jobs: CALIBRATION_BATCH_1_CANDIDATES.map((row) => {
      const record = state && state[row.canonicalSlug] ? state[row.canonicalSlug] : null;
      const summary = integrity.jobs.find((job) => job.canonicalSlug === row.canonicalSlug);
      return {
        runId: CALIBRATION_BATCH_1_RUN_ID,
        assetId: row.file.replace(/\.png$/i, ''),
        canonicalSlug: row.canonicalSlug,
        ownerVerdict: (summary && summary.OWNER_VISUAL_QA) || 'UNREVIEWED',
        checkedIssues: (summary && summary.checkedFields) || [],
        timestamp: capturedAt,
        botanicalQaStatus: 'UNKNOWN',
        assetQaStatus: 'UNKNOWN',
        inGardenQaStatus: inGardenQa,
        ROUND_1_CLASS: (record && record.ROUND_1_CLASS) || null,
        approvalStatus: 'candidate'
      };
    })
  };
}

export function derivePromptFactoryV2Learning(state = {}) {
  const integrity = reconcileOwnerFeedbackIntegrity(state);
  if (!integrity.ok) {
    return {
      finalized: false,
      code: 'OWNER_FEEDBACK_INTEGRITY_FAILED',
      regenerate: false,
      generationCorrections: [],
      runtimeIntegration: [],
      identityGates: []
    };
  }
  const classified = integrity.jobs.filter((job) => LEARNING_CLASSES.includes(job.ROUND_1_CLASS));
  if (classified.length !== 8) {
    return {
      finalized: false,
      code: 'OWNER_CLASSIFICATION_PENDING',
      regenerate: false,
      generationCorrections: [],
      runtimeIntegration: [],
      identityGates: []
    };
  }
  return {
    finalized: true,
    code: 'PROMPT_FACTORY_V2_LEARNING_READY',
    regenerate: false,
    generationCorrections: integrity.jobs
      .filter((job) => job.ROUND_1_CLASS === 'REGEN_REQUIRED')
      .map((job) => ({ canonicalSlug: job.canonicalSlug, checkedFields: job.checkedFields })),
    runtimeIntegration: integrity.jobs
      .filter((job) => job.ROUND_1_CLASS === 'BLEND_SOLVABLE')
      .map((job) => ({ canonicalSlug: job.canonicalSlug, checkedFields: job.checkedFields })),
    identityGates: integrity.jobs
      .filter((job) => job.ROUND_1_CLASS === 'REJECT_IDENTITY')
      .map((job) => ({ canonicalSlug: job.canonicalSlug, checkedFields: job.checkedFields }))
  };
}

export const ROUND_1_OWNER_FREQUENCIES = Object.freeze({
  STICKER_LOOK: '8/8',
  SILHOUETTE: '8/8',
  PERSPECTIVE: '7/8',
  SCALE_REALISM: '7/8',
  SHARPNESS_MATCH: '6/8',
  GROUND_CONTACT: '1/8',
  HALO: '1/8',
  COLOR_TONAL_MATCH: '1/8'
});

export function exportCalibrationRound1Learning(state = {}, options = {}) {
  const summary = buildOwnerFeedbackSummary(state, options);
  const integrity = reconcileOwnerFeedbackIntegrity(state);
  return {
    contract: 'calibration-round-1-learning-v1',
    runId: CALIBRATION_BATCH_1_RUN_ID,
    source: 'sessionStorage',
    storageKey: OWNER_VISUAL_QA_STORAGE_KEY,
    capturedFrom: 'sessionStorage',
    capturedAt: options.capturedAt || null,
    approvedAssets: 0,
    integrity: integrity.code,
    everyAssetVerdict: summary.jobs.every((job) => job.OWNER_VISUAL_QA === 'NEEDS_BLEND')
      ? 'NEEDS_BLEND'
      : null,
    frequencies: integrity.frequencies,
    IN_GARDEN_QA: summary.IN_GARDEN_QA,
    IN_GARDEN_QA_ALIAS: summary.IN_GARDEN_QA === 'INVALID_FOR_THIS_SESSION' ? 'NOT_RUN' : summary.IN_GARDEN_QA,
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    ASSET_QA: 'UNKNOWN',
    writeProductionRegistry: false,
    regenerate: false,
    promptFactoryV2Finalized: false,
    jobs: summary.jobs.map((job) => ({
      canonicalSlug: job.canonicalSlug,
      candidateAssetId: job.candidateAssetId,
      OWNER_VISUAL_QA: job.OWNER_VISUAL_QA,
      checkedFields: job.checkedFields,
      ROUND_1_CLASS: job.ROUND_1_CLASS,
      IN_GARDEN_QA: job.IN_GARDEN_QA,
      approvalStatus: 'candidate'
    }))
  };
}
