/**
 * Scalable cost + owner-workload model. Planning ranges are labeled as such.
 * Measured paid first-pass success is UNKNOWN until a successful calibration run.
 */
import { PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536 } from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { FACTORY_PRIORITY_BANDS } from './design-asset-factory-v1.js';

export const COST_MODEL_VERSION = '1.0.0';
export const GENERATION_USD_PER_IMAGE_OUTPUT = PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536;

/** Required vegetative/stage counts by visualForm (+ deciduous extra). */
export const REQUIRED_VARIANTS_BY_FORM = Object.freeze({
  tree_evergreen: 2,
  tree_deciduous: 3,
  shrub_evergreen: 2,
  shrub_deciduous: 3,
  climber_evergreen: 2,
  climber_deciduous: 3,
  palm: 3,
  rosette: 2,
  'herbaceous-clump': 2,
  'herbaceous-upright': 2,
  'grass-like': 2,
  groundcover: 2,
  'succulent-form': 2,
  unknown: 1
});

/**
 * Planning catalog mix — not a live census. Used only for scale estimates.
 */
export const PLANNING_FORM_MIX = Object.freeze([
  ['tree_evergreen', 0.1],
  ['tree_deciduous', 0.08],
  ['shrub_evergreen', 0.12],
  ['shrub_deciduous', 0.06],
  ['climber_evergreen', 0.04],
  ['climber_deciduous', 0.02],
  ['palm', 0.04],
  ['rosette', 0.05],
  ['herbaceous-clump', 0.1],
  ['herbaceous-upright', 0.12],
  ['grass-like', 0.06],
  ['groundcover', 0.07],
  ['succulent-form', 0.06],
  ['unknown', 0.08]
]);

export function averageRequiredVariants(mix = PLANNING_FORM_MIX) {
  let sum = 0;
  for (const [form, weight] of mix) {
    sum += (REQUIRED_VARIANTS_BY_FORM[form] || 1) * weight;
  }
  return +sum.toFixed(3);
}

export const MEASURED_FIRST_PASS_SUCCESS = Object.freeze({
  localGreyKeyBatch1: 0,
  paidNativeAlphaPilot2: 'UNKNOWN',
  note: 'Paid pilot returned HTTP 401 × 2, 0 images. First-pass native-alpha success is UNKNOWN until calibration produces images.'
});

export const PLANNING_SUCCESS_RATES = Object.freeze({
  pessimistic: 0.35,
  expected: 0.55,
  optimistic: 0.75,
  retryableShareOfFailures: 0.8,
  retriesPerRetryableFailure: 1,
  label: 'PLANNING_RANGE_NOT_MEASURED'
});

export function callsPerRequiredVariant(successRate, policy = PLANNING_SUCCESS_RATES) {
  const fail = 1 - successRate;
  return 1 + fail * policy.retryableShareOfFailures * policy.retriesPerRetryableFailure;
}

export function estimateScale(plantCount, options = {}) {
  const avgVariants = options.averageRequiredVariants || averageRequiredVariants();
  const requiredVariants = plantCount * avgVariants;
  const usd = options.usdPerCall || GENERATION_USD_PER_IMAGE_OUTPUT;
  const rows = {};
  for (const [label, rate] of [
    ['pessimistic', PLANNING_SUCCESS_RATES.pessimistic],
    ['expected', PLANNING_SUCCESS_RATES.expected],
    ['optimistic', PLANNING_SUCCESS_RATES.optimistic]
  ]) {
    const calls = requiredVariants * callsPerRequiredVariant(rate);
    rows[label] = {
      plants: plantCount,
      averageRequiredVariants: avgVariants,
      requiredVariants: +requiredVariants.toFixed(1),
      firstPassSuccess: rate,
      generationCalls: Math.round(calls),
      generationCostUsd: +(calls * usd).toFixed(2),
      qaCostUsd: 0,
      qaCostNote: 'Technical QA is local ($0). Paid identity QA is UNKNOWN and excluded unless added to the same envelope.',
      storageCostUsd: 'UNKNOWN',
      source: PLANNING_SUCCESS_RATES.label
    };
  }
  return rows;
}

export function ownerWorkloadModel() {
  return {
    routineOwnerActions: 0,
    ownerInvolvement: [
      'spend-envelope-approval',
      'qa-exceptions',
      'policy-changes',
      'unusually-expensive-batches'
    ],
    per100AssetsAfterCalibration: {
      expectedInterventions: '1-3',
      duringCalibration: '5-15',
      source: 'PLANNING_RANGE_NOT_MEASURED'
    },
    autoApproval: 'not-implemented'
  };
}

export { FACTORY_PRIORITY_BANDS };
