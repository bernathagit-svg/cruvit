/**
 * Wikimedia Commons source adapter for Licensed Image Pipeline V1.
 * Free, no API key. Uses extmetadata for license/attribution.
 */

import {
  IMAGE_PENDING,
  IMAGE_READY,
  IMAGE_BLOCKED,
  mediaCacheKey,
  pendingMediaRecord,
  blockedMediaRecord,
  parseScientificBinomial,
  reuseCachedResolution,
  selectPrimaryImageCandidate
} from './licensed-image-pipeline-v1-contract.js';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'CruvitLicensedImagePipeline/1.0 (catalog; https://github.com/bernathagit-svg/cruvit)';

function extValue(meta, key) {
  const v = meta?.[key]?.value;
  return v == null ? '' : String(v);
}

function parseBoolish(v) {
  const s = String(v || '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Bounded Commons search queries for one plant. Scientific identity first;
 * broad taxa may add a genus-scope alternative. No paid search.
 */
export function buildCommonsSearchQueries(plant) {
  const scientific = String(plant.scientific || plant.acceptedScientificName || '').trim();
  const common = String(plant.commonName || plant.names?.en || '').trim();
  const parsed = parseScientificBinomial(scientific);
  const queries = [];
  const push = (q) => {
    const s = String(q || '').trim();
    if (s && !queries.includes(s)) queries.push(s);
  };
  if (scientific) push(`"${scientific}"`);
  if (scientific && scientific.includes('×')) {
    push(`"${scientific.replace(/×/g, 'x')}"`);
    push(`"${scientific.replace(/\s*×\s*/g, ' ')}"`);
  }
  if (parsed?.genusOnly && parsed.genus && !parsed.ambiguous) {
    push(`${parsed.genus} plant`);
  }
  if (scientific && common) push(`${scientific} ${common}`);
  if (!scientific && common) push(`${common} plant`);
  return queries.slice(0, 4);
}

/**
 * Search Commons file namespace for a scientific-name-oriented query.
 */
export async function searchCommonsImageCandidates(plant, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const scientific = String(plant.scientific || plant.acceptedScientificName || '').trim();
  const common = String(plant.commonName || plant.names?.en || '').trim();
  if (!scientific && !common) return { ok: false, error: 'missing-identity', candidates: [] };

  const query = options.query || (scientific ? `"${scientific}"` : `${common} plant`);

  const searchParams = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
    gsrlimit: String(options.limit || 12),
    prop: 'imageinfo|categories',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '900',
    cllimit: '20',
    clshow: '!hidden'
  });

  const t0 = performance.now();
  let res;
  try {
    res = await fetchImpl(`${COMMONS_API}?${searchParams}`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: options.signal
    });
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'fetch-failed',
      candidates: [],
      searchMs: performance.now() - t0
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `http-${res.status}`,
      candidates: [],
      searchMs: performance.now() - t0
    };
  }
  const data = await res.json().catch(() => null);
  const pages = Object.values(data?.query?.pages || {});
  const candidates = [];

  for (const page of pages) {
    if (!page || page.missing != null) continue;
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    const title = String(page.title || '').replace(/^File:/i, '');
    const categories = (page.categories || []).map((c) => c.title || '').filter(Boolean);
    const mime = String(info.mime || '').toLowerCase();
    if (mime.includes('svg') || mime.includes('djvu') || mime.includes('pdf')) continue;

    candidates.push({
      title,
      sourceProvider: 'wikimedia-commons',
      sourceAssetId: page.title || title,
      sourcePageUrl:
        info.descriptionurl ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || `File:${title}`)}`,
      url: info.url || null,
      thumbUrl: info.thumburl || null,
      assetUrl: info.url || info.thumburl || null,
      width: info.width ?? null,
      height: info.height ?? null,
      mimeType: mime || null,
      description: extValue(meta, 'ImageDescription'),
      author: extValue(meta, 'Artist') || extValue(meta, 'Attribution'),
      artist: extValue(meta, 'Artist'),
      licenseShortName: extValue(meta, 'LicenseShortName') || extValue(meta, 'License'),
      licenseUrl: extValue(meta, 'LicenseUrl'),
      attributionRequired: parseBoolish(extValue(meta, 'AttributionRequired')),
      nonFree: parseBoolish(extValue(meta, 'NonFree')),
      categories,
      usageTerms: extValue(meta, 'UsageTerms')
    });
  }

  return {
    ok: true,
    error: null,
    query,
    candidates,
    searchMs: performance.now() - t0,
    source: 'wikimedia-commons'
  };
}

function persistResolution(cacheStore, key, plant, out, query) {
  if (!cacheStore) return;
  return Promise.resolve(
    cacheStore.set(key, {
      status: out.status,
      media: out.media,
      scientific: plant.scientific,
      rejected: out.rejected,
      passedCount: out.passedCount,
      resolvedAt: new Date().toISOString(),
      query
    })
  );
}

/**
 * Full resolve: bounded search alternatives → select. Optional cache reuse.
 * After all query alternatives fail, returns IMAGE_BLOCKED (honest, no fabricated match).
 */
export async function resolveLicensedImageForPlant(plant, options = {}) {
  const cacheStore = options.cacheStore || null;
  const key = mediaCacheKey(plant);

  if (!options.bypassCache && cacheStore) {
    const cached = await Promise.resolve(cacheStore.get(key));
    const reused = reuseCachedResolution(plant, cached, { maxAgeMs: options.maxAgeMs });
    if (reused) {
      return { ...reused, cacheKey: key, searchMs: 0, licenseValidationMs: 0 };
    }
  }

  const parsed = parseScientificBinomial(plant.scientific || plant.acceptedScientificName || '');
  if (parsed?.ambiguous) {
    const out = {
      status: IMAGE_BLOCKED,
      media: blockedMediaRecord(plant, 'identity-ambiguous'),
      rejected: [],
      passedCount: 0,
      cacheKey: key,
      searchMs: 0,
      licenseValidationMs: 0,
      fromCache: false
    };
    await persistResolution(cacheStore, key, plant, out, null);
    return out;
  }

  const queries = options.query
    ? [options.query]
    : buildCommonsSearchQueries(plant);
  const allRejected = [];
  let bestNonReady = null;
  let totalSearchMs = 0;
  let totalLicMs = 0;
  let lastQuery = queries[0] || '';

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    lastQuery = query;
    if (i > 0) {
      await new Promise((r) => setTimeout(r, options.retryDelayMs ?? 400));
    }
    const search = await searchCommonsImageCandidates(plant, { ...options, query });
    totalSearchMs += search.searchMs || 0;
    if (!search.ok) {
      bestNonReady = {
        status: IMAGE_PENDING,
        media: pendingMediaRecord(plant, `source-search-failed:${search.error}`),
        rejected: allRejected,
        passedCount: 0,
        sourceError: search.error
      };
      continue;
    }
    const tLic = performance.now();
    const selected = selectPrimaryImageCandidate(plant, search.candidates);
    totalLicMs += performance.now() - tLic;
    allRejected.push(...(selected.rejected || []));
    if (selected.status === IMAGE_READY) {
      const out = {
        ...selected,
        cacheKey: key,
        searchMs: totalSearchMs,
        licenseValidationMs: totalLicMs,
        query,
        queriesAttempted: i + 1,
        candidateCount: search.candidates.length,
        fromCache: false
      };
      await persistResolution(cacheStore, key, plant, out, query);
      return out;
    }
    bestNonReady = selected;
  }

  const failReason =
    bestNonReady?.media?.pendingReason ||
    bestNonReady?.sourceError ||
    'no-license-safe-asset';
  const blockedReason =
    /identity/.test(String(failReason))
      ? 'identity-ambiguous'
      : /source-search-failed|http-/.test(String(failReason))
        ? 'source-unavailable'
        : 'no-license-safe-asset';
  const out = {
    status: IMAGE_BLOCKED,
    media: blockedMediaRecord(plant, blockedReason, {
      lastStatus: bestNonReady?.status || IMAGE_PENDING,
      lastReason: failReason,
      queriesAttempted: queries,
      rejectedSample: allRejected.slice(0, 12)
    }),
    rejected: allRejected,
    passedCount: bestNonReady?.passedCount || 0,
    cacheKey: key,
    searchMs: totalSearchMs,
    licenseValidationMs: totalLicMs,
    query: lastQuery,
    queriesAttempted: queries.length,
    fromCache: false,
    sourceError: bestNonReady?.sourceError || null
  };
  await persistResolution(cacheStore, key, plant, out, lastQuery);
  return out;
}
