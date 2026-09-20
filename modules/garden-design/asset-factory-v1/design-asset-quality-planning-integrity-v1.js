/**
 * Design Asset Quality Planning Integrity Gate V1.
 * Two-layer quality planning before mass generation.
 * Zero spend. No image generation. No production registry write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';
import { PAPAYA_FORM_DECISION } from './multi-form-plant-architecture-v1.js';
import {
  DETAIL_CLASS,
  DEFAULT_QUALITY,
  QUALITY_POLICY_SPEND_GATE,
  WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT,
  resolveDetailClass
} from './design-asset-quality-policy-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION =
  'design-asset-quality-planning-integrity-v1';

export const VARIANT_DETAIL_DEMAND = Object.freeze({
  FOLIAGE_DENSE: 'FOLIAGE_DENSE',
  FOLIAGE_OPEN: 'FOLIAGE_OPEN',
  BRANCH_STRUCTURE: 'BRANCH_STRUCTURE',
  FLOWER_FINE_DETAIL: 'FLOWER_FINE_DETAIL',
  FRUIT_VISIBLE_DETAIL: 'FRUIT_VISIBLE_DETAIL',
  LARGE_LEAF_STRUCTURE: 'LARGE_LEAF_STRUCTURE',
  COARSE_FORM: 'COARSE_FORM',
  UNKNOWN: 'UNKNOWN'
});

export const QUALITY_PLANNING_STATE = Object.freeze({
  MEDIUM_EVIDENCE_SUPPORTED: 'MEDIUM_EVIDENCE_SUPPORTED',
  HIGH_EVIDENCE_SUPPORTED: 'HIGH_EVIDENCE_SUPPORTED',
  MEDIUM_DEFAULT_UNPROVEN: 'MEDIUM_DEFAULT_UNPROVEN',
  QUALITY_CALIBRATION_REQUIRED: 'QUALITY_CALIBRATION_REQUIRED',
  UNKNOWN_BLOCKED: 'UNKNOWN_BLOCKED'
});

export const CURRENT_AUDIT_LIMITATION = Object.freeze({
  requiredVariants: 273,
  previousMediumCount: 262,
  previousHighCount: 11,
  previousUnknownDetailClass: 251,
  previousProjectedUsd: 3.936345,
  label: 'FALLBACK_MEDIUM_PROJECTION_ONLY',
  not: 'PRODUCTION_BUDGET',
  reason: '251/273 variants had UNKNOWN detailClass, so the $3.94 figure cannot be a production spend estimate.'
});

export const STATE_SPECIFIC_HIGH_RULE_LOCKED = Object.freeze({
  paidExecutionChanged: false,
  universalHigh: false,
  appleDormantAutoEscalatedToHigh: false,
  dormantAutomaticallyInheritsFoliageHigh: false,
  youngAutomaticallyInheritsFoliageHigh: false,
  fruitingAutomaticallyInheritsFoliageHigh: false,
  rule: 'HIGH only when baseDetailClass=WOODY_DENSE_SMALL_LEAF and variantDetailDemand=FOLIAGE_DENSE and no contradictory evidence exists. DORMANT, young/open architecture, fruiting, and flowering are evaluated by their own detail demand and do not inherit foliage HIGH.',
  evidence:
    'Owner A/B on mango mature vegetative (FOLIAGE_DENSE): V2+medium ACCEPTABLE, V2+high PREFERRED, HIGH selective. Apple dormant BRANCH_STRUCTURE is MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP (Cleanup C). Do not auto-escalate BRANCH_STRUCTURE to HIGH.'
});

export const STATE_SPECIFIC_HIGH_RULE_PROPOSED = STATE_SPECIFIC_HIGH_RULE_LOCKED;

export const PLANNING_COST_ESTIMATE_USD = Object.freeze({
  medium: 0.013,
  high: 0.044,
  guaranteed: false,
  notSpendAuthorization: true,
  source: 'recent observed planning costs only as estimates'
});

const MEDIUM_USD = WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.actualCostUsd.A_medium;
const HIGH_USD = WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.actualCostUsd.B_high;

const SAFE_FORM_DETAIL_CLASS = Object.freeze({
  palm: DETAIL_CLASS.OTHER_STANDARD_DETAIL,
  'grass-like': DETAIL_CLASS.OTHER_STANDARD_DETAIL,
  groundcover: DETAIL_CLASS.OTHER_STANDARD_DETAIL
});

const WOODY_BASES = new Set([
  DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF,
  DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF,
  DETAIL_CLASS.SHRUB_FINE_FOLIAGE
]);

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function loadIntegrityPlants(root) {
  const filePath = path.join(
    root,
    'data',
    'garden-design',
    'design-asset-visual-state-integrity-gate-v1',
    'catalog-integrity-audit.json'
  );
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed.plants) ? parsed.plants : [];
}

export function resolveBaseDetailClass(input = {}) {
  const form = asText(input.visualForm);
  const blockers = Array.isArray(input.identityBlockers) ? input.identityBlockers : [];
  if (form === 'unknown' || blockers.includes('VISUAL_FORM_UNKNOWN')) {
    return {
      baseDetailClass: DETAIL_CLASS.UNKNOWN,
      source: 'visual-form-unresolved',
      blocked: true
    };
  }
  const slug = asText(input.canonicalSlug).toLowerCase();
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) {
    return {
      baseDetailClass: DETAIL_CLASS.OTHER_STANDARD_DETAIL,
      source: 'papaya-form-decision-not-woody-tree',
      blocked: false
    };
  }
  const locked = resolveDetailClass(input);
  if (locked.detailClass !== DETAIL_CLASS.UNKNOWN) {
    return {
      baseDetailClass: locked.detailClass,
      source: locked.source,
      evidence: locked.evidence || locked.note || null,
      blocked: false
    };
  }
  if (SAFE_FORM_DETAIL_CLASS[form]) {
    return {
      baseDetailClass: SAFE_FORM_DETAIL_CLASS[form],
      source: 'existing-visualForm-medium-safe',
      blocked: false,
      note: 'Form is known and is not a dense small-leaf woody canopy. Not a leaf-size invention.'
    };
  }
  return {
    baseDetailClass: DETAIL_CLASS.UNKNOWN,
    source: 'insufficient-existing-data',
    blocked: false,
    note: 'visualForm=tree or shrub is not enough to assign a foliage detail class.'
  };
}

export function resolveVariantDetailDemand(input = {}, baseDetailClass) {
  const phenology = asText(input.phenologyState || input.phenology);
  const stage = asText(input.growthStage);
  const base = baseDetailClass || DETAIL_CLASS.UNKNOWN;
  if (phenology === 'dormant') return VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE;
  if (phenology === 'flowering') return VARIANT_DETAIL_DEMAND.FLOWER_FINE_DETAIL;
  if (phenology === 'fruiting') return VARIANT_DETAIL_DEMAND.FRUIT_VISIBLE_DETAIL;
  if (stage === 'young') {
    if (base === DETAIL_CLASS.LARGE_LEAF_HERBACEOUS) return VARIANT_DETAIL_DEMAND.LARGE_LEAF_STRUCTURE;
    if (WOODY_BASES.has(base)) return VARIANT_DETAIL_DEMAND.FOLIAGE_OPEN;
    if (base === DETAIL_CLASS.ROSETTE || base === DETAIL_CLASS.SUCCULENT) {
      return VARIANT_DETAIL_DEMAND.COARSE_FORM;
    }
    return VARIANT_DETAIL_DEMAND.UNKNOWN;
  }
  if (phenology === 'vegetative' || !phenology) {
    if (base === DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF) return VARIANT_DETAIL_DEMAND.FOLIAGE_DENSE;
    if (base === DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF) return VARIANT_DETAIL_DEMAND.FOLIAGE_OPEN;
    if (base === DETAIL_CLASS.LARGE_LEAF_HERBACEOUS) return VARIANT_DETAIL_DEMAND.LARGE_LEAF_STRUCTURE;
    if (base === DETAIL_CLASS.SHRUB_FINE_FOLIAGE) return VARIANT_DETAIL_DEMAND.FOLIAGE_DENSE;
    if (base === DETAIL_CLASS.ROSETTE || base === DETAIL_CLASS.SUCCULENT || base === DETAIL_CLASS.OTHER_STANDARD_DETAIL) {
      return VARIANT_DETAIL_DEMAND.COARSE_FORM;
    }
  }
  return VARIANT_DETAIL_DEMAND.UNKNOWN;
}

function botanicalIdentityBlockerFor(input = {}) {
  const slug = asText(input.canonicalSlug).toLowerCase();
  const phenology = asText(input.phenologyState || input.phenology);
  if (slug === 'lavender' && (phenology === 'vegetative' || !phenology)) {
    return 'REVIEW_REQUIRED';
  }
  if (slug === 'aloe-vera') return 'ARCHITECTURE_REVIEW_REQUIRED';
  return null;
}

function reviewedCandidateApproval(input = {}) {
  const slug = asText(input.canonicalSlug).toLowerCase();
  const phenology = asText(input.phenologyState || input.phenology);
  const stage = asText(input.growthStage);
  const architecture = asText(input.architectureMode);
  const reviewed = [
    ['avocado', 'tree', 'mature', 'vegetative'],
    ['apple', 'tree', 'mature', 'dormant'],
    ['lavender', 'shrub', 'mature', 'vegetative'],
    ['lavender', 'shrub', 'mature', 'flowering'],
    ['banana', 'default', 'mature', 'fruiting'],
    ['pineapple', 'default', 'mature', 'vegetative'],
    ['aloe-vera', 'default', 'mature', 'vegetative']
  ];
  const hit = reviewed.some(
    (row) => row[0] === slug && row[1] === architecture && row[2] === stage && row[3] === phenology
  );
  return hit ? 'NO' : null;
}

export function planVariantQuality(input = {}) {
  const base = resolveBaseDetailClass(input);
  const demand = resolveVariantDetailDemand(input, base.baseDetailClass);
  const botanicalIdentityBlocker = botanicalIdentityBlockerFor(input);
  const assetProductionApproval = reviewedCandidateApproval(input);
  if (base.blocked) {
    return {
      canonicalSlug: input.canonicalSlug || null,
      architectureMode: input.architectureMode || null,
      growthStage: input.growthStage || null,
      phenologyState: input.phenologyState || null,
      baseDetailClass: DETAIL_CLASS.UNKNOWN,
      variantDetailDemand: VARIANT_DETAIL_DEMAND.UNKNOWN,
      qualityPlanningState: QUALITY_PLANNING_STATE.UNKNOWN_BLOCKED,
      plannedQuality: null,
      evidenceBasis: 'visualForm or identity is unresolved; quality cannot be planned',
      botanicalIdentityBlocker,
      assetProductionApproval,
      confidence: 'LOW',
      calibrationNeeded: 'YES',
      alphaCleanupRequired: false,
      alphaCleanupContract: null,
      highRequired: false,
      rawProviderPasses: null
    };
  }

  const foliageHigh =
    base.baseDetailClass === DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF &&
    demand === VARIANT_DETAIL_DEMAND.FOLIAGE_DENSE;

  let qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_DEFAULT_UNPROVEN;
  let plannedQuality = DEFAULT_QUALITY;
  let evidenceBasis = 'No HIGH evidence; medium by safe cost policy, not yet validated';
  let confidence = 'LOW';
  let calibrationNeeded = 'NO';

  if (demand === VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE) {
    const treeDormant =
      asText(input.visualForm).toLowerCase() === 'tree' && asText(input.architectureMode).toLowerCase() !== 'shrub';
    if (treeDormant) {
      qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
      plannedQuality = DEFAULT_QUALITY;
      evidenceBasis =
        'Owner design-asset-branch-alpha-salvage-1 selected CLEANUP C (EDGE_PRESERVING_C). BRANCH_STRUCTURE medium generation + deterministic alpha cleanup C is MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP. Raw provider PNG did not pass. HIGH is not required. Do not inherit foliage HIGH.';
      confidence = asText(input.canonicalSlug).toLowerCase() === 'apple' ? 'HIGH' : 'MEDIUM';
      calibrationNeeded = 'NO';
    } else {
      qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
      plannedQuality = DEFAULT_QUALITY;
      evidenceBasis =
        'BRANCH_STRUCTURE cleanup C is validated only for tree dormant variants. This form is out of scope until separately reviewed.';
      confidence = 'MEDIUM';
      calibrationNeeded = 'YES';
    }
  } else if (foliageHigh) {
    qualityPlanningState = QUALITY_PLANNING_STATE.HIGH_EVIDENCE_SUPPORTED;
    plannedQuality = 'high';
    evidenceBasis =
      'Owner A/B design-asset-woody-foliage-detail-ab-1: CONTROL old-prompt+medium DETAIL_SOFT; V2+medium ACCEPTABLE; V2+high PREFERRED for FOLIAGE_DENSE on WOODY_DENSE_SMALL_LEAF. HIGH remains selective. Medium is an acceptable fallback, not a universal HIGH policy.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'mango' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = 'NO';
  } else if (demand === VARIANT_DETAIL_DEMAND.FLOWER_FINE_DETAIL) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Owner quality-family-calibration-final-1 Lavender MATURE FLOWERING V2+medium DETAIL_OK and FLOWERING_DISTINCTION_CLEAR. FLOWER_FINE_DETAIL family is MEDIUM_POLICY_VALIDATED. Does not inherit foliage HIGH.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'lavender' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = 'NO';
  } else if (demand === VARIANT_DETAIL_DEMAND.FRUIT_VISIBLE_DETAIL) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Owner quality-family-calibration-final-1 Banana MATURE FRUITING V2+medium DETAIL_OK with readable fruit cluster. FRUIT_VISIBLE_DETAIL family is MEDIUM_POLICY_VALIDATED. Does not inherit foliage HIGH.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'banana' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = 'NO';
  } else if (
    base.baseDetailClass === DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF &&
    demand === VARIANT_DETAIL_DEMAND.FOLIAGE_OPEN
  ) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Owner quality-family-calibration-final-1 Avocado TREE MATURE VEGETATIVE V2+medium DETAIL_OK. WOODY_OPEN_OR_LARGE_LEAF does not inherit mango HIGH.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'avocado' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = 'NO';
  } else if (
    base.baseDetailClass === DETAIL_CLASS.LARGE_LEAF_HERBACEOUS &&
    demand === VARIANT_DETAIL_DEMAND.LARGE_LEAF_STRUCTURE
  ) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Banana large-leaf herbaceous: Batch-2 vegetative CRISP_ENOUGH at medium and owner quality-family-calibration-final-1 fruiting DETAIL_OK at V2+medium. Do not promote this morphology to HIGH.';
    confidence = 'HIGH';
    calibrationNeeded = 'NO';
  } else if (
    base.baseDetailClass === DETAIL_CLASS.SHRUB_FINE_FOLIAGE &&
    demand === VARIANT_DETAIL_DEMAND.FOLIAGE_DENSE
  ) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Owner quality-family-calibration-final-1 Lavender MATURE VEGETATIVE V2+medium DETAIL_OK. SHRUB_FINE_FOLIAGE detail policy is MEDIUM_POLICY_VALIDATED. Botanical identity QA remains a separate dimension and does not fail the medium quality policy.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'lavender' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = 'NO';
  } else if (
    (base.baseDetailClass === DETAIL_CLASS.ROSETTE || base.baseDetailClass === DETAIL_CLASS.SUCCULENT) &&
    demand === VARIANT_DETAIL_DEMAND.COARSE_FORM
  ) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      base.baseDetailClass === DETAIL_CLASS.ROSETTE
        ? 'Owner quality-family-calibration-final-1 Pineapple MATURE VEGETATIVE V2+medium DETAIL_OK. ROSETTE family is MEDIUM_POLICY_VALIDATED. Historical pineapple control is a different phenology/state and is not like-for-like evidence.'
        : 'Owner quality-family-calibration-final-1 Aloe Vera MATURE VEGETATIVE V2+medium DETAIL_OK. SUCCULENT family is MEDIUM_POLICY_VALIDATED. Architecture/pups remain a separate identity review, not a quality failure.';
    confidence = 'HIGH';
    calibrationNeeded = 'NO';
  } else if (demand === VARIANT_DETAIL_DEMAND.FOLIAGE_OPEN && WOODY_BASES.has(base.baseDetailClass)) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Young/open woody architecture on dense-small-leaf or fine-shrub classes is not the Avocado open/large-leaf family and does not inherit foliage HIGH.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (base.baseDetailClass === DETAIL_CLASS.UNKNOWN || demand === VARIANT_DETAIL_DEMAND.UNKNOWN) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_DEFAULT_UNPROVEN;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Insufficient existing data for a proven quality choice. Medium is a cost-safe default, not evidence-supported. visualForm name alone is not family evidence.';
    confidence = 'LOW';
    calibrationNeeded = 'NO';
  }

  const alphaCleanupRequired =
    demand === VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE &&
    qualityPlanningState === QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;

  return {
    canonicalSlug: input.canonicalSlug || null,
    architectureMode: input.architectureMode || null,
    growthStage: input.growthStage || null,
    phenologyState: input.phenologyState || null,
    baseDetailClass: base.baseDetailClass,
    variantDetailDemand: demand,
    qualityPlanningState,
    plannedQuality,
    evidenceBasis,
    botanicalIdentityBlocker,
    assetProductionApproval,
    confidence,
    calibrationNeeded,
    alphaCleanupRequired,
    alphaCleanupContract: alphaCleanupRequired ? 'BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1' : null,
    familyPolicy: alphaCleanupRequired ? 'MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP' : null,
    highRequired: foliageHigh,
    rawProviderPasses: alphaCleanupRequired ? false : null
  };
}

export function auditRequiredVariantQualityIntegrity(root = DEFAULT_ROOT) {
  const plants = loadIntegrityPlants(root);
  const variants = [];
  for (const plant of plants) {
    for (const variant of plant.requiredVariants || []) {
      variants.push(
        planVariantQuality({
          canonicalSlug: plant.canonicalSlug,
          visualForm: plant.visualForm,
          architectureMode: variant.architectureMode || plant.baselineVariant?.architectureMode,
          growthStage: variant.growthStage,
          phenologyState: variant.phenologyState,
          identityBlockers: plant.identityBlockers
        })
      );
    }
  }
  const tally = (state) => variants.filter((row) => row.qualityPlanningState === state).length;
  const unknownBase = variants.filter((row) => row.baseDetailClass === DETAIL_CLASS.UNKNOWN).length;
  return {
    requiredVariantsTotal: variants.length,
    previousUnknownDetailClass: CURRENT_AUDIT_LIMITATION.previousUnknownDetailClass,
    unknownBaseDetailClass: unknownBase,
    unknownReduction: CURRENT_AUDIT_LIMITATION.previousUnknownDetailClass - unknownBase,
    forcedClassification: false,
    planningStates: {
      MEDIUM_EVIDENCE_SUPPORTED: tally(QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED),
      HIGH_EVIDENCE_SUPPORTED: tally(QUALITY_PLANNING_STATE.HIGH_EVIDENCE_SUPPORTED),
      MEDIUM_DEFAULT_UNPROVEN: tally(QUALITY_PLANNING_STATE.MEDIUM_DEFAULT_UNPROVEN),
      QUALITY_CALIBRATION_REQUIRED: tally(QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED),
      UNKNOWN_BLOCKED: tally(QUALITY_PLANNING_STATE.UNKNOWN_BLOCKED)
    },
    plannedQuality: {
      medium: variants.filter((row) => row.plannedQuality === 'medium').length,
      high: variants.filter((row) => row.plannedQuality === 'high').length,
      unplanned: variants.filter((row) => row.plannedQuality == null).length
    },
    BRANCH_CLEANUP_REQUIRED_VARIANTS: variants.filter((row) => row.alphaCleanupRequired === true).length,
    variants
  };
}

export function calibrationCoverageFromAudit(audit) {
  const family = (id, status, note, launchCritical = true) => ({ family: id, status, note, launchCritical });
  return [
    family(
      'WOODY_DENSE_SMALL_LEAF',
      'CALIBRATED',
      'Owner A/B: CONTROL DETAIL_SOFT; V2+medium ACCEPTABLE; V2+high PREFERRED. HIGH selective only for FOLIAGE_DENSE.'
    ),
    family(
      'WOODY_OPEN_OR_LARGE_LEAF',
      'CALIBRATED',
      'Owner Avocado V2+medium DETAIL_OK. MEDIUM_POLICY_VALIDATED. Does not inherit mango HIGH.'
    ),
    family(
      'LARGE_LEAF_HERBACEOUS',
      'CALIBRATED',
      'Owner Banana fruiting V2+medium DETAIL_OK plus prior banana vegetative CRISP_ENOUGH. MEDIUM_POLICY_VALIDATED.'
    ),
    family(
      'SHRUB_FINE_FOLIAGE',
      'CALIBRATED',
      'Owner Lavender vegetative V2+medium DETAIL_OK. Detail policy PASS. Botanical identity remains REVIEW_REQUIRED on that asset and is a separate QA dimension.'
    ),
    family(
      'ROSETTE',
      'CALIBRATED',
      'Owner Pineapple vegetative V2+medium DETAIL_OK. Historical pineapple control is a different phenology/state and is not like-for-like evidence.'
    ),
    family(
      'SUCCULENT',
      'CALIBRATED',
      'Owner Aloe Vera vegetative V2+medium DETAIL_OK. Architecture/pups remain a separate identity review.'
    ),
    family(
      'BRANCH_STRUCTURE',
      'CALIBRATED',
      'Owner selected CLEANUP C on Apple TREE MATURE DORMANT. MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP. Raw provider PNG did not pass. HIGH not required. Launch-critical for deciduous coverage.'
    ),
    family(
      'FLOWER_FINE_DETAIL',
      'CALIBRATED',
      'Owner Lavender flowering V2+medium DETAIL_OK and FLOWERING_DISTINCTION_CLEAR. MEDIUM_POLICY_VALIDATED.'
    ),
    family(
      'FRUIT_VISIBLE_DETAIL',
      'CALIBRATED',
      'Owner Banana fruiting fruit cluster readable and plausible. MEDIUM_POLICY_VALIDATED. Does not inherit foliage HIGH.'
    ),
    family(
      'YOUNG_WOODY_FOLIAGE_OPEN',
      'NOT_VALIDATED',
      'Mango/Apple/Pomegranate young FOLIAGE_OPEN remain QUALITY_CALIBRATION_REQUIRED. Avocado WOODY_OPEN_OR_LARGE_LEAF medium evidence is a different morphology. Batch-2 mango young was ASSET_DETAIL_SOFT. Not launch-critical. Do not force closure.',
      false
    )
  ];
}

export const NEXT_QUALITY_CALIBRATION_SET = Object.freeze({
  execute: false,
  generateNow: false,
  spendGate: 'DENIED',
  superseded: true,
  supersededBy: 'design-asset-quality-family-calibration-final-1',
  supersededReason: 'Omitted WOODY_OPEN_OR_LARGE_LEAF. Do not execute this 6-job set.',
  doNotRepeatMangoWoodyFoliage: true,
  purpose: 'HISTORICAL_PROPOSAL_ONLY_SUPERSEDED',
  jobs: Object.freeze([
    {
      rank: 1,
      family: 'BRANCH_STRUCTURE',
      canonicalSlug: 'apple',
      architectureMode: 'tree',
      growthStage: 'mature',
      phenologyState: 'dormant',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: 'apple__mature__tree__dormant__v1.png',
      generateNow: false
    },
    {
      rank: 2,
      family: 'FLOWER_FINE_DETAIL',
      canonicalSlug: 'lavender',
      architectureMode: 'shrub',
      growthStage: 'mature',
      phenologyState: 'flowering',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: 'lavender__mature__shrub__flowering__v1.png',
      generateNow: false
    },
    {
      rank: 3,
      family: 'FRUIT_VISIBLE_DETAIL',
      canonicalSlug: 'banana',
      architectureMode: 'default',
      growthStage: 'mature',
      phenologyState: 'fruiting',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: 'banana__mature__default__vegetative__v1.png',
      generateNow: false,
      note: 'Not a mango woody-foliage redo. Fruiting demand on already CRISP_ENOUGH large-leaf morphology.'
    },
    {
      rank: 4,
      family: 'SHRUB_FINE_FOLIAGE',
      canonicalSlug: 'lavender',
      architectureMode: 'shrub',
      growthStage: 'mature',
      phenologyState: 'vegetative',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: 'lavender__mature__shrub__vegetative__v1.png',
      generateNow: false
    },
    {
      rank: 5,
      family: 'ROSETTE',
      canonicalSlug: 'pineapple',
      architectureMode: 'default',
      growthStage: 'mature',
      phenologyState: 'vegetative',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: 'pineapple-mature-rosette-vegetative-v1.png',
      generateNow: false
    },
    {
      rank: 6,
      family: 'SUCCULENT',
      canonicalSlug: 'aloe-vera',
      architectureMode: 'default',
      growthStage: 'mature',
      phenologyState: 'vegetative',
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      control: null,
      generateNow: false
    }
  ])
});

function usd(count, unit) {
  return +(count * unit).toFixed(6);
}

export function costViewsFromAudit(audit) {
  const rows = audit.variants || [];
  const highEvidence = rows.filter((row) => row.qualityPlanningState === QUALITY_PLANNING_STATE.HIGH_EVIDENCE_SUPPORTED);
  const mediumEvidence = rows.filter(
    (row) => row.qualityPlanningState === QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED
  );
  const unproven = rows.filter((row) => row.qualityPlanningState === QUALITY_PLANNING_STATE.MEDIUM_DEFAULT_UNPROVEN);
  const calibrationRequired = rows.filter(
    (row) => row.qualityPlanningState === QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED
  );
  const blocked = rows.filter((row) => row.qualityPlanningState === QUALITY_PLANNING_STATE.UNKNOWN_BLOCKED);
  const estimateMedium = PLANNING_COST_ESTIMATE_USD.medium;
  const estimateHigh = PLANNING_COST_ESTIMATE_USD.high;
  const knownEvidenceUsd = +(usd(highEvidence.length, estimateHigh) + usd(mediumEvidence.length, estimateMedium)).toFixed(6);
  const unprovenUsd = usd(unproven.length, estimateMedium);
  const fallbackUsd = +(
    usd(highEvidence.length, estimateHigh) + usd(rows.length - highEvidence.length - blocked.length, estimateMedium)
  ).toFixed(6);
  const unresolvedCount = calibrationRequired.length + blocked.length;
  return {
    unitEvidenceUsd: {
      medium: estimateMedium,
      high: estimateHigh,
      observedAbActuals: { medium: MEDIUM_USD, high: HIGH_USD },
      ratioGuaranteedForever: false,
      notSpendAuthorization: true
    },
    evidenceSupportedProduction: {
      label: 'EVIDENCE-SUPPORTED PRODUCTION PROJECTION',
      mediumEvidenceSupported: mediumEvidence.length,
      highEvidenceSupported: highEvidence.length,
      PROJECTED_SUPPORTED_ASSET_COST: knownEvidenceUsd,
      notSpendAuthorization: true
    },
    knownEvidence: {
      label: 'KNOWN-EVIDENCE COST',
      highEvidenceSupported: highEvidence.length,
      mediumEvidenceSupported: mediumEvidence.length,
      projectedUsd: knownEvidenceUsd
    },
    mediumDefaultUnprovenProjection: {
      label: 'MEDIUM_DEFAULT_UNPROVEN projection',
      mediumDefaultUnproven: unproven.length,
      PROJECTED_UNPROVEN_USD: unprovenUsd,
      separateFromEvidenceSupported: true,
      notSpendAuthorization: true
    },
    fallbackProjection: {
      label: 'FALLBACK_MEDIUM_PROJECTION_ONLY',
      not: 'PRODUCTION_BUDGET',
      notAFinalProductionBudget: true,
      mediumDefaultUnproven: unproven.length,
      highEvidenceSupportedChargedHigh: highEvidence.length,
      remainingPlannableChargedMedium: rows.length - highEvidence.length - blocked.length,
      unknownBlockedExcluded: blocked.length,
      PROJECTED_FALLBACK_COST: fallbackUsd,
      projectedUsd: fallbackUsd
    },
    calibrationRequired: {
      label: 'BLOCKED / CALIBRATION REQUIRED',
      qualityCalibrationRequired: calibrationRequired.length,
      unknownBlocked: blocked.length,
      UNRESOLVED_COST_COUNT: unresolvedCount,
      totalNotReadyToCommit: unresolvedCount,
      notIncludedAsCommittedProductionSpend: true
    }
  };
}

export function massGenerationReady(audit, coverage, costs) {
  const states = audit.planningStates || {};
  const launchCritical = (coverage || []).filter((row) => row.launchCritical !== false);
  const incompleteLaunch = launchCritical.filter((row) => row.status !== 'CALIBRATED');
  const ready = incompleteLaunch.length === 0;
  const reasons = ready
    ? [
        'Launch-critical quality families are CALIBRATED, including BRANCH_STRUCTURE via medium + Cleanup C',
        `${states.QUALITY_CALIBRATION_REQUIRED || 0} non-launch-critical variants remain QUALITY_CALIBRATION_REQUIRED and are excluded from committed generation demand`,
        `${states.UNKNOWN_BLOCKED || 0} UNKNOWN_BLOCKED variants remain excluded from generation demand`,
        'Quality-policy validation does not equal asset approval',
        'Fallback projection is FALLBACK_MEDIUM_PROJECTION_ONLY, not a production budget',
        'Do not start mass generation. generateNow remains false. Spend gate DENIED'
      ]
    : [
        'Launch-critical quality families are not fully CALIBRATED',
        ...incompleteLaunch.map((row) => `${row.family} is ${row.status}`)
      ];
  return {
    QUALITY_POLICY_MASS_GENERATION_READY: ready ? 'YES' : 'NO',
    reasons,
    incompleteFamilies: (coverage || []).filter((row) => row.status !== 'CALIBRATED').map((row) => row.family),
    incompleteLaunchCriticalFamilies: incompleteLaunch.map((row) => row.family),
    branchStructureUnresolved: incompleteLaunch.some((row) => row.family === 'BRANCH_STRUCTURE'),
    fallbackIsNotProductionBudget: costs?.fallbackProjection?.notAFinalProductionBudget === true,
    generateNow: false,
    startMassGeneration: false
  };
}

export function executeQualityPlanningIntegrity() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    newSourcing: 0,
    additionalSpendUsd: 0,
    spendGate: QUALITY_POLICY_SPEND_GATE.state,
    massGenerationStarted: false,
    productionRegistryChanged: false,
    factoryGenerateOnRender: DESIGN_ASSET_FACTORY.generateOnRender,
    factoryAutonomousGeneration: DESIGN_ASSET_FACTORY.autonomousGeneration
  };
}

export function buildQualityPlanningIntegritySummary(root = DEFAULT_ROOT) {
  const audit = auditRequiredVariantQualityIntegrity(root);
  const coverage = calibrationCoverageFromAudit(audit);
  const costs = costViewsFromAudit(audit);
  const mass = massGenerationReady(audit, coverage, costs);
  const spend = executeQualityPlanningIntegrity();
  return {
    contract: DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION,
    verdict: 'DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_V1_READY',
    policyDeploy: {
      commit: '50d2b81',
      productionGenerationInactive: DESIGN_ASSET_FACTORY.autonomousGeneration === false,
      spendGate: QUALITY_POLICY_SPEND_GATE.state,
      productionRegistryChanged: false
    },
    currentAuditLimitation: CURRENT_AUDIT_LIMITATION,
    baseDetailClass: Object.values(DETAIL_CLASS),
    variantDetailDemand: Object.values(VARIANT_DETAIL_DEMAND),
    qualityPlanningStates: Object.values(QUALITY_PLANNING_STATE),
    stateSpecificHighPolicy: STATE_SPECIFIC_HIGH_RULE_PROPOSED,
    audit273: {
      requiredVariantsTotal: audit.requiredVariantsTotal,
      unknownBaseDetailClass: audit.unknownBaseDetailClass,
      unknownReduction: audit.unknownReduction,
      forcedClassification: false,
      planningStates: audit.planningStates,
      plannedQuality: audit.plannedQuality,
      BRANCH_CLEANUP_REQUIRED_VARIANTS: audit.BRANCH_CLEANUP_REQUIRED_VARIANTS
    },
    calibrationCoverage: coverage,
    nextCalibrationSet: NEXT_QUALITY_CALIBRATION_SET,
    costs,
    massGeneration: mass,
    spend,
    confirms: {
      imageGeneration: 0,
      openaiCalls: 0,
      massGenerationStarted: 'NO',
      universalHigh: 'NO',
      dormantAutomaticallyInheritsFoliageHigh: 'NO',
      appleDormantAutoEscalatedToHigh: 'NO',
      productionRegistryChanged: 'NO',
      spendGate: 'DENIED',
      additionalSpendUsd: 0
    }
  };
}

export function writeQualityPlanningIntegrityReports(root = DEFAULT_ROOT) {
  const dir = path.join(root, 'data', 'garden-design', 'design-asset-quality-planning-integrity-v1');
  fs.mkdirSync(dir, { recursive: true });
  const audit = auditRequiredVariantQualityIntegrity(root);
  const summary = buildQualityPlanningIntegritySummary(root);
  const files = {
    summaryPath: path.join(dir, 'integrity-summary.json'),
    variantsPath: path.join(dir, 'required-variant-quality-integrity-audit.json'),
    coveragePath: path.join(dir, 'calibration-coverage.json'),
    nextSetPath: path.join(dir, 'next-quality-calibration-set.json'),
    costsPath: path.join(dir, 'cost-views.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    files.variantsPath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION, ...audit }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.coveragePath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION, coverage: summary.calibrationCoverage }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.nextSetPath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION, ...NEXT_QUALITY_CALIBRATION_SET }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.costsPath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_VERSION, ...summary.costs }, null, 2)}\n`
  );
  return { ...files, verdict: summary.verdict, spend: summary.spend, massReady: summary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY };
}
