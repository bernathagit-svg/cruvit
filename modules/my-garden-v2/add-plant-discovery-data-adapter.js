import { createCatalogPlantReadRepository } from './catalog-plant-read-repository.js';
import {
  buildAddPlantDiscoveryViewModel,
  prepareDiscoverySelection,
} from './add-plant-discovery-view-model.js';

function catalogCandidate(row) {
  if (!row?.slug || !row?.scientific_name) {
    throw new Error('catalog_candidate_identity_required');
  }
  return Object.freeze({
    id: row.id ?? null,
    slug: row.slug,
    scientificName: row.scientific_name,
    commonName:
      row.common_names?.en ??
      row.common_names?.default ??
      row.slug,
    image: row.media ?? null,
    verificationState: row.verification_state ?? null,
    needsReview: row.needs_review === true,
  });
}

function verifiedCandidate(row) {
  return (
    row &&
    row.verification_state === 'verified' &&
    row.needs_review !== true
  );
}

export function createAddPlantDiscoveryDataAdapter(supabase) {
  const catalog = createCatalogPlantReadRepository(supabase);

  async function search(query, options = {}) {
    const rows = await catalog.searchByText(query, options);
    const verified = rows.filter(verifiedCandidate).map(catalogCandidate);

    return buildAddPlantDiscoveryViewModel({
      searchResults: verified,
      locationReliability: options.locationReliability ?? 'unknown',
    });
  }

  async function resolveExactSlugs(slugs) {
    if (!Array.isArray(slugs)) throw new Error('catalog_slug_list_required');
    const out = [];
    const seen = new Set();

    for (const raw of slugs) {
      const slug = String(raw ?? '').trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const row = await catalog.getByExactSlug(slug);
      if (!verifiedCandidate(row)) continue;
      out.push(catalogCandidate(row));
    }

    return out;
  }

  async function suggestions(slugs, options = {}) {
    const rows = await resolveExactSlugs(slugs);
    return buildAddPlantDiscoveryViewModel({
      recommendations: rows,
      locationReliability: options.locationReliability ?? 'unknown',
    });
  }

  async function popularForArea(slugs, { locationReliability = 'unknown' } = {}) {
    if (!['confirmed', 'trusted'].includes(String(locationReliability))) {
      return buildAddPlantDiscoveryViewModel({
        popularForArea: [],
        locationReliability,
      });
    }

    const rows = await resolveExactSlugs(slugs);
    return buildAddPlantDiscoveryViewModel({
      popularForArea: rows,
      locationReliability,
    });
  }

  function select(candidate) {
    return prepareDiscoverySelection(candidate);
  }

  return Object.freeze({
    search,
    suggestions,
    popularForArea,
    select,
  });
}
