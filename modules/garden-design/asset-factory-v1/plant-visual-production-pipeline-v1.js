/**
 * CRUVIT Plant Visual Production Pipeline V1.
 *
 * Turns canonical catalog demand into a deterministic visual-production plan,
 * evaluates generated candidates through mandatory gates, and builds immutable
 * production registry records. Lookup/render never generates.
 */
import { detectDesignAssetGaps } from './gap-detector-v1.js';
import { planDesignAssetGeneration } from './design-asset-quality-policy-v1.js';
import { assessProductionFramingQa } from './production-framing-qa-v1.js';
import { derivePresentationSizing } from './presentation-sizing-v1.js';
import { deriveInGardenQaScale } from './in-garden-qa-scale-policy-v1.js';

export const PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION = 'plant-visual-production-pipeline-v1';

export const PLANT_VISUAL_PIPELINE_STAGES = Object.freeze([
  'canonical-identity',
  'required-visual-states',
  'coverage-gap-detection',
  'quality-and-prompt-planning',
  'owner-spend-envelope',
  'image-generation',
  'technical-qa',
  'framing-qa',
  'botanical-identity-qa',
  'state-and-architecture-qa',
  'in-garden-qa',
  'presentation-sizing',
  'promotion-gate',
  'immutable-publish',
  'registry-activation'
]);

export const PLANT_VISUAL_DECISION = Object.freeze({
  AUTO_PASS: 'AUTO_PASS',
  OWNER_REVIEW: 'OWNER_REVIEW',
  REGENERATE: 'REGENERATE',
  REJECT: 'REJECT',
  BLOCKED: 'BLOCKED'
});

export const PLANT_VISUAL_AUTOMATION_POLICY = Object.freeze({
  generateOnLookup: false,
  generateOnRender: false,
  paidNetworkDefault: 'DENY',
  autoApprovalDefault: false,
  exceptionOnlyOwnerReviewTarget: true,
  productionApprovedRequiredForNewAssets: true,
  silentBinaryReplacementForbidden: true,
  preserveSourceResolution: true
});

function qaResult(value) {
  if (!value) return 'UNKNOWN';
  if (typeof value === 'string') return value.toUpperCase();
  return String(value.result || value.status || value.verdict || 'UNKNOWN').toUpperCase();
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

export function buildPlantVisualProductionPlan(plants = [], registry = {}, signals = {}, options = {}) {
  const gaps = detectDesignAssetGaps(plants, registry, signals);
  const jobs = gaps.jobs.map((job) => {
    const generation = planDesignAssetGeneration(job);
    const formStageKey = `${job.visualForm || 'unknown'}::${job.growthStage || 'mature'}`;
    const inGardenQaScalePlan = deriveInGardenQaScale(job, {
      ownerCalibration: options.ownerScaleCalibration || null,
      statureHint:
        (options.statureHintByJobId && options.statureHintByJobId[job.jobId])
        || (options.statureHintBySlug && options.statureHintBySlug[job.canonicalSlug])
        || null,
      calibrationStatus:
        (options.qaScaleCalibrationStatusByFormStage
          && options.qaScaleCalibrationStatusByFormStage[formStageKey])
        || 'unvalidated'
    });
    return {
      ...job,
      pipelineVersion: PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION,
      state: 'NEEDED',
      qualityPlan: {
        detailClass: generation.detailClass,
        detailClassSource: generation.detailClassSource,
        quality: generation.quality,
        promptTemplateVersion: generation.promptTemplateVersion
      },
      promptRecord: generation.promptRecord,
      imageGenerationRequired: true,
      technicalQaRequired: true,
      framingQaRequired: true,
      botanicalIdentityQaRequired: true,
      inGardenQaRequired: true,
      inGardenQaScalePlan,
      presentationSizingRequired: true,
      productionApprovedRequired: true,
      autoApprovalEnabled: options.autoApprovalEnabled === true
    };
  });
  return {
    version: PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION,
    stages: PLANT_VISUAL_PIPELINE_STAGES,
    policy: PLANT_VISUAL_AUTOMATION_POLICY,
    requiredGapCount: gaps.requiredGapCount,
    blockedCount: gaps.blocked.length,
    jobs,
    blocked: gaps.blocked,
    generationStarted: false,
    paidCalls: 0,
    productionRegistryWritten: false
  };
}

export function evaluatePlantVisualCandidate(candidate = {}, options = {}) {
  const technical = candidate.technicalQa || { result: 'UNKNOWN', metrics: {} };
  const framing = candidate.framingQa || assessProductionFramingQa(technical);
  const identity = candidate.botanicalIdentityQa || candidate.identityQa || { result: 'UNKNOWN' };
  const architecture = candidate.architectureQa || { result: 'UNKNOWN' };
  const growth = candidate.growthStageQa || { result: 'UNKNOWN' };
  const phenology = candidate.phenologyStateQa || { result: 'UNKNOWN' };
  const inGarden = candidate.inGardenQa || { result: 'UNKNOWN' };
  const owner = candidate.ownerVisualQa || { result: 'UNKNOWN' };
  const presentation = candidate.presentationSizing || derivePresentationSizing({
    visualForm: candidate.job?.visualForm || candidate.visualForm,
    architectureMode: candidate.job?.architectureMode || candidate.architectureMode,
    width: technical.metrics?.width,
    height: technical.metrics?.height,
    alphaBBox: technical.metrics?.bbox
  });

  const reasons = [];
  const techResult = qaResult(technical);
  const framingResult = qaResult(framing);
  const identityResult = qaResult(identity);
  const architectureResult = qaResult(architecture);
  const growthResult = qaResult(growth);
  const phenologyResult = qaResult(phenology);
  const inGardenResult = qaResult(inGarden);
  const ownerResult = qaResult(owner);

  if (techResult === 'FAIL') reasons.push(...(technical.reasons || ['technical-qa-failed']));
  if (framingResult === 'FAIL') reasons.push(...(framing.reasons || ['framing-qa-failed']));
  if (identityResult === 'FAIL') reasons.push('botanical-identity-failed');
  if (architectureResult === 'FAIL') reasons.push('architecture-failed');
  if (growthResult === 'FAIL') reasons.push('growth-stage-failed');
  if (phenologyResult === 'FAIL') reasons.push('phenology-state-failed');
  if (inGardenResult === 'FAIL') reasons.push(...(inGarden.reasonCodes || ['in-garden-qa-failed']));
  if (inGardenResult === 'BLOCKED') reasons.push(...(inGarden.reasonCodes || ['in-garden-qa-blocked']));
  if (presentation.status === 'CALIBRATION_BLOCKED') reasons.push(presentation.reason || 'presentation-sizing-blocked');

  let decision = PLANT_VISUAL_DECISION.OWNER_REVIEW;
  if (identityResult === 'FAIL') decision = PLANT_VISUAL_DECISION.REJECT;
  else if (techResult === 'FAIL' || framingResult === 'FAIL') decision = PLANT_VISUAL_DECISION.REGENERATE;
  else if (inGardenResult === 'BLOCKED' || presentation.status === 'CALIBRATION_BLOCKED') {
    decision = PLANT_VISUAL_DECISION.BLOCKED;
  } else {
    const mandatoryPass =
      techResult === 'PASS' &&
      framingResult === 'PASS' &&
      identityResult === 'PASS' &&
      architectureResult === 'PASS' &&
      growthResult === 'PASS' &&
      phenologyResult === 'PASS' &&
      inGardenResult === 'PASS' &&
      presentation.status === 'CALIBRATED_BASELINE';
    const ownerPass = ownerResult === 'PASS' || ownerResult === 'APPROVED';
    const autoApprovalEnabled = options.autoApprovalEnabled === true;
    const calibratedAutoApproval = options.calibratedAutoApproval === true;
    if (mandatoryPass && autoApprovalEnabled && calibratedAutoApproval) {
      decision = PLANT_VISUAL_DECISION.AUTO_PASS;
    } else if (mandatoryPass && ownerPass) {
      decision = PLANT_VISUAL_DECISION.AUTO_PASS;
    } else {
      decision = PLANT_VISUAL_DECISION.OWNER_REVIEW;
      if (identityResult !== 'PASS') reasons.push('botanical-identity-review-required');
      if (architectureResult !== 'PASS') reasons.push('architecture-review-required');
      if (growthResult !== 'PASS') reasons.push('growth-stage-review-required');
      if (phenologyResult !== 'PASS') reasons.push('phenology-review-required');
      if (inGardenResult !== 'PASS') reasons.push('in-garden-review-required');
      if (!ownerPass && !autoApprovalEnabled) reasons.push('owner-visual-review-required');
    }
  }

  return {
    version: PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION,
    decision,
    productionApproved: decision === PLANT_VISUAL_DECISION.AUTO_PASS,
    retryRecommended: decision === PLANT_VISUAL_DECISION.REGENERATE,
    ownerReviewRequired: decision === PLANT_VISUAL_DECISION.OWNER_REVIEW,
    reasons: unique(reasons),
    gates: {
      technical: techResult,
      framing: framingResult,
      botanicalIdentity: identityResult,
      architecture: architectureResult,
      growthStage: growthResult,
      phenologyState: phenologyResult,
      inGarden: inGardenResult,
      ownerVisual: ownerResult,
      presentationSizing: presentation.status
    },
    framingQa: framing,
    presentationSizing: presentation
  };
}

function groundAnchorFromBbox(bbox, width, height) {
  if (!bbox || bbox.exists === false || !width || !height) return null;
  return {
    nx: ((Number(bbox.minX) + Number(bbox.maxX)) / 2) / Number(width),
    ny: Number(bbox.maxY) / Number(height),
    source: 'alpha-bbox-base-center'
  };
}

export function buildApprovedRegistryVariant(candidate = {}, decisionInput = null) {
  const decision = decisionInput || evaluatePlantVisualCandidate(candidate, candidate.approvalOptions || {});
  if (decision.productionApproved !== true) {
    const err = new Error('PRODUCTION_APPROVAL_REQUIRED');
    err.code = 'PRODUCTION_APPROVAL_REQUIRED';
    err.decision = decision.decision;
    throw err;
  }
  const job = candidate.job || candidate;
  const technical = candidate.technicalQa || {};
  const metrics = technical.metrics || {};
  const bbox = metrics.bbox || candidate.alphaBBox || null;
  const width = Number(metrics.width || candidate.width || 0);
  const height = Number(metrics.height || candidate.height || 0);
  const presentation = decision.presentationSizing;
  return {
    assetId: candidate.assetId || job.jobId,
    canonicalSlug: job.canonicalSlug,
    scientific: job.scientific || candidate.scientific || null,
    identityScope: job.identityScope || candidate.identityScope || null,
    identityPrecision: job.identityPrecision || candidate.identityPrecision || null,
    cultivarSpecific: candidate.cultivarSpecific === true,
    visualForm: job.visualForm || candidate.visualForm || null,
    architectureMode: job.architectureMode || candidate.architectureMode || null,
    growthStage: job.growthStage || candidate.growthStage || 'unspecified',
    phenology: job.phenology || job.phenologyState || candidate.phenology || 'vegetative',
    phenologyState: job.phenologyState || job.phenology || candidate.phenologyState || 'vegetative',
    season: job.season || candidate.season || 'unknown',
    formView: job.formView || candidate.formView || null,
    file: candidate.file,
    url: candidate.url || null,
    width,
    height,
    baseWidthPx: presentation.baseWidthPx,
    alphaBBox: bbox,
    groundAnchor: groundAnchorFromBbox(bbox, width, height),
    approvalStatus: 'approved',
    approvalState: 'APPROVED',
    productionApproved: true,
    transparencyReady: true,
    comingSoon: false,
    status: 'ready',
    sha256: candidate.sha256 || candidate.checksum || null,
    checksum: candidate.sha256 || candidate.checksum || null,
    bytes: Number(candidate.bytes || 0) || null,
    promptTemplateVersion: candidate.promptTemplateVersion || candidate.promptRecord?.promptTemplateVersion || null,
    quality: candidate.quality || candidate.qualityPlan?.quality || null,
    technicalQA: decision.gates.technical,
    framingQA: decision.gates.framing,
    botanicalIdentityQA: decision.gates.botanicalIdentity,
    architectureQA: decision.gates.architecture,
    growthStageQA: decision.gates.growthStage,
    phenologyStateQA: decision.gates.phenologyState,
    inGardenQA: decision.gates.inGarden,
    ownerVisualQA: decision.gates.ownerVisual,
    presentationSizing: presentation,
    provenance: {
      pipeline: PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION,
      generationRunId: candidate.generationRunId || candidate.runId || null,
      provider: candidate.provider || null,
      model: candidate.model || null,
      sourceResolutionPreserved: true,
      silentReplacement: false
    },
    version: candidate.assetVersion || job.assetVersion || 'v1'
  };
}

export function summarizePlantVisualPipeline(plan = {}, evaluated = []) {
  const decisions = evaluated.map((row) => row.decision || row.evaluation?.decision).filter(Boolean);
  const count = (value) => decisions.filter((d) => d === value).length;
  return {
    version: PLANT_VISUAL_PRODUCTION_PIPELINE_VERSION,
    plannedJobs: Number(plan.jobs?.length || 0),
    blockedBeforeSpend: Number(plan.blocked?.length || 0),
    evaluatedCandidates: evaluated.length,
    autoPass: count(PLANT_VISUAL_DECISION.AUTO_PASS),
    ownerReview: count(PLANT_VISUAL_DECISION.OWNER_REVIEW),
    regenerate: count(PLANT_VISUAL_DECISION.REGENERATE),
    rejected: count(PLANT_VISUAL_DECISION.REJECT),
    blocked: count(PLANT_VISUAL_DECISION.BLOCKED),
    ownerWorkloadTarget: 'exceptions-only',
    manualPerPlantGenerationTarget: false
  };
}
