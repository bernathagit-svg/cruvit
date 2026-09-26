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
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
  NOT_REQUIRED: 'NOT_REQUIRED',
  UNKNOWN: 'UNKNOWN'
});

export const CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

export const VARIANT_REASON = Object.freeze({
  GROWTH_ARCHITECTURE_CHANGE: 'GROWTH_ARCHITECTURE_CHANGE',
  FLOWERING_VISUALLY_SIGNIFICANT: 'FLOWERING_VISUALLY_SIGNIFICANT',
  FLOWERING_MINOR_VISUAL_EFFECT: 'FLOWERING_MINOR_VISUAL_EFFECT',
  FLOWERING_EVIDENCE_UNKNOWN: 'FLOWERING_EVIDENCE_UNKNOWN',
  FLOWERING_STATE_NOT_MEANINGFUL_FOR_DESIGN: 'FLOWERING_STATE_NOT_MEANINGFUL_FOR_DESIGN',
  FRUITING_VISUALLY_SIGNIFICANT: 'FRUITING_VISUALLY_SIGNIFICANT',
  FRUITING_MINOR_VISUAL_EFFECT: 'FRUITING_MINOR_VISUAL_EFFECT',
  FRUITING_EVIDENCE_UNKNOWN: 'FRUITING_EVIDENCE_UNKNOWN',
  DECIDUOUS_DORMANCY_SIGNIFICANT: 'DECIDUOUS_DORMANCY_SIGNIFICANT',
  DECIDUOUS_LEAF_OFF: 'DECIDUOUS_LEAF_OFF',
  HERBACEOUS_DIEBACK: 'HERBACEOUS_DIEBACK',
  EVERGREEN_NO_DORMANCY_ASSET: 'EVERGREEN_NO_DORMANCY_ASSET',
  LIFECYCLE_EVIDENCE_UNKNOWN: 'LIFECYCLE_EVIDENCE_UNKNOWN',
  ANNUAL_OR_BIENNIAL_NO_DORMANT_ASSET: 'ANNUAL_OR_BIENNIAL_NO_DORMANT_ASSET',
  GROWTH_STAGE_EVIDENCE_UNKNOWN: 'GROWTH_STAGE_EVIDENCE_UNKNOWN',
  MULTI_FORM_ARCHITECTURE: 'MULTI_FORM_ARCHITECTURE',
  NO_DISTINCT_VARIANT_REQUIRED: 'NO_DISTINCT_VARIANT_REQUIRED',
  BASELINE_MATURE_VEGETATIVE: 'BASELINE_MATURE_VEGETATIVE'
});

export const FALLBACK_REASON = Object.freeze({
  NONE: 'NONE',
  PHENOLOGY_VISUAL_FALLBACK: 'PHENOLOGY_VISUAL_FALLBACK',
  DORMANT_ASSET_UNAVAILABLE: 'DORMANT_ASSET_UNAVAILABLE',
  YOUNG_ASSET_UNAVAILABLE: 'YOUNG_ASSET_UNAVAILABLE',
  ARCHITECTURE_MISMATCH_FORBIDDEN: 'ARCHITECTURE_MISMATCH_FORBIDDEN',
  IDENTITY_MISMATCH_FORBIDDEN: 'IDENTITY_MISMATCH_FORBIDDEN',
  HONEST_PLACEHOLDER: 'HONEST_PLACEHOLDER'
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
  dormantSilentlyFallsBackToLeafyVegetative: false,
  youngRequiredSilentlyFallsBackToMature: false,
  architectureMismatchFallbackAllowed: false,
  canonicalIdentitySubstitutionAllowed: false,
  botanicalTruthUnchanged: true,
  matrix: Object.freeze({
    floweringMissing: 'same architectureMode + growthStage + VEGETATIVE with PHENOLOGY_VISUAL_FALLBACK',
    fruitingMissing: 'same architectureMode + growthStage + VEGETATIVE with PHENOLOGY_VISUAL_FALLBACK',
    dormantMissing: 'DORMANT_ASSET_UNAVAILABLE honest placeholder; never leafy vegetative',
    youngMissing: 'YOUNG_ASSET_UNAVAILABLE honest placeholder; never mature-as-equivalent',
    architectureMismatch: 'ARCHITECTURE_MISMATCH_FORBIDDEN',
    identityMismatch: 'IDENTITY_MISMATCH_FORBIDDEN'
  })
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

  const traits = plant?.climateTraits && typeof plant.climateTraits === 'object'
    ? plant.climateTraits
    : {};
  const morphologyEvidenceClass = String(
    traits?.traitEvidenceClasses?.growthHabit
    || traits?.designMetadata?.morphologyEvidenceClass
    || plant?.designMetadata?.morphologyEvidenceClass
    || ''
  ).toUpperCase();
  const sourceBackedModes = morphologyEvidenceClass === 'SOURCE_SUPPORTED'
    ? (
        plant?.designMetadata?.architectureModeSupport
        || traits?.designMetadata?.architectureModeSupport
        || []
      )
    : [];
  const allowedModes = new Set(['tree','shrub','climber','palm','default']);
  const normalizedModes = Array.isArray(sourceBackedModes)
    ? [...new Set(
        sourceBackedModes
          .map((x) => String(x || '').trim().toLowerCase())
          .filter((x) => allowedModes.has(x))
      )]
    : [];
  if (normalizedModes.length) return normalizedModes;

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

function decision(state, reasonCode, evidenceBasis, confidence) {
  return { state, reasonCode, evidenceBasis, confidence };
}

function formShowsFlowers(visualForm) {
  return [
    DESIGN_VISUAL_FORMS.SHRUB,
    DESIGN_VISUAL_FORMS.SUBSHRUB,
    DESIGN_VISUAL_FORMS.CLIMBER,
    DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP,
    DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT,
    DESIGN_VISUAL_FORMS.TREE,
    DESIGN_VISUAL_FORMS.GROUNDCOVER
  ].includes(visualForm);
}

function formShowsFruit(visualForm) {
  return [
    DESIGN_VISUAL_FORMS.TREE,
    DESIGN_VISUAL_FORMS.SHRUB,
    DESIGN_VISUAL_FORMS.SUBSHRUB,
    DESIGN_VISUAL_FORMS.PALM,
    DESIGN_VISUAL_FORMS.CLIMBER,
    DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP,
    DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT,
    DESIGN_VISUAL_FORMS.ROSETTE
  ].includes(visualForm);
}

export function classifyYoungState(plant, visualForm) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const blob = traitBlob(plant);
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.GROWTH_STAGE_EVIDENCE_UNKNOWN,
      'visualForm unknown; architecture/scale change cannot be judged',
      CONFIDENCE.LOW
    );
  }
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) {
    return decision(
      REQUIREMENT.REQUIRED,
      VARIANT_REASON.GROWTH_ARCHITECTURE_CHANGE,
      'papaya pachycaul scale/architecture changes materially between young and mature',
      CONFIDENCE.HIGH
    );
  }
  if (
    visualForm === DESIGN_VISUAL_FORMS.TREE
    || visualForm === DESIGN_VISUAL_FORMS.PALM
    || visualForm === DESIGN_VISUAL_FORMS.CLIMBER
  ) {
    return decision(
      REQUIREMENT.REQUIRED,
      VARIANT_REASON.GROWTH_ARCHITECTURE_CHANGE,
      `visualForm=${visualForm}; young vs mature architecture/scale is materially different`,
      CONFIDENCE.HIGH
    );
  }
  if (visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP && hasToken(blob, /\bbanana\b|\bpup\b|\blarge herbaceous\b/)) {
    return decision(
      REQUIREMENT.REQUIRED,
      VARIANT_REASON.GROWTH_ARCHITECTURE_CHANGE,
      'large herbaceous clump/pup architecture changes enough for Design',
      CONFIDENCE.MEDIUM
    );
  }
  if (
    visualForm === DESIGN_VISUAL_FORMS.ROSETTE
    || visualForm === DESIGN_VISUAL_FORMS.SUCCULENT_FORM
    || visualForm === DESIGN_VISUAL_FORMS.GRASS_LIKE
    || visualForm === DESIGN_VISUAL_FORMS.GROUNDCOVER
  ) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED,
      `visualForm=${visualForm}; young plant keeps essentially the same architecture`,
      CONFIDENCE.HIGH
    );
  }
  return decision(
    REQUIREMENT.NOT_REQUIRED,
    VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED,
    `visualForm=${visualForm}; form/scale change is not material enough to require a young asset`,
    CONFIDENCE.MEDIUM
  );
}

export function classifyFloweringState(plant, visualForm) {
  const blob = traitBlob(plant);
  if (hasToken(blob, /\bflowers enclosed\b|\bsyconium\b|\bnot showy\b|\binconspicuous\b/)) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.FLOWERING_STATE_NOT_MEANINGFUL_FOR_DESIGN,
      'catalog evidence of inconspicuous or enclosed flowers',
      CONFIDENCE.HIGH
    );
  }
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.FLOWERING_EVIDENCE_UNKNOWN,
      'visualForm unknown; flowering visual significance cannot be judged',
      CONFIDENCE.LOW
    );
  }
  const showyLexical = hasToken(
    blob,
    /\bornamental-flowering\b|\bshowy\b|\bbracts\b|\bflower spikes\b|\bblooms\b|\blavender\b|\bbougainvillea\b|\bplumeria\b|\brose\b|\bhibiscus\b/
  );
  const floweringVisualTag = hasToken(blob, /\bflowering\b|\bflower\b/);
  const springBloom = hasToken(blob, /\bspring-bloom\b|\bspring bloom\b/);
  if ((showyLexical || floweringVisualTag) && formShowsFlowers(visualForm)) {
    return decision(
      REQUIREMENT.REQUIRED,
      VARIANT_REASON.FLOWERING_VISUALLY_SIGNIFICANT,
      showyLexical
        ? 'showy/ornamental flower evidence in catalog traits'
        : 'flower/flowering visual tag on a form that can display bloom',
      showyLexical ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM
    );
  }
  if (springBloom && visualForm === DESIGN_VISUAL_FORMS.TREE) {
    return decision(
      REQUIREMENT.OPTIONAL,
      VARIANT_REASON.FLOWERING_MINOR_VISUAL_EFFECT,
      'spring bloom is visually useful but not required for minimum fruit/nut-tree Design coverage',
      CONFIDENCE.MEDIUM
    );
  }
  return decision(
    REQUIREMENT.UNKNOWN,
    VARIANT_REASON.FLOWERING_EVIDENCE_UNKNOWN,
    'no catalog evidence that flowers are showy or insignificant; purpose=flowering was not used',
    CONFIDENCE.LOW
  );
}

export function classifyFruitingState(plant, visualForm, purpose) {
  const blob = traitBlob(plant);
  if (hasToken(blob, /\bolives?\b/) && !hasToken(blob, /\bcitrus\b/)) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.FRUITING_MINOR_VISUAL_EFFECT,
      'olive fruit is catalog-evidenced but does not materially change garden silhouette',
      CONFIDENCE.HIGH
    );
  }
  if (hasToken(blob, /\bnuts?\b/) && !hasToken(blob, /\bfruit\b|\bberry\b|\bcitrus\b|\bdrupe\b|\bpome\b/)) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.FRUITING_MINOR_VISUAL_EFFECT,
      'nut crop evidence without fleshy fruit display',
      CONFIDENCE.MEDIUM
    );
  }
  if (hasToken(blob, /\bherb-edible\b|\bculinary\b|\bherbs?\b/) && !hasToken(blob, /\bfruit\b|\bcitrus\b|\bberry\b|\beggplant\b|\btomato\b|\bpepper\b/)) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED,
      'herb/culinary catalog evidence without fruit-display evidence',
      CONFIDENCE.HIGH
    );
  }
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.FRUITING_EVIDENCE_UNKNOWN,
      'visualForm unknown; fruit display cannot be judged',
      CONFIDENCE.LOW
    );
  }
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const visibleFruit = slug === 'fig' || hasToken(
    blob,
    /\bfruit\b|\bcitrus\b|\bberry\b|\bdrupe\b|\bpome\b|\beggplant\b|\btomato\b|\bpepper\b|\bbanana\b|\bpineapple\b|\bmango\b|\bavocado\b|\bpomegranate\b|\bgrape\b|\bkiwi\b|\bpassionfruit\b/
  );
  if (visibleFruit && formShowsFruit(visualForm)) {
    return decision(
      REQUIREMENT.REQUIRED,
      VARIANT_REASON.FRUITING_VISUALLY_SIGNIFICANT,
      'visible fruit evidence on a form where fruit display changes appearance or Design value',
      CONFIDENCE.HIGH
    );
  }
  if (visibleFruit && !formShowsFruit(visualForm)) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.FRUITING_EVIDENCE_UNKNOWN,
      `fruit evidence present but visualForm=${visualForm} is not a judged fruit-display form`,
      CONFIDENCE.LOW
    );
  }
  return decision(
    REQUIREMENT.UNKNOWN,
    VARIANT_REASON.FRUITING_EVIDENCE_UNKNOWN,
    'no catalog evidence for or against a distinct fruiting visual state; edible purpose alone was not used',
    CONFIDENCE.LOW
  );
}

export function classifyDormantState(plant, visualForm) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const habit = classifyDesignHabitModifiers(plant);
  const lifecycle = lower(
    plant?.designMetadata?.lifecycle
    || plant?.lifecycle
    || habit.lifecycle
    || ''
  );

  if (lifecycle === 'annual' || lifecycle === 'biennial') {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.ANNUAL_OR_BIENNIAL_NO_DORMANT_ASSET,
      'annual/biennial lifecycle ends or renews rather than requiring a persistent dormant presentation asset',
      CONFIDENCE.HIGH
    );
  }

  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.EVERGREEN_NO_DORMANCY_ASSET,
      'papaya is not a deciduous woody leaf-off subject',
      CONFIDENCE.HIGH
    );
  }
  if (isEvergreenHabit(plant) && !isDeciduousHabit(plant)) {
    return decision(
      REQUIREMENT.NOT_REQUIRED,
      VARIANT_REASON.EVERGREEN_NO_DORMANCY_ASSET,
      'evergreen habit evidence; no fake dormant asset',
      CONFIDENCE.HIGH
    );
  }
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.LIFECYCLE_EVIDENCE_UNKNOWN,
      'visualForm unknown; dormant architecture cannot be judged',
      CONFIDENCE.LOW
    );
  }
  if (habit.deciduous === true) {
    if (
      visualForm === DESIGN_VISUAL_FORMS.TREE
      || visualForm === DESIGN_VISUAL_FORMS.SHRUB
      || visualForm === DESIGN_VISUAL_FORMS.SUBSHRUB
      || visualForm === DESIGN_VISUAL_FORMS.CLIMBER
    ) {
      return decision(
        REQUIREMENT.REQUIRED,
        VARIANT_REASON.DECIDUOUS_LEAF_OFF,
        'deciduous woody/climber leaf-off is materially distinct',
        CONFIDENCE.HIGH
      );
    }
    if (habit.herbaceous) {
      return decision(
        REQUIREMENT.REQUIRED,
        VARIANT_REASON.HERBACEOUS_DIEBACK,
        'herbaceous deciduous dieback is materially distinct for Design',
        CONFIDENCE.MEDIUM
      );
    }
  }
  if (!habit.deciduous && !habit.evergreen) {
    return decision(
      REQUIREMENT.UNKNOWN,
      VARIANT_REASON.LIFECYCLE_EVIDENCE_UNKNOWN,
      'no evergreen or deciduous catalog evidence; lack of metadata is not evergreen truth',
      CONFIDENCE.LOW
    );
  }
  return decision(
    REQUIREMENT.NOT_REQUIRED,
    VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED,
    'lifecycle evidence does not support a distinct dormant asset',
    CONFIDENCE.MEDIUM
  );
}

function identityBlockers(plant, visualForm) {
  const blockers = [];
  if (isBroadPlantIdentity(plant) || plant.identityScope === 'genus') blockers.push('GENUS_OR_BROAD_IDENTITY');
  if (plant.identityNeedsReview) blockers.push('IDENTITY_NEEDS_REVIEW');
  if (plant.duplicateConflict) blockers.push('DUPLICATE_IDENTITY');
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) blockers.push('VISUAL_FORM_UNKNOWN');
  return blockers;
}

function makeVariant(plant, architectureMode, growthStage, phenologyState, reasonCodes, requirementState) {
  const required = requirementState === REQUIREMENT.REQUIRED;
  return {
    canonicalSlug: slugify(plant.canonicalSlug || plant.slug),
    visualForm: classifyDesignVisualForm(plant).visualForm,
    architectureMode,
    growthStage,
    phenologyState,
    phenology: phenologyState,
    season: DESIGN_SEASON_NEUTRAL,
    required,
    requirementState,
    reasonCodes,
    reason: reasonCodes.join(', '),
    variantKey: visualStateKey({ growthStage, architectureMode, phenologyState })
  };
}

function pushStateVariant(target, plant, mode, stage, phenology, decisionRow) {
  if (decisionRow.state === REQUIREMENT.REQUIRED) {
    target.required.push(makeVariant(plant, mode, stage, phenology, [decisionRow.reasonCode], REQUIREMENT.REQUIRED));
  } else if (decisionRow.state === REQUIREMENT.OPTIONAL) {
    target.optional.push(makeVariant(plant, mode, stage, phenology, [decisionRow.reasonCode], REQUIREMENT.OPTIONAL));
  }
}

export function deriveVisualStateRequirements(plant = {}) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const architecture = classifyDesignVisualForm(plant);
  const visualForm = architecture.visualForm;
  const purpose = classifyDesignPurposeCapabilities(plant);
  const modes = architectureModesForPlant(plant);
  const defaultMode = defaultArchitectureMode(plant);
  const blockers = identityBlockers(plant, visualForm);
  const young = classifyYoungState(plant, visualForm);
  const flowering = classifyFloweringState(plant, visualForm);
  const fruiting = classifyFruitingState(plant, visualForm, purpose);
  const dormant = classifyDormantState(plant, visualForm);
  const reasonCodes = [VARIANT_REASON.BASELINE_MATURE_VEGETATIVE];
  const requiredVariants = [];
  const optionalVariants = [];

  for (const mode of modes) {
    requiredVariants.push(
      makeVariant(plant, mode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.VEGETATIVE, [
        VARIANT_REASON.BASELINE_MATURE_VEGETATIVE,
        ...(modes.length > 1 ? [VARIANT_REASON.MULTI_FORM_ARCHITECTURE] : [])
      ], REQUIREMENT.REQUIRED)
    );
  }
  if (modes.length > 1) reasonCodes.push(VARIANT_REASON.MULTI_FORM_ARCHITECTURE);

  const buckets = { required: requiredVariants, optional: optionalVariants };
  pushStateVariant(buckets, plant, defaultMode, GROWTH_STAGE.YOUNG, PHENOLOGY_STATE.VEGETATIVE, young);
  pushStateVariant(buckets, plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.FLOWERING, flowering);
  pushStateVariant(buckets, plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.FRUITING, fruiting);
  pushStateVariant(buckets, plant, defaultMode, GROWTH_STAGE.MATURE, PHENOLOGY_STATE.DORMANT, dormant);

  if (young.state === REQUIREMENT.REQUIRED) reasonCodes.push(young.reasonCode);
  if (flowering.state === REQUIREMENT.REQUIRED) reasonCodes.push(flowering.reasonCode);
  if (fruiting.state === REQUIREMENT.REQUIRED) reasonCodes.push(fruiting.reasonCode);
  if (dormant.state === REQUIREMENT.REQUIRED) reasonCodes.push(dormant.reasonCode);
  if (
    young.state !== REQUIREMENT.REQUIRED
    && flowering.state !== REQUIREMENT.REQUIRED
    && fruiting.state !== REQUIREMENT.REQUIRED
    && dormant.state !== REQUIREMENT.REQUIRED
    && modes.length === 1
  ) {
    reasonCodes.push(VARIANT_REASON.NO_DISTINCT_VARIANT_REQUIRED);
  }

  const unknownStates = [];
  if (young.state === REQUIREMENT.UNKNOWN) unknownStates.push('young');
  if (flowering.state === REQUIREMENT.UNKNOWN) unknownStates.push('flowering');
  if (fruiting.state === REQUIREMENT.UNKNOWN) unknownStates.push('fruiting');
  if (dormant.state === REQUIREMENT.UNKNOWN) unknownStates.push('dormant');

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
    youngRequired: young.state,
    floweringRequired: flowering.state,
    fruitingRequired: fruiting.state,
    dormantRequired: dormant.state,
    youngDecision: young,
    floweringDecision: flowering,
    fruitingDecision: fruiting,
    dormantDecision: dormant,
    reasonCodes: [...new Set(reasonCodes)],
    identityBlockers: blockers,
    assetCountRequired: requiredVariants.length,
    assetCountOptional: optionalVariants.length,
    variants: requiredVariants,
    requiredVariants,
    optionalVariants,
    unknownStates,
    cartesianForbidden: true,
    seasonIsIdentity: false,
    generationBlocked: blocked,
    phenologyNotAutomaticallyDoubledAcrossArchitecture: true
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
    requiredVariants: req.requiredVariants,
    optionalVariants: req.optionalVariants,
    unknownStates: req.unknownStates,
    visualState: req,
    generationDemandUsesRequiredOnly: true
  };
}

function compatibleArchitecture(desiredArch, rowArch) {
  const wanted = desiredArch || 'default';
  const got = rowArch || wanted;
  if (wanted === 'tree' && got === 'shrub') return false;
  if (wanted === 'shrub' && got === 'tree') return false;
  return got === wanted;
}

function desiredStateSnapshot(desired = {}) {
  return {
    canonicalSlug: desired.canonicalSlug || null,
    botanicalTaxonId: desired.botanicalTaxonId || null,
    architectureMode: desired.architectureMode || 'default',
    growthStage: desired.growthStage || GROWTH_STAGE.MATURE,
    phenologyState: desired.phenologyState || desired.phenology || PHENOLOGY_STATE.VEGETATIVE
  };
}

function fallbackResult(desired, actual, fallbackReason, extra = {}) {
  return {
    fallback: fallbackReason === FALLBACK_REASON.NONE ? 'exact' : fallbackReason,
    fallbackReason,
    desiredVisualState: desiredStateSnapshot(desired),
    actualRenderedVisualState: actual,
    generateOnRender: false,
    botanicalTruthUnchanged: true,
    ...extra
  };
}

export function selectVisualStateFallback(desired = {}, available = []) {
  const list = Array.isArray(available) ? available : [];
  const wanted = desiredStateSnapshot(desired);
  const identitySafe = list.filter((row) => {
    if (wanted.canonicalSlug && row.canonicalSlug && slugify(row.canonicalSlug) !== slugify(wanted.canonicalSlug)) {
      return false;
    }
    return true;
  });
  if (wanted.canonicalSlug && list.some((row) => row.canonicalSlug && slugify(row.canonicalSlug) !== slugify(wanted.canonicalSlug)) && !identitySafe.length) {
    return fallbackResult(wanted, null, FALLBACK_REASON.IDENTITY_MISMATCH_FORBIDDEN, {
      fallback: 'honest-placeholder'
    });
  }
  const architectureSafe = identitySafe.filter((row) => compatibleArchitecture(wanted.architectureMode, row.architectureMode));
  const mismatchedArchitecture = identitySafe.find((row) => !compatibleArchitecture(wanted.architectureMode, row.architectureMode));
  const find = (stage, pheno) => architectureSafe.find((row) =>
    row.growthStage === stage
    && (row.phenologyState || row.phenology) === pheno
  );

  const exact = find(wanted.growthStage, wanted.phenologyState);
  if (exact) {
    return fallbackResult(wanted, {
      canonicalSlug: wanted.canonicalSlug,
      botanicalTaxonId: wanted.botanicalTaxonId,
      architectureMode: wanted.architectureMode,
      growthStage: wanted.growthStage,
      phenologyState: wanted.phenologyState
    }, FALLBACK_REASON.NONE, exact);
  }

  if (wanted.phenologyState === PHENOLOGY_STATE.DORMANT) {
    return fallbackResult(wanted, null, FALLBACK_REASON.DORMANT_ASSET_UNAVAILABLE, {
      fallback: 'honest-placeholder',
      usedLeafyVegetative: false
    });
  }
  if (wanted.growthStage === GROWTH_STAGE.YOUNG) {
    return fallbackResult(wanted, null, FALLBACK_REASON.YOUNG_ASSET_UNAVAILABLE, {
      fallback: 'honest-placeholder',
      usedMatureAsEquivalent: false
    });
  }
  if (
    wanted.phenologyState === PHENOLOGY_STATE.FLOWERING
    || wanted.phenologyState === PHENOLOGY_STATE.FRUITING
  ) {
    const veg = find(wanted.growthStage, PHENOLOGY_STATE.VEGETATIVE);
    if (veg) {
      return fallbackResult(wanted, {
        canonicalSlug: wanted.canonicalSlug,
        botanicalTaxonId: wanted.botanicalTaxonId,
        architectureMode: wanted.architectureMode,
        growthStage: wanted.growthStage,
        phenologyState: PHENOLOGY_STATE.VEGETATIVE
      }, FALLBACK_REASON.PHENOLOGY_VISUAL_FALLBACK, {
        ...veg,
        fallback: 'phenology-visual-fallback'
      });
    }
  }
  if (mismatchedArchitecture) {
    return fallbackResult(wanted, null, FALLBACK_REASON.ARCHITECTURE_MISMATCH_FORBIDDEN, {
      fallback: 'honest-placeholder'
    });
  }
  return fallbackResult(wanted, null, FALLBACK_REASON.HONEST_PLACEHOLDER, {
    fallback: 'honest-placeholder'
  });
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
    else if (req.unknownStates.length) counts.unknownOrBlocked += 1;
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
      youngDecision: row.youngDecision,
      floweringDecision: row.floweringDecision,
      fruitingDecision: row.fruitingDecision,
      dormantDecision: row.dormantDecision,
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
