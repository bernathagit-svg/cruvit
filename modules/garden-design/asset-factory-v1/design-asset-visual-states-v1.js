/**
 * Design Asset Visual States V1.
 * Biologically relevant variant contract. Planning only.
 * Season/month is context, not asset identity. No generation. No spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DESIGN_VISUAL_FORMS,
  DESIGN_SEASON_NEUTRAL,
  classifyDesignVisualForm,
  classifyDesignHabitModifiers,
  classifyDesignPurposeCapabilities,
  isBroadPlantIdentity,
  isDeciduousHabit,
  isEvergreenHabit
} from '../garden-design-variant-policy-v1.js';
import {
  MULTI_FORM_ARCHITECTURE_CONTRACTS,
  PAPAYA_FORM_DECISION,
  ARCHITECTURE_MODES
} from './multi-form-plant-architecture-v1.js';
import { CALIBRATION_BATCH_1_CANDIDATES } from './calibration-review-candidates-v1.js';
import { isUsableDesignVariant } from '../garden-design-asset-registry-v1.js';

function slugify(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const DESIGN_ASSET_VISUAL_STATES_VERSION = 'design-asset-visual-states-v1';

export const GROWTH_STAGE = Object.freeze({
  YOUNG: 'young',
  MATURE: 'mature'
});

export const PHENOLOGY_STATE = Object.freeze({
  VEGETATIVE: 'vegetative',
  FLOWERING: 'flowering',
  FRUITING: 'fruiting',
  DORMANT: 'dormant'
});

export const REQUIREMENT = Object.freeze({
  YES: 'YES',
  NO: 'NO',
  UNKNOWN: 'UNKNOWN'
});

export const VARIANT_REASON = Object.freeze({
  GROWTH_ARCHITECTURE_CHANGE: 'GROWTH_ARCHITECTURE_CHANGE',
  FLOWERING_VISUALLY_SIGNIFICANT: 'FLOWERING_VISUALLY_SIGNIFICANT',
  FRUITING_VISUALLY_SIGNIFICANT: 'FRUITING_VISUALLY_SIGNIFICANT',
  DECIDUOUS_DORMANCY_SIGNIFICANT: 'DECIDUOUS_DORMANCY_SIGNIFICANT',
  MULTI_FORM_ARCHITECTURE: 'MULTI_FORM_ARCHITECTURE',
  NO_DISTINCT_VARIANT_REQUIRED: 'NO_DISTINCT_VARIANT_REQUIRED',
  BASELINE_MATURE_VEGETATIVE: 'BASELINE_MATURE_VEGETATIVE'
});

export const VISUAL_STATE_AXES = Object.freeze({
  growthStage: Object.freeze(Object.values(GROWTH_STAGE)),
  phenologyState: Object.freeze(Object.values(PHENOLOGY_STATE)),
  architectureMode: Object.freeze(['tree', 'shrub', 'default']),
  visualForm: 'existing DESIGN_VISUAL_FORMS',
  seasonIsIdentity: false,
  seasonIsContextOnly: true
});

export const VISUAL_STATE_ASSET_IDENTITY = Object.freeze({
  fields: Object.freeze([
    'assetId', 'canonicalSlug', 'visualForm', 'architectureMode', 'growthStage',
    'phenologyState', 'identityScope', 'botanicalTaxonId', 'groundAnchor', 'alphaBBox',
    'source', 'generationProvenance', 'technicalQA', 'botanicalIdentityQA',
    'inGardenQA', 'approvalState', 'version'
  ]),
  calendarSeasonIsIdentityDimension: false,
  productionRegistryModified: false
});

export const VISUAL_STATE_FALLBACK = Object.freeze({
  generateOnRender: false,
  silentIncompatibleArchitectureSubstitution: false,
  order: Object.freeze([
    'exact-growthStage-architectureMode-phenologyState',
    'same-architectureMode-growthStage-VEGETATIVE',
    'mature-same-architectureMode-VEGETATIVE',
    'honest-silhouette-placeholder'
  ])
});

export const VISUAL_STATE_PHYSICAL_SCALE_LINK = Object.freeze({
  matureVisualUsesMatureAuthority: true,
  youngMustNotUseMatureSizeAuthority: true,
  youngMetersFromMaturePercentForbidden: true,
  youngScaleWhenEvidenceUnknown: 'Estimated'
});

export const VISUAL_STATE_RESOLUTION_CONCEPT = Object.freeze({
  implemented: false,
  automaticPhenologyPrediction: false
});

function lower(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function traitBlob(plant = {}) {
  const tags = Array.isArray(plant.tags) ? plant.tags.join(' ') : '';
  return lower([tags, plant.growth, plant.scientific, plant.name, plant.canonicalSlug].filter(Boolean).join(' '));
}

function hasToken(blob, re) {
  return re.test(String(blob || ''));
}

export function visualStateKey(input = {}) {
  const stage = lower(input.growthStage) || GROWTH_STAGE.MATURE;
  const architecture = lower(input.architectureMode) || 'default';
  const phenology = lower(input.phenologyState || input.phenology) || PHENOLOGY_STATE.VEGETATIVE;
  return `${stage}__${architecture}__${phenology}`;
}

export function architectureModesForPlant(plant = {}) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const multi = MULTI_FORM_ARCHITECTURE_CONTRACTS[slug];
  if (multi) return [...multi.supportedVisualForms];
  const form = classifyDesignVisualForm(plant).visualForm;
  if (form === DESIGN_VISUAL_FORMS.SHRUB || form === DESIGN_VISUAL_FORMS.SUBSHRUB) return ['shrub'];
  if (form === DESIGN_VISUAL_FORMS.TREE) return ['tree'];
  return ['default'];
}

function defaultArchitectureMode(plant = {}) {
  const modes = architectureModesForPlant(plant);
  const slug = slugify(plant.canonicalSlug || plant.slug);
  if (MULTI_FORM_ARCHITECTURE_CONTRACTS[slug]) {
    return MULTI_FORM_ARCHITECTURE_CONTRACTS[slug].runtimeFallbackArchitectureMode || ARCHITECTURE_MODES.TREE;
  }
  return modes[0] || 'default';
}

function youngRequirement(plant, visualForm) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) return REQUIREMENT.YES;
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) return REQUIREMENT.UNKNOWN;
  if (
    visualForm === DESIGN_VISUAL_FORMS.TREE
    || visualForm === DESIGN_VISUAL_FORMS.PALM
    || visualForm === DESIGN_VISUAL_FORMS.CLIMBER
  ) {
    return REQUIREMENT.YES;
  }
  const blob = traitBlob(plant);
  if (visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP && hasToken(blob, /\bbanana\b|\bpup\b|\blarge herbaceous\b/)) {
    return REQUIREMENT.YES;
  }
  return REQUIREMENT.NO;
}

function floweringRequirement(plant, visualForm) {
  const blob = traitBlob(plant);
  if (hasToken(blob, /\bflowers enclosed\b|\bsyconium\b|\bnot showy\b|\binconspicuous\b/)) return REQUIREMENT.NO;
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) return REQUIREMENT.UNKNOWN;
  const showy = hasToken(
    blob,
    /\bornamental-flowering\b|\bshowy\b|\bbracts\b|\bflower spikes\b|\bblooms\b|\blavender\b|\bbougainvillea\b|\bplumeria\b|\brose\b|\bhibiscus\b/
  );
  if (!showy) return REQUIREMENT.NO;
  if (
    visualForm === DESIGN_VISUAL_FORMS.SHRUB
    || visualForm === DESIGN_VISUAL_FORMS.SUBSHRUB
    || visualForm === DESIGN_VISUAL_FORMS.CLIMBER
    || visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP
    || visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT
    || visualForm === DESIGN_VISUAL_FORMS.TREE
  ) {
    return REQUIREMENT.YES;
  }
  return REQUIREMENT.NO;
}

function fruitingRequirement(plant, visualForm, purpose) {
  const blob = traitBlob(plant);
  if (hasToken(blob, /\bolives?\b/) && !hasToken(blob, /\bcitrus\b/)) return REQUIREMENT.NO;
  if (purpose.herbHarvestUseful && !hasToken(blob, /\bfruit\b|\bcitrus\b|\bberry\b|\beggplant\b|\btomato\b/)) {
    return REQUIREMENT.NO;
  }
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) return REQUIREMENT.UNKNOWN;
  const visibleFruit = hasToken(
    blob,
    /\bfruit\b|\bcitrus\b|\bberry\b|\bdrupe\b|\bpome\b|\beggplant\b|\btomato\b|\bbanana\b|\bpineapple\b|\bmango\b|\bavocado\b|\bpomegranate\b/
  );
  if (!visibleFruit) return REQUIREMENT.NO;
  if (
    visualForm === DESIGN_VISUAL_FORMS.TREE
    || visualForm === DESIGN_VISUAL_FORMS.SHRUB
    || visualForm === DESIGN_VISUAL_FORMS.PALM
    || visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP
    || visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT
    || visualForm === DESIGN_VISUAL_FORMS.ROSETTE
  ) {
    return REQUIREMENT.YES;
  }
  return REQUIREMENT.NO;
}

function dormantRequirement(plant, visualForm) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) return REQUIREMENT.NO;
  if (isEvergreenHabit(plant) && !isDeciduousHabit(plant)) return REQUIREMENT.NO;
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) return REQUIREMENT.UNKNOWN;
  const habit = classifyDesignHabitModifiers(plant);
  if (habit.deciduous === true) {
    if (
      visualForm === DESIGN_VISUAL_FORMS.TREE
      || visualForm === DESIGN_VISUAL_FORMS.SHRUB
      || visualForm === DESIGN_VISUAL_FORMS.SUBSHRUB
      || visualForm === DESIGN_VISUAL_FORMS.CLIMBER
    ) {
      return REQUIREMENT.YES;
    }
    if (habit.herbaceous) return REQUIREMENT.YES;
  }
  if (!habit.deciduous && !habit.evergreen) return REQUIREMENT.UNKNOWN;
  return REQUIREMENT.NO;
}

function identityBlockers(plant, visualForm) {
  const blockers = [];
  if (isBroadPlantIdentity(plant) || plant.identityScope === 'genus') blockers.push('GENUS_OR_BROAD_IDENTITY');
  if (plant.identityNeedsReview) blockers.push('IDENTITY_NEEDS_REVIEW');
  if (plant.duplicateConflict) blockers.push('DUPLICATE_IDENTITY');
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) blockers.push('VISUAL_FORM_UNKNOWN');
  return blockers;
}

function makeVariant(plant, architectureMode, growthStage, phenologyState, reasonCodes) {
  return {
    canonicalSlug: slugify(plant.canonicalSlug || plant.slug),
    visualForm: classifyDesignVisualForm(plant).visualForm,
    architectureMode,
    growthStage,
    phenologyState,
    phenology: phenologyState,
    season: DESIGN_SEASON_NEUTRAL,
    required: true,
    reasonCodes,
    reason: reasonCodes.join(', '),
    variantKey: visualStateKey({ growthStage, architectureMode, phenologyState })
  };
}

export function deriveVisualStateRequirements(plant = {}) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const architecture = classifyDesignVisualForm(plant);
  const visualForm = architecture.visualForm;
  const purpose = classifyDesignPurposeCapabilities(plant);
  const modes = architectureModesForPlant(plant);
  const defaultMode = defaultArchitectureMode(plant);
  const blockers = identityBlockers(plant, visualForm);
  const young = youngRequirement(plant, visualForm);
  const flowering = floweringRequirement(plant, visualForm);
  const fruiting = fruitingRequirement(plant, visualForm, purpose);
  const dormant = dormantRequirement(plant, visualForm);
  const reasonCodes = [VARIANT_REASON.BASELINE_MATURE_VEGETATIVE];
  const variants = [];

  for (const mode of modes) {
    variants.push(
      makeVariant(plant, mode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.VEGETATIVE, [
        VARIANT_REASON.BASELINE_MATURE_VEGETATIVE,
        ...(modes.length > 1 ? [VARIANT_REASON.MULTI_FORM_ARCHITECTURE] : [])
      ])
    );
  }
  if (modes.length > 1) reasonCodes.push(VARIANT_REASON.MULTI_FORM_ARCHITECTURE);

  if (young === REQUIREMENT.YES) {
    reasonCodes.push(VARIANT_REASON.GROWTH_ARCHITECTURE_CHANGE);
    variants.push(
      makeVariant(plant, defaultMode, GROWTH_STAGE.YOUNG, PHENOLOGY_STATE.VEGETATIVE, [
        VARIANT_REASON.GROWTH_ARCHITECTURE_CHANGE
      ])
    );
  }
  if (flowering === REQUIREMENT.YES) {
    reasonCodes.push(VARIANT_REASON.FLOWERING_VISUALLY_SIGNIFICANT);
    variants.push(
      makeVariant(plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.FLOWERING, [
        VARIANT_REASON.FLOWERING_VISUALLY_SIGNIFICANT
      ])
    );
  }
  if (fruiting === REQUIREMENT.YES) {
    reasonCodes.push(VARIANT_REASON.FRUITING_VISUALLY_SIGNIFICANT);
    variants.push(
      makeVariant(plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.FRUITING, [
        VARIANT_REASON.FRUITING_VISUALLY_SIGNIFICANT
      ])
    );
  }
  if (dormant === REQUIREMENT.YES) {
    reasonCodes.push(VARIANT_REASON.DECIDUOUS_DORMANCY_SIGNIFICANT);
    variants.push(
      makeVariant(plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.DORMANT, [
        VARIANT_REASON.DECIDUOUS_DORMANCY_SIGNIFICANT
      ])
    );
  }
  if (
    young !== REQUIREMENT.YES
    && flowering !== REQUIREMENT.YES
    && fruiting !== REQUIREMENT.YES
    && dormant !== REQUIREMENT.YES
    && modes.length === 1
  ) {
    reasonCodes.push(VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED);
  }

  const blocked = blockers.length > 0;
  return {
    canonicalSlug: slug,
    visualForm,
    architectureModeSupport: modes,
    baselineVariant: {
      growthStage: GROWTH_STAGE.MATURE,
      phenologyState: PHENOLOGY_STATE.VEGETATIVE,
      architectureMode: defaultMode
    },
    youngRequired: young,
    floweringRequired: flowering,
    fruitingRequired: fruiting,
    dormantRequired: dormant,
    reasonCodes: [...new Set(reasonCodes)],
    identityBlockers: blockers,
    assetCountRequired: variants.length,
    variants,
    cartesianForbidden: true,
    seasonIsIdentity: false,
    generationBlocked: blocked
  };
}

export function deriveVisualStateDemand(plant = {}) {
  const req = deriveVisualStateRequirements(plant);
  const architecture = classifyDesignVisualForm(plant);
  return {
    canonicalSlug: req.canonicalSlug,
    visualForm: req.visualForm,
    habitModifiers: architecture.habitModifiers || [],
    lifecycle: architecture.lifecycle,
    purposeCapabilities: classifyDesignPurposeCapabilities(plant).capabilities,
    morphologyAuthority: architecture.authority,
    morphologyUnknown: req.visualForm === DESIGN_VISUAL_FORMS.UNKNOWN,
    scientific: plant.scientific || plant.scientificName || plant.latin || null,
    requiredVariants: req.variants,
    optionalVariants: [],
    visualState: req
  };
}

export function selectVisualStateFallback(desired = {}, available = []) {
  const list = Array.isArray(available) ? available : [];
  const arch = desired.architectureMode || 'default';
  const stage = desired.growthStage || GROWTH_STAGE.MATURE;
  const pheno = desired.phenologyState || PHENOLOGY_STATE.VEGETATIVE;
  const exact = list.find((row) =>
    row.growthStage === stage
    && (row.architectureMode || arch) === arch
    && (row.phenologyState || row.phenology) === pheno
  );
  if (exact) return { ...exact, fallback: 'exact' };
  const sameStageVeg = list.find((row) =>
    row.growthStage === stage
    && (row.architectureMode || arch) === arch
    && (row.phenologyState || row.phenology) === PHENOLOGY_STATE.VEGETATIVE
  );
  if (sameStageVeg) return { ...sameStageVeg, fallback: 'same-architecture-growth-vegetative' };
  const matureVeg = list.find((row) =>
    row.growthStage === GROWTH_STAGE.MATURE
    && (row.architectureMode || arch) === arch
    && (row.phenologyState || row.phenology) === PHENOLOGY_STATE.VEGETATIVE
  );
  if (matureVeg) return { ...matureVeg, fallback: 'mature-vegetative-baseline' };
  return { fallback: 'honest-placeholder', generateOnRender: false };
}

export const VISUAL_STATE_CALIBRATION_ROLES = Object.freeze([
  {
    role: 'evergreen-fruit-tree',
    canonicalSlug: 'mango',
    usefulVariants: Object.freeze(['mature/tree/vegetative', 'young/tree/vegetative', 'mature/tree/fruiting'])
  },
  {
    role: 'deciduous-fruit-tree',
    canonicalSlug: 'apple',
    usefulVariants: Object.freeze([
      'mature/tree/vegetative',
      'young/tree/vegetative',
      'mature/tree/fruiting',
      'mature/tree/dormant'
    ])
  },
  {
    role: 'flowering-shrub-perennial',
    canonicalSlug: 'lavender',
    usefulVariants: Object.freeze(['mature/shrub/vegetative', 'mature/shrub/flowering'])
  },
  {
    role: 'large-herbaceous-plant',
    canonicalSlug: 'banana',
    usefulVariants: Object.freeze(['mature/default/vegetative', 'young/default/vegetative', 'mature/default/fruiting'])
  },
  {
    role: 'rosette-succulent',
    canonicalSlug: 'aloe-vera',
    usefulVariants: Object.freeze(['mature/default/vegetative'])
  },
  {
    role: 'fruiting-crop',
    canonicalSlug: 'eggplant',
    usefulVariants: Object.freeze(['mature/default/vegetative', 'mature/default/fruiting'])
  },
  {
    role: 'evergreen-structural-tree',
    canonicalSlug: 'olive',
    usefulVariants: Object.freeze(['mature/tree/vegetative'])
  },
  {
    role: 'multi-form-plant',
    canonicalSlug: 'pomegranate',
    usefulVariants: Object.freeze(['mature/tree/vegetative', 'mature/shrub/vegetative'])
  }
]);

function loadRegistry(root) {
  const filePath = path.join(root, 'modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { sets: [] };
  }
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

export function auditCatalogVisualStates(plants = [], registry = {}) {
  const bySlug = new Map();
  for (const set of registry.sets || []) {
    if (set.canonicalSlug) bySlug.set(slugify(set.canonicalSlug), set);
  }
  const rows = [];
  const counts = {
    canonicalPlantsAudited: 0,
    totalRequiredVariants: 0,
    baselineMatureVegetative: 0,
    youngVariantsRequired: 0,
    floweringVariantsRequired: 0,
    fruitingVariantsRequired: 0,
    dormantVariantsRequired: 0,
    multiFormArchitectureVariants: 0,
    unknownOrBlocked: 0,
    currentlyApprovedCoverage: 0,
    currentCalibrationCandidateCoverage: CALIBRATION_BATCH_1_CANDIDATES.length,
    missingRequiredVariants: 0
  };
  for (const plant of plants) {
    const req = deriveVisualStateRequirements(plant);
    counts.canonicalPlantsAudited += 1;
    counts.totalRequiredVariants += req.assetCountRequired;
    if (req.identityBlockers.length) counts.unknownOrBlocked += 1;
    else if (
      req.youngRequired === REQUIREMENT.UNKNOWN
      || req.floweringRequired === REQUIREMENT.UNKNOWN
      || req.fruitingRequired === REQUIREMENT.UNKNOWN
      || req.dormantRequired === REQUIREMENT.UNKNOWN
    ) {
      counts.unknownOrBlocked += 1;
    }
    for (const variant of req.variants) {
      if (variant.growthStage === GROWTH_STAGE.MATURE && variant.phenologyState === PHENOLOGY_STATE.VEGETATIVE) {
        counts.baselineMatureVegetative += 1;
      }
      if (variant.growthStage === GROWTH_STAGE.YOUNG) counts.youngVariantsRequired += 1;
      if (variant.phenologyState === PHENOLOGY_STATE.FLOWERING) counts.floweringVariantsRequired += 1;
      if (variant.phenologyState === PHENOLOGY_STATE.FRUITING) counts.fruitingVariantsRequired += 1;
      if (variant.phenologyState === PHENOLOGY_STATE.DORMANT) counts.dormantVariantsRequired += 1;
      if (variant.reasonCodes.includes(VARIANT_REASON.MULTI_FORM_ARCHITECTURE)) {
        counts.multiFormArchitectureVariants += 1;
      }
      const set = bySlug.get(req.canonicalSlug);
      if (approvedCoversVisual(set, variant)) counts.currentlyApprovedCoverage += 1;
      else if (req.assetCountRequired) counts.missingRequiredVariants += 1;
    }
    rows.push(req);
  }
  return { counts, rows };
}

export function writeDesignAssetVisualStatesReports(root, catalogPlants, registry) {
  const plants = Array.isArray(catalogPlants) ? catalogPlants : [];
  const audit = auditCatalogVisualStates(plants, registry || loadRegistry(root));
  const dir = path.join(root, 'data', 'garden-design', 'design-asset-visual-states-v1');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    summaryPath: path.join(dir, 'visual-states-summary.json'),
    auditPath: path.join(dir, 'catalog-state-audit.json'),
    calibrationPath: path.join(dir, 'role-based-calibration-set.json')
  };
  const spend = { openaiCalls: 0, imageGeneration: 0, newBotanicalSourcing: 0, additionalSpendUsd: 0 };
  fs.writeFileSync(`${files.summaryPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATES_VERSION,
    verdict: 'DESIGN_ASSET_VISUAL_STATES_V1_READY',
    treePhysicalScaleReopened: false,
    productionAssetRegistryChanged: false,
    axes: VISUAL_STATE_AXES,
    seasonPolicy: 'context-not-identity',
    fallback: VISUAL_STATE_FALLBACK,
    physicalScaleLink: VISUAL_STATE_PHYSICAL_SCALE_LINK,
    counts: audit.counts,
    spend
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.auditPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATES_VERSION,
    plants: audit.rows.map((row) => ({
      canonicalSlug: row.canonicalSlug,
      visualForm: row.visualForm,
      architectureModeSupport: row.architectureModeSupport,
      baselineVariant: row.baselineVariant,
      youngRequired: row.youngRequired,
      floweringRequired: row.floweringRequired,
      fruitingRequired: row.fruitingRequired,
      dormantRequired: row.dormantRequired,
      reasonCodes: row.reasonCodes,
      identityBlockers: row.identityBlockers,
      assetCountRequired: row.assetCountRequired
    }))
  }, null, 2)}\n`);
  fs.writeFileSync(`${files.calibrationPath}`, `${JSON.stringify({
    contract: DESIGN_ASSET_VISUAL_STATES_VERSION,
    existingCalibrationCandidates: CALIBRATION_BATCH_1_CANDIDATES.map((row) => row.canonicalSlug),
    oliveApprovedRemainsApproved: true,
    generateNow: false,
    roles: VISUAL_STATE_CALIBRATION_ROLES
  }, null, 2)}\n`);
  return { ...files, counts: audit.counts, verdict: 'DESIGN_ASSET_VISUAL_STATES_V1_READY' };
}
