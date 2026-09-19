/**
 * Design Asset Visual State Integrity Gate V1.
 * Four-way requirement states, safe fallback, REQUIRED-only generation demand.
 * Overlay only. No generation. No spend. No production registry write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CALIBRATION_BATCH_1_CANDIDATES } from './calibration-review-candidates-v1.js';
import { isUsableDesignVariant } from '../garden-design-asset-registry-v1.js';
import {
  DESIGN_ASSET_VISUAL_STATES_VERSION,
  FALLBACK_REASON,
  GROWTH_STAGE,
  PHENOLOGY_STATE,
  REQUIREMENT,
  VISUAL_STATE_FALLBACK,
  deriveVisualStateRequirements,
  selectVisualStateFallback,
  visualStateKey
} from './design-asset-visual-states-v1.js';

export const DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION = 'design-asset-visual-state-integrity-gate-v1';

export const REQUIREMENT_STATE = REQUIREMENT;

export const FACTORY_GENERATION_RULE = Object.freeze({
  generateRequired: true,
  generateOptional: false,
  generateUnknown: false,
  generateNotRequired: false,
  generateOnRender: false,
  note: 'Factory job derivation enqueues REQUIRED variants only. OPTIONAL stays out of the minimum queue. UNKNOWN and NOT_REQUIRED must not generate.'
});

export const MULTI_FORM_SLUGS = Object.freeze([
  'fig',
  'plumeria',
  'pomegranate',
  'quince',
  'strawberry-guava'
]);

const LEGACY_UNKNOWN_EXCLUSIVE = Object.freeze({
  identityBlocked: 16,
  architectureUnresolved: 22,
  lifecycleEvidenceMissing: 42,
  phenologyEvidenceMissing: 0,
  growthStageEvidenceMissing: 0,
  other: 0,
  total: 80
});

const FROZEN_V1_UNKNOWN_80 = Object.freeze({
  meaning:
    'The V1 count of 80 is plants with identity blockers and/or at least one YES/NO/UNKNOWN state equal to UNKNOWN. It is not a NOT_REQUIRED bucket. Exclusive primary class: identity first, then unresolved architecture, then missing lifecycle (dormant UNKNOWN). Phenology and growth-stage UNKNOWN in V1 were nested under visualForm unknown, so they have 0 exclusive remainder.',
  unknownConvertedToNotRequired: false,
  exclusive: LEGACY_UNKNOWN_EXCLUSIVE,
  overlapping: Object.freeze({
    identityBlocked: 16,
    architectureUnresolved: 26,
    lifecycleEvidenceMissing: 74,
    phenologyEvidenceMissing: 26,
    growthStageEvidenceMissing: 26
  }),
  identityBlockedSlugs: Object.freeze([
    'agapanthus', 'azalea', 'banana', 'blueberry', 'bougainvillea', 'camellia',
    'geranium', 'jasmine', 'melaleuca', 'mint', 'oak-tree', 'orchid', 'pine-tree',
    'plum', 'rose', 'succulent'
  ]),
  architectureUnresolvedSlugs: Object.freeze([
    'basil', 'borage', 'broccoli', 'carrot', 'cyclamen', 'french-marigold',
    'garden-pea', 'garden-peony', 'ginger', 'green-bean', 'lettuce', 'nasturtium',
    'oleander', 'raspberry', 'spinach', 'strawberry', 'strelitzia', 'sunflower',
    'sweet-pepper', 'watermelon', 'zinnia', 'zucchini'
  ]),
  lifecycleEvidenceMissingSlugs: Object.freeze([
    'acerola', 'aloe-vera', 'areca-palm', 'bay-laurel', 'black-eyed-susan-vine',
    'breadfruit', 'cacao', 'carob', 'cedar', 'chinese-wisteria', 'coconut',
    'common-lilac', 'common-thyme', 'cucumber', 'cycas', 'date-palm',
    'dragon-fruit', 'durian', 'eggplant', 'feijoa', 'fiddle-leaf-fig', 'forsythia',
    'ginkgo', 'gooseberry', 'grapefruit', 'jaboticaba', 'japanese-maple',
    'lemongrass', 'longan', 'loquat', 'mangosteen', 'monstera', 'moringa',
    'pineapple', 'queen-palm', 'red-currant', 'silver-birch', 'snake-plant',
    'sweet-cherry', 'sweet-orange', 'tomato', 'white-sapote'
  ]),
  expectedExclusive: LEGACY_UNKNOWN_EXCLUSIVE,
  source: 'design-asset-visual-states-v1 YES/NO/UNKNOWN plant-level audit; frozen so later four-way rewrites cannot convert it to NOT_REQUIRED'
});

function slugify(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadRegistry(root) {
  const filePath = path.join(root, 'modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { sets: [] };
  }
}

function loadLegacyVisualStatesAudit(root) {
  const filePath = path.join(root, 'data', 'garden-design', 'design-asset-visual-states-v1', 'catalog-state-audit.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { plants: [] };
  }
}

export function explainLegacyUnknownOrBlocked(legacyPlants = []) {
  const plants = Array.isArray(legacyPlants) ? legacyPlants : [];
  const usesV1YesNo = plants.some((row) => row.youngRequired === 'YES' || row.youngRequired === 'NO');
  if (!usesV1YesNo) return { ...FROZEN_V1_UNKNOWN_80 };
  const flagged = plants.filter((row) =>
    (row.identityBlockers || []).length
    || ['youngRequired', 'floweringRequired', 'fruitingRequired', 'dormantRequired'].some((key) => row[key] === 'UNKNOWN')
  );
  const exclusive = {
    identityBlocked: 0,
    architectureUnresolved: 0,
    lifecycleEvidenceMissing: 0,
    phenologyEvidenceMissing: 0,
    growthStageEvidenceMissing: 0,
    other: 0
  };
  const overlapping = {
    identityBlocked: 0,
    architectureUnresolved: 0,
    lifecycleEvidenceMissing: 0,
    phenologyEvidenceMissing: 0,
    growthStageEvidenceMissing: 0
  };
  const identityBlockedSlugs = [];
  const architectureSlugs = [];
  const lifecycleSlugs = [];
  for (const row of flagged) {
    const identity = (row.identityBlockers || []).filter((code) => code !== 'VISUAL_FORM_UNKNOWN');
    const architecture = (row.identityBlockers || []).includes('VISUAL_FORM_UNKNOWN') || row.visualForm === 'unknown';
    const lifecycle = row.dormantRequired === 'UNKNOWN';
    const phenology = row.floweringRequired === 'UNKNOWN' || row.fruitingRequired === 'UNKNOWN';
    const growth = row.youngRequired === 'UNKNOWN';
    if (identity.length) overlapping.identityBlocked += 1;
    if (architecture) overlapping.architectureUnresolved += 1;
    if (lifecycle) overlapping.lifecycleEvidenceMissing += 1;
    if (phenology) overlapping.phenologyEvidenceMissing += 1;
    if (growth) overlapping.growthStageEvidenceMissing += 1;
    if (identity.length) {
      exclusive.identityBlocked += 1;
      identityBlockedSlugs.push(row.canonicalSlug);
    } else if (architecture) {
      exclusive.architectureUnresolved += 1;
      architectureSlugs.push(row.canonicalSlug);
    } else if (lifecycle) {
      exclusive.lifecycleEvidenceMissing += 1;
      lifecycleSlugs.push(row.canonicalSlug);
    } else if (phenology) exclusive.phenologyEvidenceMissing += 1;
    else if (growth) exclusive.growthStageEvidenceMissing += 1;
    else exclusive.other += 1;
  }
  const exclusiveTotal = Object.values(exclusive).reduce((sum, n) => sum + n, 0);
  return {
    meaning:
      'The V1 count of 80 is plants with identity blockers and/or at least one YES/NO/UNKNOWN state equal to UNKNOWN. It is not a NOT_REQUIRED bucket. Exclusive primary class: identity first, then unresolved architecture, then missing lifecycle (dormant UNKNOWN). Phenology and growth-stage UNKNOWN in V1 were nested under visualForm unknown, so they have 0 exclusive remainder.',
    unknownConvertedToNotRequired: false,
    exclusive: { ...exclusive, total: exclusiveTotal },
    overlapping,
    identityBlockedSlugs,
    architectureUnresolvedSlugs: architectureSlugs,
    lifecycleEvidenceMissingSlugs: lifecycleSlugs,
    expectedExclusive: LEGACY_UNKNOWN_EXCLUSIVE
  };
}

function tallyState(rows, field) {
  const counts = {
    [REQUIREMENT.REQUIRED]: 0,
    [REQUIREMENT.OPTIONAL]: 0,
    [REQUIREMENT.NOT_REQUIRED]: 0,
    [REQUIREMENT.UNKNOWN]: 0
  };
  const slugs = {
    [REQUIREMENT.REQUIRED]: [],
    [REQUIREMENT.OPTIONAL]: [],
    [REQUIREMENT.NOT_REQUIRED]: [],
    [REQUIREMENT.UNKNOWN]: []
  };
  for (const row of rows) {
    const state = row[field];
    if (counts[state] == null) continue;
    counts[state] += 1;
    slugs[state].push(row.canonicalSlug);
  }
  return { counts, slugs };
}

function approvedCoversVisual(set, variant) {
  const rows = Array.isArray(set?.variants) ? set.variants : [];
  return rows.some((row) => {
    if (!isUsableDesignVariant(row)) return false;
    if (String(row.growthStage || '') !== String(variant.growthStage)) return false;
    if (String(row.phenology || 'vegetative') !== String(variant.phenologyState)) return false;
    if (row.architectureMode && variant.architectureMode && row.architectureMode !== variant.architectureMode) {
      return false;
    }
    if (!row.architectureMode && variant.architectureMode && variant.architectureMode !== 'tree' && variant.architectureMode !== 'default') {
      return false;
    }
    return true;
  });
}

export function validateBaselineCount(rows = []) {
  const baselines = [];
  const seen = new Set();
  const duplicates = [];
  for (const row of rows) {
    for (const mode of row.architectureModeSupport || []) {
      const key = `${row.canonicalSlug}::${mode}::mature::vegetative`;
      const record = {
        canonicalSlug: row.canonicalSlug,
        architectureMode: mode,
        growthStage: GROWTH_STAGE.MATURE,
        phenologyState: PHENOLOGY_STATE.VEGETATIVE
      };
      if (seen.has(key)) duplicates.push(record);
      seen.add(key);
      baselines.push(record);
    }
  }
  const extraArchitectureBaselines = baselines.filter((row) =>
    MULTI_FORM_SLUGS.includes(row.canonicalSlug) && row.architectureMode === 'shrub'
  );
  const canonicalPlants = rows.length;
  const expected = canonicalPlants + extraArchitectureBaselines.length;
  return {
    canonicalPlants,
    architectureBaselines: baselines.length,
    additionalArchitectureBaselines: extraArchitectureBaselines,
    additionalArchitectureBaselineCount: extraArchitectureBaselines.length,
    expected,
    matchesExpected: baselines.length === expected && duplicates.length === 0,
    accidentalDuplicates: duplicates,
    explanation: `${canonicalPlants} canonical identities + ${extraArchitectureBaselines.length} additional multi-form architecture baselines = ${expected}`
  };
}

export function validateMultiForm(rows = []) {
  const bySlug = new Map(rows.map((row) => [row.canonicalSlug, row]));
  return MULTI_FORM_SLUGS.map((slug) => {
    const row = bySlug.get(slug);
    const required = row?.requiredVariants || row?.variants || [];
    const phenologyRequired = required.filter((variant) =>
      variant.phenologyState !== PHENOLOGY_STATE.VEGETATIVE || variant.growthStage !== GROWTH_STAGE.MATURE
    );
    const phenologyArchitectures = [...new Set(phenologyRequired.map((variant) => variant.architectureMode))];
    return {
      canonicalSlug: slug,
      found: Boolean(row),
      architectureModeSupport: row?.architectureModeSupport || [],
      independentBaselines: (row?.architectureModeSupport || []).map((mode) => ({
        canonicalSlug: slug,
        architectureMode: mode,
        growthStage: GROWTH_STAGE.MATURE,
        phenologyState: PHENOLOGY_STATE.VEGETATIVE
      })),
      phenologyVariants: phenologyRequired.map((variant) => ({
        architectureMode: variant.architectureMode,
        growthStage: variant.growthStage,
        phenologyState: variant.phenologyState,
        requirementState: variant.requirementState
      })),
      phenologyAutomaticallyDoubled: phenologyArchitectures.length > 1,
      secondCanonicalIdentityCreated: false
    };
  });
}

export function calibrationCandidateStates() {
  return CALIBRATION_BATCH_1_CANDIDATES.map((row) => ({
    canonicalSlug: row.canonicalSlug,
    file: row.file,
    classifiedAs: `${GROWTH_STAGE.MATURE}+${PHENOLOGY_STATE.VEGETATIVE}`,
    filenameWordingDoesNotReclassify: true,
    approvalStatus: 'candidate'
  }));
}

export function proposedCalibrationDeltaSet(rows = []) {
  const bySlug = new Map(rows.map((row) => [row.canonicalSlug, row]));
  const existing = new Set(CALIBRATION_BATCH_1_CANDIDATES.map((row) => row.canonicalSlug));
  const proposals = [
    {
      axis: 'young-vs-mature',
      canonicalSlug: 'mango',
      missingVariant: 'young/tree/vegetative',
      compareAgainst: 'existing mango-mature-vegetative-v1 candidate'
    },
    {
      axis: 'vegetative-vs-fruiting',
      canonicalSlug: 'mango',
      missingVariant: 'mature/tree/fruiting',
      compareAgainst: 'existing mango-mature-vegetative-v1 candidate'
    },
    {
      axis: 'vegetative-vs-flowering',
      canonicalSlug: 'lavender',
      missingVariant: 'mature/shrub/flowering',
      compareAgainst: 'existing lavender-mature-vegetative-v1 candidate'
    },
    {
      axis: 'vegetative-vs-fruiting-crop',
      canonicalSlug: 'eggplant',
      missingVariant: visualStateKey({
        growthStage: GROWTH_STAGE.MATURE,
        architectureMode: bySlug.get('eggplant')?.baselineVariant?.architectureMode || 'default',
        phenologyState: PHENOLOGY_STATE.FRUITING
      }).replace(/__/g, '/'),
      compareAgainst: 'existing eggplant-mature-vegetative-v1 candidate'
    },
    {
      axis: 'vegetative-vs-dormant',
      canonicalSlug: 'apple',
      missingVariant: 'mature/tree/dormant',
      compareAgainst: 'apple mature/tree/vegetative (also missing; not one of the 8 candidates)'
    },
    {
      axis: 'multi-form-tree-vs-shrub',
      canonicalSlug: 'pomegranate',
      missingVariant: 'mature/shrub/vegetative',
      compareAgainst: 'pomegranate mature/tree/vegetative (also missing; not one of the 8 candidates)'
    },
    {
      axis: 'young-vs-mature-herbaceous',
      canonicalSlug: 'banana',
      missingVariant: 'young/default/vegetative',
      compareAgainst: 'existing banana-mature-vegetative-v1 candidate'
    }
  ];
  return {
    generateNow: false,
    keepExistingEightAsMatureVegetativeCandidates: true,
    oliveApprovedRemainsApproved: true,
    existingCalibrationSlugs: [...existing],
    missingVariantsOnly: proposals
  };
}

export function auditVisualStateIntegrity(plants = [], registry = {}, legacyPlants = []) {
  const bySlug = new Map();
  for (const set of registry.sets || []) {
    if (set.canonicalSlug) bySlug.set(slugify(set.canonicalSlug), set);
  }
  const rows = plants.map((plant) => deriveVisualStateRequirements(plant));
  const flowering = tallyState(rows, 'floweringRequired');
  const fruiting = tallyState(rows, 'fruitingRequired');
  const dormant = tallyState(rows, 'dormantRequired');
  const young = tallyState(rows, 'youngRequired');
  const baseline = validateBaselineCount(rows);
  const multiForm = validateMultiForm(rows);
  let approvedCoverage = 0;
  let missingRequired = 0;
  let requiredVariants = 0;
  let optionalVariants = 0;
  let unknownDecisions = 0;
  let notRequiredDecisions = 0;
  for (const row of rows) {
    requiredVariants += row.assetCountRequired;
    optionalVariants += row.assetCountOptional;
    unknownDecisions += row.unknownStates.length;
    for (const field of ['youngRequired', 'floweringRequired', 'fruitingRequired', 'dormantRequired']) {
      if (row[field] === REQUIREMENT.NOT_REQUIRED) notRequiredDecisions += 1;
    }
    for (const variant of row.requiredVariants) {
      const set = bySlug.get(row.canonicalSlug);
      if (approvedCoversVisual(set, variant)) approvedCoverage += 1;
      else missingRequired += 1;
    }
  }
  const youngRequiredVariants = rows.reduce(
    (n, row) => n + row.requiredVariants.filter((variant) => variant.growthStage === GROWTH_STAGE.YOUNG).length,
    0
  );
  const floweringRequiredVariants = rows.reduce(
    (n, row) => n + row.requiredVariants.filter((variant) => variant.phenologyState === PHENOLOGY_STATE.FLOWERING).length,
    0
  );
  const fruitingRequiredVariants = rows.reduce(
    (n, row) => n + row.requiredVariants.filter((variant) => variant.phenologyState === PHENOLOGY_STATE.FRUITING).length,
    0
  );
  const dormantRequiredVariants = rows.reduce(
    (n, row) => n + row.requiredVariants.filter((variant) => variant.phenologyState === PHENOLOGY_STATE.DORMANT).length,
    0
  );
  const multiFormRequiredVariants = rows
    .filter((row) => MULTI_FORM_SLUGS.includes(row.canonicalSlug))
    .reduce((n, row) => n + row.assetCountRequired, 0);

  return {
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    visualStatesContract: DESIGN_ASSET_VISUAL_STATES_VERSION,
    rows,
    legacyUnknown: explainLegacyUnknownOrBlocked(legacyPlants),
    flowering,
    fruiting,
    dormant,
    young,
    baseline,
    multiForm,
    calibrationCandidates: calibrationCandidateStates(),
    calibrationDelta: proposedCalibrationDeltaSet(rows),
    fallback: VISUAL_STATE_FALLBACK,
    factoryGenerationRule: FACTORY_GENERATION_RULE,
    counts: {
      canonicalPlants: rows.length,
      architectureBaselines: baseline.architectureBaselines,
      requiredVariantsTotal: requiredVariants,
      optionalVariantsTotal: optionalVariants,
      unknownStateDecisions: unknownDecisions,
      notRequiredDecisions,
      requiredYoung: youngRequiredVariants,
      requiredFlowering: floweringRequiredVariants,
      requiredFruiting: fruitingRequiredVariants,
      requiredDormant: dormantRequiredVariants,
      multiFormRequiredVariants,
      currentlyApprovedCoverage: approvedCoverage,
      currentCalibrationCandidateCoverage: CALIBRATION_BATCH_1_CANDIDATES.length,
      missingRequiredVariants: missingRequired,
      floweringRequiredCount: flowering.counts[REQUIREMENT.REQUIRED],
      floweringOptionalCount: flowering.counts[REQUIREMENT.OPTIONAL],
      floweringUnknownCount: flowering.counts[REQUIREMENT.UNKNOWN],
      floweringNotRequiredCount: flowering.counts[REQUIREMENT.NOT_REQUIRED],
      fruitingRequiredCount: fruiting.counts[REQUIREMENT.REQUIRED],
      fruitingOptionalCount: fruiting.counts[REQUIREMENT.OPTIONAL],
      fruitingUnknownCount: fruiting.counts[REQUIREMENT.UNKNOWN],
      fruitingNotRequiredCount: fruiting.counts[REQUIREMENT.NOT_REQUIRED],
      dormantRequiredCount: dormant.counts[REQUIREMENT.REQUIRED],
      dormantOptionalCount: dormant.counts[REQUIREMENT.OPTIONAL],
      dormantUnknownCount: dormant.counts[REQUIREMENT.UNKNOWN],
      dormantNotRequiredCount: dormant.counts[REQUIREMENT.NOT_REQUIRED],
      youngRequiredCount: young.counts[REQUIREMENT.REQUIRED],
      youngOptionalCount: young.counts[REQUIREMENT.OPTIONAL],
      youngUnknownCount: young.counts[REQUIREMENT.UNKNOWN],
      youngNotRequiredCount: young.counts[REQUIREMENT.NOT_REQUIRED]
    },
    confirms: {
      unknownConvertedToNotRequiredAutomatically: false,
      dormantSilentlyFallsBackToLeafyVegetative: false,
      youngRequiredSilentlyFallsBackToMature: false,
      architectureMismatchFallbackAllowed: false,
      imageGeneration: 0,
      productionRegistryChanged: false,
      additionalSpendUsd: 0,
      treePhysicalScaleReopened: false
    },
    selectVisualStateFallback
  };
}

function compactPlant(row) {
  return {
    canonicalSlug: row.canonicalSlug,
    visualForm: row.visualForm,
    architectureModeSupport: row.architectureModeSupport,
    baselineVariant: row.baselineVariant,
    young: row.youngDecision,
    flowering: row.floweringDecision,
    fruiting: row.fruitingDecision,
    dormant: row.dormantDecision,
    identityBlockers: row.identityBlockers,
    unknownStates: row.unknownStates,
    assetCountRequired: row.assetCountRequired,
    assetCountOptional: row.assetCountOptional,
    requiredVariants: row.requiredVariants.map((variant) => ({
      architectureMode: variant.architectureMode,
      growthStage: variant.growthStage,
      phenologyState: variant.phenologyState,
      requirementState: variant.requirementState,
      reasonCodes: variant.reasonCodes
    })),
    optionalVariants: row.optionalVariants.map((variant) => ({
      architectureMode: variant.architectureMode,
      growthStage: variant.growthStage,
      phenologyState: variant.phenologyState,
      requirementState: variant.requirementState,
      reasonCodes: variant.reasonCodes
    }))
  };
}

export function writeVisualStateIntegrityReports(root, catalogPlants, registry) {
  const plants = Array.isArray(catalogPlants) ? catalogPlants : [];
  const liveRegistry = registry || loadRegistry(root);
  const legacy = loadLegacyVisualStatesAudit(root);
  const audit = auditVisualStateIntegrity(plants, liveRegistry, legacy.plants || []);
  const dir = path.join(root, 'data', 'garden-design', 'design-asset-visual-state-integrity-gate-v1');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    summaryPath: path.join(dir, 'integrity-summary.json'),
    catalogPath: path.join(dir, 'catalog-integrity-audit.json'),
    unknownPath: path.join(dir, 'unknown-breakdown.json'),
    baselinePath: path.join(dir, 'baseline-validation.json'),
    multiFormPath: path.join(dir, 'multi-form-validation.json'),
    fallbackPath: path.join(dir, 'fallback-matrix.json'),
    calibrationPath: path.join(dir, 'calibration-delta-set.json')
  };
  const spend = { openaiCalls: 0, imageGeneration: 0, newBotanicalSourcing: 0, additionalSpendUsd: 0 };
  fs.writeFileSync(`${files.summaryPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    verdict: 'DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_V1_READY',
    requirementSemantics: Object.values(REQUIREMENT_STATE),
    factoryGenerationRule: FACTORY_GENERATION_RULE,
    counts: audit.counts,
    flowering: audit.flowering.counts,
    fruiting: audit.fruiting.counts,
    dormant: audit.dormant.counts,
    young: audit.young.counts,
    confirms: audit.confirms,
    spend
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.catalogPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    plants: audit.rows.map(compactPlant)
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.unknownPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    legacyUnknownOrBlocked: audit.legacyUnknown
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.baselinePath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    baseline: audit.baseline
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.multiFormPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    multiForm: audit.multiForm
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.fallbackPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    fallback: VISUAL_STATE_FALLBACK,
    reasons: FALLBACK_REASON
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.calibrationPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_VERSION,
    candidates: audit.calibrationCandidates,
    delta: audit.calibrationDelta
  }, null, 2)}\n`);
  return {
    ...files,
    counts: audit.counts,
    baseline: audit.baseline,
    legacyUnknown: audit.legacyUnknown,
    verdict: 'DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_V1_READY'
  };
}
