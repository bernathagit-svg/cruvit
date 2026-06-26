import { gbifItemIsPlant, looksScientificName } from '../guards.mjs';
import { fetchJson, normalizeText, text, unique } from '../utils.mjs';

function rankScore(rank) {
  switch (String(rank || '').toUpperCase()) {
    case 'SPECIES': return 18;
    case 'SUBSPECIES': return 15;
    case 'VARIETY': return 14;
    case 'GENUS': return 12;
    case 'FAMILY': return 6;
    default: return 2;
  }
}

function itemText(item) {
  return [
    item.canonicalName,
    item.scientificName,
    item.vernacularName,
    item.name,
    item.genus,
    item.family
  ].filter(Boolean).join(' ');
}

export function scoreGbifItem(item, query) {
  if (!gbifItemIsPlant(item)) return -1000;
  const normalizedQuery = normalizeText(query);
  const normalizedNames = normalizeText(itemText(item));
  let score = rankScore(item.rank);

  const status = String(item.status || item.taxonomicStatus || '').toUpperCase();
  if (status === 'ACCEPTED') score += 10;
  if (item.matchType === 'EXACT') score += 18;
  if (normalizedNames === normalizedQuery) score += 30;
  if (normalizedNames.includes(normalizedQuery) && normalizedQuery.length >= 3) score += 16;
  if (normalizedQuery.includes(normalizeText(item.canonicalName)) && text(item.canonicalName).length >= 4) score += 10;
  if (looksScientificName(query) && normalizeText(item.scientificName).startsWith(normalizedQuery)) score += 16;
  if (Number.isFinite(Number(item.confidence))) score += Number(item.confidence) / 8;
  return score;
}

async function gbifMatch(query) {
  const url = 'https://api.gbif.org/v1/species/match?' + new URLSearchParams({
    name: query,
    kingdom: 'Plantae',
    strict: 'false',
    verbose: 'true'
  });
  const item = await fetchJson(url, {}, 9000);
  if (!gbifItemIsPlant(item)) return [];
  return [{ ...item, _source: 'gbif-match', _query: query }];
}

async function gbifSuggest(query) {
  const url = 'https://api.gbif.org/v1/species/suggest?' + new URLSearchParams({
    q: query,
    kingdomKey: '6',
    limit: '12'
  });
  const items = await fetchJson(url, {}, 9000);
  return (Array.isArray(items) ? items : [])
    .filter(gbifItemIsPlant)
    .map(item => ({ ...item, _source: 'gbif-suggest', _query: query }));
}

async function gbifSearch(query) {
  const url = 'https://api.gbif.org/v1/species/search?' + new URLSearchParams({
    q: query,
    kingdomKey: '6',
    limit: '12'
  });
  const data = await fetchJson(url, {}, 10000);
  return (Array.isArray(data?.results) ? data.results : [])
    .filter(gbifItemIsPlant)
    .map(item => ({ ...item, _source: 'gbif-search', _query: query }));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.usageKey || item.key || item.scientificName || item.canonicalName;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveGbifTaxon(queries, options = {}) {
  const queryList = unique(queries).slice(0, options.maxQueries || 8);
  const batches = await Promise.all(queryList.map(async query => {
    const [matched, suggested, searched] = await Promise.all([
      gbifMatch(query),
      gbifSuggest(query),
      gbifSearch(query)
    ]);
    return [...matched, ...suggested, ...searched];
  }));


  const allowedRanks = new Set([
  'GENUS',
  'SPECIES',
  'SUBSPECIES',
  'VARIETY',
  'FORM',
  'CULTIVAR'
]);

const candidates = dedupe(batches.flat())
  .filter(item =>
    allowedRanks.has(String(item.rank || '').toUpperCase())
  )
  .map(item => ({
    ...item,
    _score: scoreGbifItem(item, item.query || queryList[0])
  }))
  .sort((a, b) => b._score - a._score);
  const best = candidates[0] || null;
  const threshold = options.aliasMatched ? 14 : 20;
  const confident = Boolean(best) && best._score >= threshold;

  return {
    ok: confident,
    best,
    candidates: candidates.slice(0, 10),
    searchedQueries: queryList
  };
}

export function simplifyGbifCandidate(item) {
  if (!item) return null;
  return {
    commonName: text(item.vernacularName || item.canonicalName || item.scientificName),
    scientificName: text(item.scientificName || item.canonicalName),
    canonicalName: text(item.canonicalName || item.scientificName),
    rank: text(item.rank),
    family: text(item.family),
    genus: text(item.genus),
    taxonKey: item.usageKey || item.key || '',
    confidenceScore: Number(item._score || 0),
    source: 'GBIF Plantae'
  };
}
