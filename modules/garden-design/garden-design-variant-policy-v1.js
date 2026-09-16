/**
 * Garden Design multi-state variant policy V1.
 *
 * Role-based required design-asset states from canonical plant TRAITS.
 * Does not hard-code plant names. Does not invent Cartesian combinations.
 * Does not generate assets. Does not create a second botanical identity.
 */

export const DESIGN_VARIANT_POLICY_VERSION = '1.0.0';

export const DESIGN_GROWTH_STAGES = Object.freeze(['young', 'intermediate', 'mature']);
export const DESIGN_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const DESIGN_PHENOLOGY = Object.freeze([
  'vegetative',
  'flowering',
  'fruiting',
  'dormant'
]);

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
 * Launch-scope coverage proposal for Core Feature Freeze.
 * Product recommendation only — not identity authority, not a generation queue.
 */
export const CORE_FREEZE_MINIMUM_DESIGN_COVERAGE = Object.freeze({
  fullCatalogRequired: false,
  reason: 'Design V1 is a planning layer over the active Garden, not a global cutout catalog.',
  requiredStatesByForm: Object.freeze({
    deciduous_tree: ['young', 'mature-leafy', 'dormant-winter'],
    evergreen_tree_shrub: ['young', 'mature'],
    flowering_perennial: ['vegetative', 'flowering'],
    annual_vegetable: ['young', 'mature-harvest'],
    palm_structural_evergreen: ['young', 'intermediate', 'mature']
  }),
  optionalWhenVisuallyMeaningful: Object.freeze(['flowering', 'fruiting']),
  proposedLaunchCanonicalSlugs: Object.freeze([
    'olive',
    'lavender',
    'rosemary',
    'lemon',
    'mango',
    'cypress',
    'bougainvillea'
  ]),
  note: 'Propose mature composition-ready cutout first; add biologically real extra states only. Do not generate this set automatically.'
});

export const DESIGN_ASSET_PRODUCTION_PIPELINE = Object.freeze({
  autonomousGeneration: false,
  generateOnRender: false,
  ownerMustNotManuallyProcessThousands: true,
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

function plantTraitBlob(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  const groups = Array.isArray(traits.groupIds) ? traits.groupIds.join(' ') : asText(traits.groupIds);
  const tags = Array.isArray(plant.tags) ? plant.tags.join(' ') : asText(plant.tags);
  return lower(
    [
      tags,
      plant.growth,
      plant.scientific,
      plant.care?.growth,
      groups,
      traits.floweringRequirements,
      traits.fruitingRequirements,
      plant.floweringRequirements,
      plant.fruitingRequirements
    ]
      .filter(Boolean)
      .join(' ')
  );
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

export function isDeciduousHabit(plant = {}) {
  const blob = plantTraitBlob(plant);
  if (hasToken(blob, /\bevergreen\b/)) return false;
  return hasToken(blob, /\bdeciduous\b|\bsemideciduous\b|\bsemi-deciduous\b|\bdormant\b/);
}

export function isEvergreenHabit(plant = {}) {
  const blob = plantTraitBlob(plant);
  if (isDeciduousHabit(plant) && !hasToken(blob, /\bevergreen\b/)) return false;
  return hasToken(blob, /\bevergreen\b|\bsemi-evergreen\b|\bsemievergreen\b/);
}

export function isWoodyTreeOrShrub(plant = {}) {
  const blob = plantTraitBlob(plant);
  return hasToken(blob, /\btree\b|\bshrub\b|\bwoody\b|\bcitrus\b/);
}

export function floweringIsVisuallyMeaningful(plant = {}) {
  const blob = plantTraitBlob(plant);
  if (hasToken(blob, /\bflowers enclosed\b|\bsyconium\b|\binside the fruit\b|\binside the syconium\b/)) {
    return false;
  }
  if (hasToken(blob, /\bornamental-flowering\b|\bshowy\b|\bfragrant .*flower\b|\bflower spikes\b|\bblooms\b/)) {
    return true;
  }
  return hasToken(blob, /\bflowering\b/) && !hasToken(blob, /\bnot showy\b|\binconspicuous true flowers\b/);
}

export function fruitingIsVisuallyMeaningful(plant = {}) {
  const blob = plantTraitBlob(plant);
  if (hasToken(blob, /\bnot grown for (edible )?fruit\b|\bornamental; not grown for fruit\b|\bnot a food crop\b/)) {
    return false;
  }
  return hasToken(
    blob,
    /\bfruit\b|\bedible\b|\bcitrus\b|\bberry\b|\bharvest\b|\bmediterranean-fruit\b|\btemperate-chill-fruit/
  );
}

export function classifyDesignGrowthForm(plant = {}) {
  const blob = plantTraitBlob(plant);
  if (hasToken(blob, /\bpalm\b|\bcycad\b/)) return DESIGN_GROWTH_FORMS.PALM_STRUCTURAL_EVERGREEN;
  if (hasToken(blob, /\bannual\b|\bvegetable\b|\bcrop\b/)) return DESIGN_GROWTH_FORMS.ANNUAL_VEGETABLE;
  if (isWoodyTreeOrShrub(plant) && isDeciduousHabit(plant)) return DESIGN_GROWTH_FORMS.DECIDUOUS_TREE;
  if (isWoodyTreeOrShrub(plant) && (isEvergreenHabit(plant) || !isDeciduousHabit(plant))) {
    return DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB;
  }
  if (hasToken(blob, /\bperennial\b|\bornamental-flowering\b|\bclump\b/) && !isWoodyTreeOrShrub(plant)) {
    return DESIGN_GROWTH_FORMS.FLOWERING_PERENNIAL;
  }
  if (hasToken(blob, /\bherb\b|\bherb-edible\b|\bherbaceous\b/)) return DESIGN_GROWTH_FORMS.HERBACEOUS;
  if (isWoodyTreeOrShrub(plant)) return DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB;
  return DESIGN_GROWTH_FORMS.UNKNOWN;
}

function role(partial) {
  return {
    growthStage: partial.growthStage || 'mature',
    season: partial.season || 'unknown',
    phenology: partial.phenology || 'vegetative',
    formView: partial.formView || null,
    required: partial.required !== false,
    reason: asText(partial.reason)
  };
}

/**
 * Required (and optional) design-asset roles. Not a 3×4×3 cartesian product.
 */
export function requiredDesignVariantRoles(plant = {}) {
  const form = classifyDesignGrowthForm(plant);
  const flower = floweringIsVisuallyMeaningful(plant);
  const fruit = fruitingIsVisuallyMeaningful(plant);
  const roles = [];

  if (form === DESIGN_GROWTH_FORMS.DECIDUOUS_TREE) {
    roles.push(role({ growthStage: 'young', season: 'summer', phenology: 'vegetative', reason: 'establishment form' }));
    roles.push(
      role({ growthStage: 'mature', season: 'summer', phenology: 'vegetative', reason: 'mature leafy canopy' })
    );
    if (flower) {
      roles.push(
        role({ growthStage: 'mature', season: 'spring', phenology: 'flowering', reason: 'visually meaningful bloom' })
      );
    }
    if (fruit) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'autumn',
          phenology: 'fruiting',
          reason: 'visually meaningful harvest'
        })
      );
    }
    roles.push(
      role({
        growthStage: 'mature',
        season: 'winter',
        phenology: 'dormant',
        reason: 'winter-deciduous must not appear fully leafy'
      })
    );
  } else if (form === DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB) {
    roles.push(role({ growthStage: 'young', season: 'summer', phenology: 'vegetative', reason: 'establishment form' }));
    roles.push(role({ growthStage: 'mature', season: 'summer', phenology: 'vegetative', reason: 'mature evergreen' }));
    if (flower) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'unknown',
          phenology: 'flowering',
          required: false,
          reason: 'flowering only if visually important'
        })
      );
    }
    if (fruit) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'unknown',
          phenology: 'fruiting',
          required: false,
          reason: 'fruiting only if visually important'
        })
      );
    }
  } else if (form === DESIGN_GROWTH_FORMS.FLOWERING_PERENNIAL) {
    roles.push(role({ growthStage: 'mature', season: 'unknown', phenology: 'vegetative', reason: 'vegetative clump' }));
    roles.push(role({ growthStage: 'mature', season: 'unknown', phenology: 'flowering', reason: 'flowering display' }));
    roles.push(
      role({
        growthStage: 'mature',
        season: 'unknown',
        phenology: 'vegetative',
        formView: 'mature-clump',
        required: false,
        reason: 'mature clump where composition needs mass'
      })
    );
  } else if (form === DESIGN_GROWTH_FORMS.ANNUAL_VEGETABLE) {
    roles.push(role({ growthStage: 'young', season: 'unknown', phenology: 'vegetative', reason: 'young crop' }));
    roles.push(
      role({ growthStage: 'mature', season: 'unknown', phenology: 'vegetative', reason: 'mature / harvest stage' })
    );
    if (flower || fruit) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'unknown',
          phenology: fruit ? 'fruiting' : 'flowering',
          required: false,
          reason: 'crop-relevant flowering/fruiting only'
        })
      );
    }
  } else if (form === DESIGN_GROWTH_FORMS.PALM_STRUCTURAL_EVERGREEN) {
    roles.push(role({ growthStage: 'young', season: 'unknown', phenology: 'vegetative', reason: 'juvenile palm form' }));
    roles.push(
      role({ growthStage: 'intermediate', season: 'unknown', phenology: 'vegetative', reason: 'intermediate stature' })
    );
    roles.push(role({ growthStage: 'mature', season: 'unknown', phenology: 'vegetative', reason: 'mature structural form' }));
  } else if (form === DESIGN_GROWTH_FORMS.HERBACEOUS) {
    roles.push(role({ growthStage: 'young', season: 'unknown', phenology: 'vegetative', reason: 'young herb' }));
    roles.push(role({ growthStage: 'mature', season: 'unknown', phenology: 'vegetative', reason: 'mature herb' }));
    if (flower) {
      roles.push(
        role({
          growthStage: 'mature',
          season: 'unknown',
          phenology: 'flowering',
          required: false,
          reason: 'flowering if visually meaningful'
        })
      );
    }
  } else {
    roles.push(
      role({
        growthStage: 'mature',
        season: 'unknown',
        phenology: 'vegetative',
        reason: 'unknown form: one honest mature representation'
      })
    );
  }

  return {
    form,
    deciduous: isDeciduousHabit(plant),
    evergreen: isEvergreenHabit(plant),
    floweringVisuallyMeaningful: flower,
    fruitingVisuallyMeaningful: fruit,
    cartesianForbidden: true,
    roles: uniqueRoles(roles)
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

const api = {
  DESIGN_VARIANT_POLICY_VERSION,
  DESIGN_GROWTH_STAGES,
  DESIGN_SEASONS,
  DESIGN_PHENOLOGY,
  DESIGN_GROWTH_FORMS,
  CORE_FREEZE_MINIMUM_DESIGN_COVERAGE,
  DESIGN_ASSET_PRODUCTION_PIPELINE,
  isBroadPlantIdentity,
  isDeciduousHabit,
  isEvergreenHabit,
  floweringIsVisuallyMeaningful,
  fruitingIsVisuallyMeaningful,
  classifyDesignGrowthForm,
  requiredDesignVariantRoles,
  assertNoFakeSeasonalVariants,
  cartesianVariantCount
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignVariantPolicy = api;
}
