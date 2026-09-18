/**
 * Automatic 8-job visual calibration batch from the real factory queue.
 * Role-based: one job per major morphology class, owned first.
 * Evidence-quality blocks replace automatically from a missing morphology class.
 */
import { DESIGN_MORPHOLOGY_AUTHORITY } from '../garden-design-variant-policy-v1.js';
import { IDENTITY_PRECISION } from './identity-precision-v1.js';

export const CALIBRATION_BATCH_SIZE = 8;
export const LOCKED_CALIBRATION_SLUGS = Object.freeze([
  'mango',
  'lavender',
  'pineapple',
  'banana',
  'areca-palm',
  'bougainvillea',
  'aloe-vera',
  'eggplant'
]);

export const CALIBRATION_TARGET_FORMS = Object.freeze([
  'tree',
  'shrub',
  'rosette',
  'herbaceous-clump',
  'palm',
  'climber',
  'succulent-form'
]);

export const CALIBRATION_ADDITIONAL_FORMS = Object.freeze([
  'subshrub',
  'grass-like',
  'groundcover',
  'herbaceous-upright'
]);

const UNRELIABLE_AUTHORITY = new Set([
  DESIGN_MORPHOLOGY_AUTHORITY.HEURISTIC_FALLBACK,
  DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN
]);

export function isCalibrationEvidenceBlocked(job = {}) {
  const authority = String(job.morphologyAuthority || '');
  if (UNRELIABLE_AUTHORITY.has(authority)) {
    return { blocked: true, reason: 'evidence-quality-morphology-unreliable' };
  }
  if (job.identityPrecision === IDENTITY_PRECISION.IDENTITY_UNKNOWN) {
    return { blocked: true, reason: 'evidence-quality-identity-unknown' };
  }
  return { blocked: false, reason: null };
}

function jobScore(job) {
  const mature = job.growthStage === 'mature' ? 2 : 0;
  const veg = job.phenology === 'vegetative' ? 1 : 0;
  return job.priority * 10 + mature + veg;
}

function pickForForm(jobs, form, usedSlugs) {
  const pool = jobs.filter((j) => j.visualForm === form && !usedSlugs.has(j.canonicalSlug));
  pool.sort((a, b) => jobScore(b) - jobScore(a) || a.canonicalSlug.localeCompare(b.canonicalSlug));
  return pool[0] || null;
}

function calibrationWhy(job) {
  const bits = [
    `Tests ${job.visualForm} silhouette and overlay composition.`,
    job.priorityReason === 'owned-plants'
      ? 'Owned-garden priority: measures the live Garden Design path.'
      : job.priorityReason === 'garden-design-surfaced'
        ? 'Already declared in Garden Design, so prompt/model must match existing product intent.'
        : 'Adds morphology diversity the owned/surfaced set does not cover.',
    job.identityPrecision === 'GENUS_VISUALLY_REPRESENTABLE'
      ? 'Genus-level morphology-neutral vegetative asset; must not invent a species.'
      : 'Species-supported identity for botanical correctness measurement.',
    job.growthStage === 'mature'
      ? 'Mature stage is the default overlay specimen for visual-language consistency.'
      : `${job.growthStage} stage checks life-stage distinctness in scene.`
  ];
  return bits.join(' ');
}

function rankJobs(picked) {
  return picked.map((job, i) => ({
    rank: i + 1,
    canonicalSlug: job.canonicalSlug,
    scientific: job.scientific || null,
    identityScope: job.identityScope || null,
    identityPrecision: job.identityPrecision || null,
    visualForm: job.visualForm,
    habitModifiers: job.habitModifiers || [],
    growthStage: job.growthStage,
    phenology: job.phenology,
    season: job.season,
    formView: job.formView || null,
    variantKey: job.variantKey,
    priorityReason: job.priorityReason,
    priority: job.priority,
    morphologyAuthority: job.morphologyAuthority,
    existingAssetCoverage: job.existingAssetCoverage,
    estimatedGenerationCalls: 1,
    retryAllowance: 0,
    generated: false,
    replacementOf: job.replacementOf || null,
    replacementReason: job.replacementReason || null,
    whyUsefulForCalibration: job.whyUsefulForCalibration || calibrationWhy(job)
  }));
}

function eligiblePool(jobs, usedSlugs) {
  return (jobs || []).filter((j) => !usedSlugs.has(j.canonicalSlug) && !isCalibrationEvidenceBlocked(j).blocked);
}

export function selectCalibrationBatch(eligibleJobs = [], size = CALIBRATION_BATCH_SIZE, options = {}) {
  const extraBlocked = new Set(options.blockedSlugs || []);
  const jobs = eligiblePool(Array.isArray(eligibleJobs) ? eligibleJobs : [], extraBlocked);
  const picked = [];
  const usedSlugs = new Set(extraBlocked);
  const usedForms = new Set();

  for (const form of CALIBRATION_TARGET_FORMS) {
    if (picked.length >= size) break;
    const job = pickForForm(jobs, form, usedSlugs);
    if (!job) continue;
    picked.push(job);
    usedSlugs.add(job.canonicalSlug);
    usedForms.add(job.visualForm);
  }
  for (const form of CALIBRATION_ADDITIONAL_FORMS) {
    if (picked.length >= size) break;
    if (usedForms.has(form)) continue;
    const job = pickForForm(jobs, form, usedSlugs);
    if (!job) continue;
    picked.push(job);
    usedSlugs.add(job.canonicalSlug);
    usedForms.add(job.visualForm);
  }
  const rest = jobs
    .filter((j) => !usedSlugs.has(j.canonicalSlug))
    .sort((a, b) => jobScore(b) - jobScore(a) || a.canonicalSlug.localeCompare(b.canonicalSlug));
  for (const job of rest) {
    if (picked.length >= size) break;
    picked.push(job);
    usedSlugs.add(job.canonicalSlug);
    usedForms.add(job.visualForm);
  }

  return rankJobs(picked.slice(0, size));
}

/**
 * If a selected job is BLOCKED for evidence quality, fill the slot from a
 * morphology class not already in the batch. No hand-picked replacement.
 */
export function replaceBlockedCalibrationJobs(batch = [], eligibleJobs = [], blockedSlugs = []) {
  const blocked = new Set(blockedSlugs);
  const kept = (batch || []).filter((j) => !blocked.has(j.canonicalSlug));
  const usedSlugs = new Set(kept.map((j) => j.canonicalSlug));
  blocked.forEach((slug) => usedSlugs.add(slug));
  const usedForms = new Set(kept.map((j) => j.visualForm));
  const blockedForms = new Set(
    (batch || []).filter((j) => blocked.has(j.canonicalSlug)).map((j) => j.visualForm)
  );
  const size = (batch && batch.length) || CALIBRATION_BATCH_SIZE;
  const pool = eligiblePool(eligibleJobs, usedSlugs);
  const missingForms = [
    ...CALIBRATION_TARGET_FORMS.filter((form) => !usedForms.has(form) && !blockedForms.has(form)),
    ...CALIBRATION_ADDITIONAL_FORMS.filter((form) => !usedForms.has(form) && !blockedForms.has(form))
  ];
  const replaced = [...kept];
  const pendingBlocked = [...blocked];
  function adopt(job) {
    usedSlugs.add(job.canonicalSlug);
    usedForms.add(job.visualForm);
    replaced.push({
      ...job,
      replacementOf: pendingBlocked.shift() || null,
      replacementReason: 'evidence-quality-auto-replace-missing-morphology-class',
      whyUsefulForCalibration: calibrationWhy(job)
    });
  }
  for (const form of missingForms) {
    if (replaced.length >= size) break;
    const job = pickForForm(pool, form, usedSlugs);
    if (!job) continue;
    adopt(job);
  }
  const rest = pool
    .filter((j) => !usedSlugs.has(j.canonicalSlug) && !usedForms.has(j.visualForm) && !blockedForms.has(j.visualForm))
    .sort((a, b) => jobScore(b) - jobScore(a) || a.canonicalSlug.localeCompare(b.canonicalSlug));
  for (const job of rest) {
    if (replaced.length >= size) break;
    adopt(job);
  }
  return rankJobs(replaced.slice(0, size));
}
