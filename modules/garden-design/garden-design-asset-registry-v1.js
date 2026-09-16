/**
 * Garden Design Asset Registry V1 — multi-state presentation assets.
 *
 * Catalog Images remain informational identity images.
 * Design assets are transparent composition cutouts with optional variants.
 * Both resolve from the SAME canonical slug. This is not a second catalog.
 *
 * Lookup never generates. Missing states stay UNKNOWN / placeholder.
 */

import {
  isBroadPlantIdentity,
  requiredDesignVariantRoles
} from './garden-design-variant-policy-v1.js';

export const GARDEN_DESIGN_ASSET_REGISTRY_VERSION = '1.0.0';

export const DESIGN_ASSET_APPROVAL = Object.freeze({
  APPROVED: 'approved',
  MISSING: 'missing',
  UNVERIFIED: 'unverified',
  REJECTED: 'rejected'
});

export const DESIGN_ASSET_FALLBACK = Object.freeze({
  CLOSEST_APPROVED: 'closest-approved',
  NEUTRAL_CANONICAL: 'neutral-canonical',
  HONEST_PLACEHOLDER: 'honest-placeholder'
});

const MANIFEST_KEY_TO_CANONICAL = Object.freeze({
  'olive-tree': 'olive',
  'italian-cypress': 'cypress'
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

export function resolveManifestKeyToCanonical(manifestKey, map = MANIFEST_KEY_TO_CANONICAL) {
  const key = slugify(manifestKey);
  if (!key) return '';
  return slugify(map[key] || key);
}

export function isUsableDesignVariant(variant) {
  if (!variant || typeof variant !== 'object') return false;
  if (variant.comingSoon === true) return false;
  const status = lower(variant.status || variant.approvalStatus);
  if (status === 'missing' || status === 'rejected') return false;
  if (variant.approvalStatus === DESIGN_ASSET_APPROVAL.APPROVED && variant.transparencyReady === true) {
    return true;
  }
  return status === 'ready' && (variant.file || variant.url || variant.cdnUrl);
}

export function assertVariantIdentityConsistency(plant, variant = {}) {
  const plantSlug = slugify(plant?.canonicalSlug || plant?.slug);
  const assetSlug = slugify(variant.canonicalSlug || variant.plantSlug);
  if (plantSlug && assetSlug && plantSlug !== assetSlug) {
    return { ok: false, reason: 'cross-species-substitution-forbidden' };
  }
  if (isBroadPlantIdentity(plant) && variant.cultivarSpecific === true) {
    return { ok: false, reason: 'broad-identity-must-not-become-cultivar' };
  }
  if (!isBroadPlantIdentity(plant) && variant.cultivarSpecific === true && variant.authorizedCultivar !== true) {
    return { ok: false, reason: 'species-record-must-not-introduce-unauthorized-cultivar' };
  }
  return { ok: true };
}

export function assertDesignAssetSetIdentity(set) {
  const slug = slugify(set?.canonicalSlug);
  if (!slug) return { ok: false, reason: 'canonical-slug-required' };
  for (const variant of set.variants || []) {
    const vSlug = slugify(variant.canonicalSlug || set.canonicalSlug);
    if (vSlug !== slug) return { ok: false, reason: 'variant-identity-mismatch' };
    const gate = assertVariantIdentityConsistency(
      { slug, canonicalSlug: slug, identityScope: set.identityScope, scientific: set.scientific },
      { ...variant, canonicalSlug: vSlug }
    );
    if (!gate.ok) return gate;
  }
  return { ok: true, canonicalSlug: slug };
}

function variantScore(requested, candidate) {
  if (!isUsableDesignVariant(candidate)) return 1000;
  let score = 0;
  if (requested.growthStage && candidate.growthStage !== requested.growthStage) score += 4;
  if (requested.phenology && candidate.phenology !== requested.phenology) score += 3;
  if (requested.season && requested.season !== 'unknown' && candidate.season !== requested.season) score += 2;
  if (requested.formView && candidate.formView !== requested.formView) score += 1;
  return score;
}

function neutralPreferred(variant) {
  return (
    variant.growthStage === 'mature' &&
    (variant.phenology === 'vegetative' || !variant.phenology) &&
    (variant.season === 'summer' || variant.season === 'unknown' || !variant.season)
  );
}

export function indexDesignAssetRegistry(registry = {}) {
  const sets = Array.isArray(registry.sets) ? registry.sets : [];
  const bySlug = new Map();
  const manifestMap = Object.assign({}, MANIFEST_KEY_TO_CANONICAL, registry.manifestKeyToCanonical || {});
  for (const set of sets) {
    const slug = slugify(set.canonicalSlug);
    if (!slug) continue;
    bySlug.set(slug, set);
    if (set.manifestKey) {
      manifestMap[slugify(set.manifestKey)] = slug;
    }
  }
  return { bySlug, manifestMap, registry };
}

export function getDesignAssetSet(canonicalSlug, index) {
  const slug = slugify(canonicalSlug);
  if (!slug || !index?.bySlug) return null;
  return index.bySlug.get(slug) || null;
}

/**
 * canonicalSlug → designAssetSet → available variants → chosen variant → transparent asset.
 * Never another species, never a random web image, never generate-on-render.
 */
export function resolveDesignAsset(input = {}, index) {
  const canonicalSlug = slugify(input.canonicalSlug || input.slug);
  const requested = {
    growthStage: input.growthStage || 'mature',
    season: input.season || 'unknown',
    phenology: input.phenology || 'vegetative',
    formView: input.formView || null
  };
  const empty = {
    canonicalSlug,
    generated: false,
    generationAllowed: false,
    generateOnRender: false,
    substitutedSpecies: false,
    usedWebImage: false,
    fallback: DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER,
    variant: null,
    url: null,
    visualReady: false
  };
  if (!canonicalSlug) return empty;
  const set = getDesignAssetSet(canonicalSlug, index);
  if (!set) return empty;

  const plant = {
    slug: canonicalSlug,
    canonicalSlug,
    identityScope: set.identityScope,
    scientific: set.scientific
  };
  const eligible = (set.variants || []).filter((v) => {
    const gate = assertVariantIdentityConsistency(plant, { ...v, canonicalSlug });
    return gate.ok && isUsableDesignVariant(v);
  });

  if (!eligible.length) return empty;

  let chosen = eligible.slice().sort((a, b) => variantScore(requested, a) - variantScore(requested, b))[0];
  let fallback = DESIGN_ASSET_FALLBACK.CLOSEST_APPROVED;
  if (variantScore(requested, chosen) > 0) {
    const neutral = eligible.find(neutralPreferred);
    if (neutral && variantScore(requested, chosen) >= 4) {
      chosen = neutral;
      fallback = DESIGN_ASSET_FALLBACK.NEUTRAL_CANONICAL;
    }
  } else {
    fallback = DESIGN_ASSET_FALLBACK.CLOSEST_APPROVED;
  }

  const file = chosen.file || chosen.defaultFile;
  return {
    canonicalSlug,
    designAssetSetId: set.designAssetSetId,
    assetId: chosen.assetId,
    growthStage: chosen.growthStage,
    season: chosen.season,
    phenology: chosen.phenology,
    formView: chosen.formView || null,
    provenance: chosen.provenance || {},
    approvalStatus: chosen.approvalStatus,
    transparencyReady: chosen.transparencyReady === true,
    identityConfidence: chosen.identityConfidence || set.identityScope || null,
    generated: false,
    generationAllowed: false,
    generateOnRender: false,
    substitutedSpecies: false,
    usedWebImage: false,
    fallback,
    variant: chosen,
    file,
    url: chosen.url || chosen.cdnUrl || (file ? `assets/plants/${file}` : null),
    visualReady: true
  };
}

export function auditDesignAssetCoverage(catalog = [], index) {
  const slugs = [
    ...new Set(
      (catalog || [])
        .map((p) => slugify(p.canonicalSlug || p.slug))
        .filter(Boolean)
    )
  ];
  let designEnabled = 0;
  let onlyOneAsset = 0;
  let multipleGrowthStages = 0;
  let seasonalStates = 0;
  let floweringVariants = 0;
  let fruitingVariants = 0;
  let noUsable = 0;
  const enabledSlugs = [];

  for (const slug of slugs) {
    const set = getDesignAssetSet(slug, index);
    const usable = (set?.variants || []).filter(isUsableDesignVariant);
    if (!usable.length) {
      noUsable += 1;
      continue;
    }
    designEnabled += 1;
    enabledSlugs.push(slug);
    if (usable.length === 1) onlyOneAsset += 1;
    const stages = new Set(usable.map((v) => v.growthStage).filter(Boolean));
    if (stages.size > 1) multipleGrowthStages += 1;
    const seasons = new Set(
      usable.map((v) => v.season).filter((s) => s && s !== 'unknown')
    );
    if (seasons.size > 1) seasonalStates += 1;
    if (usable.some((v) => v.phenology === 'flowering')) floweringVariants += 1;
    if (usable.some((v) => v.phenology === 'fruiting')) fruitingVariants += 1;
  }

  return {
    catalogCount: slugs.length,
    designEnabled,
    onlyOneAsset,
    multipleGrowthStages,
    seasonalStates,
    floweringVariants,
    fruitingVariants,
    noUsable,
    enabledSlugs,
    generateOnLookup: false,
    massGenerationStarted: false
  };
}

export function requiredRolesVersusCoverage(plant, index) {
  const plan = requiredDesignVariantRoles(plant);
  const slug = slugify(plant.canonicalSlug || plant.slug);
  const set = getDesignAssetSet(slug, index);
  const usable = (set?.variants || []).filter(isUsableDesignVariant);
  const missing = plan.roles.filter((role) => {
    if (role.required === false) return false;
    return !usable.some(
      (v) =>
        v.growthStage === role.growthStage &&
        (role.season === 'unknown' || v.season === role.season || v.season === 'unknown') &&
        v.phenology === role.phenology
    );
  });
  return { plan, usableCount: usable.length, missingRequired: missing };
}

export function lookupMustNotGenerate(canonicalSlug, index) {
  const resolved = resolveDesignAsset({ canonicalSlug }, index);
  return {
    generated: false,
    generationAllowed: false,
    generateOnRender: false,
    visualReady: resolved.visualReady,
    canonicalSlug: resolved.canonicalSlug
  };
}

const api = {
  GARDEN_DESIGN_ASSET_REGISTRY_VERSION,
  DESIGN_ASSET_APPROVAL,
  DESIGN_ASSET_FALLBACK,
  resolveManifestKeyToCanonical,
  isUsableDesignVariant,
  assertVariantIdentityConsistency,
  assertDesignAssetSetIdentity,
  indexDesignAssetRegistry,
  getDesignAssetSet,
  resolveDesignAsset,
  auditDesignAssetCoverage,
  requiredRolesVersusCoverage,
  lookupMustNotGenerate
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignAssetRegistry = api;
}
