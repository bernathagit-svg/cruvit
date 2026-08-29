/**
 * Wikimedia Commons source adapter for Licensed Image Pipeline V1.
 * Free, no API key. Uses extmetadata for license/attribution.
 */

import {
  IMAGE_PENDING,
  mediaCacheKey,
  pendingMediaRecord,
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
 * Search Commons file namespace for a scientific-name-oriented query.
 */
export async function searchCommonsImageCandidates(plant, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const scientific = String(plant.scientific || plant.acceptedScientificName || '').trim();
  const common = String(plant.commonName || plant.names?.en || '').trim();
  if (!scientific && !common) return { ok: false, error: 'missing-identity', candidates: [] };

  const query = scientific ? `"${scientific}"` : `${common} plant`;

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

/**
 * Full resolve: search → select. Optional cache reuse.
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

  const search = await searchCommonsImageCandidates(plant, options);
  if (!search.ok) {
    const out = {
      status: IMAGE_PENDING,
      media: pendingMediaRecord(plant, `source-search-failed:${search.error}`),
      rejected: [],
      passedCount: 0,
      cacheKey: key,
      searchMs: search.searchMs || 0,
      licenseValidationMs: 0,
      sourceError: search.error
    };
    if (cacheStore && options.cachePending !== false) {
      await Promise.resolve(
        cacheStore.set(key, {
          ...out,
          scientific: plant.scientific,
          resolvedAt: new Date().toISOString()
        })
      );
    }
    return out;
  }

  const tLic = performance.now();
  const selected = selectPrimaryImageCandidate(plant, search.candidates);
  const licenseValidationMs = performance.now() - tLic;

  const out = {
    ...selected,
    cacheKey: key,
    searchMs: search.searchMs,
    licenseValidationMs,
    query: search.query,
    candidateCount: search.candidates.length,
    fromCache: false
  };

  if (cacheStore) {
    await Promise.resolve(
      cacheStore.set(key, {
        status: out.status,
        media: out.media,
        scientific: plant.scientific,
        rejected: out.rejected,
        passedCount: out.passedCount,
        resolvedAt: new Date().toISOString(),
        query: search.query
      })
    );
  }

  return out;
}
