/**
 * Garden Design multi-state variant policy V1.3.
 *
 * Three authorities: visual form, habit/lifecycle modifiers, purpose.
 * Does not hard-code plant names. Does not invent Cartesian combinations.
 * Does not generate assets. Does not create a second botanical identity.
 */

export const DESIGN_VARIANT_POLICY_VERSION = '1.3.0';

export const DESIGN_GROWTH_STAGES = Object.freeze(['young', 'intermediate', 'mature']);
export const DESIGN_STAGE_UNSPECIFIED = 'unspecified';
export const DESIGN_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const DESIGN_SEASON_NEUTRAL = 'season-neutral';
export const DESIGN_PHENOLOGY = Object.freeze([
  'vegetative',
  'flowering',
  'fruiting',
  'dormant'
]);

/** Legacy growth-form keys kept for existing callers. Role matrix below is authority. */
export const DESIGN_GROWTH_FORMS = Object.freeze({
  DECIDUOUS_TREE: 'deciduous_tree',
  EVERGREEN_TREE_SHRUB: 'evergreen_tree_shrub',
  FLOWERING_PERENNIAL: 'flowering_perennial',
  ANNUAL_VEGETABLE: 'annual_vegetable',
  PALM_STRUCTURAL_EVERGREEN: 'palm_structural_evergreen',
  HERBACEOUS: 'herbaceous',
  UNKNOWN: 'unknown'
});

/**
 * Visual form — physical architecture on the canvas.
 * Lifecycle, harvest use, and flowering purpose must NOT select these.
 */
export const DESIGN_VISUAL_FORMS = Object.freeze({
  TREE: 'tree',
  SHRUB: 'shrub',
  SUBSHRUB: 'subshrub',
  HERBACEOUS_UPRIGHT: 'herbaceous-upright',
  HERBACEOUS_CLUMP: 'herbaceous-clump',
  ROSETTE: 'rosette',
  CLIMBER: 'climber',
  PALM: 'palm',
  GRASS_LIKE: 'grass-like',
  GROUNDCOVER: 'groundcover',
  SUCCULENT_FORM: 'succulent-form',
  UNKNOWN: 'unknown'
});

/** Habit / lifecycle modifiers. They adjust variant requirements; they are not forms. */
export const DESIGN_HABIT_MODIFIERS = Object.freeze({
  EVERGREEN: 'evergreen',
  DECIDUOUS: 'deciduous',
  ANNUAL: 'annual',
  BIENNIAL: 'biennial',
  PERENNIAL: 'perennial',
  WOODY: 'woody',
  HERBACEOUS: 'herbaceous',
  UNKNOWN: 'unknown'
});

export const DESIGN_LIFECYCLES = Object.freeze({
  ANNUAL: 'annual',
  BIENNIAL: 'biennial',
  PERENNIAL: 'perennial',
  UNKNOWN: 'unknown'
});

/**
 * @deprecated Composite role leftover. Authority is visualForm + habitModifiers + purpose.
 * Kept only so older callers can still read a derived label.
 */
export const DESIGN_PLANT_ROLES = Object.freeze({
  DECIDUOUS_TREE: 'deciduous_tree',
  EVERGREEN_TREE: 'evergreen_tree',
  SHRUB: 'shrub',
  SUBSHRUB: 'subshrub',
  FLOWERING_PERENNIAL: 'flowering_perennial',
  ANNUAL: 'annual',
  ANNUAL_HERBACEOUS: 'annual_herbaceous',
  HERBACEOUS: 'herbaceous',
  VEGETATIVE_ROOT_CROP: 'vegetative_root_crop',
  PALM_STRUCTURAL_EVERGREEN: 'palm_structural_evergreen',
  CLIMBER: 'climber',
  ROSETTE: 'rosette',
  GRASS_LIKE: 'grass_like',
  GROUNDCOVER: 'groundcover',
  WOODY_TREE_HABIT_UNKNOWN: 'woody_tree_habit_unknown',
  UNKNOWN: 'unknown'
});

/** Purpose / use capabilities. May add optional variants only. Never override morphology. */
export const DESIGN_PURPOSE_CAPABILITIES = Object.freeze({
  EDIBLE: 'edible',
  HERB_HARVEST: 'herb_harvest',
  FRUITING: 'fruiting',
  FRUITING_CROP: 'fruiting',
  FLOWERING_ORNAMENTAL: 'flowering_ornamental',
  POLLINATOR: 'pollinator',
  FOLIAGE: 'foliage'
});

export const DESIGN_MORPHOLOGY_AUTHORITY = Object.freeze({
  EXPLICIT_HABIT_FIELD: 'explicit_habit_field',
  SOURCE_SUPPORTED_HABIT: 'source_supported_habit',
  CANONICAL_GROWTH_METADATA: 'canonical_growth_metadata',
  TRUSTED_GROUP_HABIT: 'trusted_group_habit_metadata',
  HEURISTIC_FALLBACK: 'heuristic_fallback',
  UNKNOWN: 'unknown'
});

/**
 * Launch coverage is per-plant Design-ready, not an arbitrary slug count.
 * Product note only — not identity authority, not a generation queue.
 */
export const CORE_FREEZE_MINIMUM_DESIGN_COVERAGE = Object.freeze({
  fullCatalogRequired: false,
  arbitraryPlantCountForbidden: true,
  designReadyIsPerPlant: true,
  reason: 'Design V1 is a planning layer over the active Garden, not a global cutout catalog.',
  requiredStatesByForm: Object.freeze({
    tree_deciduous: ['young', 'mature-leafy', 'dormant'],
    tree_evergreen: ['young', 'mature'],
    shrub: ['young-compact', 'mature'],
    subshrub: ['young-compact', 'mature'],
    herbaceous_upright: ['young', 'mature'],
    herbaceous_clump: ['vegetative', 'mature-clump'],
    rosette: ['young', 'mature-rosette'],
    climber: ['young-establishing', 'mature-coverage'],
    palm: ['young', 'intermediate', 'mature'],
    grass_like: ['young', 'mature'],
    groundcover: ['young-establishing', 'mature-coverage'],
    succulent_form: ['young', 'mature'],
    unknown: ['unspecified-neutral']
  }),
  basedOnVisualFormPlusHabit: true,
  purposeBlocksReadinessOnlyIfLaunchRequired: true,
  launchRequiredPurposeVariants: Object.freeze([]),
  optionalWhenVisuallyMeaningful: Object.freeze(['flowering', 'fruiting', 'herb-harvest', 'foliage']),
  purposeDoesNotRedefineMorphology: true,
  proposedLaunchCanonicalSlugs: Object.freeze([]),
  note: 'A plant is Design-ready when required role states exist with identity, transparency, provenance, and a default state. Optional variants do not block. Do not generate this automatically.'
});

export const DESIGN_ASSET_PRODUCTION_PIPELINE = Object.freeze({
  autonomousGeneration: false,
  generateOnRender: false,
  ownerMustNotManuallyProcessThousands: true,
  cartesianProductForbidden: true,
  steps: Object.freeze([
    'canonical-plant',
    'determine-required-variant-set',
    'source-or-generate-candidate',
    'identity-validation',
    'transparency-composition-validation',
    'biological-state-validation',
    'approve-or-reject',
    'register-asset',
    'reuse-globally'
  ])
});

const GENERIC_GROWTH_COPY = /^(woody landscape plant|tree|herbaceous\s*\/\s*culinary|woody ornamental\s*\/\s*landscape plant)$/i;
const PURPOSE_ONLY_TOKEN =
  /\b(herb-edible|herbs?|edible|culinary|ornamental-flowering|ornamental|pollinator|fruiting|fruits?|vegetable|food|root|tuber|taproot|cole|harvest)\b/;
const LIFECYCLE_ONLY_TOKEN = /^(annual|biennial|perennial)$/;
const VISUAL_FORM_TAG =
  /^(tree|shrub|subshrub|climber|vine|climbing|palm|cycad|rosette|bromeliad|grass|groundcover|conifer|herbaceous|citrus|succulent|cactus|clump)$/;

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function uniqueRoles(roles) {
  const seen = new Set();
  const out = [];
  for (const role of roles || []) {
    const key = `${role.growthStage || ''}|${role.season || ''}|${role.phenology || ''}|${role.formView || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(role);
  }
  return out;
}

function tagList(plant = {}) {
  if (Array.isArray(plant.tags)) return plant.tags.map((t) => asText(t)).filter(Boolean);
  const raw = asText(plant.tags);
  return raw ? raw.split(/[,\s]+/).filter(Boolean) : [];
}

function groupIdList(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  if (Array.isArray(traits.groupIds)) return traits.groupIds.map((g) => asText(g)).filter(Boolean);
  const raw = asText(traits.groupIds);
  return raw ? raw.split(/[,\s]+/).filter(Boolean) : [];
}

function isPurposeOnlyToken(value) {
  return PURPOSE_ONLY_TOKEN.test(lower(value));
}

function isMorphologyTag(value) {
  const s = lower(value);
  if (!s || isPurposeOnlyToken(s) || LIFECYCLE_ONLY_TOKEN.test(s)) return false;
  return VISUAL_FORM_TAG.test(s);
}

function isMorphologyGroupId(value) {
  const s = lower(value);
  if (!s) return false;
  if (/fruit|herb|edible|ornamental/.test(s)) return false;
  return /tree|shrub|palm|climber|vine|grass|groundcover|conifer|structural/.test(s);
}

function usableGrowthText(text) {
  const value = asText(text);
  return !value || GENERIC_GROWTH_COPY.test(value) ? '' : value;
}

function usableCareGrowth(plant = {}) {
  return usableGrowthText(plant.care?.growth);
}

function readExplicitHabitField(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  const identity = plant.identity && typeof plant.identity === 'object' ? plant.identity : {};
  const candidates = [
    plant.growthHabit,
    plant.habit,
    plant.growthForm,
    plant.morphology,
    plant.lifeForm,
    traits.growthHabit,
    traits.habit,
    traits.growthForm,
    identity.growthHabit,
    identity.habit
  ];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return '';
}

function habitEvidenceClass(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  const classes = traits.traitEvidenceClasses && typeof traits.traitEvidenceClasses === 'object'
    ? traits.traitEvidenceClasses
    : plant.traitEvidenceClasses && typeof plant.traitEvidenceClasses === 'object'
      ? plant.traitEvidenceClasses
      : {};
  return lower(classes.growthHabit || classes.habit || classes.growthForm || '');
}

function purposeTraitBlob(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  return lower(
    [
      tagList(plant).filter((t) => isPurposeOnlyToken(t)).join(' '),
      groupIdList(plant).join(' '),
      traits.floweringRequirements,
      traits.fruitingRequirements,
      plant.floweringRequirements,
      plant.fruitingRequirements
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function morphologyTraitBlob(plant = {}, extraText = '') {
  return lower(
    [
      extraText,
      readExplicitHabitField(plant),
      usableGrowthText(plant.growth),
      usableCareGrowth(plant),
      tagList(plant).filter((t) => isMorphologyTag(t)).join(' '),
      groupIdList(plant).filter((g) => isMorphologyGroupId(g)).join(' ')
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function plantTraitBlob(plant = {}) {
  return lower([morphologyTraitBlob(plant), purposeTraitBlob(plant)].filter(Boolean).join(' '));
}

function hasToken(blob, pattern) {
  return pattern.test(blob);
}

export function isBroadPlantIdentity(plant = {}) {
  const scope = lower(plant.identityScope || plant.meta?.identityScope || plant.identity?.scope);
  if (scope === 'genus' || scope === 'broad' || scope === 'broad_provisional') return true;
  const sci = lower(plant.scientific || plant.acceptedScientificName);
  return /\bspp\.?\b/.test(sci) || /^various\b/.test(sci);
}

function sourceSupportedSeasonalityState(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object'
    ? plant.climateTraits
    : {};
  const candidates = [
    plant.seasonalityEvidence,
    traits.seasonalityEvidence,
    plant.designMetadata?.leafHabit,
    traits.designMetadata?.leafHabit
  ];
  for (const evidence of candidates) {
    if (!evidence || typeof evidence !== 'object') continue;
    if (String(evidence.evidenceClass || '').toUpperCase() !== 'SOURCE_SUPPORTED') continue;
    const state = String(evidence.state || '').toUpperCase();
    if (state === 'DECIDUOUS' || state === 'EVERGREEN') return state.toLowerCase();
  }
  return '';
}

function habitLeafText(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  return lower(
    [
      sourceSupportedSeasonalityState(plant),
      morphologyTraitBlob(plant),
      traits.floweringRequirements,
      plant.floweringRequirements
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function isDeciduousHabit(plant = {}) {
  const blob = habitLeafText(plant);
  if (hasToken(blob, /\bevergreen\b/)) return false;
  return hasToken(blob, /\bdeciduous\b|\bsemideciduous\b|\bsemi-deciduous\b|\bdormant\b|\bdormancy\b/);
}

export function isEvergreenHabit(plant = {}) {
  const blob = habitLeafText(plant);
  if (isDeciduousHabit(plant) && !hasToken(blob, /\bevergreen\b/)) return false;
  return hasToken(blob, /\bevergreen\b|\bsemi-evergreen\b|\bsemievergreen\b/);
}

export function isWoodyTreeOrShrub(plant = {}) {
  const blob = morphologyTraitBlob(plant);
  return hasToken(blob, /\btree\b|\bshrub\b|\bsubshrub\b|\bcitrus\b/);
}

export function floweringIsVisuallyMeaningful(plant = {}) {
  const blob = purposeTraitBlob(plant) + ' ' + lower(plant.growth || '');
  if (hasToken(blob, /\bflowers enclosed\b|\bsyconium\b|\binside the fruit\b|\binside the syconium\b|\bnot showy\b/)) {
    return false;
  }
  if (hasToken(blob, /\binconspicuous\b/) && !hasToken(blob, /\bshowy\b|\bbracts\b|\bornamental-flowering\b/)) {
    return false;
  }
  if (hasToken(blob, /\bornamental-flowering\b|\bshowy\b|\bfragrant .*flower\b|\bflower spikes\b|\bblooms\b|\bbracts\b/)) {
    return true;
  }
  return hasToken(blob, /\bflowering\b/);
}

export function fruitingIsVisuallyMeaningful(plant = {}) {
  const blob = purposeTraitBlob(plant);
  if (
    hasToken(
      blob,
      /\bnot grown for (edible )?fruit\b|\bornamental; not grown for fruit\b|\bnot a food crop\b|\bnot a fruit crop\b/
    )
  ) {
    return false;
  }
  if (
    hasToken(
      blob,
      /\bgrown for edible taproots\b|\bharvest immature flower heads\b|\bgrown for flowers and aromatic foliage\b|\bgrown for aromatic evergreen leaves\b/
    )
  ) {
    return false;
  }
  if (hasToken(blob, /\broot\b/) && hasToken(blob, /\bvegetable\b/) && !hasToken(blob, /\bfruit\b|\bberry\b/)) {
    return false;
  }
  return hasToken(
    blob,
    /\bfruit\b|\bcitrus\b|\bberry\b|\bdrupe\b|\bpome\b|\bnuts?\b|\bolives?\b|\bmediterranean-fruit\b|\btemperate-chill-fruit/
  );
}

function classifyVisualFormFromText(blob) {
  if (hasToken(blob, /\bpalm\b|\bcycad\b/)) return DESIGN_VISUAL_FORMS.PALM;
  if (hasToken(blob, /\bclimber\b|\bvine\b|\bclimbing\b/)) return DESIGN_VISUAL_FORMS.CLIMBER;
  if (hasToken(blob, /\bgroundcover\b/)) return DESIGN_VISUAL_FORMS.GROUNDCOVER;
  if (hasToken(blob, /\bgrass\b|\bgraminoid\b/)) return DESIGN_VISUAL_FORMS.GRASS_LIKE;
  if (hasToken(blob, /\brosette\b|\bbromeliad\b/)) return DESIGN_VISUAL_FORMS.ROSETTE;
  if (hasToken(blob, /\bsucculent\b|\bcactus\b/)) return DESIGN_VISUAL_FORMS.SUCCULENT_FORM;
  if (hasToken(blob, /\btree\b|\bcitrus\b|\bconifer\b/) && !hasToken(blob, /\bherbaceous\b/)) {
    return DESIGN_VISUAL_FORMS.TREE;
  }
  if (hasToken(blob, /\bsubshrub\b/)) return DESIGN_VISUAL_FORMS.SUBSHRUB;
  if (hasToken(blob, /\bshrub\b/)) return DESIGN_VISUAL_FORMS.SHRUB;
  if (hasToken(blob, /\bherbaceous\b/) && hasToken(blob, /\bpups?\b|\bclump\b|\boffsets?\b/)) {
    return DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP;
  }
  if (hasToken(blob, /\bclump\b/) && !hasToken(blob, /\btree\b|\bshrub\b/)) {
    return DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP;
  }
  if (hasToken(blob, /\bherbaceous\b/)) return DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT;
  return DESIGN_VISUAL_FORMS.UNKNOWN;
}

function lifecycleBlob(plant = {}) {
  return lower(
    [
      tagList(plant).join(' '),
      usableGrowthText(plant.growth),
      usableCareGrowth(plant),
      plant.lifecycle,
      plant.lifeCycle,
      plant.climateTraits?.lifecycle
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function classifyDesignHabitModifiers(plant = {}) {
  const leaf = habitLeafText(plant);
  const life = lifecycleBlob(plant);
  const morph = morphologyTraitBlob(plant);
  const modifiers = [];
  if (isEvergreenHabit(plant)) modifiers.push(DESIGN_HABIT_MODIFIERS.EVERGREEN);
  if (isDeciduousHabit(plant)) modifiers.push(DESIGN_HABIT_MODIFIERS.DECIDUOUS);
  if (hasToken(life, /\bannual\b/)) modifiers.push(DESIGN_HABIT_MODIFIERS.ANNUAL);
  if (hasToken(life, /\bbiennial\b/)) modifiers.push(DESIGN_HABIT_MODIFIERS.BIENNIAL);
  if (hasToken(life, /\bperennial\b/)) modifiers.push(DESIGN_HABIT_MODIFIERS.PERENNIAL);
  const woody = hasToken(morph, /\btree\b|\bshrub\b|\bsubshrub\b|\bwoody\b|\bconifer\b|\bcitrus\b|\bpalm\b/);
  const herbaceous = hasToken(morph, /\bherbaceous\b/) || hasToken(leaf, /\bherbaceous\b/);
  if (woody && !herbaceous) modifiers.push(DESIGN_HABIT_MODIFIERS.WOODY);
  if (herbaceous) modifiers.push(DESIGN_HABIT_MODIFIERS.HERBACEOUS);

  let lifecycle = DESIGN_LIFECYCLES.UNKNOWN;
  if (modifiers.includes(DESIGN_HABIT_MODIFIERS.ANNUAL)) lifecycle = DESIGN_LIFECYCLES.ANNUAL;
  else if (modifiers.includes(DESIGN_HABIT_MODIFIERS.BIENNIAL)) lifecycle = DESIGN_LIFECYCLES.BIENNIAL;
  else if (modifiers.includes(DESIGN_HABIT_MODIFIERS.PERENNIAL)) lifecycle = DESIGN_LIFECYCLES.PERENNIAL;
  else if (woody) lifecycle = DESIGN_LIFECYCLES.PERENNIAL;

  const unique = [...new Set(modifiers)];
  if (!unique.length) unique.push(DESIGN_HABIT_MODIFIERS.UNKNOWN);
  return {
    modifiers: unique,
    lifecycle,
    deciduous: unique.includes(DESIGN_HABIT_MODIFIERS.DECIDUOUS),
    evergreen: unique.includes(DESIGN_HABIT_MODIFIERS.EVERGREEN),
    woody: unique.includes(DESIGN_HABIT_MODIFIERS.WOODY),
    herbaceous: unique.includes(DESIGN_HABIT_MODIFIERS.HERBACEOUS),
    isForm: false
  };
}

export function classifyDesignPurposeCapabilities(plant = {}) {
  const blob = purposeTraitBlob(plant);
  const flowering = floweringIsVisuallyMeaningful(plant);
  const fruiting = fruitingIsVisuallyMeaningful(plant);
  const capabilities = [];
  if (hasToken(blob, /\bherb\b|\bherb-edible\b|\bculinary\b/)) {
    capabilities.push(DESIGN_PURPOSE_CAPABILITIES.HERB_HARVEST);
  }
  if (hasToken(blob, /\bedible\b|\bvegetable\b|\bculinary\b|\bherb-edible\b|\broot\b|\btuber\b/)) {
    capabilities.push(DESIGN_PURPOSE_CAPABILITIES.EDIBLE);
  }
  if (fruiting) capabilities.push(DESIGN_PURPOSE_CAPABILITIES.FRUITING);
  if (flowering || hasToken(blob, /\bornamental-flowering\b|\bornamental\b/)) {
    capabilities.push(DESIGN_PURPOSE_CAPABILITIES.FLOWERING_ORNAMENTAL);
  }
  if (hasToken(blob, /\bpollinator\b|\bbees\b/)) capabilities.push(DESIGN_PURPOSE_CAPABILITIES.POLLINATOR);
  if (hasToken(blob, /\bfoliage\b|\bleaves\b|\baromatic foliage\b/)) {
    capabilities.push(DESIGN_PURPOSE_CAPABILITIES.FOLIAGE);
  }
  return {
    capabilities: [...new Set(capabilities)],
    floweringUseful: flowering,
    fruitingUseful: fruiting,
    herbHarvestUseful: capabilities.includes(DESIGN_PURPOSE_CAPABILITIES.HERB_HARVEST),
    foliageUseful: capabilities.includes(DESIGN_PURPOSE_CAPABILITIES.FOLIAGE),
    edibleUseful: capabilities.includes(DESIGN_PURPOSE_CAPABILITIES.EDIBLE),
    overridesForm: false,
    overridesMorphology: false
  };
}

function formConfidence(authority, form) {
  if (form === DESIGN_VISUAL_FORMS.UNKNOWN || authority === DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN) {
    return 'unknown';
  }
  if (
    authority === DESIGN_MORPHOLOGY_AUTHORITY.EXPLICIT_HABIT_FIELD ||
    authority === DESIGN_MORPHOLOGY_AUTHORITY.SOURCE_SUPPORTED_HABIT
  ) {
    return 'high';
  }
  if (authority === DESIGN_MORPHOLOGY_AUTHORITY.CANONICAL_GROWTH_METADATA) return 'medium';
  return 'low';
}

export function classifyDesignVisualForm(plant = {}) {
  const explicit = readExplicitHabitField(plant);
  const growth = usableGrowthText(plant.growth) || usableCareGrowth(plant);
  const morphGroups = groupIdList(plant).filter((g) => isMorphologyGroupId(g));
  const morphTags = tagList(plant).filter((t) => isMorphologyTag(t));
  const supported = habitEvidenceClass(plant) === 'source_supported';

  let authority = DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN;
  let evidence = '';
  if (explicit) {
    authority = supported
      ? DESIGN_MORPHOLOGY_AUTHORITY.SOURCE_SUPPORTED_HABIT
      : DESIGN_MORPHOLOGY_AUTHORITY.EXPLICIT_HABIT_FIELD;
    evidence = explicit;
  } else if (supported && growth) {
    authority = DESIGN_MORPHOLOGY_AUTHORITY.SOURCE_SUPPORTED_HABIT;
    evidence = growth;
  } else if (growth && !GENERIC_GROWTH_COPY.test(growth)) {
    authority = DESIGN_MORPHOLOGY_AUTHORITY.CANONICAL_GROWTH_METADATA;
    evidence = growth;
  } else if (morphGroups.length) {
    authority = DESIGN_MORPHOLOGY_AUTHORITY.TRUSTED_GROUP_HABIT;
    evidence = morphGroups.join(' ');
  } else if (morphTags.length) {
    authority = DESIGN_MORPHOLOGY_AUTHORITY.HEURISTIC_FALLBACK;
    evidence = morphTags.join(' ');
  }

  const blob = morphologyTraitBlob(plant, evidence);
  let visualForm = classifyVisualFormFromText(blob);
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN && morphTags.length) {
    const fromTags = classifyVisualFormFromText(lower(morphTags.join(' ')));
    if (fromTags !== DESIGN_VISUAL_FORMS.UNKNOWN) {
      visualForm = fromTags;
      authority = DESIGN_MORPHOLOGY_AUTHORITY.HEURISTIC_FALLBACK;
      evidence = morphTags.join(' ');
    }
  }
  if (visualForm === DESIGN_VISUAL_FORMS.UNKNOWN) {
    authority = DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN;
    evidence = evidence || '';
  }

  const habit = classifyDesignHabitModifiers(plant);
  const purpose = classifyDesignPurposeCapabilities(plant);
  return {
    visualForm,
    form: visualForm,
    authority,
    evidence: asText(evidence),
    confidence: formConfidence(authority, visualForm),
    habitModifiers: habit.modifiers,
    lifecycle: habit.lifecycle,
    purposeCapabilities: purpose.capabilities,
    deciduous: habit.deciduous,
    evergreen: habit.evergreen
  };
}

export function classifyDesignVisualMorphology(plant = {}) {
  const classified = classifyDesignVisualForm(plant);
  return {
    ...classified,
    role: classified.visualForm,
    visualMorphologyRole: classified.visualForm,
    purposeDidNotSelectRole: true
  };
}

export function classifyDesignPlantRole(plant = {}) {
  return classifyDesignVisualForm(plant).visualForm;
}

export function mapPlantRoleToLegacyGrowthForm(visualForm, plant = {}) {
  const habit = classifyDesignHabitModifiers(plant);
  switch (visualForm) {
    case DESIGN_VISUAL_FORMS.TREE:
      return habit.deciduous ? DESIGN_GROWTH_FORMS.DECIDUOUS_TREE : DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB;
    case DESIGN_VISUAL_FORMS.SHRUB:
    case DESIGN_VISUAL_FORMS.SUBSHRUB:
    case DESIGN_VISUAL_FORMS.CLIMBER:
      return DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB;
    case DESIGN_VISUAL_FORMS.PALM:
      return DESIGN_GROWTH_FORMS.PALM_STRUCTURAL_EVERGREEN;
    case DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP:
      return DESIGN_GROWTH_FORMS.FLOWERING_PERENNIAL;
    case DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT:
    case DESIGN_VISUAL_FORMS.ROSETTE:
    case DESIGN_VISUAL_FORMS.GRASS_LIKE:
    case DESIGN_VISUAL_FORMS.GROUNDCOVER:
    case DESIGN_VISUAL_FORMS.SUCCULENT_FORM:
      return habit.lifecycle === DESIGN_LIFECYCLES.ANNUAL
        ? DESIGN_GROWTH_FORMS.ANNUAL_VEGETABLE
        : DESIGN_GROWTH_FORMS.HERBACEOUS;
    default:
      return habit.lifecycle === DESIGN_LIFECYCLES.ANNUAL
        ? DESIGN_GROWTH_FORMS.ANNUAL_VEGETABLE
        : DESIGN_GROWTH_FORMS.UNKNOWN;
  }
}

export function classifyDesignGrowthForm(plant = {}) {
  return mapPlantRoleToLegacyGrowthForm(classifyDesignVisualForm(plant).visualForm, plant);
}

function role(partial) {
  return {
    growthStage: partial.growthStage || DESIGN_STAGE_UNSPECIFIED,
    season: partial.season || DESIGN_SEASON_NEUTRAL,
    phenology: partial.phenology || 'vegetative',
    formView: partial.formView || null,
    required: partial.required !== false,
    reason: asText(partial.reason)
  };
}

function optionalPhenologyRoles(growthStage, flower, fruit, extra = {}) {
  const roles = [];
  if (flower) {
    roles.push(
      role({
        growthStage,
        season: extra.flowerSeason || DESIGN_SEASON_NEUTRAL,
        phenology: 'flowering',
        required: false,
        reason: extra.flowerReason || 'optional flowering when visually meaningful'
      })
    );
  }
  if (fruit) {
    roles.push(
      role({
        growthStage,
        season: extra.fruitSeason || DESIGN_SEASON_NEUTRAL,
        phenology: 'fruiting',
        required: false,
        reason: extra.fruitReason || 'optional fruiting when visually/product relevant'
      })
    );
  }
  return roles;
}

/**
 * Required states come from visualForm + habit/lifecycle modifiers.
 * Purpose may add optional / product-relevant states only.
 */
export function requiredDesignVariantRoles(plant = {}) {
  const architecture = classifyDesignVisualForm(plant);
  const purpose = classifyDesignPurposeCapabilities(plant);
  const visualForm = architecture.visualForm;
  const habit = architecture.habitModifiers || [];
  const deciduous = architecture.deciduous === true;
  const evergreen = architecture.evergreen === true;
  const form = mapPlantRoleToLegacyGrowthForm(visualForm, plant);
  const flower =
    purpose.floweringUseful ||
    (purpose.capabilities || []).includes(DESIGN_PURPOSE_CAPABILITIES.FLOWERING_ORNAMENTAL);
  const fruit = purpose.fruitingUseful;
  const roles = [];

  if (visualForm === DESIGN_VISUAL_FORMS.TREE) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'establishment form' }));
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'leafy',
        reason: 'mature canopy'
      })
    );
    if (deciduous) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'winter',
          phenology: 'dormant',
          reason: 'deciduous habit: winter dormant asset'
        })
      );
    }
  } else if (visualForm === DESIGN_VISUAL_FORMS.SHRUB || visualForm === DESIGN_VISUAL_FORMS.SUBSHRUB) {
    roles.push(
      role({
        growthStage: 'young',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'compact',
        reason: 'young/compact shrub'
      })
    );
    roles.push(role({ growthStage: 'mature', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'mature shrub' }));
    if (deciduous) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'winter',
          phenology: 'dormant',
          reason: 'deciduous habit: winter dormant asset'
        })
      );
    }
  } else if (visualForm === DESIGN_VISUAL_FORMS.CLIMBER) {
    roles.push(
      role({
        growthStage: 'young',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'establishing',
        reason: 'young/establishing climber'
      })
    );
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'coverage',
        reason: 'mature coverage'
      })
    );
    if (deciduous) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'winter',
          phenology: 'dormant',
          reason: 'deciduous climber: winter dormant asset'
        })
      );
    }
  } else if (visualForm === DESIGN_VISUAL_FORMS.PALM) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'juvenile palm form' }));
    roles.push(
      role({ growthStage: 'intermediate', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'intermediate stature' })
    );
    roles.push(role({ growthStage: 'mature', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'mature structural form' }));
  } else if (visualForm === DESIGN_VISUAL_FORMS.ROSETTE) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'young rosette' }));
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'rosette',
        reason: 'mature rosette'
      })
    );
  } else if (visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'vegetative clump' }));
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'mature-clump',
        reason: 'mature clump'
      })
    );
  } else if (visualForm === DESIGN_VISUAL_FORMS.HERBACEOUS_UPRIGHT) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'young herbaceous-upright form' }));
    roles.push(role({ growthStage: 'mature', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'mature herbaceous-upright form' }));
  } else if (visualForm === DESIGN_VISUAL_FORMS.GRASS_LIKE) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'young grass-like form' }));
    roles.push(role({ growthStage: 'mature', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'mature grass-like form' }));
  } else if (visualForm === DESIGN_VISUAL_FORMS.GROUNDCOVER) {
    roles.push(
      role({
        growthStage: 'young',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'establishing',
        reason: 'establishing groundcover'
      })
    );
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'coverage',
        reason: 'mature groundcover'
      })
    );
  } else if (visualForm === DESIGN_VISUAL_FORMS.SUCCULENT_FORM) {
    roles.push(role({ growthStage: 'young', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'young succulent form' }));
    roles.push(role({ growthStage: 'mature', season: DESIGN_SEASON_NEUTRAL, phenology: 'vegetative', reason: 'mature succulent form' }));
  } else {
    roles.push(
      role({
        growthStage: DESIGN_STAGE_UNSPECIFIED,
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        reason: 'unknown form: one honest neutral representation; do not assume mature'
      })
    );
  }

  roles.push(...optionalPhenologyRoles('mature', flower, fruit, {
    flowerReason: 'purpose-driven flowering; not physical form',
    fruitReason: 'purpose-driven fruiting; not physical form'
  }));
  if (purpose.herbHarvestUseful || purpose.foliageUseful) {
    roles.push(
      role({
        growthStage: 'mature',
        season: DESIGN_SEASON_NEUTRAL,
        phenology: 'vegetative',
        formView: 'harvestable',
        required: false,
        reason: 'optional purpose-driven harvest/foliage state'
      })
    );
  }

  return {
    form,
    role: visualForm,
    visualForm,
    visualMorphologyRole: visualForm,
    morphologyAuthority: architecture.authority,
    morphologyEvidence: architecture.evidence,
    formAuthority: architecture.authority,
    formEvidence: architecture.evidence,
    habitModifiers: habit,
    lifecycle: architecture.lifecycle,
    confidence: architecture.confidence,
    purposeCapabilities: purpose.capabilities,
    purpose: purpose,
    deciduous,
    evergreen,
    floweringVisuallyMeaningful: flower,
    fruitingVisuallyMeaningful: fruit,
    cartesianForbidden: true,
    purposeDoesNotRedefineMorphology: true,
    purposeDoesNotRedefineForm: true,
    lifecycleIsNotVisualForm: true,
    roles: uniqueRoles(roles)
  };
}

export function seasonPolicyForRole(visualForm, plant = {}) {
  const habit = classifyDesignHabitModifiers(plant);
  const form = visualForm || classifyDesignVisualForm(plant).visualForm;
  const evergreen = habit.evergreen || form === DESIGN_VISUAL_FORMS.PALM;
  const deciduous = habit.deciduous;
  return {
    unknownAcceptable: true,
    fillSeasonSlotsForbidden: true,
    winter: deciduous
      ? 'dormant-asset-when-approved'
      : evergreen
        ? 'remain-leafy-no-fake-bare'
        : 'unknown',
    floweringYearRoundForbidden: false,
    fruitingOnlyWhenPlausible: true,
    artificialSeasonalVariantsForbidden: evergreen || form === DESIGN_VISUAL_FORMS.PALM || form === DESIGN_VISUAL_FORMS.SUCCULENT_FORM
  };
}

export function phenologyPolicyForRole(visualForm, plant = {}) {
  const habit = classifyDesignHabitModifiers(plant);
  const form = visualForm || classifyDesignVisualForm(plant).visualForm;
  return {
    defaultPhenology: 'vegetative',
    floweringNotDefaultForAesthetics: true,
    fruitingNotDefaultForAesthetics: true,
    floweringRequiredAsset: false,
    fruitingRequiredAsset: false,
    dormantRequiredAsset: form === DESIGN_VISUAL_FORMS.TREE && habit.deciduous === true,
    userMayChooseApprovedAlternate: true,
    purposeMayAddOptionalStates: true,
    purposeBlocksReadinessOnlyIfLaunchRequired: true
  };
}

export function assertNoFakeSeasonalVariants(plant, variant = {}) {
  const season = lower(variant.season);
  const phenology = lower(variant.phenology);
  if (isEvergreenHabit(plant) && phenology === 'dormant' && (season === 'winter' || season === 'autumn')) {
    return {
      ok: false,
      reason: 'evergreen-must-not-be-made-bare-for-winter'
    };
  }
  if (isDeciduousHabit(plant) && season === 'winter' && phenology === 'vegetative' && variant.fullyLeafy === true) {
    return {
      ok: false,
      reason: 'winter-deciduous-must-not-appear-fully-leafy'
    };
  }
  if (phenology === 'flowering' && !floweringIsVisuallyMeaningful(plant) && variant.required === true) {
    return { ok: false, reason: 'flowering-not-botanically-plausible-as-required' };
  }
  if (phenology === 'fruiting' && !fruitingIsVisuallyMeaningful(plant) && variant.required === true) {
    return { ok: false, reason: 'fruiting-not-botanically-plausible-as-required' };
  }
  return { ok: true };
}

export function cartesianVariantCount(growthStages, seasons, phenology) {
  return (growthStages || []).length * (seasons || []).length * (phenology || []).length;
}

export function seasonMatchesRole(roleSeason, variantSeason) {
  const rs = lower(roleSeason || 'unknown');
  const vs = lower(variantSeason || 'unknown');
  if (!rs || rs === 'unknown' || rs === DESIGN_SEASON_NEUTRAL) return true;
  if (!vs || vs === 'unknown' || vs === DESIGN_SEASON_NEUTRAL) return true;
  return rs === vs;
}

const api = {
  DESIGN_VARIANT_POLICY_VERSION,
  DESIGN_GROWTH_STAGES,
  DESIGN_STAGE_UNSPECIFIED,
  DESIGN_SEASONS,
  DESIGN_SEASON_NEUTRAL,
  DESIGN_PHENOLOGY,
  DESIGN_GROWTH_FORMS,
  DESIGN_VISUAL_FORMS,
  DESIGN_HABIT_MODIFIERS,
  DESIGN_LIFECYCLES,
  DESIGN_PLANT_ROLES,
  DESIGN_PURPOSE_CAPABILITIES,
  DESIGN_MORPHOLOGY_AUTHORITY,
  CORE_FREEZE_MINIMUM_DESIGN_COVERAGE,
  DESIGN_ASSET_PRODUCTION_PIPELINE,
  isBroadPlantIdentity,
  isDeciduousHabit,
  isEvergreenHabit,
  floweringIsVisuallyMeaningful,
  fruitingIsVisuallyMeaningful,
  classifyDesignPurposeCapabilities,
  classifyDesignHabitModifiers,
  classifyDesignVisualForm,
  classifyDesignVisualMorphology,
  classifyDesignPlantRole,
  mapPlantRoleToLegacyGrowthForm,
  classifyDesignGrowthForm,
  requiredDesignVariantRoles,
  seasonPolicyForRole,
  phenologyPolicyForRole,
  assertNoFakeSeasonalVariants,
  cartesianVariantCount,
  seasonMatchesRole
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignVariantPolicy = api;
}
