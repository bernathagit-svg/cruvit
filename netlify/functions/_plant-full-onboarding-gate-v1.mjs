import { evaluateFullPlantOnboardingBatch } from '../../modules/catalog/full-plant-onboarding-gate-v1.js';

function env(name) {
  return Netlify.env.get(name) || '';
}

function eq(value) {
  return encodeURIComponent(String(value));
}

async function fetchCatalogRow(slug) {
  const base = String(env('SUPABASE_URL') || '').replace(/\/$/, '');
  const anon = String(env('SUPABASE_ANON_KEY') || '');
  if (!base || !anon) throw new Error('SUPABASE_CATALOG_CONFIG_MISSING');
  const path =
    '/rest/v1/catalog_plants'
    + '?select=slug,scientific_name,needs_review,verification_state,climate_traits,flowering_requirements,fruiting_requirements,provenance,source_packet'
    + '&slug=eq.' + eq(slug)
    + '&limit=1';
  const res = await fetch(base + path, {
    method: 'GET',
    headers: {
      apikey: anon,
      authorization: 'Bearer ' + anon,
      accept: 'application/json',
      'cache-control': 'no-store'
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : []; } catch { data = []; }
  if (!res.ok) {
    const err = new Error('CANONICAL_CATALOG_READ_FAILED');
    err.status = res.status;
    throw err;
  }
  return Array.isArray(data) ? (data[0] || null) : null;
}

export async function evaluateLiveFullPlantOnboarding(expectedRows = []) {
  const uniqueSlugs = [...new Set(
    (expectedRows || [])
      .map((row) => String(row?.canonicalSlug || '').trim().toLowerCase())
      .filter(Boolean)
  )];
  const rows = [];
  for (const slug of uniqueSlugs) {
    rows.push(await fetchCatalogRow(slug));
  }
  return evaluateFullPlantOnboardingBatch(rows.filter(Boolean), expectedRows);
}
