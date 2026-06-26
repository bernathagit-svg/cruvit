import { isHebrew, fetchJson, text, unique } from '../utils.mjs';
import { looksBotanicalText } from '../guards.mjs';

function claimValue(entity, property) {
  const claims = entity?.claims?.[property] || [];
  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function searchEntities(query, language) {
  const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language,
    uselang: language,
    type: 'item',
    limit: '8',
    format: 'json',
    origin: '*'
  });
  const data = await fetchJson(url, {}, 8000);
  return Array.isArray(data?.search) ? data.search : [];
}

async function fetchEntity(id) {
  if (!id) return null;
  const data = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`, {}, 8000);
  return data?.entities?.[id] || null;
}

export async function wikidataBotanicalQueries(rawQuery) {
  const languages = unique([isHebrew(rawQuery) ? 'he' : 'en', 'en', 'he']);
  const hits = [];

  for (const language of languages) {
    const results = await searchEntities(rawQuery, language);
    for (const result of results) {
      const description = text(result.description);
      if (!looksBotanicalText([result.label, description])) continue;
      hits.push({ ...result, language });
    }
  }

  const uniqueHits = [];
  const seen = new Set();
  for (const hit of hits) {
    if (!hit.id || seen.has(hit.id)) continue;
    seen.add(hit.id);
    uniqueHits.push(hit);
  }

  const detailed = [];
  for (const hit of uniqueHits.slice(0, 5)) {
    const entity = await fetchEntity(hit.id);
    const taxonName = claimValue(entity, 'P225');
    const englishLabel = text(entity?.labels?.en?.value);
    const hebrewLabel = text(entity?.labels?.he?.value);
    detailed.push({
      id: hit.id,
      taxonName,
      label: englishLabel || hit.label,
      hebrewLabel,
      description: hit.description,
      botanical: Boolean(taxonName) || looksBotanicalText([hit.label, hit.description])
    });
  }

  return {
    queries: unique(detailed.flatMap(item => [item.taxonName, item.label, item.hebrewLabel])),
    candidates: detailed
  };
}
