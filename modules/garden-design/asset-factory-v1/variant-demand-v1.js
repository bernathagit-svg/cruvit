/**
 * Derive required / optional Design Asset variants from catalog morphology.
 * No plant-name switches. No generation.
 */
import {
  DESIGN_MORPHOLOGY_AUTHORITY,
  requiredDesignVariantRoles
} from '../garden-design-variant-policy-v1.js';

export function slugify(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function variantKeyFromRole(role = {}) {
  const stage = String(role.growthStage || 'unspecified').trim().toLowerCase() || 'unspecified';
  const season = String(role.season || 'season-neutral').trim().toLowerCase() || 'season-neutral';
  const phenology = String(role.phenology || 'vegetative').trim().toLowerCase() || 'vegetative';
  const formView = String(role.formView || 'default').trim().toLowerCase() || 'default';
  return `${stage}__${season}__${phenology}__${formView}`;
}

export const DEFAULT_ASSET_VERSION = 'v1';

export function jobIdentity(canonicalSlug, role, assetVersion = DEFAULT_ASSET_VERSION) {
  const slug = slugify(canonicalSlug);
  const variantKey = variantKeyFromRole(role);
  const version = String(assetVersion || DEFAULT_ASSET_VERSION).trim() || DEFAULT_ASSET_VERSION;
  return {
    canonicalSlug: slug,
    variantKey,
    assetVersion: version,
    jobId: `${slug}__${variantKey}__${version}`
  };
}

export function deriveVariantDemand(plant = {}, options = {}) {
  const canonicalSlug = slugify(plant.canonicalSlug || plant.slug);
  const plan = requiredDesignVariantRoles(plant);
  const roles = Array.isArray(plan.roles) ? plan.roles : [];
  const requiredVariants = [];
  const optionalVariants = [];
  for (const role of roles) {
    const identity = jobIdentity(canonicalSlug, role, options.assetVersion);
    const record = {
      ...identity,
      visualForm: plan.visualForm,
      growthStage: role.growthStage,
      phenology: role.phenology,
      season: role.season,
      formView: role.formView || null,
      required: role.required !== false,
      reason: role.reason || '',
      morphologyAuthority: plan.morphologyAuthority,
      habitModifiers: plan.habitModifiers || [],
      lifecycle: plan.lifecycle,
      purposeCapabilities: plan.purposeCapabilities || []
    };
    if (record.required) requiredVariants.push(record);
    else optionalVariants.push(record);
  }
  const morphologyUnknown =
    plan.visualForm === 'unknown' ||
    plan.morphologyAuthority === DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN;
  return {
    canonicalSlug,
    visualForm: plan.visualForm,
    habitModifiers: plan.habitModifiers || [],
    lifecycle: plan.lifecycle,
    purposeCapabilities: plan.purposeCapabilities || [],
    morphologyAuthority: plan.morphologyAuthority,
    morphologyUnknown,
    scientific: plant.scientific || plant.scientificName || plant.latin || null,
    requiredVariants,
    optionalVariants
  };
}
