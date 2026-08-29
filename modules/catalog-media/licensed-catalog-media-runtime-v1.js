/**
 * Licensed Catalog Media — runtime consume helpers (no network search).
 * Catalog IMAGE_READY records only; IMAGE_PENDING → placeholder.
 * Does not mutate private user photos.
 */

export const RUNTIME_MEDIA_CONTRACT_VERSION = '1.0.0';

export const IMAGE_READY = 'IMAGE_READY';
export const IMAGE_PENDING = 'IMAGE_PENDING';
export const IMAGE_OWNER_REVIEW = 'IMAGE_OWNER_REVIEW';

const READY = IMAGE_READY;
const PENDING = IMAGE_PENDING;
const OWNER_REVIEW = IMAGE_OWNER_REVIEW;

function isHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || ''));
}

function isDataImage(u) {
  return /^data:image\//i.test(String(u || ''));
}

function isBannedPlaceholderHost(u) {
  return /garden-bg\.jpg|source\.unsplash\.com|loremflickr\.com|tse\d*\.mm\.bing\.net/i.test(
    String(u || '')
  );
}

/**
 * Extract catalog media record from plant / catalog flat / seed-shaped objects.
 */
export function getCatalogMediaRecord(plantOrCatalog) {
  if (!plantOrCatalog || typeof plantOrCatalog !== 'object') return null;
  const candidates = [
    plantOrCatalog.catalogMedia,
    plantOrCatalog.media,
    plantOrCatalog.meta?.catalogMedia,
    plantOrCatalog.meta?.media
  ];
  for (const m of candidates) {
    if (m && typeof m === 'object') return m;
  }
  return null;
}

/**
 * Validate stored catalog media for commercial catalog render.
 * No live license reinterpretation — trust stored pipeline fields only when complete.
 */
export function isApprovedCatalogMediaRecord(media, plant = null) {
  if (!media || typeof media !== 'object') {
    return { ok: false, reason: 'missing-media' };
  }
  if (String(media.imageStatus || '') !== READY) {
    return { ok: false, reason: `status:${media.imageStatus || 'none'}` };
  }
  const url = String(media.primaryUrl || media.url || '').trim();
  if (!isHttpUrl(url) || isBannedPlaceholderHost(url)) {
    return { ok: false, reason: 'missing-or-banned-url' };
  }
  if (media.commercialUseAllowed !== true) {
    return { ok: false, reason: 'commercial-use-not-allowed' };
  }
  if (!String(media.license || '').trim()) {
    return { ok: false, reason: 'missing-license' };
  }
  if (!String(media.sourceProvider || media.provenance?.provider || '').trim()) {
    return { ok: false, reason: 'missing-provider' };
  }
  if (!String(media.sourcePageUrl || '').trim()) {
    return { ok: false, reason: 'missing-source-page' };
  }
  if (media.attributionRequired === true) {
    const attr = String(media.attribution || '').trim();
    const author = String(media.author || '').trim();
    if (!attr && !author) {
      return { ok: false, reason: 'attribution-required-missing' };
    }
  }
  // Optional identity check against plant scientific when both present
  if (plant) {
    const sci = String(plant.scientific || plant.meta?.scientific || '')
      .toLowerCase()
      .trim();
    const blob = `${media.sourceAssetId || ''} ${media.searchQuery || ''} ${media.attribution || ''} ${url}`
      .toLowerCase();
    if (sci) {
      const parts = sci.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const binomial = `${parts[0]} ${parts[1]}`;
        if (!blob.includes(binomial) && !blob.includes(parts[0])) {
          // Soft: URL may not include name; require identityConfidence if present
          const conf = String(media.identityConfidence || '').toLowerCase();
          if (conf && conf !== 'high' && conf !== 'medium') {
            return { ok: false, reason: 'identity-confidence-insufficient' };
          }
        }
      }
    }
  }
  return { ok: true, reason: null, url };
}

/**
 * User-owned Garden photo (not catalog).
 */
export function getUserOwnedPlantPhotoUrl(plant) {
  if (!plant || typeof plant !== 'object') return '';
  const m = plant.meta && typeof plant.meta === 'object' ? plant.meta : {};
  const scan = String(plant.scanPhotoUrl || '').trim();
  const candidates = [
    plant.photoUrl,
    m.photoUrl,
    plant.userPhotoUrl,
    m.userPhotoUrl
  ];
  for (const raw of candidates) {
    const u = String(raw || '').trim();
    if (!u || u === scan) continue;
    if ((isHttpUrl(u) || isDataImage(u)) && !isBannedPlaceholderHost(u)) return u;
  }
  // Explicit scan/capture photo counts as user-owned when present
  if (scan && (isHttpUrl(scan) || isDataImage(scan)) && !isBannedPlaceholderHost(scan)) {
    return scan;
  }
  return '';
}

/**
 * Resolve display image for a plant card / result.
 * Priority: user photo → approved catalog IMAGE_READY → empty (placeholder).
 * Never searches the web.
 */
export function resolvePlantDisplayMedia(plant) {
  const userUrl = getUserOwnedPlantPhotoUrl(plant);
  if (userUrl) {
    return {
      kind: 'user',
      url: userUrl,
      attributionRequired: false,
      attribution: null,
      license: null,
      sourcePageUrl: null,
      imageStatus: null,
      placeholder: false
    };
  }

  const media = getCatalogMediaRecord(plant);
  const approved = isApprovedCatalogMediaRecord(media, plant);
  if (approved.ok) {
    return {
      kind: 'catalog',
      url: approved.url,
      attributionRequired: media.attributionRequired === true,
      attribution: media.attribution || null,
      author: media.author || null,
      license: media.license || null,
      licenseUrl: media.licenseUrl || null,
      sourcePageUrl: media.sourcePageUrl || null,
      sourceProvider: media.sourceProvider || null,
      imageStatus: READY,
      placeholder: false,
      media
    };
  }

  const status = media?.imageStatus || PENDING;
  return {
    kind: 'placeholder',
    url: '',
    attributionRequired: false,
    attribution: null,
    license: null,
    sourcePageUrl: null,
    imageStatus: status === OWNER_REVIEW ? OWNER_REVIEW : PENDING,
    pendingReason: media?.pendingReason || approved.reason || 'no-approved-catalog-media',
    placeholder: true
  };
}

/**
 * Compact attribution label for UI (creator · license).
 */
export function formatCatalogAttributionLabel(displayMedia) {
  if (!displayMedia || displayMedia.kind !== 'catalog') return '';
  if (!displayMedia.attributionRequired && !displayMedia.attribution) return '';
  const author = String(displayMedia.author || '').trim();
  const license = String(displayMedia.license || '').trim();
  if (author && license) return `${author} · ${license}`;
  if (displayMedia.attribution) {
    const short = String(displayMedia.attribution).slice(0, 80);
    return short.length < displayMedia.attribution.length ? short + '…' : short;
  }
  return license || 'Source';
}

/**
 * Reject media that would be unsafe if somehow attached at runtime.
 */
export function assertCatalogMediaSafeToRender(media) {
  return isApprovedCatalogMediaRecord(media).ok;
}

/** Deterministic SVG placeholder data URL (no network). */
export function catalogMediaPlaceholderDataUrl(name = 'Plant') {
  const safe = String(name || 'Plant')
    .replace(/[<>&]/g, '')
    .slice(0, 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#eaf4df"/><stop offset="1" stop-color="#fff2cd"/></linearGradient></defs><rect width="900" height="520" fill="url(#g)"/><text x="450" y="245" text-anchor="middle" font-size="86">🌿</text><text x="450" y="340" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#0d3d27">${safe}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function measureCatalogMediaLookupLatency(plants, iterations = 200) {
  const list = Array.isArray(plants) ? plants : [];
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    for (const p of list) resolvePlantDisplayMedia(p);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
  return {
    iterations,
    plantCount: list.length,
    minMs: times[0],
    medianMs: pct(50),
    p95Ms: pct(95),
    maxMs: times[times.length - 1]
  };
}

const api = {
  RUNTIME_MEDIA_CONTRACT_VERSION,
  getCatalogMediaRecord,
  isApprovedCatalogMediaRecord,
  getUserOwnedPlantPhotoUrl,
  resolvePlantDisplayMedia,
  formatCatalogAttributionLabel,
  assertCatalogMediaSafeToRender,
  catalogMediaPlaceholderDataUrl,
  measureCatalogMediaLookupLatency,
  IMAGE_READY: READY,
  IMAGE_PENDING: PENDING,
  IMAGE_OWNER_REVIEW: OWNER_REVIEW
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitLicensedCatalogMedia = api;
}
