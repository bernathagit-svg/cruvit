/**
 * Garden Design Variant Selection Policy V1.
 *
 * Authoritative default + lookup for composition-ready Design assets.
 * Catalog Images V1 remain a separate visual authority.
 * Does not generate images. Does not invent age or life stage.
 * Does not start an asset batch. Does not apply a DB migration.
 */

import {
  DESIGN_STAGE_UNSPECIFIED,
  DESIGN_SEASON_NEUTRAL,
  DESIGN_PLANT_ROLES,
  classifyDesignPlantRole,
  classifyDesignVisualMorphology,
  classifyDesignVisualForm,
  classifyDesignPurposeCapabilities,
  classifyDesignHabitModifiers,
  requiredDesignVariantRoles,
  seasonPolicyForRole,
  phenologyPolicyForRole,
  assertNoFakeSeasonalVariants
} from './garden-design-variant-policy-v1.js?v=20260920graph1';
import {
  DESIGN_ASSET_FALLBACK,
  getDesignAssetSet,
  isUsableDesignVariant,
  requiredRolesVersusCoverage,
  resolveDesignAsset
} from './garden-design-asset-registry-v1.js?v=20260920graph1';

export const DESIGN_VARIANT_SELECTION_POLICY_VERSION = '1.2.0';

export const VISUAL_AUTHORITY_SEPARATION = Object.freeze({
  catalogCardImage: Object.freeze({
    authority: 'Catalog Images V1',
    usedFor: Object.freeze([
      'smart-recommendations',
      'my-garden-cards',
      'plant-identifier-result',
      'informational-plant-cards'
    ]),
    purpose: 'recognition / information / attractive real plant photo',
    mayBeUsedAsDesignCutout: false
  }),
  gardenDesignAsset: Object.freeze({
    authority: 'Garden Design Asset Registry',
    usedFor: Object.freeze(['garden-design-canvas', 'visual-future-growth-preview']),
    purpose: 'transparent composition-ready plant representation',
    mayHaveBiologicallyMeaningfulVariants: true
  }),
  sharedIdentity: 'canonicalSlug',
  sameImageAuthority: false
});

export const DESIGN_VARIANT_METADATA_AUDIT = Object.freeze({
  canonicalSlug: Object.freeze({
    status: 'mixed',
    catalog: 'SOURCE_SUPPORTED',
    owned: 'heuristic',
    note: 'Owned rows store profile_slug; Design copies it to canonicalSlug.'
  }),
  garden_plant_id: Object.freeze({ status: 'SOURCE_SUPPORTED', note: 'garden_plants.id' }),
  added_at: Object.freeze({
    status: 'SOURCE_SUPPORTED',
    asAge: false,
    note: 'Add-to-garden timestamp, not planting date. Design DTO currently drops it.'
  }),
  knownAge: Object.freeze({ status: 'missing', inventForbidden: true }),
  gardenHistory: Object.freeze({
    status: 'SOURCE_SUPPORTED',
    growthStageEvents: 'missing',
    note: 'plant_added exists; no age/stage/phenology events.'
  }),
  gardenArea: Object.freeze({ status: 'SOURCE_SUPPORTED', note: 'garden_area_id; microclimate, not stage.' }),
  growthForm: Object.freeze({
    status: 'heuristic',
    note: 'Visual morphology from habit/growth/morphology tags only. Purpose tags do not select form.'
  }),
  deciduousEvergreen: Object.freeze({
    status: 'heuristic',
    note: 'No habit enum; occasional SOURCE_SUPPORTED-adjacent text.'
  }),
  plantType: Object.freeze({ status: 'heuristic' }),
  floweringRelevance: Object.freeze({ status: 'mixed', selector: 'heuristic' }),
  fruitingRelevance: Object.freeze({ status: 'mixed', selector: 'heuristic' }),
  seasonality: Object.freeze({ status: 'missing', asCurrentGardenSeason: true }),
  growthStageMetadata: Object.freeze({ status: 'missing', ownedColumn: false }),
  targetMatureStage: Object.freeze({ status: 'missing', ownedColumn: false }),
  currentLocalSeason: Object.freeze({
    status: 'missing',
    note: 'Garden lat/lon exist; no currentLocalSeason helper. UNKNOWN is acceptable.'
  }),
  plantingDateToStageMapping: Object.freeze({
    status: 'missing',
    scientificallyDefensible: false,
    doNotInvent: true
  }),
  evidenceQuality: Object.freeze({
    status: 'SOURCE_SUPPORTED',
    scope: 'some catalog trait fields only',
    ownedPlants: 'missing'
  })
});

export const DESIGN_TEMPORAL_VIEWS = Object.freeze({
  CURRENT: Object.freeze({
    key: 'current',
    evidenceLimited: true,
    inventAgeForbidden: true,
    metadataWouldDrive: Object.freeze([
      'explicit growth stage',
      'planting date + defensible stage map',
      'user-confirmed garden history',
      'garden season for phenology only'
    ])
  }),
  NEAR_TERM: Object.freeze({
    key: 'near-term',
    optional: true,
    implemented: false,
    yearsEstimated: false
  }),
  MATURE: Object.freeze({
    key: 'mature',
    usesApprovedMatureFormAssetOnly: true,
    doesNotImplyCurrentSize: true,
    yearsToMaturity: null
  })
});

export const OWNED_DEFAULT_PRECEDENCE = Object.freeze([
  'explicit-known-growth-stage-or-age-evidence',
  'planting-date-plus-supported-stage-mapping',
  'garden-history-user-confirmed-state',
  'seasonally-appropriate-neutral-state',
  'canonical-neutral-fallback'
]);

export const DESIGN_READY_DEFINITION = Object.freeze({
  requiredMinimumRoleStatesExist: true,
  basedOnVisualMorphology: true,
  basedOnVisualFormPlusHabit: true,
  purposeDoesNotRedefineForm: true,
  purposeBlocksReadinessOnlyIfLaunchRequired: true,
  launchRequiredPurposeVariants: Object.freeze([]),
  identityConsistencyPasses: true,
  transparencyCompositionPasses: true,
  provenanceRightsPass: true,
  requiredDefaultStateExists: true,
  optionalVariantsDoNotBlock: true,
  honestPlaceholderIsNotDesignReady: true,
  arbitraryPlantCountForbidden: true,
  notAGenerationQueue: true
});

export const SELECTION_FORBIDDEN = Object.freeze({
  substituteSpecies: false,
  useCatalogPhotoAsFakeCutout: false,
  randomWebImage: false,
  generateOnRender: false,
  defaultMatureWhenAgeUnknown: false,
  cartesianExplosion: false,
  floweringFruitingForAestheticsOnly: false,
  usageTagsDefinePhysicalMorphology: false,
  purposeOverridesPhysicalForm: false
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function slugify(value) {
  return lower(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stageKnown(value) {
  const stage = lower(value);
  return stage === 'young' || stage === 'intermediate' || stage === 'mature';
}

export function ownedPlacementVisualDefaults() {
  return {
    growthStage: DESIGN_STAGE_UNSPECIFIED,
    targetGrowthStage: 'mature',
    season: 'unknown',
    phenology: 'vegetative',
    stageKnown: false,
    ageKnown: false,
    uncertainty: 'current-stage-unknown',
    view: DESIGN_TEMPORAL_VIEWS.CURRENT.key,
    maturePreviewImpliesCurrentSize: false
  };
}

export function proposedPlacementVisualDefaults() {
  return {
    growthStage: 'young',
    targetGrowthStage: 'mature',
    season: 'unknown',
    phenology: 'vegetative',
    stageKnown: false,
    ageKnown: false,
    uncertainty: 'proposed-near-planting-not-observed-age',
    view: DESIGN_TEMPORAL_VIEWS.CURRENT.key,
    maturePreviewImpliesCurrentSize: false
  };
}

function plantingDateStageMappingSupported() {
  return DESIGN_VARIANT_METADATA_AUDIT.plantingDateToStageMapping.scientificallyDefensible === true;
}

export function resolveOwnedDefaultRequest(input = {}) {
  const defaults = ownedPlacementVisualDefaults();
  const explicitStage = stageKnown(input.growthStage) ? lower(input.growthStage) : '';
  const historyStage = stageKnown(input.gardenHistoryStage || input.userConfirmedStage)
    ? lower(input.gardenHistoryStage || input.userConfirmedStage)
    : '';
  const gardenSeason = lower(input.gardenSeason || input.season);
  const usableSeason =
    gardenSeason && gardenSeason !== 'unknown' ? gardenSeason : DESIGN_SEASON_NEUTRAL;

  if (explicitStage) {
    return {
      ...defaults,
      growthStage: explicitStage,
      season: usableSeason,
      phenology: lower(input.phenology) || 'vegetative',
      stageKnown: true,
      ageKnown: Boolean(input.ageKnown),
      uncertainty: null,
      precedenceUsed: OWNED_DEFAULT_PRECEDENCE[0]
    };
  }

  if (input.plantingDate && plantingDateStageMappingSupported() && stageKnown(input.mappedStageFromPlantingDate)) {
    return {
      ...defaults,
      growthStage: lower(input.mappedStageFromPlantingDate),
      season: usableSeason,
      phenology: 'vegetative',
      stageKnown: true,
      precedenceUsed: OWNED_DEFAULT_PRECEDENCE[1]
    };
  }

  if (historyStage) {
    return {
      ...defaults,
      growthStage: historyStage,
      season: usableSeason,
      phenology: lower(input.phenology) || 'vegetative',
      stageKnown: true,
      precedenceUsed: OWNED_DEFAULT_PRECEDENCE[2]
    };
  }

  return {
    ...defaults,
    growthStage: DESIGN_STAGE_UNSPECIFIED,
    season: usableSeason === DESIGN_SEASON_NEUTRAL ? 'unknown' : usableSeason,
    phenology: 'vegetative',
    stageKnown: false,
    ageKnown: false,
    uncertainty: 'current-stage-unknown',
    precedenceUsed: gardenSeason && gardenSeason !== 'unknown'
      ? OWNED_DEFAULT_PRECEDENCE[3]
      : OWNED_DEFAULT_PRECEDENCE[4]
  };
}

export function resolveProposedDefaultRequest(input = {}) {
  const defaults = proposedPlacementVisualDefaults();
  const view = lower(input.view || input.userSelectedView || defaults.view);
  if (view === DESIGN_TEMPORAL_VIEWS.MATURE.key) {
    return {
      ...defaults,
      growthStage: 'mature',
      phenology: 'vegetative',
      view: DESIGN_TEMPORAL_VIEWS.MATURE.key,
      maturePreviewImpliesCurrentSize: false,
      uncertainty: 'mature-preview-not-current-size'
    };
  }
  return {
    ...defaults,
    growthStage: 'young',
    phenology: 'vegetative',
    view: DESIGN_TEMPORAL_VIEWS.CURRENT.key
  };
}

export function availableUserVariantControls(canonicalSlug, index) {
  const slug = slugify(canonicalSlug);
  const set = getDesignAssetSet(slug, index);
  const usable = (set?.variants || []).filter(isUsableDesignVariant);
  const views = [];
  if (usable.some((v) => v.growthStage === 'young' || v.growthStage === 'intermediate' || v.growthStage === DESIGN_STAGE_UNSPECIFIED)) {
    views.push('current');
  } else if (usable.length) {
    views.push('current');
  }
  if (usable.some((v) => v.growthStage === 'mature')) views.push('mature');
  const states = [];
  for (const phenology of ['vegetative', 'flowering', 'fruiting', 'dormant']) {
    if (usable.some((v) => v.phenology === phenology)) states.push(phenology);
  }
  return {
    canonicalSlug: slug,
    views: [...new Set(views)],
    states,
    emptyOptionsHidden: true,
    generateMissingOptions: false
  };
}

function applyUserOverride(request, input, controls) {
  const view = lower(input.userSelectedView || input.view);
  const state = lower(input.userSelectedState || input.selectedPhenology);
  const next = { ...request };
  if (view === 'mature' && (!controls || controls.views.includes('mature'))) {
    next.growthStage = 'mature';
    next.view = 'mature';
    next.maturePreviewImpliesCurrentSize = false;
  } else if (view === 'current' && (!controls || controls.views.includes('current'))) {
    next.view = 'current';
  }
  if (state && (!controls || controls.states.includes(state))) {
    next.phenology = state;
  }
  return next;
}

export function selectDesignVariant(input = {}, index) {
  const canonicalSlug = slugify(input.canonicalSlug || input.slug);
  const kind = lower(input.kind) === 'owned' ? 'owned' : 'proposed';
  const plant = input.plant || { slug: canonicalSlug, canonicalSlug };
  const plan = requiredDesignVariantRoles(plant);
  const controls = availableUserVariantControls(canonicalSlug, index);

  let request =
    kind === 'owned' ? resolveOwnedDefaultRequest(input) : resolveProposedDefaultRequest(input);
  request = applyUserOverride(request, input, controls);

  const resolved = resolveDesignAsset(
    {
      canonicalSlug,
      growthStage: request.growthStage,
      season: request.season,
      phenology: request.phenology,
      formView: request.formView || null
    },
    index
  );

  const seasonalGate = assertNoFakeSeasonalVariants(plant, {
    season: resolved.season,
    phenology: resolved.phenology,
    required: false
  });

  return {
    canonicalSlug,
    kind,
    role: plan.role,
    requested: {
      growthStage: request.growthStage,
      season: request.season,
      phenology: request.phenology,
      view: request.view,
      uncertainty: request.uncertainty,
      stageKnown: request.stageKnown === true,
      ageKnown: request.ageKnown === true,
      maturePreviewImpliesCurrentSize: request.maturePreviewImpliesCurrentSize === true,
      precedenceUsed: request.precedenceUsed || null
    },
    asset: resolved,
    fallback: resolved.fallback,
    visualReady: resolved.visualReady === true,
    substitutedSpecies: false,
    usedCatalogPhotoAsCutout: false,
    usedWebImage: false,
    generated: false,
    generateOnRender: false,
    seasonalGateOk: seasonalGate.ok,
    controls
  };
}

export function isDesignReady(plant, index) {
  const coverage = requiredRolesVersusCoverage(plant, index);
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const set = getDesignAssetSet(slug, index);
  const usable = (set?.variants || []).filter(isUsableDesignVariant);
  const defaultStateExists = usable.some(
    (v) =>
      v.phenology === 'vegetative' &&
      (v.growthStage === 'young' ||
        v.growthStage === 'mature' ||
        v.growthStage === DESIGN_STAGE_UNSPECIFIED)
  );
  const identityOk = usable.every((v) => slugify(v.canonicalSlug || slug) === slug);
  const transparencyOk = usable.length > 0 && usable.every((v) => v.transparencyReady === true);
  const provenanceOk = usable.every((v) => v.provenance && typeof v.provenance === 'object');
  const ready =
    coverage.missingRequired.length === 0 &&
    usable.length > 0 &&
    defaultStateExists &&
    identityOk &&
    transparencyOk &&
    provenanceOk;
  return {
    canonicalSlug: slug,
    ready,
    missingRequired: coverage.missingRequired,
    optionalDoNotBlock: true,
    purposeBlocksReadinessOnlyIfLaunchRequired: true,
    launchRequiredPurposeVariants: [],
    honestPlaceholderIsNotDesignReady: true,
    reasons: {
      requiredMinimumRoleStatesExist: coverage.missingRequired.length === 0,
      identityConsistencyPasses: identityOk,
      transparencyCompositionPasses: transparencyOk,
      provenanceRightsPass: provenanceOk,
      requiredDefaultStateExists: defaultStateExists
    }
  };
}

export function auditOliveApprovedAsset(index) {
  const plant = {
    slug: 'olive',
    canonicalSlug: 'olive',
    tags: ['tree', 'mediterranean'],
    growth: 'Evergreen Mediterranean tree',
    climateTraits: { fruitingRequirements: 'Edible olives' }
  };
  const plan = requiredDesignVariantRoles(plant);
  const set = getDesignAssetSet('olive', index);
  const approved = (set?.variants || []).filter(
    (v) => v.assetId === 'olive-mature-summer-vegetative-v1' && isUsableDesignVariant(v)
  );
  const variant = approved[0] || null;
  const coverage = requiredRolesVersusCoverage(plant, index);
  const slot = variant
    ? {
        growthStage: variant.growthStage,
        season: variant.season,
        phenology: variant.phenology,
        satisfies: 'evergreen_tree mature vegetative (season-neutral leafy / summer)',
        requiredSlot: 'mature'
      }
    : null;
  return {
    assetId: 'olive-mature-summer-vegetative-v1',
    found: Boolean(variant),
    replaceForbidden: true,
    slot,
    role: plan.visualForm || plan.role,
    visualForm: plan.visualForm || plan.role,
    visualMorphologyRole: plan.visualForm || plan.role,
    missingRequired: coverage.missingRequired,
    designReady: isDesignReady(plant, index).ready
  };
}

export function describePlantDesignPolicy(plant, index) {
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const plan = requiredDesignVariantRoles(plant);
  const season = seasonPolicyForRole(plan.visualForm || plan.role, plant);
  const phenology = phenologyPolicyForRole(plan.visualForm || plan.role, plant);
  const ownedDefault = resolveOwnedDefaultRequest({ kind: 'owned' });
  const proposedDefault = resolveProposedDefaultRequest({ kind: 'proposed' });
  const maturePreview = resolveProposedDefaultRequest({ kind: 'proposed', view: 'mature' });
  const coverage = index ? requiredRolesVersusCoverage(plant, index) : { missingRequired: [] };
  const gaps = [];
  if (DESIGN_VARIANT_METADATA_AUDIT.knownAge.status === 'missing') gaps.push('owned-age-missing');
  if (DESIGN_VARIANT_METADATA_AUDIT.growthStageMetadata.status === 'missing') gaps.push('owned-growth-stage-missing');
  if (DESIGN_VARIANT_METADATA_AUDIT.currentLocalSeason.status === 'missing') gaps.push('garden-season-missing');
  if (plan.visualForm === 'unknown' || plan.role === DESIGN_PLANT_ROLES.UNKNOWN) gaps.push('visual-form-unknown');
  if (plan.confidence === 'unknown' || plan.confidence === 'low') gaps.push('form-confidence-' + (plan.confidence || 'unknown'));
  if (coverage.missingRequired?.length) gaps.push('required-design-assets-missing');
  const optionalPurposeDriven = plan.roles.filter((r) => r.required === false);
  return {
    canonicalSlug: slug,
    visualForm: plan.visualForm || plan.role,
    visualMorphologyRole: plan.visualForm || plan.role,
    formAuthority: plan.formAuthority || plan.morphologyAuthority || null,
    formEvidence: plan.formEvidence || plan.morphologyEvidence || '',
    morphologyAuthority: plan.formAuthority || plan.morphologyAuthority || null,
    morphologyEvidence: plan.formEvidence || plan.morphologyEvidence || '',
    habitModifiers: plan.habitModifiers || [],
    lifecycle: plan.lifecycle || 'unknown',
    confidence: plan.confidence || 'unknown',
    purposeCapabilities: plan.purposeCapabilities || [],
    resolvedRole: plan.role,
    legacyForm: plan.form,
    minimumRequiredDesignVariants: plan.roles.filter((r) => r.required !== false),
    optionalVariants: optionalPurposeDriven,
    optionalPurposeDrivenVariants: optionalPurposeDriven,
    defaultVisualState: {
      owned: {
        growthStage: ownedDefault.growthStage,
        phenology: ownedDefault.phenology,
        season: ownedDefault.season,
        uncertainty: ownedDefault.uncertainty
      },
      proposed: {
        growthStage: proposedDefault.growthStage,
        phenology: proposedDefault.phenology,
        view: proposedDefault.view
      }
    },
    maturePreviewState: {
      growthStage: maturePreview.growthStage,
      phenology: maturePreview.phenology,
      impliesCurrentSize: false
    },
    seasonalRequirement: season,
    phenologyRequirement: phenology,
    dataGaps: gaps,
    cartesianForbidden: true
  };
}

export function catalogCardMustNotBecomeDesignCutout() {
  return {
    catalogPhotoAsDesignCutout: false,
    designUsesTransparentRegistryAsset: true,
    sharedKey: 'canonicalSlug',
    replaceCardImages: false
  };
}

const api = {
  DESIGN_VARIANT_SELECTION_POLICY_VERSION,
  VISUAL_AUTHORITY_SEPARATION,
  DESIGN_VARIANT_METADATA_AUDIT,
  DESIGN_TEMPORAL_VIEWS,
  OWNED_DEFAULT_PRECEDENCE,
  DESIGN_READY_DEFINITION,
  SELECTION_FORBIDDEN,
  ownedPlacementVisualDefaults,
  proposedPlacementVisualDefaults,
  resolveOwnedDefaultRequest,
  resolveProposedDefaultRequest,
  availableUserVariantControls,
  selectDesignVariant,
  isDesignReady,
  auditOliveApprovedAsset,
  describePlantDesignPolicy,
  catalogCardMustNotBecomeDesignCutout,
  classifyDesignVisualMorphology,
  classifyDesignVisualForm,
  classifyDesignPurposeCapabilities,
  classifyDesignHabitModifiers
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignVariantSelectionPolicy = api;
}
