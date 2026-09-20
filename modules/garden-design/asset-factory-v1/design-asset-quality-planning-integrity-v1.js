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

export const STATE_SPECIFIC_HIGH_RULE_PROPOSED = Object.freeze({
  paidExecutionChanged: false,
  universalHigh: false,
  dormantAutomaticallyInheritsFoliageHigh: false,
  rule: 'HIGH only when baseDetailClass=WOODY_DENSE_SMALL_LEAF and variantDetailDemand=FOLIAGE_DENSE. DORMANT, young/open architecture, fruiting, and flowering are evaluated by their own detail demand and do not inherit foliage HIGH.',
  evidence: 'Owner A/B on mango mature vegetative (FOLIAGE_DENSE). Apple dormant is BRANCH_STRUCTURE, not dense foliage.'
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

export function planVariantQuality(input = {}) {
  const base = resolveBaseDetailClass(input);
  const demand = resolveVariantDetailDemand(input, base.baseDetailClass);
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
      confidence: 'LOW',
      calibrationNeeded: 'YES'
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

  if (foliageHigh) {
    qualityPlanningState = QUALITY_PLANNING_STATE.HIGH_EVIDENCE_SUPPORTED;
    plannedQuality = 'high';
    evidenceBasis =
      'Owner A/B design-asset-woody-foliage-detail-ab-1: V2+medium ACCEPTABLE, V2+high PREFERRED for FOLIAGE_DENSE on WOODY_DENSE_SMALL_LEAF. Generic class+demand transfer; not a species hard-code. Old-prompt softness is not treated as V2 proof.';
    confidence = asText(input.canonicalSlug).toLowerCase() === 'mango' ? 'HIGH' : 'MEDIUM';
    calibrationNeeded = asText(input.canonicalSlug).toLowerCase() === 'mango' ? 'NO' : 'NO';
  } else if (
    base.baseDetailClass === DETAIL_CLASS.LARGE_LEAF_HERBACEOUS &&
    demand === VARIANT_DETAIL_DEMAND.LARGE_LEAF_STRUCTURE
  ) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Batch-2 banana large-leaf herbaceous was CRISP_ENOUGH at medium. Do not promote Banana-like morphology to HIGH.';
    confidence = 'HIGH';
  } else if (demand === VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Dormant/branch structure must not inherit foliage HIGH. Apple dormant was BORDERLINE on the old prompt; Prompt V2 is unvalidated for BRANCH_STRUCTURE.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (demand === VARIANT_DETAIL_DEMAND.FLOWER_FINE_DETAIL) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Flowering is evaluated as FLOWER_FINE_DETAIL. Lavender flowering was BORDERLINE on the old prompt; not V2 evidence.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (demand === VARIANT_DETAIL_DEMAND.FRUIT_VISIBLE_DETAIL) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Fruiting is evaluated as FRUIT_VISIBLE_DETAIL and does not inherit dense-foliage HIGH. Existing fruiting assets used the old prompt family.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (demand === VARIANT_DETAIL_DEMAND.FOLIAGE_OPEN && WOODY_BASES.has(base.baseDetailClass)) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Young/open woody architecture is not dense small-leaf foliage. It does not inherit foliage HIGH.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (base.baseDetailClass === DETAIL_CLASS.SHRUB_FINE_FOLIAGE) {
    qualityPlanningState = QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis =
      'Lavender/pomegranate shrub were BORDERLINE on the old prompt. No Prompt V2 HIGH/medium calibration for SHRUB_FINE_FOLIAGE.';
    confidence = 'MEDIUM';
    calibrationNeeded = 'YES';
  } else if (base.baseDetailClass === DETAIL_CLASS.UNKNOWN || demand === VARIANT_DETAIL_DEMAND.UNKNOWN) {
    qualityPlanningState = QUALITY_PLANNING_STATE.MEDIUM_DEFAULT_UNPROVEN;
    plannedQuality = DEFAULT_QUALITY;
    evidenceBasis = 'Insufficient existing data for a proven quality choice. Medium is a cost-safe default, not evidence-supported.';
    confidence = 'LOW';
  }

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
    confidence,
    calibrationNeeded
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
    variants
  };
}

export function calibrationCoverageFromAudit(audit) {
  const has = (pred) => (audit.variants || []).some(pred);
  const family = (id, status, note) => ({ family: id, status, note });
  return [
    family(
      'WOODY_DENSE_SMALL_LEAF',
      'CALIBRATED',
      'Owner A/B V2 medium ACCEPTABLE / high PREFERRED for FOLIAGE_DENSE. Not repeated.'
    ),
    family(
      'WOODY_OPEN_OR_LARGE_LEAF',
      'UNVALIDATED',
      has((row) => row.baseDetailClass === DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF)
        ? 'Class present without V2 quality evidence'
        : 'No REQUIRED variant currently classified into this class from existing data'
    ),
    family(
      'LARGE_LEAF_HERBACEOUS',
      'PARTIALLY_CALIBRATED',
      'Banana medium CRISP_ENOUGH under previous prompt family. Not a Prompt V2 A/B.'
    ),
    family(
      'SHRUB_FINE_FOLIAGE',
      'PARTIALLY_CALIBRATED',
      'Lavender/pomegranate shrub BORDERLINE on old prompt. No V2 quality calibration.'
    ),
    family('ROSETTE', 'UNVALIDATED', 'Pineapple Batch-1 exists; no native quality calibration under Prompt V2.'),
    family('SUCCULENT', 'UNVALIDATED', 'Form-known succulents have no quality A/B.'),
    family(
      'BRANCH_STRUCTURE',
      'PARTIALLY_CALIBRATED',
      'Apple dormant BORDERLINE on old prompt. Must not inherit foliage HIGH.'
    ),
    family(
      'FLOWER_FINE_DETAIL',
      'PARTIALLY_CALIBRATED',
      'Lavender flowering BORDERLINE on old prompt. Individual florets not V2-calibrated.'
    ),
    family(
      'FRUIT_VISIBLE_DETAIL',
      'PARTIALLY_CALIBRATED',
      'Mango fruiting existed under old prompt and was SOFT; that is not V2 fruit calibration and must not reuse the woody-foliage A/B.'
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
  const knownEvidenceUsd = +(usd(highEvidence.length, HIGH_USD) + usd(mediumEvidence.length, MEDIUM_USD)).toFixed(6);
  const fallbackUsd = +(
    usd(highEvidence.length, HIGH_USD) + usd(rows.length - highEvidence.length - blocked.length, MEDIUM_USD)
  ).toFixed(6);
  return {
    unitEvidenceUsd: { medium: MEDIUM_USD, high: HIGH_USD, ratioGuaranteedForever: false },
    knownEvidence: {
      label: 'KNOWN-EVIDENCE COST',
      highEvidenceSupported: highEvidence.length,
      mediumEvidenceSupported: mediumEvidence.length,
      projectedUsd: knownEvidenceUsd
    },
    fallbackProjection: {
      label: 'FALLBACK_MEDIUM_PROJECTION_ONLY',
      not: 'PRODUCTION_BUDGET',
      notAFinalProductionBudget: true,
      mediumDefaultUnproven: unproven.length,
      highEvidenceSupportedChargedHigh: highEvidence.length,
      remainingPlannableChargedMedium: rows.length - highEvidence.length - blocked.length,
      unknownBlockedExcluded: blocked.length,
      projectedUsd: fallbackUsd
    },
    calibrationRequired: {
      label: 'CALIBRATION-REQUIRED COUNT',
      qualityCalibrationRequired: calibrationRequired.length,
      unknownBlocked: blocked.length,
      totalNotReadyToCommit: calibrationRequired.length + blocked.length
    }
  };
}

export function massGenerationReady(audit, coverage, costs) {
  const states = audit.planningStates || {};
  const incompleteFamilies = (coverage || [])
    .filter((row) => row.status !== 'CALIBRATED')
    .map((row) => row.family);
  return {
    QUALITY_POLICY_MASS_GENERATION_READY: 'NO',
    reasons: [
      'Launch-critical quality families are not fully CALIBRATED',
      `${states.QUALITY_CALIBRATION_REQUIRED || 0} variants are QUALITY_CALIBRATION_REQUIRED`,
      `${states.UNKNOWN_BLOCKED || 0} variants are UNKNOWN_BLOCKED`,
      `${states.MEDIUM_DEFAULT_UNPROVEN || 0} variants are MEDIUM_DEFAULT_UNPROVEN, which is not evidence-supported`,
      'Fallback projection is FALLBACK_MEDIUM_PROJECTION_ONLY, not a production budget',
      'State-specific HIGH rule is proposed only; paid execution policy is unchanged'
    ],
    incompleteFamilies,
    fallbackIsNotProductionBudget: costs?.fallbackProjection?.notAFinalProductionBudget === true,
    generateNow: false
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
      plannedQuality: audit.plannedQuality
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
