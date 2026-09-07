/**
 * Bootstrap SAFE structural climateTraits migration applier v1.
 * Attaches pre-derived LEGACY_ASSERTED_METADATA climateTraits onto bootstrap plants
 * that lack canonical traits. Does not invent botanical facts.
 */
import {
  BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1
} from './bootstrap-safe-climate-traits-migration-data-v1.js';
import { plantHasCanonicalClimateTraits } from './smart-rec-climate-meta-authority-v1.js';

export const BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION = '1.0.0';

export function getBootstrapSafeClimateTraitsMigrationPayload() {
  return BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1;
}

/**
 * @param {object[]} library PLANT_LIBRARY-like array
 * @param {Record<string, object>} [index] PLANT_INDEX-like map
 * @param {object} [payload] migration payload (defaults to bundled SAFE set)
 */
export function applyBootstrapSafeClimateTraitsMigration(
  library,
  index = null,
  payload = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1
) {
  const plants = payload?.plants && typeof payload.plants === 'object' ? payload.plants : {};
  const list = Array.isArray(library) ? library : [];
  const bySlug =
    index && typeof index === 'object'
      ? index
      : Object.fromEntries(list.filter((p) => p?.slug).map((p) => [String(p.slug).toLowerCase(), p]));

  const applied = [];
  const skipped = [];

  for (const slug of Object.keys(plants)) {
    const target = bySlug[slug] || list.find((p) => String(p?.slug || '').toLowerCase() === slug);
    if (!target) {
      skipped.push({ slug, reason: 'plant-not-in-library' });
      continue;
    }
    // Do not overwrite real seed/canonical traits that already exist (non-migration).
    if (
      plantHasCanonicalClimateTraits(target) &&
      target.climateTraits?.migration?.kind !== 'bootstrap-safe-structural-v1'
    ) {
      skipped.push({ slug, reason: 'already-has-non-migration-climateTraits' });
      continue;
    }
    const nextTraits = plants[slug]?.climateTraits;
    if (!nextTraits || typeof nextTraits !== 'object') {
      skipped.push({ slug, reason: 'missing-migration-traits' });
      continue;
    }
    // Structural attach only — freeze a shallow copy so callers cannot mutate payload by accident
    target.climateTraits = { ...nextTraits };
    if (nextTraits.traitEvidenceClasses) {
      target.climateTraits.traitEvidenceClasses = { ...nextTraits.traitEvidenceClasses };
    }
    if (nextTraits.fieldOrigins) {
      target.climateTraits.fieldOrigins = { ...nextTraits.fieldOrigins };
    }
    if (Array.isArray(nextTraits.groupIds)) {
      target.climateTraits.groupIds = nextTraits.groupIds.slice();
    }
    if (nextTraits.migration) {
      target.climateTraits.migration = { ...nextTraits.migration };
    }
    applied.push(slug);
  }

  return {
    version: BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION,
    migrationId: payload?.migrationId || null,
    appliedCount: applied.length,
    appliedSlugs: applied.sort(),
    skipped
  };
}
