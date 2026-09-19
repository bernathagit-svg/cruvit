/**
 * Deterministic Design Asset gap detector.
 * Catalog plant → required variants → registry → missing required jobs.
 * Does not generate assets. Optional variants do not enter production by default.
 */
import { isUsableDesignVariant } from '../garden-design-asset-registry-v1.js';
import { deriveVariantDemand, slugify, variantKeyFromRole } from './variant-demand-v1.js';
import { FACTORY_PRIORITY_BANDS } from './design-asset-factory-v1.js';
import { classifySpendBlock } from './spend-block-v1.js';

export function variantMatchesRole(variant, role) {
  if (!variant) return false;
  if (String(variant.growthStage || '') !== String(role.growthStage || '')) return false;
  const rolePhenology = String(role.phenologyState || role.phenology || 'vegetative');
  if (String(variant.phenology || 'vegetative') !== rolePhenology) return false;
  if (role.architectureMode && variant.architectureMode && String(variant.architectureMode) !== String(role.architectureMode)) {
    return false;
  }
  if (
    role.architectureMode
    && !variant.architectureMode
    && role.architectureMode !== 'tree'
    && role.architectureMode !== 'default'
  ) {
    return false;
  }
  if (role.formView && variant.formView && String(variant.formView) !== String(role.formView)) {
    return false;
  }
  return true;
}

export function approvedCovers(set, role) {
  const variants = Array.isArray(set?.variants) ? set.variants : [];
  return variants.some((v) => isUsableDesignVariant(v) && variantMatchesRole(v, role));
}

export function priorityForPlant(canonicalSlug, signals = {}) {
  const slug = slugify(canonicalSlug);
  const owned = new Set((signals.ownedCanonicalSlugs || []).map(slugify));
  const recommended = new Set((signals.highFrequencyRecommendedSlugs || []).map(slugify));
  const designSurfaced = new Set((signals.gardenDesignSurfacedSlugs || []).map(slugify));
  const launch = new Set((signals.portfolioLaunchSlugs || []).map(slugify));
  if (owned.has(slug)) return { priority: FACTORY_PRIORITY_BANDS.OWNED_PLANTS, band: 'owned-plants' };
  if (recommended.has(slug)) {
    return { priority: FACTORY_PRIORITY_BANDS.HIGH_FREQUENCY_RECOMMENDED, band: 'high-frequency-recommended' };
  }
  if (designSurfaced.has(slug)) {
    return { priority: FACTORY_PRIORITY_BANDS.GARDEN_DESIGN_SURFACED, band: 'garden-design-surfaced' };
  }
  if (launch.has(slug)) {
    return { priority: FACTORY_PRIORITY_BANDS.PORTFOLIO_LAUNCH_GAPS, band: 'portfolio-launch-gaps' };
  }
  return { priority: FACTORY_PRIORITY_BANDS.REMAINING_CATALOG, band: 'remaining-catalog' };
}

export function detectDesignAssetGaps(plants = [], registry = {}, signals = {}) {
  const sets = Array.isArray(registry.sets) ? registry.sets : [];
  const bySlug = new Map();
  for (const set of sets) {
    const slug = slugify(set.canonicalSlug);
    if (slug) bySlug.set(slug, set);
  }
  const jobs = [];
  const blocked = [];
  for (const plant of plants) {
    const demand = deriveVariantDemand(plant);
    if (!demand.canonicalSlug) continue;
    const set = bySlug.get(demand.canonicalSlug) || null;
    const rank = priorityForPlant(demand.canonicalSlug, signals);
    for (const role of demand.requiredVariants) {
      const spendBlock = classifySpendBlock(plant, demand, role);
      if (spendBlock.blocked) {
        blocked.push({
          canonicalSlug: demand.canonicalSlug,
          visualForm: demand.visualForm,
          variantKey: role.variantKey || variantKeyFromRole(role),
          required: true,
          reason: spendBlock.primaryReason,
          reasons: spendBlock.reasons,
          metadataFix: spendBlock.metadataFix,
          identityPrecision: spendBlock.identityPrecision,
          state: 'BLOCKED'
        });
        continue;
      }
      if (approvedCovers(set, role)) continue;
      jobs.push({
        canonicalSlug: demand.canonicalSlug,
        visualForm: demand.visualForm,
        growthStage: role.growthStage,
        phenology: role.phenology,
        season: role.season,
        formView: role.formView,
        variantKey: role.variantKey || variantKeyFromRole(role),
        jobId: role.jobId,
        required: true,
        reason: role.reason || 'missing-required-design-variant',
        priority: rank.priority,
        priorityBand: rank.band,
        morphologyAuthority: demand.morphologyAuthority,
        scientific: demand.scientific,
        identityPrecision: spendBlock.identityPrecision,
        identityScope: plant.identityScope || null
      });
    }
    if (!demand.requiredVariants.length) {
      const spendBlock = classifySpendBlock(plant, demand);
      if (spendBlock.blocked) {
        blocked.push({
          canonicalSlug: demand.canonicalSlug,
          visualForm: demand.visualForm,
          required: true,
          reason: spendBlock.primaryReason,
          reasons: spendBlock.reasons,
          metadataFix: spendBlock.metadataFix,
          identityPrecision: spendBlock.identityPrecision,
          state: 'BLOCKED'
        });
      }
    }
  }
  jobs.sort((a, b) => b.priority - a.priority || a.jobId.localeCompare(b.jobId));
  return {
    generated: false,
    generationAllowed: false,
    requiredGapCount: jobs.length,
    optionalExcludedFromDefaultProduction: true,
    jobs,
    blocked
  };
}
