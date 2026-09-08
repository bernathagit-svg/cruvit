/**
 * Bootstrap SAFE structural climateTraits migration applier v1.
 * Attaches pre-derived LEGACY_ASSERTED_METADATA climateTraits onto bootstrap plants
 * that lack canonical traits. Does not invent botanical facts.
 *
 * Extended cleanly for unlocked-six species via the same applier + sibling payload
 * (kind: bootstrap-unlocked-species-structural-v1).
 */
import {
  BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1
} from './bootstrap-safe-climate-traits-migration-data-v1.js';
import {
  BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1
} from './bootstrap-unlocked-six-climate-traits-migration-data-v1.js';
import { plantHasCanonicalClimateTraits } from './smart-rec-climate-meta-authority-v1.js';

export const BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION = '1.0.0';

/** Migration kinds that may re-apply / replace prior structural migration attachments. */
export const BOOTSTRAP_STRUCTURAL_CLIMATE_MIGRATION_KINDS = Object.freeze([
  'bootstrap-safe-structural-v1',
  'bootstrap-unlocked-species-structural-v1'
]);

function isStructuralMigrationKind(kind) {
  return BOOTSTRAP_STRUCTURAL_CLIMATE_MIGRATION_KINDS.includes(kind);
}

export function getBootstrapSafeClimateTraitsMigrationPayload() {
  return BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1;
}

export function getBootstrapUnlockedSixClimateTraitsMigrationPayload() {
  return BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1;
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
      !isStructuralMigrationKind(target.climateTraits?.migration?.kind)
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

/**
 * Apply unlocked-six structural payload using the same applier (no second migration system).
 */
export function applyBootstrapUnlockedSixClimateTraitsMigration(library, index = null) {
  return applyBootstrapSafeClimateTraitsMigration(
    library,
    index,
    BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1
  );
}

/**
 * Apply SAFE then unlocked-six structural migrations in order.
 */
export function applyAllBootstrapStructuralClimateTraitsMigrations(library, index = null) {
  const safe = applyBootstrapSafeClimateTraitsMigration(library, index);
  const unlocked = applyBootstrapUnlockedSixClimateTraitsMigration(library, index);
  return {
    version: BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION,
    safe,
    unlocked,
    appliedCount: safe.appliedCount + unlocked.appliedCount,
    appliedSlugs: [...safe.appliedSlugs, ...unlocked.appliedSlugs].sort()
  };
}
