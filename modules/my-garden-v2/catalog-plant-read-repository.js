const CATALOG_SELECT = [
  'id',
  'slug',
  'scientific_name',
  'common_names',
  'aliases',
  'climate_traits',
  'flowering_requirements',
  'fruiting_requirements',
  'provenance',
  'needs_review',
  'verification_state',
  'media',
  'media_status',
  'catalog_version',
  'source_packet',
  'created_at',
  'updated_at',
].join(',');

function requireClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('supabase_client_required');
  }
}

function requireSlug(value) {
  const slug = String(value ?? '').trim();
  if (!slug) throw new Error('catalog_slug_required');
  return slug;
}

function assertSuccess(result, context) {
  if (!result || typeof result !== 'object') {
    throw new Error(context + ':invalid_response');
  }
  if (result.error) {
    const code = result.error.code ? ':' + result.error.code : '';
    throw new Error(context + code + ':' + (result.error.message || 'query_failed'));
  }
  return result.data;
}

export function createCatalogPlantReadRepository(supabase) {
  requireClient(supabase);

  async function getByExactSlug(slugValue) {
    const slug = requireSlug(slugValue);
    const result = await supabase
      .from('catalog_plants')
      .select(CATALOG_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    const row = assertSuccess(result, 'catalog_plants_read');
    if (!row) return null;
    if (row.slug !== slug) {
      throw new Error('catalog_exact_slug_mismatch:' + slug + ':' + row.slug);
    }
    return row;
  }

  async function searchByText(queryValue, { limit = 20 } = {}) {
    const query = String(queryValue ?? '').trim();
    if (!query) return [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('invalid_catalog_search_limit');
    }

    // Search is discovery only. Exact identity is still taken from returned row.slug.
    const escaped = query.replaceAll('%', '\\%').replaceAll('_', '\\_');
    const result = await supabase
      .from('catalog_plants')
      .select(CATALOG_SELECT)
      .or(
        'slug.ilike.%' + escaped + '%,scientific_name.ilike.%' + escaped + '%,common_names.cs.{}'
      )
      .limit(limit);

    const rows = assertSuccess(result, 'catalog_plants_search');
    if (!Array.isArray(rows)) throw new Error('catalog_plants_search:expected_array');

    const seen = new Set();
    for (const row of rows) {
      if (!row?.slug) throw new Error('catalog_search_slug_required');
      if (seen.has(row.slug)) throw new Error('duplicate_catalog_slug:' + row.slug);
      seen.add(row.slug);
    }
    return rows;
  }

  return Object.freeze({
    getByExactSlug,
    searchByText,
  });
}

export const CATALOG_PLANT_SELECT = CATALOG_SELECT;
