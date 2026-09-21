/**
 * Design Asset Factory V1 — automation-first production architecture.
 *
 * Chat/manual generation is calibration only. Lookup never generates.
 * Paid execution is default-deny and requires a new owner spend envelope
 * for that run. This module does not flip live autonomousGeneration.
 */

export const DESIGN_ASSET_FACTORY_VERSION = '1.1.0';

export const DESIGN_ASSET_FACTORY = Object.freeze({
  version: DESIGN_ASSET_FACTORY_VERSION,
  architectureReady: true,
  catalogScaleOrchestrationImplemented: true,
  productionFramingQaImplemented: true,
  automaticPresentationSizingImplemented: true,
  autonomousGeneration: false,
  generateOnLookup: false,
  generateOnRender: false,
  manualPerPlantWorkflowIsFinal: false,
  autoApprovalImplemented: false,
  autoApprovalTarget: 'calibrated-exceptions-only',
  productionApprovedRequiredForNewAssets: true,
  automaticPresentationSizing: true,
  productionFramingQaRequired: true,
  liveRegistryWrites: false,
  paidNetworkDefault: 'DENY',
  fullPlantVisualPipelineImplemented: true,
  genericPaidGenerationExecutorImplemented: true,
  framingQaImplemented: true,
  presentationSizingImplemented: true,
  productionApprovalMetadataImplemented: true
});

export const FACTORY_PLANNING_PATH_QUALITY_V1 = Object.freeze([
  'canonical-plant',
  'required-visual-state',
  'visualForm-architectureMode',
  'detailClass',
  'generation-quality',
  'spend-gate',
  'generation'
]);

export const FACTORY_PIPELINE_STEPS = Object.freeze([
  'catalog-canonical',
  'visual-state-requirements',
  'existing-approved-asset-coverage',
  'missing-required-variants',
  'prioritize',
  'owner-spend-envelope',
  'prompt-factory',
  'capped-provider-generate',
  'technical-qa',
  'framing-qa',
  'identity-variant-qa',
  'in-garden-qa',
  'presentation-sizing',
  'bounded-retry',
  'promotion-gate',
  'candidate-registry',
  'owner-exceptions-only'
]);

export const FACTORY_JOB_STATES = Object.freeze({
  NEEDED: 'NEEDED',
  QUEUED: 'QUEUED',
  APPROVED_FOR_SPEND: 'APPROVED_FOR_SPEND',
  GENERATING: 'GENERATING',
  GENERATED: 'GENERATED',
  QA_PENDING: 'QA_PENDING',
  QA_FAILED: 'QA_FAILED',
  RETRY_APPROVED: 'RETRY_APPROVED',
  CANDIDATE: 'CANDIDATE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED'
});

export const FACTORY_PRIORITY_BANDS = Object.freeze({
  OWNED_PLANTS: 100,
  HIGH_FREQUENCY_RECOMMENDED: 80,
  GARDEN_DESIGN_SURFACED: 60,
  PORTFOLIO_LAUNCH_GAPS: 40,
  REMAINING_CATALOG: 10
});

export const AUTO_APPROVAL_ELIGIBLE_CRITERIA = Object.freeze({
  implemented: false,
  ownerReviewRequiredInitially: true,
  requires: Object.freeze([
    'technical-qa-pass',
    'identity-qa-pass-not-unknown',
    'morphology-authority-not-heuristic-unknown',
    'retry-count-within-envelope',
    'no-exception-flags',
    'calibrated-threshold-evidence'
  ]),
  lowConfidenceMustNotAutoApprove: true
});
