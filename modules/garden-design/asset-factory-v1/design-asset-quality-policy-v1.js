/**
 * Design Asset Quality Policy V1. Morphology-aware quality selection.
 * Planning only. Zero spend. No generation. No production registry write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAID_IMAGE_QUALITY } from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY } from './prompt-factory-visual-state-family-v1.js';
import {
  PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  buildVisualStateDetailV2PromptRecord
} from './prompt-factory-visual-state-detail-v2.js';
import { FACTORY_PLANNING_PATH_QUALITY_V1 } from './design-asset-factory-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const DESIGN_ASSET_QUALITY_POLICY_VERSION = 'design-asset-quality-policy-v1';

export const DETAIL_CLASS = Object.freeze({
  WOODY_DENSE_SMALL_LEAF: 'WOODY_DENSE_SMALL_LEAF',
  WOODY_OPEN_OR_LARGE_LEAF: 'WOODY_OPEN_OR_LARGE_LEAF',
  LARGE_LEAF_HERBACEOUS: 'LARGE_LEAF_HERBACEOUS',
  SHRUB_FINE_FOLIAGE: 'SHRUB_FINE_FOLIAGE',
  ROSETTE: 'ROSETTE',
  SUCCULENT: 'SUCCULENT',
  OTHER_STANDARD_DETAIL: 'OTHER_STANDARD_DETAIL',
  UNKNOWN: 'UNKNOWN'
});

export const DETAIL_CLASS_VALUES = Object.freeze(Object.values(DETAIL_CLASS));

export const DEFAULT_QUALITY = 'medium';
export const SELECTIVE_HIGH_QUALITY = 'high';
export const HIGH_DETAIL_CLASSES = Object.freeze([DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF]);

export const QUALITY_POLICY_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  generateNow: false,
  generateOnRender: false,
  automaticMediumThenHighRetry: false,
  universalHigh: false,
  defaultQuality: DEFAULT_QUALITY,
  highSelective: true,
  mangoCandidatesProductionApproved: false,
  productionRegistryWrite: false
});

export const AUTOMATIC_QUALITY_RETRY = Object.freeze({
  mediumThenHigh: false,
  inspectThenRegenerateHigh: false,
  note: 'Quality is chosen from detailClass before any paid call. Genuine QA exceptions need a separate owner-approved retry envelope. No automatic paid retry.'
});

export const WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT = Object.freeze({
  runId: 'design-asset-woody-foliage-detail-ab-1',
  CONTROL: {
    prompt: 'design-cutout-visual-state-family-v1',
    quality: 'medium',
    owner: 'DETAIL_SOFT',
    verdict: 'TOO_SOFT'
  },
  A: {
    prompt: 'design-cutout-woody-foliage-detail-v2-experiment',
    quality: 'medium',
    owner: 'ACCEPTABLE',
    verdict: 'ACCEPTABLE_GOOD'
  },
  B: {
    prompt: 'design-cutout-woody-foliage-detail-v2-experiment',
    quality: 'high',
    owner: 'PREFERRED',
    verdict: 'BETTER_THAN_A'
  },
  PROMPT_V2_VALIDATED: true,
  HIGH_UNIVERSAL: false,
  HIGH_FOR_WOODY_DENSE_SMALL_LEAF: 'candidate policy accepted',
  mangoCandidatesRemainCalibrationOnly: true,
  actualCostUsd: Object.freeze({
    A_medium: 0.013175,
    B_high: 0.044045,
    highOverMediumRatio: 3.343,
    ratioGuaranteedForever: false
  })
});

export const NEXT_PRODUCTION_PROMPT = Object.freeze({
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  supersedes: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY,
  historicalBatch2Prompt: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY,
  generateNow: false,
  appliedToPaidExecute: false
});

/**
 * Evidence-backed detailClass locks. Generation-planning metadata, not botanical identity.
 * HIGH is never inferred from visualForm=tree alone.
 */
export const EVIDENCE_LOCKED_DETAIL_CLASS = Object.freeze([
  {
    canonicalSlug: 'mango',
    architectureMode: 'tree',
    detailClass: DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF,
    evidence: 'owner-ab-1 woody foliage detail; dense small-leaf canopy',
    confidence: 'HIGH'
  },
  {
    canonicalSlug: 'apple',
    architectureMode: 'tree',
    detailClass: DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF,
    evidence: 'batch-2 native audit ASSET_DETAIL=SOFT on woody small-leaf canopy',
    confidence: 'MEDIUM'
  },
  {
    canonicalSlug: 'pomegranate',
    architectureMode: 'tree',
    detailClass: DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF,
    evidence: 'batch-2 native audit BORDERLINE woody foliage on tree architecture',
    confidence: 'MEDIUM'
  },
  {
    canonicalSlug: 'pomegranate',
    architectureMode: 'shrub',
    detailClass: DETAIL_CLASS.SHRUB_FINE_FOLIAGE,
    evidence: 'batch-2 native audit BORDERLINE shrub canopy; HIGH not evidenced for shrub form',
    confidence: 'MEDIUM'
  },
  {
    canonicalSlug: 'banana',
    architectureMode: 'default',
    detailClass: DETAIL_CLASS.LARGE_LEAF_HERBACEOUS,
    evidence: 'batch-2 native audit CRISP_ENOUGH at medium',
    confidence: 'HIGH'
  },
  {
    canonicalSlug: 'lavender',
    architectureMode: 'shrub',
    detailClass: DETAIL_CLASS.SHRUB_FINE_FOLIAGE,
    evidence: 'batch-2 native audit BORDERLINE; keep medium until HIGH evidence exists',
    confidence: 'MEDIUM'
  }
]);

const MEDIUM_FORM_HEURISTICS = Object.freeze({
  rosette: DETAIL_CLASS.ROSETTE,
  'succulent-form': DETAIL_CLASS.SUCCULENT
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function slugify(value) {
  return asText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isKnownDetailClass(value) {
  return DETAIL_CLASS_VALUES.includes(asText(value));
}

export function qualityForDetailClass(detailClass) {
  const cls = isKnownDetailClass(detailClass) ? detailClass : DETAIL_CLASS.UNKNOWN;
  if (HIGH_DETAIL_CLASSES.includes(cls)) return SELECTIVE_HIGH_QUALITY;
  return DEFAULT_QUALITY;
}

export function mayAutoEscalateQuality() {
  return {
    ok: false,
    automaticMediumThenHighRetry: false,
    reason: 'QUALITY_CHOSEN_BEFORE_PAID_CALL'
  };
}

export function resolveDetailClass(input = {}) {
  const explicit = asText(input.detailClass);
  if (explicit && isKnownDetailClass(explicit)) {
    return {
      detailClass: explicit,
      source: 'explicit',
      visualFormIsNotQualityAuthority: true
    };
  }
  const slug = slugify(input.canonicalSlug);
  const architecture = asText(input.architectureMode) || 'default';
  const locked = EVIDENCE_LOCKED_DETAIL_CLASS.find(
    (row) => row.canonicalSlug === slug && row.architectureMode === architecture
  );
  if (locked) {
    return {
      detailClass: locked.detailClass,
      source: 'evidence-locked',
      evidence: locked.evidence,
      confidence: locked.confidence,
      visualFormIsNotQualityAuthority: true
    };
  }
  const form = asText(input.visualForm);
  if (MEDIUM_FORM_HEURISTICS[form]) {
    return {
      detailClass: MEDIUM_FORM_HEURISTICS[form],
      source: 'safe-medium-visualForm-heuristic',
      visualFormIsNotQualityAuthority: true,
      note: 'Heuristic only assigns medium-quality classes. Tree/shrub never auto-promote to HIGH.'
    };
  }
  return {
    detailClass: DETAIL_CLASS.UNKNOWN,
    source: 'unknown-default-medium',
    visualFormIsNotQualityAuthority: true,
    note: 'Missing detailClass does not spend HIGH. visualForm=tree is not enough.'
  };
}

export function planDesignAssetGeneration(input = {}) {
  const resolved = resolveDetailClass(input);
  const quality = qualityForDetailClass(resolved.detailClass);
  const promptRecord = buildVisualStateDetailV2PromptRecord(input, {
    settings: { quality }
  });
  return {
    canonicalSlug: input.canonicalSlug || null,
    visualForm: input.visualForm || null,
    architectureMode: input.architectureMode || null,
    growthStage: input.growthStage || null,
    phenologyState: input.phenologyState || input.phenology || null,
    detailClass: resolved.detailClass,
    detailClassSource: resolved.source,
    quality,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
    generateNow: false,
    generateOnRender: false,
    automaticQualityRetry: false,
    spendGate: QUALITY_POLICY_SPEND_GATE.state,
    approvalStatus: 'not-production-approved',
    promptRecord
  };
}

export function auditRequiredVariantQuality(root = DEFAULT_ROOT) {
  const overlay = path.join(
    root,
    'data',
    'garden-design',
    'design-asset-visual-state-integrity-gate-v1',
    'catalog-integrity-audit.json'
  );
  const parsed = JSON.parse(fs.readFileSync(overlay, 'utf8'));
  const plants = Array.isArray(parsed.plants) ? parsed.plants : [];
  const rows = [];
  let medium = 0;
  let high = 0;
  for (const plant of plants) {
    for (const variant of plant.requiredVariants || []) {
      const plan = planDesignAssetGeneration({
        canonicalSlug: plant.canonicalSlug,
        visualForm: plant.visualForm,
        architectureMode: variant.architectureMode || plant.baselineVariant?.architectureMode,
        growthStage: variant.growthStage,
        phenologyState: variant.phenologyState
      });
      if (plan.quality === SELECTIVE_HIGH_QUALITY) high += 1;
      else medium += 1;
      rows.push({
        canonicalSlug: plant.canonicalSlug,
        visualForm: plant.visualForm,
        architectureMode: plan.architectureMode,
        growthStage: variant.growthStage,
        phenologyState: variant.phenologyState,
        detailClass: plan.detailClass,
        quality: plan.quality,
        detailClassSource: plan.detailClassSource
      });
    }
  }
  const actual = WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.actualCostUsd;
  const projectedFromActuals = +(medium * actual.A_medium + high * actual.B_high).toFixed(6);
  return {
    source: 'design-asset-visual-state-integrity-gate-v1 catalog-integrity-audit.json',
    requiredVariantsTotal: rows.length,
    expectedRequiredVariantsTotal: 273,
    countsMatchFrozenIntegrity: rows.length === 273,
    mediumCount: medium,
    highCount: high,
    unknownDetailClassCount: rows.filter((row) => row.detailClass === DETAIL_CLASS.UNKNOWN).length,
    projectedUsdFromAbActuals: projectedFromActuals,
    projectionDisclaimer:
      'Uses this-run A/B actuals as evidence only. Ratio is not guaranteed forever. Not a spend envelope. Do not execute.',
    execute273: false,
    visualStateCalibrationComplete: false,
    ownerMustReviewSpendEnvelopeBeforeAnyMassRun: true,
    variants: rows
  };
}

export function executeDesignAssetQualityPolicyV1() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    productionRegistryChanged: false,
    mangoCandidatesProductionApproved: false,
    universalHighEnabled: false,
    automaticMediumThenHighRetry: false,
    woodyFoliageAbSpendGate: 'DENIED'
  };
}

export function buildQualityPolicySummary(root = DEFAULT_ROOT) {
  const audit = auditRequiredVariantQuality(root);
  const execute = executeDesignAssetQualityPolicyV1();
  return {
    contract: DESIGN_ASSET_QUALITY_POLICY_VERSION,
    verdict: 'DESIGN_ASSET_QUALITY_POLICY_V1_READY',
    ownerResult: WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT,
    nextProductionPrompt: NEXT_PRODUCTION_PROMPT,
    detailClassTaxonomy: DETAIL_CLASS_VALUES,
    defaultQuality: DEFAULT_QUALITY,
    factoryDefaultQualityConstant: PAID_IMAGE_QUALITY,
    settingsDefaultQuality: DEFAULT_GENERATION_SETTINGS.quality,
    highSelectivePolicy: {
      classes: HIGH_DETAIL_CLASSES.slice(),
      treeVisualFormAloneIsNotEnough: true,
      bananaLargeLeafHerbaceousStaysMedium: true
    },
    unknownPolicy: {
      detailClass: DETAIL_CLASS.UNKNOWN,
      quality: DEFAULT_QUALITY,
      doNotSpendHighBecauseMetadataMissing: true
    },
    automaticQualityRetry: AUTOMATIC_QUALITY_RETRY,
    factoryPlanningPath: FACTORY_PLANNING_PATH_QUALITY_V1,
    requiredVariantQualityAuditProposal: {
      requiredVariantsTotal: audit.requiredVariantsTotal,
      mediumCount: audit.mediumCount,
      highCount: audit.highCount,
      unknownDetailClassCount: audit.unknownDetailClassCount,
      projectedUsdFromAbActuals: audit.projectedUsdFromAbActuals,
      execute273: false
    },
    spend: execute,
    confirms: {
      universalHighEnabled: false,
      defaultQuality: DEFAULT_QUALITY,
      highSelective: true,
      automaticMediumThenHighRetry: false,
      imageGeneration: 0,
      productionRegistryChanged: false,
      additionalSpendUsd: 0
    }
  };
}

export function writeDesignAssetQualityPolicyReports(root = DEFAULT_ROOT) {
  const dir = path.join(root, 'data', 'garden-design', 'design-asset-quality-policy-v1');
  fs.mkdirSync(dir, { recursive: true });
  const audit = auditRequiredVariantQuality(root);
  const summary = buildQualityPolicySummary(root);
  const files = {
    summaryPath: path.join(dir, 'quality-policy-summary.json'),
    taxonomyPath: path.join(dir, 'detail-class-taxonomy.json'),
    abResultPath: path.join(dir, 'woody-foliage-detail-ab-owner-result.json'),
    auditPath: path.join(dir, 'required-variant-quality-audit-proposal.json'),
    planningPath: path.join(dir, 'factory-planning-path.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    files.taxonomyPath,
    `${JSON.stringify(
      {
        contract: DESIGN_ASSET_QUALITY_POLICY_VERSION,
        detailClass: DETAIL_CLASS,
        evidenceLocked: EVIDENCE_LOCKED_DETAIL_CLASS,
        highClasses: HIGH_DETAIL_CLASSES,
        defaultQuality: DEFAULT_QUALITY,
        notBotanicalIdentity: true
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    files.abResultPath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_POLICY_VERSION, ...WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.auditPath,
    `${JSON.stringify({ contract: DESIGN_ASSET_QUALITY_POLICY_VERSION, ...audit }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.planningPath,
    `${JSON.stringify(
      {
        contract: DESIGN_ASSET_QUALITY_POLICY_VERSION,
        path: FACTORY_PLANNING_PATH_QUALITY_V1,
        generateOnRender: false,
        automaticQualityRetry: AUTOMATIC_QUALITY_RETRY,
        spendGate: QUALITY_POLICY_SPEND_GATE
      },
      null,
      2
    )}\n`
  );
  return { ...files, verdict: summary.verdict, spend: summary.spend };
}
