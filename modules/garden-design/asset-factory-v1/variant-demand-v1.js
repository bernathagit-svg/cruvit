/**
 * Derive required / optional Design Asset variants from catalog morphology.
 * No plant-name switches. No generation.
 */
import {
  DESIGN_MORPHOLOGY_AUTHORITY,
  DESIGN_SEASON_NEUTRAL
} from '../garden-design-variant-policy-v1.js';
import { deriveVisualStateDemand, visualStateKey } from './design-asset-visual-states-v1.js';

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
  if (role.variantKey) return role.variantKey;
  if (role.architectureMode || role.phenologyState) return visualStateKey(role);
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
  const demand = deriveVisualStateDemand(plant, options);
  const requiredVariants = demand.requiredVariants.map((role) => ({
    ...jobIdentity(demand.canonicalSlug, role, options.assetVersion),
    visualForm: demand.visualForm,
    growthStage: role.growthStage,
    phenology: role.phenology || role.phenologyState,
    phenologyState: role.phenologyState || role.phenology,
    architectureMode: role.architectureMode || null,
    season: role.season || DESIGN_SEASON_NEUTRAL,
    formView: role.formView || null,
    required: true,
    reason: role.reason || '',
    reasonCodes: role.reasonCodes || [],
    requirementState: role.requirementState || 'REQUIRED',
    morphologyAuthority: demand.morphologyAuthority,
    habitModifiers: demand.habitModifiers || [],
    lifecycle: demand.lifecycle,
    purposeCapabilities: demand.purposeCapabilities || []
  }));
  const optionalVariants = (demand.optionalVariants || []).map((role) => ({
    ...jobIdentity(demand.canonicalSlug, role, options.assetVersion),
    visualForm: demand.visualForm,
    growthStage: role.growthStage,
    phenology: role.phenology || role.phenologyState,
    phenologyState: role.phenologyState || role.phenology,
    architectureMode: role.architectureMode || null,
    season: role.season || DESIGN_SEASON_NEUTRAL,
    formView: role.formView || null,
    required: false,
    reason: role.reason || '',
    reasonCodes: role.reasonCodes || [],
    requirementState: role.requirementState || 'OPTIONAL',
    morphologyAuthority: demand.morphologyAuthority,
    habitModifiers: demand.habitModifiers || [],
    lifecycle: demand.lifecycle,
    purposeCapabilities: demand.purposeCapabilities || []
  }));
  return {
    canonicalSlug: demand.canonicalSlug,
    visualForm: demand.visualForm,
    habitModifiers: demand.habitModifiers || [],
    lifecycle: demand.lifecycle,
    purposeCapabilities: demand.purposeCapabilities || [],
    morphologyAuthority: demand.morphologyAuthority,
    morphologyUnknown:
      demand.morphologyUnknown
      || demand.visualForm === 'unknown'
      || demand.morphologyAuthority === DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN,
    scientific: demand.scientific,
    requiredVariants,
    optionalVariants,
    unknownStates: demand.unknownStates || [],
    visualState: demand.visualState,
    generationDemandUsesRequiredOnly: true
  };
}
