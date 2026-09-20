/**
 * Visual State Calibration Batch 2 prep.
 * Pair-complete state families. Preparation only. Spend DENIED. No generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PAID_IMAGE_MODEL } from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { FACTORY_GENERATION_RULE, REQUIREMENT_STATE } from './design-asset-visual-state-integrity-gate-v1.js';
import { deriveVisualStateRequirements, visualStateKey } from './design-asset-visual-states-v1.js';
import { jobIdentity } from './variant-demand-v1.js';
import { buildVisualStateFamilyPromptRecord } from './prompt-factory-visual-state-family-v1.js';
import { classifyIdentityPrecision } from './identity-precision-v1.js';
import { writeVisualStateCalibrationBatch2Review } from './visual-state-calibration-batch-2-review-v1.js';
import { CALIBRATION_BATCH_1_CANDIDATES } from './calibration-review-candidates-v1.js';

export const VISUAL_STATE_CALIBRATION_BATCH_2_VERSION = 'visual-state-calibration-batch-2-prep-v1';
export const VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID = 'design-asset-visual-state-calibration-batch-2';
export const VISUAL_STATE_CALIBRATION_BATCH_2_CACHE_BUST = '20260919u';

export const BATCH_2_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  previousApprovalCarryForward: false,
  previousPaidApprovalExhausted: true,
  retriesAuthorized: 0,
  maxJobs: 11,
  maxCalls: 11,
  maxRetries: 0,
  model: PAID_IMAGE_MODEL,
  provider: 'openai-images-api',
  note: 'Owner must explicitly approve this exact runId before execution. Batch-1 approval does not apply.'
});

export const FAMILY_CONSISTENCY_FIELDS = Object.freeze([
  'IDENTITY_CONTINUITY',
  'ARCHITECTURE_CONTINUITY',
  'STATE_DISTINCTION',
  'CAMERA_CONTINUITY',
  'GROUND_ANCHOR_COMPATIBILITY',
  'SCALE_COHERENCE',
  'BOTANICAL_STATE_PLAUSIBILITY'
]);

export const BATCH_2_QA_STATES = Object.freeze([
  'TECHNICAL_QA',
  'BOTANICAL_IDENTITY_QA',
  'STATE_QA',
  'FAMILY_CONSISTENCY_QA',
  'IN_GARDEN_QA',
  'OWNER_VISUAL_QA'
]);

export const BATCH_2_FAILURE_CLASSES = Object.freeze([
  'IDENTITY_DRIFT',
  'ARCHITECTURE_DRIFT',
  'STATE_NOT_VISIBLE',
  'STATE_OVERSTATED',
  'BOTANICAL_IMPLAUSIBILITY',
  'PERSPECTIVE_FAILURE',
  'IN_GARDEN_INTEGRATION_FAILURE'
]);

export const ANCHOR_STATUS = Object.freeze({
  USABLE: 'STATE_COMPARISON_ANCHOR_USABLE',
  NOT_USABLE: 'STATE_COMPARISON_ANCHOR_NOT_USABLE'
});

function batch1Candidate(slug) {
  return CALIBRATION_BATCH_1_CANDIDATES.find((row) => row.canonicalSlug === slug) || null;
}

/**
 * Not production approval. Silhouette architecture flags invalidate state-comparison
 * anchors. Sticker-look alone would not.
 */
export function classifyBatch1StateComparisonAnchor(slug) {
  const row = batch1Candidate(slug);
  if (!row) {
    return {
      canonicalSlug: slug,
      status: ANCHOR_STATUS.NOT_USABLE,
      baselineAnchor: 'BASELINE_ANCHOR_NOT_USABLE',
      productionApproval: false,
      reasons: ['NO_BATCH_1_CANDIDATE']
    };
  }
  if (slug === 'mango' || slug === 'banana') {
    return {
      canonicalSlug: slug,
      file: row.file,
      status: ANCHOR_STATUS.NOT_USABLE,
      baselineAnchor: 'BASELINE_ANCHOR_NOT_USABLE',
      productionApproval: false,
      reasons: [
        'OWNER_EXCLUDED_FROM_BATCH_2_ANCHOR',
        'UNRESOLVED_ARCHITECTURE_QUALITY',
        'NEW_FAMILY_ANCHOR_REQUIRED'
      ]
    };
  }
  if (slug === 'lavender' || slug === 'eggplant') {
    return {
      canonicalSlug: slug,
      file: row.file,
      status: ANCHOR_STATUS.NOT_USABLE,
      baselineAnchor: 'BASELINE_ANCHOR_NOT_USABLE',
      productionApproval: false,
      notProductionApproval: true,
      identityRejected: false,
      stickerLookAloneWouldInvalidate: false,
      historicalEvidenceOnly: true,
      overwriteBatch1Candidate: false,
      reasons: [
        'SILHOUETTE_FLAGGED_ON_BATCH_1',
        'ARCHITECTURE_NOT_RELIABLE_FOR_STATE_COMPARISON',
        'OWNER_VISUAL_QA_NEEDS_BLEND_NOT_APPROVED'
      ],
      note:
        slug === 'lavender'
          ? 'Batch-1 lavender remains historical evidence only. Batch 2 generates a new mature vegetative family anchor.'
          : 'Eggplant is deferred. Existing vegetative candidate is not a valid family anchor. No Batch-2 generation demand.'
    };
  }
  return {
    canonicalSlug: slug,
    file: row.file,
    status: ANCHOR_STATUS.NOT_USABLE,
    baselineAnchor: 'BASELINE_ANCHOR_NOT_USABLE',
    productionApproval: false,
    reasons: ['NOT_AUDITED_FOR_BATCH_2']
  };
}

export const LAVENDER_BATCH1_HISTORICAL = classifyBatch1StateComparisonAnchor('lavender');
export const EGGPLANT_DEFERRED = Object.freeze({
  canonicalSlug: 'eggplant',
  visualStateCalibration: 'DEFERRED_BASELINE_REQUIRED',
  generatedInBatch2: false,
  reason: 'existing vegetative candidate is not a valid family anchor',
  fruitingCoveredBy: 'mango mature fruiting',
  batch1Candidate: classifyBatch1StateComparisonAnchor('eggplant'),
  overwriteBatch1Candidate: false,
  rejected: false,
  deleted: false
});

function makeJob(spec) {
  const identity = jobIdentity(spec.canonicalSlug, {
    growthStage: spec.growthStage,
    architectureMode: spec.architectureMode,
    phenologyState: spec.phenologyState,
    phenology: spec.phenologyState
  });
  return Object.freeze({
    rank: spec.rank,
    family: spec.family,
    familyId: spec.familyId,
    canonicalSlug: spec.canonicalSlug,
    visualForm: spec.visualForm,
    architectureMode: spec.architectureMode,
    growthStage: spec.growthStage,
    phenologyState: spec.phenologyState,
    phenology: spec.phenologyState,
    season: 'season-neutral',
    requirementState: REQUIREMENT_STATE.REQUIRED,
    variantKey: identity.variantKey,
    visualStateKey: visualStateKey(spec),
    jobId: identity.jobId,
    assetVersion: identity.assetVersion,
    purpose: spec.purpose,
    generated: false,
    candidateRelPath: null,
    encodePhysicalMeters: false,
    youngMustNotUseMatureSizeAuthority: spec.growthStage === 'young',
    youngPhysicalScale: spec.growthStage === 'young' ? 'Estimated' : null,
    secondCanonicalIdentityForbidden: spec.familyId === 'D',
    comparisonAnchor: spec.comparisonAnchor || null,
    addPaidJobIfAnchorUnusable: false
  });
}

export const BATCH_2_JOBS = Object.freeze([
  makeJob({
    rank: 1,
    family: 'mango',
    familyId: 'A',
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'new corrected family anchor using current Prompt Factory architecture rules'
  }),
  makeJob({
    rank: 2,
    family: 'mango',
    familyId: 'A',
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'young',
    phenologyState: 'vegetative',
    purpose: 'test true growth-stage architecture change'
  }),
  makeJob({
    rank: 3,
    family: 'mango',
    familyId: 'A',
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'fruiting',
    purpose: 'test phenology state while preserving mature architecture'
  }),
  makeJob({
    rank: 4,
    family: 'banana',
    familyId: 'B',
    canonicalSlug: 'banana',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'new corrected large-herbaceous anchor'
  }),
  makeJob({
    rank: 5,
    family: 'banana',
    familyId: 'B',
    canonicalSlug: 'banana',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default',
    growthStage: 'young',
    phenologyState: 'vegetative',
    purpose: 'test young vs mature large-herbaceous architecture'
  }),
  makeJob({
    rank: 6,
    family: 'apple',
    familyId: 'C',
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'leafy vegetative anchor for deciduous leaf-off comparison'
  }),
  makeJob({
    rank: 7,
    family: 'apple',
    familyId: 'C',
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant',
    purpose: 'prove leafy vs deciduous leaf-off without changing identity or tree architecture'
  }),
  makeJob({
    rank: 8,
    family: 'pomegranate',
    familyId: 'D',
    canonicalSlug: 'pomegranate',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'TREE architectureMode under one canonical identity'
  }),
  makeJob({
    rank: 9,
    family: 'pomegranate',
    familyId: 'D',
    canonicalSlug: 'pomegranate',
    visualForm: 'tree',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'SHRUB architectureMode under the same canonical identity'
  }),
  makeJob({
    rank: 10,
    family: 'lavender',
    familyId: 'E',
    canonicalSlug: 'lavender',
    visualForm: 'shrub',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    purpose: 'new clean family anchor; do not use Batch-1 lavender candidate'
  }),
  makeJob({
    rank: 11,
    family: 'lavender',
    familyId: 'E',
    canonicalSlug: 'lavender',
    visualForm: 'shrub',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'flowering',
    purpose: 'flowering phenology against the new Batch-2 mature vegetative family anchor'
  })
]);

export const BATCH_2_FAMILIES = Object.freeze([
  {
    id: 'A',
    role: 'evergreen-fruit-tree',
    canonicalSlug: 'mango',
    oneCanonicalIdentity: true,
    reuseBatch1MatureAsAnchor: false,
    includeYoung: true,
    proves: 'YOUNG vs MATURE; VEGETATIVE vs FRUITING',
    jobs: [1, 2, 3]
  },
  {
    id: 'B',
    role: 'large-herbaceous',
    canonicalSlug: 'banana',
    oneCanonicalIdentity: true,
    reuseBatch1MatureAsAnchor: false,
    includeYoung: true,
    proves: 'YOUNG vs MATURE in large-herbaceous architecture',
    jobs: [4, 5]
  },
  {
    id: 'C',
    role: 'deciduous-fruit-tree',
    canonicalSlug: 'apple',
    oneCanonicalIdentity: true,
    includeYoung: false,
    proves: 'VEGETATIVE vs DORMANT',
    jobs: [6, 7]
  },
  {
    id: 'D',
    role: 'multi-form',
    canonicalSlug: 'pomegranate',
    oneCanonicalIdentity: true,
    secondCatalogIdentityForbidden: true,
    proves: 'TREE vs SHRUB architectureMode',
    jobs: [8, 9]
  },
  {
    id: 'E',
    role: 'flowering-shrub',
    canonicalSlug: 'lavender',
    oneCanonicalIdentity: true,
    reuseBatch1MatureAsAnchor: false,
    familyAnchor: 'new Batch-2 mature vegetative',
    proves: 'VEGETATIVE vs FLOWERING',
    jobs: [10, 11]
  }
]);

export function attachCatalogIdentity(job, plant = {}) {
  const demand = deriveVisualStateRequirements(plant);
  const precision = classifyIdentityPrecision(plant, { visualForm: job.visualForm }, job);
  return {
    ...job,
    scientific: plant.scientific || plant.scientificName || null,
    identityScope: plant.identityScope || null,
    identityPrecision: precision.identityPrecision,
    catalogVisualForm: demand.visualForm,
    requirementMatchesCatalog:
      (job.phenologyState === 'vegetative' && job.growthStage === 'mature')
      || (job.growthStage === 'young' && demand.youngRequired === REQUIREMENT_STATE.REQUIRED)
      || (job.phenologyState === 'flowering' && demand.floweringRequired === REQUIREMENT_STATE.REQUIRED)
      || (job.phenologyState === 'fruiting' && demand.fruitingRequired === REQUIREMENT_STATE.REQUIRED)
      || (job.phenologyState === 'dormant' && demand.dormantRequired === REQUIREMENT_STATE.REQUIRED)
  };
}

export function buildBatch2PromptManifest(plantsBySlug = {}) {
  return BATCH_2_JOBS.map((job) => {
    const plant = plantsBySlug[job.canonicalSlug] || { canonicalSlug: job.canonicalSlug };
    const hydrated = attachCatalogIdentity(job, plant);
    return {
      job: hydrated,
      prompt: buildVisualStateFamilyPromptRecord(hydrated, {
        provider: BATCH_2_SPEND_GATE.provider,
        model: BATCH_2_SPEND_GATE.model
      })
    };
  });
}

export function executeVisualStateCalibrationBatch2() {
  return {
    executed: false,
    imageGeneration: 0,
    openaiCalls: 0,
    retries: 0,
    spendGate: BATCH_2_SPEND_GATE.state,
    reason: 'PREPARATION_ONLY_OWNER_MUST_APPROVE_THIS_EXACT_RUN',
    runId: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
    jobsPrepared: BATCH_2_JOBS.length,
    doNotExpandToRequiredCatalog: true
  };
}

export function writeVisualStateCalibrationBatch2Reports(root, catalogPlants = []) {
  const bySlug = new Map();
  for (const plant of catalogPlants) {
    const slug = String(plant.canonicalSlug || plant.slug || '').trim();
    if (slug) bySlug.set(slug, plant);
  }
  const plantsBySlug = Object.fromEntries(bySlug);
  const prompts = buildBatch2PromptManifest(plantsBySlug);
  const dir = path.join(root, 'data', 'garden-design', 'visual-state-calibration-batch-2-prep-v1');
  fs.mkdirSync(dir, { recursive: true });
  const spend = { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 };
  const files = {
    summaryPath: path.join(dir, 'batch-2-prep-summary.json'),
    manifestPath: path.join(dir, 'batch-2-job-manifest.json'),
    promptsPath: path.join(dir, 'batch-2-family-prompts.json'),
    anchorsPath: path.join(dir, 'batch-2-anchor-audit.json'),
    spendPath: path.join(dir, 'batch-2-spend-gate.json')
  };
  const review = writeVisualStateCalibrationBatch2Review(root);
  let previousSpend = null;
  if (fs.existsSync(files.spendPath)) {
    try {
      previousSpend = JSON.parse(fs.readFileSync(files.spendPath, 'utf8'));
    } catch {
      previousSpend = null;
    }
  }
  fs.writeFileSync(`${files.summaryPath}`, `${JSON.stringify({
    contract: VISUAL_STATE_CALIBRATION_BATCH_2_VERSION,
    verdict: 'VISUAL_STATE_CALIBRATION_BATCH_2_FINAL_PREP_READY',
    runId: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
    jobsPrepared: BATCH_2_JOBS.length,
    generated: 0,
    everyTestedStateHasValidFamilyAnchor: true,
    eggplant: EGGPLANT_DEFERRED,
    factoryGenerationRule: FACTORY_GENERATION_RULE,
    requirementSemantics: Object.values(REQUIREMENT_STATE),
    familyConsistencyFields: FAMILY_CONSISTENCY_FIELDS,
    qaStates: BATCH_2_QA_STATES,
    failureClasses: BATCH_2_FAILURE_CLASSES,
    doNotGenerate273RequiredVariants: true,
    unknownStatesStayOutOfDemand: true,
    treePhysicalScaleReopened: false,
    productionAssetRegistryChanged: false,
    spendGate: BATCH_2_SPEND_GATE,
    spend,
    review
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.manifestPath}`, `${JSON.stringify({
    contract: VISUAL_STATE_CALIBRATION_BATCH_2_VERSION,
    runId: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
    families: BATCH_2_FAMILIES,
    jobs: BATCH_2_JOBS
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.promptsPath}`, `${JSON.stringify({
    contract: VISUAL_STATE_CALIBRATION_BATCH_2_VERSION,
    generateNow: false,
    prompts: prompts.map((row) => ({
      jobId: row.job.jobId,
      canonicalSlug: row.job.canonicalSlug,
      scientific: row.job.scientific,
      identityScope: row.job.identityScope,
      promptTemplateVersion: row.prompt.promptTemplateVersion,
      round1LearningInherited: row.prompt.round1LearningInherited,
      runtimeNotInPng: row.prompt.runtimeNotInPng,
      prompt: row.prompt.prompt,
      encodesPhysicalMeters: false
    }))
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.anchorsPath}`, `${JSON.stringify({
    contract: VISUAL_STATE_CALIBRATION_BATCH_2_VERSION,
    mango: classifyBatch1StateComparisonAnchor('mango'),
    banana: classifyBatch1StateComparisonAnchor('banana'),
    lavenderBatch1Historical: LAVENDER_BATCH1_HISTORICAL,
    lavenderBatch2FamilyAnchor: 'lavender shrub mature vegetative (new Batch-2 job 10)',
    eggplant: EGGPLANT_DEFERRED,
    silentlyAddedPaidJobs: 0
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.spendPath}`, `${JSON.stringify({
    contract: VISUAL_STATE_CALIBRATION_BATCH_2_VERSION,
    gate: BATCH_2_SPEND_GATE,
    executeResult: executeVisualStateCalibrationBatch2(),
    lastRun: previousSpend && previousSpend.lastRun ? previousSpend.lastRun : undefined,
    proposedFutureCommand: [
      `--run-id=${VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID}`,
      `--approve-envelope=${VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID}`,
      `--owner-approve-run=${VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID}`,
      `--provider=${BATCH_2_SPEND_GATE.provider}`,
      `--model=${BATCH_2_SPEND_GATE.model}`,
      '--max-jobs=11',
      '--max-calls=11',
      '--max-retries=0'
    ],
    authorizedNow: false
  }, null, 2)}\n`);
  return {
    ...files,
    reviewHtml: review.htmlPath,
    verdict: 'VISUAL_STATE_CALIBRATION_BATCH_2_FINAL_PREP_READY',
    jobsPrepared: BATCH_2_JOBS.length
  };
}
