/**
 * CRUVIT Plant Visual R2 object-storage contract helpers.
 * Pure planning/readiness layer. No network calls and no object writes.
 */
export const PLANT_VISUAL_STORAGE_CONTRACT_VERSION = 'plant-visual-object-storage-v1';

export const PLANT_VISUAL_R2_ENV = Object.freeze([
  'PLANT_VISUAL_R2_ACCOUNT_ID',
  'PLANT_VISUAL_R2_ACCESS_KEY_ID',
  'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
  'PLANT_VISUAL_R2_CANDIDATES_BUCKET',
  'PLANT_VISUAL_R2_PRODUCTION_BUCKET'
]);

export const EXPECTED_PLANT_VISUAL_BUCKETS = Object.freeze({
  candidates: 'cruvit-plant-visual-candidates',
  production: 'cruvit-plant-visual-production'
});

function safe(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getPlantVisualStorageStatus(env = process.env) {
  const missing = PLANT_VISUAL_R2_ENV.filter((key) => !String(env[key] || '').trim());
  const candidates = String(env.PLANT_VISUAL_R2_CANDIDATES_BUCKET || '').trim();
  const production = String(env.PLANT_VISUAL_R2_PRODUCTION_BUCKET || '').trim();
  return {
    ready: missing.length === 0
      && candidates === EXPECTED_PLANT_VISUAL_BUCKETS.candidates
      && production === EXPECTED_PLANT_VISUAL_BUCKETS.production,
    missing,
    candidatesBucket: candidates || null,
    productionBucket: production || null,
    candidatesBucketMatches: candidates === EXPECTED_PLANT_VISUAL_BUCKETS.candidates,
    productionBucketMatches: production === EXPECTED_PLANT_VISUAL_BUCKETS.production,
    blocker: missing.length
      ? 'PLANT_VISUAL_STORAGE_CONNECTION_REQUIRED'
      : candidates !== EXPECTED_PLANT_VISUAL_BUCKETS.candidates
        || production !== EXPECTED_PLANT_VISUAL_BUCKETS.production
        ? 'PLANT_VISUAL_BUCKET_NAME_MISMATCH'
        : null
  };
}

export function buildPlantVisualCandidateObjectKey(input = {}) {
  const runId = safe(input.runId);
  const canonicalSlug = safe(input.canonicalSlug);
  const assetId = safe(input.assetId);
  const sha256 = safe(input.sha256);
  if (!runId || !canonicalSlug || !assetId || !sha256) {
    const err = new Error('PLANT_VISUAL_CANDIDATE_KEY_FIELDS_REQUIRED');
    err.code = 'PLANT_VISUAL_CANDIDATE_KEY_FIELDS_REQUIRED';
    throw err;
  }
  return `candidates/${runId}/${canonicalSlug}/${assetId}__${sha256}.png`;
}

export function buildPlantVisualProductionObjectKey(input = {}) {
  const canonicalSlug = safe(input.canonicalSlug);
  const growthStage = safe(input.growthStage);
  const architectureMode = safe(input.architectureMode || 'default');
  const phenology = safe(input.phenology || input.phenologyState);
  const assetId = safe(input.assetId);
  const sha256 = safe(input.sha256);
  if (!canonicalSlug || !growthStage || !architectureMode || !phenology || !assetId || !sha256) {
    const err = new Error('PLANT_VISUAL_PRODUCTION_KEY_FIELDS_REQUIRED');
    err.code = 'PLANT_VISUAL_PRODUCTION_KEY_FIELDS_REQUIRED';
    throw err;
  }
  return `production/${canonicalSlug}/${growthStage}__${architectureMode}__${phenology}/${assetId}__${sha256}.png`;
}

export function validatePlantVisualPromotionStorageInput(input = {}) {
  const requiredPass = [
    'technicalQA',
    'framingQA',
    'botanicalIdentityQA',
    'architectureQA',
    'growthStageQA',
    'phenologyStateQA',
    'inGardenQA'
  ];
  const failed = requiredPass.filter((field) => input[field] !== 'PASS');
  if (input.productionApproved !== true) failed.push('productionApproved');
  return {
    ok: failed.length === 0,
    failed,
    immutableProductionKey: failed.length === 0
      ? buildPlantVisualProductionObjectKey(input)
      : null
  };
}
