/**
 * Smart Recommendations → Garden Intelligence V1
 *
 * Recommendation cards consume Catalog Images V1 + existing Smart Rec suitability.
 * No parallel image database. No render-time image search. No user-media promotion.
 */
import {
  IMAGE_BLOCKED,
  IMAGE_READY,
  mayPromoteUserMediaToCatalogImage,
  resolvePlantDisplayMedia,
  withCanonicalCatalogMedia
} from '../catalog-media/licensed-catalog-media-runtime-v1.js';

import {
  applyPurposePolicyToSuitability,
  purposeRankBand
} from './smart-rec-purpose-policy-v1.js';
export { PURPOSE_FIT_STATUS, PURPOSE_ROLES, SMART_REC_PURPOSE_POLICY_VERSION } from './smart-rec-purpose-policy-v1.js';
export {
  applyPurposePolicyToSuitability,
  catalogPurposeCapabilities,
  evaluatePurposeFit,
  formatPurposeRecommendationLabel,
  resolveSmartRecPurpose
} from './smart-rec-purpose-policy-v1.js';

export const SMART_REC_GARDEN_INTELLIGENCE_VERSION = '1.2.0-purpose-aware';

/** Same collapse table as Catalog Images V1 — not a second identity registry. */
export const SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL = Object.freeze({
  'english-lavender': 'lavender',
  spearmint: 'mint',
  'common-jasmine': 'jasmine',
  'bigleaf-hydrangea': 'hydrangea',
  'lesser-bougainvillea': 'bougainvillea',
  'bell-pepper': 'sweet-pepper'
});

export const SMART_REC_BOOTSTRAP_ALIAS_TO_CANONICAL = Object.freeze({
  'apple-tree': 'apple',
  'pear-tree': 'pear',
  'peach-tree': 'peach',
  'plum-tree': 'plum',
  'fig-tree': 'fig',
  'grape-vine': 'grapevine',
  'passion-fruit': 'passionfruit'
});

const OUTCOME_KEYS = Object.freeze(['survival', 'growth', 'flowering', 'fruiting']);

function asText(value) {
  return String(value || '').trim();
}

function slugKey(value) {
  return asText(value).toLowerCase();
}

export function resolveSmartRecCanonicalSlug(slug, extraMaps = {}) {
  const key = slugKey(slug);
  if (!key) return '';
  const maps = Object.assign(
    {},
    SMART_REC_BOOTSTRAP_ALIAS_TO_CANONICAL,
    SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL,
    extraMaps && typeof extraMaps === 'object' ? extraMaps : {}
  );
  const hop = maps[key] || key;
  return maps[hop] || hop;
}

export function buildSmartRecCatalogBySlug(plantIndex) {
  const out = {};
  const index = plantIndex && typeof plantIndex === 'object' ? plantIndex : {};
  for (const [rawSlug, plant] of Object.entries(index)) {
    if (!plant || typeof plant !== 'object') continue;
    const slug = resolveSmartRecCanonicalSlug(plant.slug || rawSlug);
    if (!slug || out[slug]) continue;
    out[slug] = plant;
  }
  return out;
}

export function attachSmartRecCatalogImage(plant, catalogBySlug, extraMaps = {}) {
  if (!plant || typeof plant !== 'object') return plant;
  const canonicalSlug = resolveSmartRecCanonicalSlug(plant.profileSlug || plant.slug, extraMaps);
  const base = Object.assign({}, plant, {
    slug: canonicalSlug || plant.slug,
    profileSlug: canonicalSlug || plant.profileSlug || plant.slug
  });
  return withCanonicalCatalogMedia(base, catalogBySlug || {});
}

export function resolveSmartRecCatalogDisplay(plant, catalogBySlug, extraMaps = {}) {
  const attached = attachSmartRecCatalogImage(plant, catalogBySlug, extraMaps);
  return resolvePlantDisplayMedia(attached);
}

export function formatSmartRecOutcomeBand(fit) {
  if (fit == null || !Number.isFinite(Number(fit))) return 'UNKNOWN';
  const n = Number(fit);
  if (n >= 70) return 'strong';
  if (n >= 40) return 'limited';
  return 'weak';
}

function requirementsUnknown(meta, plant, field) {
  const fromMeta = asText(meta?.[field]);
  const fromTraits = asText(plant?.climateTraits?.[field]);
  return !fromMeta && !fromTraits;
}

export function smartRecDimensionDisplay(suitability = {}, meta = null, plant = null) {
  const floweringUnknown = requirementsUnknown(meta, plant, 'floweringRequirements');
  const fruitingUnknown = requirementsUnknown(meta, plant, 'fruitingRequirements');
  return {
    survival: formatSmartRecOutcomeBand(suitability.survivalFit),
    growth: formatSmartRecOutcomeBand(suitability.thriveFit),
    flowering: floweringUnknown ? 'UNKNOWN' : formatSmartRecOutcomeBand(suitability.floweringFit),
    fruiting: fruitingUnknown ? 'UNKNOWN' : formatSmartRecOutcomeBand(suitability.fruitingFit)
  };
}

const POSITIVE_LEVELS = Object.freeze({ excellent: true, good: true });

/**
 * Hard-blocked Survival / validated blocked overall cannot be a positive recommendation.
 * Stale suitabilityScore / recommendationLevel cannot override that.
 */
export function isPositiveRecommendationIneligible({
  hardSurvivalBlocked,
  positiveRecommendationEligible,
  recommendationLevel,
  derivedOverall,
  derivedSurvival
} = {}) {
  if (positiveRecommendationEligible === false) return true;
  if (hardSurvivalBlocked === true) return true;
  const level = asText(recommendationLevel).toLowerCase();
  if (level === 'blocked') return true;
  const overall = asText(derivedOverall).toLowerCase();
  if (overall === 'blocked') return true;
  const survival = asText(derivedSurvival).toLowerCase();
  if (survival === 'unreliable' || survival === 'poor') return true;
  return false;
}

export function isPositiveRecommendationRank(recommendationLevel) {
  return !!POSITIVE_LEVELS[asText(recommendationLevel).toLowerCase()];
}

export function validatedSmartRecCardOutcomes(derived, suitability, meta, plant) {
  if (derived && (derived.survivalLabel || derived.survival)) {
    return {
      survival: derived.survivalLabel || derived.survival || 'UNKNOWN',
      growth: derived.growthLabel || derived.growth || 'UNKNOWN',
      flowering: derived.floweringLabel || derived.flowering || 'UNKNOWN',
      fruiting: derived.fruitingLabel || derived.fruiting || 'UNKNOWN'
    };
  }
  return smartRecDimensionDisplay(suitability, meta, plant);
}

export function alignSmartRecSuitabilityWithValidatedOutcomes(suitability = {}, derived = null, options = {}) {
  const next = Object.assign({}, suitability && typeof suitability === 'object' ? suitability : {});
  const ineligible = isPositiveRecommendationIneligible({
    hardSurvivalBlocked: next.hardSurvivalBlocked,
    positiveRecommendationEligible: next.positiveRecommendationEligible,
    recommendationLevel: next.recommendationLevel,
    derivedOverall: derived?.overall,
    derivedSurvival: derived?.survival
  });
  if (ineligible) {
    next.recommendationLevel = 'blocked';
    next.suitabilityScore = 0;
    next.hardSurvivalBlocked = true;
  }
  const derivedLimiter = Array.isArray(derived?.limitingFactors)
    ? derived.limitingFactors.map((m) => asText(m)).find(Boolean)
    : '';
  if (derivedLimiter) next.explanationText = derivedLimiter;
  next.derivedOutcomes = derived || next.derivedOutcomes || null;
  return applyPurposePolicyToSuitability(next, derived, options);
}

const LEVEL_RANK = Object.freeze({ excellent: 4, good: 3, borderline: 2, blocked: 1 });

export function compareSmartRecRecommendationRank(a = {}, b = {}) {
  const aInel = isPositiveRecommendationIneligible(a);
  const bInel = isPositiveRecommendationIneligible(b);
  if (aInel !== bInel) return aInel ? 1 : -1;
  const purposeDelta = (purposeRankBand(b.purposeFit) || 0) - (purposeRankBand(a.purposeFit) || 0);
  if (purposeDelta) return purposeDelta;
  const level =
    (LEVEL_RANK[asText(b.recommendationLevel).toLowerCase()] || 0) -
    (LEVEL_RANK[asText(a.recommendationLevel).toLowerCase()] || 0);
  if (level) return level;
  return (Number(b.suitabilityScore) || 0) - (Number(a.suitabilityScore) || 0);
}

export function smartRecEmptyStateKind({ hasTrustedLocation, eligibleCount } = {}) {
  if (hasTrustedLocation !== true) return 'need-location';
  if (!Number(eligibleCount)) return 'none-eligible';
  return null;
}

export function buildSmartRecVisibleResultsModel({
  hasTrustedLocation,
  eligiblePlants = [],
  rankedLimit = 12
} = {}) {
  const ranked = Array.isArray(eligiblePlants) ? eligiblePlants.slice(0, rankedLimit) : [];
  const emptyKind = smartRecEmptyStateKind({
    hasTrustedLocation,
    eligibleCount: ranked.length
  });
  return {
    shouldRenderCards: !emptyKind && ranked.length > 0,
    emptyKind,
    ranked,
    renderedCardCount: emptyKind ? 0 : ranked.length
  };
}

export function ownedCanonicalSlugSet(plants, extraMaps = {}) {
  const set = new Set();
  for (const p of plants || []) {
    const slug = resolveSmartRecCanonicalSlug(p?.profileSlug || p?.slug, extraMaps);
    if (slug) set.add(slug);
  }
  return set;
}

/**
 * Map a trusted Garden Area sun/planting token onto existing Smart Rec answer vocabulary.
 * Does not override explicit user answers. Cannot clear climate hard blocks.
 */
export function smartRecContextFromGardenArea(areaContext, answers = {}) {
  const ctx = areaContext && typeof areaContext === 'object' ? areaContext : {};
  const next = Object.assign({}, answers);
  const sun = asText(ctx.sunExposure || ctx.sun_exposure);
  if (!next.q2) {
    if (sun === 'full_sun') next.q2 = 'full-sun';
    else if (sun === 'part_shade' || sun === 'morning_sun_part_shade' || sun === 'full_sun_to_part_shade') {
      next.q2 = 'partial-sun';
    } else if (sun === 'full_shade' || sun === 'shade' || sun === 'bright_shade') {
      next.q2 = 'shade';
    }
  }
  const planting = asText(ctx.plantingMode || ctx.planting_mode);
  if (!next.q1 && (planting === 'container' || planting === 'pot' || planting === 'balcony')) {
    next.q1 = 'balcony';
  }
  if (!next.q8 && (planting === 'container' || planting === 'pot')) next.q8 = 'compact';
  return next;
}

export function buildSmartRecCardModel(plant, options = {}) {
  const extraMaps = options.aliasMaps || {};
  const catalogBySlug = options.catalogBySlug || {};
  const attached = attachSmartRecCatalogImage(plant, catalogBySlug, extraMaps);
  const display = resolvePlantDisplayMedia(attached);
  const suitability = plant?.smartRecSuitability || options.suitability || {};
  const derived =
    options.derivedOutcomes ||
    plant?.smartRecDerivedOutcomes ||
    suitability.derivedOutcomes ||
    null;
  const meta = options.meta || null;
  const outcomes = validatedSmartRecCardOutcomes(derived, suitability, meta, attached);
  const canonicalSlug = resolveSmartRecCanonicalSlug(attached.slug || plant?.slug, extraMaps);
  const owned = options.ownedCanonicalSlugs instanceof Set && options.ownedCanonicalSlugs.has(canonicalSlug);
  const limiter = asText(
    suitability.explanationText ||
      (Array.isArray(derived?.limitingFactors) ? derived.limitingFactors[0] : '') ||
      (Array.isArray(suitability.warnings) ? suitability.warnings[0] : '')
  );
  const derivedUnknowns = Array.isArray(derived?.unknownEvidence) ? derived.unknownEvidence : [];
  const noteUnknowns = Array.isArray(options.confidenceNotes) ? options.confidenceNotes : [];
  const unknowns = [...noteUnknowns, ...derivedUnknowns].map(asText).filter(Boolean);
  const catalogImage = display.kind === 'catalog' && display.url ? display.url : '';
  return {
    canonicalSlug,
    name: asText(attached.name || plant?.name),
    scientific: asText(attached.scientific || plant?.scientific),
    imageUrl: catalogImage,
    imageStatus:
      display.imageStatus ||
      (display.kind === 'catalog' ? IMAGE_READY : display.placeholder ? 'IMAGE_PENDING' : IMAGE_READY),
    placeholder: display.placeholder === true || !catalogImage,
    attribution: display.kind === 'catalog' ? display.attribution || null : null,
    outcomes,
    recommendationLevel: suitability.recommendationLevel || '',
    recommendationLabel: suitability.recommendationLabel || suitability.recommendationLevel || '',
    purposeRole: suitability.purpose?.role || '',
    purposeFit: suitability.purposeFit?.status || '',
    limiter,
    unknowns,
    alreadyOwned: !!owned,
    userUploadRequired: false,
    renderTimeImageSearch: false,
    promoteUserMedia: mayPromoteUserMediaToCatalogImage()
  };
}

export { IMAGE_READY, IMAGE_BLOCKED, OUTCOME_KEYS };

const api = {
  SMART_REC_GARDEN_INTELLIGENCE_VERSION,
  SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL,
  SMART_REC_BOOTSTRAP_ALIAS_TO_CANONICAL,
  resolveSmartRecCanonicalSlug,
  buildSmartRecCatalogBySlug,
  attachSmartRecCatalogImage,
  resolveSmartRecCatalogDisplay,
  formatSmartRecOutcomeBand,
  smartRecDimensionDisplay,
  isPositiveRecommendationIneligible,
  isPositiveRecommendationRank,
  validatedSmartRecCardOutcomes,
  alignSmartRecSuitabilityWithValidatedOutcomes,
  applyPurposePolicyToSuitability,
  compareSmartRecRecommendationRank,
  smartRecEmptyStateKind,
  buildSmartRecVisibleResultsModel,
  ownedCanonicalSlugSet,
  smartRecContextFromGardenArea,
  buildSmartRecCardModel,
  IMAGE_READY,
  IMAGE_BLOCKED
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitSmartRecGardenIntelligence = api;
}
