/**
 * Canonical catalog persistence contract V1 — pure helpers.
 * Long-term authority: store validated plant facts once → runtime reuse.
 * Does not perform network I/O. Bulk ingestion is a separate Owner turn.
 */

export const CANONICAL_CATALOG_PERSISTENCE_VERSION = '1.0.0';

export const CATALOG_VERIFICATION_STATES = Object.freeze([
  'verified',
  'needsReview',
  'conflict',
  'unknown'
]);

export const CATALOG_MEDIA_STATUSES = Object.freeze([
  'IMAGE_READY',
  'IMAGE_PENDING',
  'IMAGE_OWNER_REVIEW'
]);

/**
 * Map a seed / packet plant object into a catalog_plants row shape.
 * Bounded proof helper — not a bulk migrator.
 */
export function seedPlantToCatalogRow(plant, { catalogVersion = '1.0.0', sourcePacket } = {}) {
  if (!plant || typeof plant !== 'object') {
    throw new Error('seed plant required');
  }
  const slug = String(plant.slug || '').trim();
  if (!slug) throw new Error('slug required');

  const media = plant.media && typeof plant.media === 'object' ? plant.media : {};
  const mediaStatus = String(media.imageStatus || 'IMAGE_PENDING');
  const needsReview = plant.needsReview === true || plant.climateTraits?.needsReview === true;
  let verificationState = 'needsReview';
  if (plant.verificationState && CATALOG_VERIFICATION_STATES.includes(plant.verificationState)) {
    verificationState = plant.verificationState;
  } else if (!needsReview) {
    verificationState = 'verified';
  }

  return {
    slug,
    scientific_name: plant.scientific ? String(plant.scientific) : null,
    common_names: plant.names && typeof plant.names === 'object' ? plant.names : {},
    aliases: Array.isArray(plant.aliases) ? plant.aliases : [],
    climate_traits: plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {},
    flowering_requirements:
      plant.climateTraits?.floweringRequirements ?? plant.floweringRequirements ?? null,
    fruiting_requirements:
      plant.climateTraits?.fruitingRequirements ?? plant.fruitingRequirements ?? null,
    provenance: Array.isArray(plant.provenance)
      ? plant.provenance
      : Array.isArray(plant.climateTraits?.provenance)
        ? plant.climateTraits.provenance
        : [],
    needs_review: !!needsReview,
    verification_state: verificationState,
    media,
    media_status: CATALOG_MEDIA_STATUSES.includes(mediaStatus) ? mediaStatus : 'IMAGE_PENDING',
    catalog_version: String(catalogVersion),
    source_packet: sourcePacket ? String(sourcePacket) : null
  };
}

/** Runtime evaluation plant shape from a catalog_plants row (or seed-shaped object). */
export function catalogRowToRuntimePlant(row) {
  if (!row || typeof row !== 'object') return null;
  const slug = String(row.slug || '').trim();
  if (!slug) return null;
  const names = row.common_names || row.names || {};
  const climateTraits = row.climate_traits || row.climateTraits || {};
  const media = row.media && typeof row.media === 'object' ? row.media : {};
  return {
    slug,
    name: names.en || slug,
    names,
    scientific: row.scientific_name || row.scientific || '',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    climateTraits,
    floweringRequirements: row.flowering_requirements ?? climateTraits.floweringRequirements,
    fruitingRequirements: row.fruiting_requirements ?? climateTraits.fruitingRequirements,
    provenance: row.provenance || [],
    needsReview: row.needs_review === true || climateTraits.needsReview === true,
    verificationState: row.verification_state || 'needsReview',
    media,
    catalogMedia: media,
    mediaStatus: row.media_status || media.imageStatus || 'IMAGE_PENDING',
    catalogVersion: row.catalog_version || CANONICAL_CATALOG_PERSISTENCE_VERSION,
    source: 'canonical-catalog'
  };
}

/**
 * Resolve plant for evaluation: prefer in-memory / stored catalog records.
 * Never triggers external research.
 */
export function resolveCanonicalPlantForEvaluation({ slug, catalogBySlug, seedBySlug } = {}) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return { plant: null, source: null };
  if (catalogBySlug && catalogBySlug[key]) {
    return { plant: catalogRowToRuntimePlant(catalogBySlug[key]), source: 'catalog_plants' };
  }
  if (seedBySlug && seedBySlug[key]) {
    const row = seedPlantToCatalogRow(seedBySlug[key]);
    return { plant: catalogRowToRuntimePlant(row), source: 'plants.seed.json' };
  }
  return { plant: null, source: null };
}

export function assertNoExternalEnrichmentInCatalogResolve() {
  return {
    allowsNetwork: false,
    allowsLlm: false,
    allowsImageSearch: false,
    contract: 'ACQUIRE_ONCE_STORE_REUSE'
  };
}
