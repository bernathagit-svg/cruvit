/**
 * Owner quality review consolidation V1.
 * Records owner findings, recalculates 273-variant policy.
 * Zero spend. No generation. No production registry write. No auto-approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';
import { QUALITY_POLICY_SPEND_GATE } from './design-asset-quality-policy-v1.js';
import { QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE } from './quality-family-calibration-final-prep-v1.js';
import {
  QUALITY_PLANNING_STATE,
  PLANNING_COST_ESTIMATE_USD,
  auditRequiredVariantQualityIntegrity,
  buildQualityPlanningIntegritySummary,
  writeQualityPlanningIntegrityReports
} from './design-asset-quality-planning-integrity-v1.js';
import { auditAppleDormantRootCause, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';
import {
  APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT,
  buildBranchStructureV2ExperimentPromptRecord,
  PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT
} from './prompt-factory-branch-structure-v2-experiment-v1.js';
import { writeDesignAssetQualityPolicyReports } from './design-asset-quality-policy-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION = 'owner-quality-review-consolidation-v1';

export const QA_DIMENSIONS = Object.freeze({
  IMAGE_DETAIL_QUALITY: 'IMAGE_DETAIL_QUALITY',
  BOTANICAL_IDENTITY_ARCHITECTURE: 'BOTANICAL_IDENTITY_ARCHITECTURE',
  STATE_CORRECTNESS: 'STATE_CORRECTNESS',
  neverCollapse: true
});

export const OWNER_QUALITY_REVIEW_RECORD = Object.freeze({
  round: 'design-asset-quality-family-calibration-final-1',
  authoritative: true,
  QA_DIMENSIONS,
  families: Object.freeze({
    WOODY_DENSE_SMALL_LEAF: {
      source: 'mango A/B design-asset-woody-foliage-detail-ab-1',
      CONTROL: { prompt: 'old', quality: 'medium', owner: 'DETAIL_SOFT' },
      A: { prompt: 'V2', quality: 'medium', owner: 'ACCEPTABLE' },
      B: { prompt: 'V2', quality: 'high', owner: 'PREFERRED' },
      promptV2ImprovesFoliageDetail: true,
      mediumAcceptable: true,
      highVisiblyBetter: true,
      HIGH_selectiveNotUniversal: true,
      planned: { prompt: 'design-cutout-visual-state-detail-v2', qualityWhenFoliageDense: 'high', mediumFallback: true }
    },
    WOODY_OPEN_OR_LARGE_LEAF: {
      sample: 'avocado TREE MATURE VEGETATIVE V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      painterlySoftness: false,
      strongHalo: false,
      cgiCrunchySharpening: false,
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    BRANCH_STRUCTURE: {
      sample: 'apple TREE MATURE DORMANT V2+medium',
      DETAIL_QA: 'NOT_ACCEPTABLE',
      observed: Object.freeze([
        'main branches readable',
        'semi-transparent brown branch ghosting / haze',
        'residual branch-like artifacts around crown',
        'halo-like / dirty transparent structure'
      ]),
      issues: Object.freeze(['HALO', 'DETAIL_SOFT', 'OTHER']),
      other: 'semi-transparent branch ghosting / brown haze',
      familyResult: 'QUALITY_POLICY_NOT_VALIDATED',
      automaticHighEscalation: false,
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    SHRUB_FINE_FOLIAGE: {
      sample: 'lavender SHRUB MATURE VEGETATIVE V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      DETAIL_POLICY: 'PASS',
      BOTANICAL_IDENTITY_QA: 'REVIEW_REQUIRED',
      identityNote: 'architecture too upright/woody, somewhat rosemary-like rather than convincing Lavender habit',
      doNotFailMediumPolicyBecauseOfIdentity: true,
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    FLOWER_FINE_DETAIL: {
      sample: 'lavender SHRUB MATURE FLOWERING V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      STATE_QA: 'FLOWERING_DISTINCTION_CLEAR',
      painterlySoftness: false,
      meaningfulHalo: false,
      highRequired: false,
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    LARGE_LEAF_HERBACEOUS: {
      sample: 'banana herbaceous-clump MATURE FRUITING V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      note: 'Leaves, veins and natural leaf damage readable.',
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    FRUIT_VISIBLE_DETAIL: {
      sample: 'same banana fruiting asset',
      DETAIL_QA: 'DETAIL_OK',
      STATE_QA: 'FRUITING_DISTINCTION_CLEAR',
      note: 'fruit cluster clearly readable; fruiting state visually useful and plausible',
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    ROSETTE: {
      sample: 'pineapple MATURE VEGETATIVE V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      historicalControlNotLikeForLike: true,
      historicalControlNote:
        'Historical Pineapple control is a different phenology/state and is NOT a like-for-like state comparison.',
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    SUCCULENT: {
      sample: 'aloe-vera MATURE VEGETATIVE V2+medium',
      DETAIL_QA: 'DETAIL_OK',
      familyResult: 'MEDIUM_POLICY_VALIDATED',
      BOTANICAL_IDENTITY_QA: 'ARCHITECTURE_REVIEW_REQUIRED',
      architectureNote: 'large clump / offsets / pups may require later BOTANICAL_IDENTITY / ARCHITECTURE review',
      doNotTreatArchitectureAsQualityFailure: true,
      ASSET_PRODUCTION_APPROVAL: 'NO'
    }
  }),
  productionApprovedThisRound: Object.freeze([])
});

const OWNER_JOB_QA = Object.freeze({
  'avocado__mature__tree__vegetative__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'UNKNOWN',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'apple__mature__tree__dormant__detail-v2__medium': {
    DETAIL_QA: 'NOT_ACCEPTABLE',
    OWNER_VISUAL_QA: 'NOT_ACCEPTABLE',
    OWNER_VISUAL_QA_ISSUES: ['HALO', 'DETAIL_SOFT', 'OTHER'],
    OWNER_VISUAL_QA_OTHER: 'semi-transparent branch ghosting / brown haze',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'UNKNOWN',
    familyPolicy: 'QUALITY_POLICY_NOT_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'lavender__mature__shrub__vegetative__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'REVIEW_REQUIRED',
    STATE_QA: 'UNKNOWN',
    DETAIL_POLICY: 'PASS',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'lavender__mature__shrub__flowering__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'FLOWERING_DISTINCTION_CLEAR',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'banana__mature__default__fruiting__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'FRUITING_DISTINCTION_CLEAR',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'pineapple__mature__default__vegetative__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'UNKNOWN',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    historicalControlNotLikeForLike: true,
    ASSET_PRODUCTION_APPROVAL: 'NO'
  },
  'aloe-vera__mature__default__vegetative__detail-v2__medium': {
    DETAIL_QA: 'DETAIL_OK',
    OWNER_VISUAL_QA: 'DETAIL_OK',
    BOTANICAL_IDENTITY_QA: 'ARCHITECTURE_REVIEW_REQUIRED',
    STATE_QA: 'UNKNOWN',
    familyPolicy: 'MEDIUM_POLICY_VALIDATED',
    ASSET_PRODUCTION_APPROVAL: 'NO'
  }
});

const PROTECTED_CANDIDATES = Object.freeze([
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/avocado__mature__tree__vegetative__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/apple__mature__tree__dormant__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/lavender__mature__shrub__vegetative__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/lavender__mature__shrub__flowering__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/banana__mature__default__fruiting__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/pineapple__mature__default__vegetative__detail-v2__medium.png',
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/aloe-vera__mature__default__vegetative__detail-v2__medium.png'
]);

const RESULTS_REL = path.join('data', 'garden-design', 'quality-family-calibration-final-1', 'results.json');
const REGISTRY_REL = path.join('modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');

export function applyOwnerVisualQaToFinalJobs(jobs = []) {
  return (jobs || []).map((job) => {
    const mark = OWNER_JOB_QA[job?.jobId];
    if (!mark) return job;
    return {
      ...job,
      ...mark,
      approvalStatus: 'candidate',
      outputStatus: 'CALIBRATION_CANDIDATE',
      approvalEligible: false,
      autoApproved: false
    };
  });
}

function hashFile(root, rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}

export function snapshotProtectedBinaries(root) {
  const files = {};
  for (const rel of PROTECTED_CANDIDATES) {
    files[rel] = hashFile(root, rel);
  }
  files[REGISTRY_REL] = hashFile(root, REGISTRY_REL);
  return files;
}

export function assertProtectedBinariesUnchanged(root, before) {
  const after = snapshotProtectedBinaries(root);
  for (const [rel, sha] of Object.entries(before)) {
    if (after[rel] !== sha) {
      const err = new Error(`PROTECTED_BINARY_CHANGED:${rel}`);
      err.code = 'PROTECTED_BINARY_CHANGED';
      err.file = rel;
      throw err;
    }
  }
  return { candidatePngsChanged: false, productionRegistryChanged: false };
}

export function executeOwnerQualityReviewConsolidation() {
  return {
    executedPaid: false,
    openaiCalls: 0,
    imageGeneration: 0,
    retries: 0,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    qualityFamilySpendGate: QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.state,
    qualityPolicySpendGate: QUALITY_POLICY_SPEND_GATE.state,
    massGenerationStarted: false,
    productionRegistryChanged: false,
    assetsAutoApproved: 0,
    universalHigh: false,
    appleDormantAutoEscalatedToHigh: false,
    factoryGenerateOnRender: DESIGN_ASSET_FACTORY.generateOnRender
  };
}

export function buildOwnerQualityReviewConsolidationSummary(root = DEFAULT_ROOT) {
  const apple = auditAppleDormantRootCause(root);
  const integrity = buildQualityPlanningIntegritySummary(root);
  const audit = auditRequiredVariantQualityIntegrity(root);
  const states = audit.planningStates;
  const costs = integrity.costs;
  const unresolved = (audit.variants || []).filter(
    (row) =>
      row.qualityPlanningState === QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED ||
      row.qualityPlanningState === QUALITY_PLANNING_STATE.UNKNOWN_BLOCKED
  );
  const identityHolds = (audit.variants || []).filter((row) => row.botanicalIdentityBlocker);
  const promptPrep = buildBranchStructureV2ExperimentPromptRecord({
    canonicalSlug: 'apple',
    scientific: 'Malus domestica',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant',
    jobId: 'apple__mature__tree__dormant__branch-structure-v2-experiment'
  });
  const spend = executeOwnerQualityReviewConsolidation();
  return {
    contract: OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION,
    verdict: 'OWNER_QUALITY_REVIEW_CONSOLIDATED_V1_READY',
    ownerReviewRecord: OWNER_QUALITY_REVIEW_RECORD,
    validatedQualityFamilies: Object.entries(OWNER_QUALITY_REVIEW_RECORD.families)
      .filter(([, row]) => row.familyResult === 'MEDIUM_POLICY_VALIDATED' || row.HIGH_selectiveNotUniversal)
      .map(([family, row]) => ({
        family,
        result: row.familyResult || 'HIGH_SELECTIVE_PREFERRED',
        detailPolicy: row.DETAIL_POLICY || row.DETAIL_QA || null
      })),
    branchStructureStatus: 'QUALITY_POLICY_NOT_VALIDATED',
    appleDormantRootCause: {
      rootCause: apple.rootCause,
      classification: apple.classification,
      fullyOpaquePixels: apple.pixels.fullyOpaque,
      brownShareOfPartial: apple.pixels.brownShareOfPartial,
      escalateToHighNow: false
    },
    botanicalIdentityHolds: identityHolds.map((row) => ({
      canonicalSlug: row.canonicalSlug,
      architectureMode: row.architectureMode,
      growthStage: row.growthStage,
      phenologyState: row.phenologyState,
      botanicalIdentityBlocker: row.botanicalIdentityBlocker,
      qualityPlanningState: row.qualityPlanningState,
      DETAIL_POLICY_SEPARATE: true
    })),
    audit273: {
      requiredVariantsTotal: audit.requiredVariantsTotal,
      planningStates: states,
      plannedQuality: audit.plannedQuality,
      unknownBaseDetailClass: audit.unknownBaseDetailClass
    },
    costs: {
      unitEstimateUsd: PLANNING_COST_ESTIMATE_USD,
      PROJECTED_SUPPORTED_ASSET_COST: costs.evidenceSupportedProduction.PROJECTED_SUPPORTED_ASSET_COST,
      PROJECTED_FALLBACK_COST: costs.fallbackProjection.PROJECTED_FALLBACK_COST,
      UNRESOLVED_COST_COUNT: costs.calibrationRequired.UNRESOLVED_COST_COUNT,
      evidenceSupportedProduction: costs.evidenceSupportedProduction,
      mediumDefaultUnprovenProjection: costs.mediumDefaultUnprovenProjection,
      blockedOrCalibrationRequired: costs.calibrationRequired,
      notSpendAuthorization: true
    },
    unresolvedVariants: unresolved.map((row) => ({
      canonicalSlug: row.canonicalSlug,
      architectureMode: row.architectureMode,
      growthStage: row.growthStage,
      phenologyState: row.phenologyState,
      baseDetailClass: row.baseDetailClass,
      variantDetailDemand: row.variantDetailDemand,
      plannedQuality: row.plannedQuality,
      qualityPlanningState: row.qualityPlanningState,
      evidenceBasis: row.evidenceBasis,
      botanicalIdentityBlocker: row.botanicalIdentityBlocker || null,
      calibrationNeeded: row.calibrationNeeded
    })),
    massGeneration: integrity.massGeneration,
    nextMinimalCalibration: {
      ...APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
      promptPreviewLength: promptPrep.prompt.length,
      generateNow: false,
      execute: false
    },
    oliveRemainsOnlyApprovedDesignAssetUnlessPriorExplicitApproval: true,
    spend,
    confirms: {
      imageGeneration: 0,
      openaiCalls: 0,
      productionRegistryChanged: 'NO',
      assetsAutoApproved: 0,
      universalHigh: 'NO',
      appleDormantAutoEscalatedToHigh: 'NO',
      spendGate: 'DENIED',
      additionalSpendUsd: 0
    }
  };
}

export function writeOwnerQualityReviewConsolidationReports(root = DEFAULT_ROOT) {
  const before = snapshotProtectedBinaries(root);
  assertAppleDormantUnmodified(root);
  const dir = path.join(root, 'data', 'garden-design', 'owner-quality-review-consolidation-v1');
  fs.mkdirSync(dir, { recursive: true });
  const apple = auditAppleDormantRootCause(root);
  const summary = buildOwnerQualityReviewConsolidationSummary(root);
  const integrityWritten = writeQualityPlanningIntegrityReports(root);
  writeDesignAssetQualityPolicyReports(root);
  const resultsPath = path.join(root, RESULTS_REL);
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  results.jobs = applyOwnerVisualQaToFinalJobs(results.jobs);
  results.ownerQualityReviewConsolidationV1 = {
    recorded: true,
    authoritative: true,
    contract: OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION,
    assetsAutoApproved: 0
  };
  fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  const files = {
    summaryPath: path.join(dir, 'consolidation-summary.json'),
    ownerRecordPath: path.join(dir, 'owner-review-record.json'),
    applePath: path.join(dir, 'apple-dormant-root-cause.json'),
    nextExperimentPath: path.join(dir, 'next-apple-branch-structure-experiment.json'),
    recalcPath: path.join(dir, 'required-variant-quality-recalc.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    files.ownerRecordPath,
    `${JSON.stringify({ contract: OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION, ...OWNER_QUALITY_REVIEW_RECORD }, null, 2)}\n`
  );
  fs.writeFileSync(files.applePath, `${JSON.stringify(apple, null, 2)}\n`);
  fs.writeFileSync(
    files.nextExperimentPath,
    `${JSON.stringify(
      {
        contract: OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION,
        ...APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT,
        promptRecord: buildBranchStructureV2ExperimentPromptRecord({
          canonicalSlug: 'apple',
          scientific: 'Malus domestica',
          visualForm: 'tree',
          architectureMode: 'tree',
          growthStage: 'mature',
          phenologyState: 'dormant'
        })
      },
      null,
      2
    )}\n`
  );
  const audit = auditRequiredVariantQualityIntegrity(root);
  fs.writeFileSync(
    files.recalcPath,
    `${JSON.stringify(
      {
        contract: OWNER_QUALITY_REVIEW_CONSOLIDATION_VERSION,
        requiredVariantsTotal: audit.requiredVariantsTotal,
        planningStates: audit.planningStates,
        plannedQuality: audit.plannedQuality,
        variants: audit.variants
      },
      null,
      2
    )}\n`
  );
  assertProtectedBinariesUnchanged(root, before);
  return {
    ...files,
    integritySummaryPath: integrityWritten.summaryPath,
    resultsPath,
    verdict: summary.verdict,
    massReady: summary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY,
    spend: summary.spend,
    appleRootCause: apple.rootCause
  };
}
