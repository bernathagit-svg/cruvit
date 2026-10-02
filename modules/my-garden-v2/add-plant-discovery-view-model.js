const DISCOVERY_SOURCES = new Set([
  'catalog_search',
  'smart_recommendations',
  'popular_for_area',
  'plant_identifier',
]);

function requireCanonicalCandidate(candidate, source) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('plant_candidate_required');
  }

  const slug = String(candidate.slug ?? candidate.canonicalSlug ?? '').trim();
  const scientificName = String(candidate.scientificName ?? candidate.scientific_name ?? '').trim();

  if (!slug || !scientificName) {
    throw new Error('canonical_candidate_identity_required:' + source);
  }

  return Object.freeze({
    slug,
    scientificName,
    commonName: candidate.commonName ?? candidate.name ?? null,
    image: candidate.image ?? null,
    source,
    sourceRecordId: candidate.id ?? null,
    // Discovery is not ownership: no Plant Instance exists yet.
    gardenPlantId: null,
  });
}

export function buildAddPlantDiscoveryViewModel({
  searchResults = [],
  recommendations = [],
  popularForArea = [],
  locationReliability = 'unknown',
} = {}) {
  const search = searchResults.map((row) =>
    requireCanonicalCandidate(row, 'catalog_search')
  );

  const suggested = recommendations.map((row) =>
    requireCanonicalCandidate(row, 'smart_recommendations')
  );

  const reliableLocation = ['confirmed', 'trusted'].includes(String(locationReliability));

  const popular = reliableLocation
    ? popularForArea.map((row) => requireCanonicalCandidate(row, 'popular_for_area'))
    : [];

  return Object.freeze({
    entryModes: Object.freeze(['scan', 'manual', 'suggestions']),
    search: Object.freeze(search),
    suggestions: Object.freeze(suggested),
    popularForArea: Object.freeze(popular),
    popularForAreaAvailable: reliableLocation,
    locationReliability,
  });
}

export function prepareDiscoverySelection(candidate) {
  if (!candidate || !DISCOVERY_SOURCES.has(candidate.source)) {
    throw new Error('unsupported_discovery_source');
  }

  return Object.freeze({
    canonicalSlug: candidate.slug,
    scientificName: candidate.scientificName,
    displayName: candidate.commonName ?? candidate.scientificName,
    source: candidate.source,
    sourceRecordId: candidate.sourceRecordId,
    // Selection is still not a saved Plant Instance.
    gardenPlantId: null,
    requiresExplicitAddConfirmation: true,
  });
}
