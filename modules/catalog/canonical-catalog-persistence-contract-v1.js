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

const ASSERTED_CLIMATE_KEYS = Object.freeze([
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill'
]);

/**
 * Botanical provenance only — never media.provenance / image license trails.
 * Prefer top-level plant.provenance; fall back to expansion source.provenance.
 */
export function extractBotanicalProvenance(plant) {
  if (!plant || typeof plant !== 'object') return [];
  if (Array.isArray(plant.provenance) && plant.provenance.length > 0) {
    return plant.provenance;
  }
  if (Array.isArray(plant.climateTraits?.provenance) && plant.climateTraits.provenance.length > 0) {
    return plant.climateTraits.provenance;
  }
  // Expansion materializer historically nested botanical sources here.
  if (Array.isArray(plant.source?.provenance) && plant.source.provenance.length > 0) {
    return plant.source.provenance;
  }
  return [];
}

export function plantHasAssertedBotanicalTraits(plant) {
  if (!plant || typeof plant !== 'object') return false;
  const ct = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  for (const key of ASSERTED_CLIMATE_KEYS) {
    if (ct[key] !== undefined && ct[key] !== null && ct[key] !== '') return true;
  }
  const flowering = ct.floweringRequirements ?? plant.floweringRequirements;
  if (flowering !== undefined && flowering !== null && String(flowering).trim() !== '') return true;
  const fruiting = ct.fruitingRequirements ?? plant.fruitingRequirements;
  if (fruiting !== undefined && fruiting !== null && String(fruiting).trim() !== '') return true;
  return false;
}

export function resolveCatalogSourcePacket(plant, explicitSourcePacket) {
  // Exact per-plant expansion packet id is authoritative when present.
  const recordId = plant?.source?.recordId && String(plant.source.recordId).trim();
  if (recordId) return recordId;
  if (explicitSourcePacket != null && String(explicitSourcePacket).trim()) {
    return String(explicitSourcePacket).trim();
  }
  if (plant?.sourcePacket && String(plant.sourcePacket).trim()) {
    return String(plant.sourcePacket).trim();
  }
  return null;
}

/**
 * Normalize flowering/fruiting for catalog_plants jsonb columns.
 * Canonical form for prose: JS string (Supabase serializes to JSONB string scalar).
 * Absent / unknown: null. Never invent objects.
 */
export function normalizeCatalogRequirementJsonbValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? value : null;
  }
  // Already a structured JSON value from DB round-trip — keep as-is.
  if (typeof value === 'object') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

/**
 * PostgreSQL JSONB literal for Owner SQL upserts into catalog_plants.
 * Live columns flowering_requirements / fruiting_requirements are jsonb.
 * Prose must become a JSON string scalar, never a bare SQL text cast to jsonb.
 *
 * Preferred for strings: to_jsonb('<escaped>'::text)
 * NULL when absent.
 */
export function sqlJsonbLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') {
    const escaped = value.replace(/'/g, "''");
    return `to_jsonb('${escaped}'::text)`;
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

/**
 * Map a seed / packet plant object into a catalog_plants row shape.
 * Bounded proof helper — not a bulk migrator.
 *
 * Rule: verification_state cannot be `verified` when asserted botanical traits
 * lack non-empty botanical provenance.
 *
 * flowering_requirements / fruiting_requirements are JS string|null so the
 * Supabase client JSON-encodes them as JSONB string scalars (parity with SQL).
 */
export function seedPlantToCatalogRow(plant, { catalogVersion = '1.0.0', sourcePacket } = {}) {
  if (!plant || typeof plant !== 'object') {
    throw new Error('seed plant required');
  }
  const slug = String(plant.slug || '').trim();
  if (!slug) throw new Error('slug required');

  const media = plant.media && typeof plant.media === 'object' ? plant.media : {};
  const mediaStatus = String(media.imageStatus || 'IMAGE_PENDING');
  const botanicalProvenance = extractBotanicalProvenance(plant);
  const hasAsserted = plantHasAssertedBotanicalTraits(plant);

  let needsReview =
    plant.needsReview === true ||
    plant.climateTraits?.needsReview === true ||
    plant.verification?.needsReview === true ||
    String(plant.qualityTier || '').toLowerCase() === 'needs_review';

  // Asserted botanical facts without traceable botanical provenance cannot be verified.
  if (hasAsserted && botanicalProvenance.length === 0) {
    needsReview = true;
  }

  let verificationState = 'needsReview';
  if (needsReview) {
    verificationState = 'needsReview';
  } else if (plant.verificationState && CATALOG_VERIFICATION_STATES.includes(plant.verificationState)) {
    verificationState = plant.verificationState;
  } else if (hasAsserted && botanicalProvenance.length > 0) {
    verificationState = 'verified';
  } else {
    verificationState = 'needsReview';
  }

  // Hard gate: never emit verified + empty botanical provenance.
  if (verificationState === 'verified' && botanicalProvenance.length === 0) {
    verificationState = 'needsReview';
    needsReview = true;
  }

  return {
    slug,
    scientific_name: plant.scientific ? String(plant.scientific) : null,
    common_names: plant.names && typeof plant.names === 'object' ? plant.names : {},
    aliases: Array.isArray(plant.aliases) ? plant.aliases : [],
    climate_traits: plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {},
    flowering_requirements: normalizeCatalogRequirementJsonbValue(
      plant.climateTraits?.floweringRequirements ?? plant.floweringRequirements ?? null
    ),
    fruiting_requirements: normalizeCatalogRequirementJsonbValue(
      plant.climateTraits?.fruitingRequirements ?? plant.fruitingRequirements ?? null
    ),
    provenance: botanicalProvenance,
    needs_review: !!needsReview,
    verification_state: verificationState,
    media,
    media_status: CATALOG_MEDIA_STATUSES.includes(mediaStatus) ? mediaStatus : 'IMAGE_PENDING',
    catalog_version: String(catalogVersion),
    source_packet: resolveCatalogSourcePacket(plant, sourcePacket)
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
    provenance: Array.isArray(row.provenance) ? row.provenance : extractBotanicalProvenance(row),
    needsReview: row.needs_review === true || climateTraits.needsReview === true,
    verificationState: row.verification_state || 'needsReview',
    media,
    catalogMedia: media,
    mediaStatus: row.media_status || media.imageStatus || 'IMAGE_PENDING',
    catalogVersion: row.catalog_version || CANONICAL_CATALOG_PERSISTENCE_VERSION,
    source: 'canonical-catalog',
    sourcePacket: row.source_packet || null
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
