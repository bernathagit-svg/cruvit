import { buildInitialQueries } from './aliases.mjs';
import { profilePassesFinalGate } from './guards.mjs';
import { buildBaseProfile, mergeCareProfile } from './profile.mjs';
import { resolveGbifTaxon, simplifyGbifCandidate } from './providers/gbif.mjs';
import { expandBotanicalQuery, generateCareProfile } from './providers/openai.mjs';
import { wikidataBotanicalQueries } from './providers/wikidata.mjs';
import { resolveBotanicalImage, wikipediaSummary } from './providers/wikipedia.mjs';
import { corsHeaders, jsonResponse, text, unique } from './utils.mjs';

export const ENGINE_VERSION = '2.0.0-phase1';

function confidenceFromScore(score, aliasMatched) {
  const base = aliasMatched ? 0.91 : 0.78;
  const bonus = Math.min(0.08, Math.max(0, Number(score || 0) - 20) / 250);
  return Math.min(0.99, base + bonus);
}

async function buildVerifiedQuerySet(rawQuery) {
  const initial = buildInitialQueries(rawQuery);
  const wikidata = await wikidataBotanicalQueries(rawQuery).catch(() => ({ queries: [], candidates: [] }));
  return {
    ...initial,
    wikidata,
    queries: unique([...initial.queries, ...(wikidata.queries || [])])
  };
}

async function resolveTaxonomy(rawQuery) {
  const querySet = await buildVerifiedQuerySet(rawQuery);
  let resolved = await resolveGbifTaxon(querySet.queries, {
    aliasMatched: querySet.aliasMatched,
    maxQueries: 8
  });

  let aiExpandedQueries = [];
  if (!resolved.ok) {
    aiExpandedQueries = await expandBotanicalQuery(rawQuery).catch(() => []);
    if (aiExpandedQueries.length) {
      resolved = await resolveGbifTaxon(unique([...querySet.queries, ...aiExpandedQueries]), {
        aliasMatched: querySet.aliasMatched,
        maxQueries: 12
      });
    }
  }

  return { resolved, querySet, aiExpandedQueries };
}

function suggestionPayload(resolved) {
  return (resolved?.candidates || [])
    .slice(0, 8)
    .map(simplifyGbifCandidate)
    .filter(Boolean);
}

export async function resolvePlantKnowledge(body = {}) {
  const rawQuery = text(body.plantName || body.query || body.name || body.originalQuery);
  const location = text(body.location);
  const climate = text(body.climate);
  const mode = text(body.mode || 'resolve').toLowerCase();

  if (!rawQuery) {
    return { status: 400, body: { isPlant: false, error: 'Missing plant name', engineVersion: ENGINE_VERSION } };
  }

  const { resolved, querySet, aiExpandedQueries } = await resolveTaxonomy(rawQuery);
  const suggestions = suggestionPayload(resolved);

  if (mode === 'suggest') {
    return {
      status: 200,
      body: {
        isPlant: Boolean(resolved.ok),
        query: rawQuery,
        suggestions,
        engineVersion: ENGINE_VERSION,
        sourcesUsed: ['aliases', 'Wikidata', 'GBIF', ...(aiExpandedQueries.length ? ['OpenAI query expansion'] : [])]
      }
    };
  }

  if (!resolved.ok || !resolved.best) {
    return {
      status: 200,
      body: {
        isPlant: false,
        error: 'No confident botanical plant match found. Try a scientific name, common plant name, Hebrew plant name or transliteration.',
        normalizedQuery: querySet.queries[0] || rawQuery,
        suggestions,
        engineVersion: ENGINE_VERSION,
        botanicalVerified: false
      }
    };
  }

  const taxon = resolved.best;
  const scientificName = text(taxon.scientificName || taxon.canonicalName);
  const commonName = text(taxon.vernacularName || taxon.canonicalName || rawQuery);

  const [summary, imageUrl] = await Promise.all([
    wikipediaSummary(taxon.canonicalName || scientificName || commonName).catch(() => null),
    resolveBotanicalImage([scientificName, taxon.canonicalName, commonName, rawQuery]).catch(() => '')
  ]);

  const baseProfile = buildBaseProfile({
    rawQuery,
    taxon,
    summary,
    imageUrl,
    confidence: confidenceFromScore(taxon._score, querySet.aliasMatched)
  });

  const aiProfile = await generateCareProfile({
    rawQuery,
    taxon,
    summary,
    location,
    climate
  }).catch(() => null);

  const profile = mergeCareProfile(baseProfile, aiProfile);
  profile.imageUrl = imageUrl || profile.imageUrl || '';
  profile.imageSearchQuery = profile.scientificName || profile.commonName;

  if (!profilePassesFinalGate(profile)) {
    return {
      status: 200,
      body: {
        isPlant: false,
        error: 'The result matched a non-plant entity and was rejected.',
        engineVersion: ENGINE_VERSION,
        botanicalVerified: false
      }
    };
  }

  return {
    status: 200,
    body: {
      ...profile,
      request: {
        original: rawQuery,
        searchedQueries: resolved.searchedQueries,
        location,
        climate
      },
      engineVersion: ENGINE_VERSION,
      botanicalVerified: true,
      verification: {
        source: 'GBIF',
        kingdom: 'Plantae',
        taxonKey: taxon.usageKey || taxon.key || '',
        rank: taxon.rank || '',
        matchedName: scientificName,
        family: taxon.family || '',
        genus: taxon.genus || '',
        score: taxon._score || 0
      },
      suggestions
    }
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { isPlant: false, error: 'Use POST', engineVersion: ENGINE_VERSION });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await resolvePlantKnowledge(body);
    return jsonResponse(result.status, result.body);
  } catch (error) {
    return jsonResponse(200, {
      isPlant: false,
      error: 'Plant knowledge service failed safely. No plant was added because the botanical match could not be verified.',
      details: error?.message || String(error || ''),
      engineVersion: ENGINE_VERSION,
      botanicalVerified: false
    });
  }
}
