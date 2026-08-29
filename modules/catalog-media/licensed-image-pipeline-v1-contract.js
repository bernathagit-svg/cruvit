/**
 * Licensed Image Pipeline V1 — catalog media acquisition contract (non-runtime).
 *
 * Resolves provenance-backed, commercially compatible plant portraits for the
 * catalog. Does NOT attach arbitrary web images. IMAGE_PENDING is a valid outcome.
 *
 * NOT imported by product Suitability / Smart Rec runtime paths.
 */

export const LICENSED_IMAGE_PIPELINE_VERSION = '1.0.0';

export const IMAGE_PENDING = 'IMAGE_PENDING';
export const IMAGE_READY = 'IMAGE_READY';
export const IMAGE_OWNER_REVIEW = 'IMAGE_OWNER_REVIEW';

/** Storage strategy for V1: reference stable source assets; provenance retained locally. */
export const STORAGE_STRATEGY_V1 = Object.freeze({
  mode: 'reference-third-party',
  rationale:
    'Wikimedia Commons URLs are stable and redistribution is permitted under accepted licenses; V1 avoids CRUVIT media hosting cost while retaining full provenance for attribution and re-verification.',
  risks: [
    'source-removal',
    'hotlink-policy-change',
    'thumb-url-rotation'
  ],
  mitigations: [
    'persist original file page URL + asset id',
    'prefer original url over ephemeral thumbs when available',
    're-resolve from cache key without network when still valid'
  ]
});

/**
 * Explicit commercial-compatible allow/deny by normalized license short name.
 * Unknown / missing → REJECT (do not guess).
 */
export const LICENSE_POLICY = Object.freeze({
  accept: Object.freeze([
    'cc0',
    'cc0 1.0',
    'public domain',
    'pd',
    'pdm',
    'cc-zero',
    'cc by 1.0',
    'cc by 2.0',
    'cc by 2.5',
    'cc by 3.0',
    'cc by 4.0',
    'cc-by-1.0',
    'cc-by-2.0',
    'cc-by-2.5',
    'cc-by-3.0',
    'cc-by-4.0',
    'cc by-sa 1.0',
    'cc by-sa 2.0',
    'cc by-sa 2.5',
    'cc by-sa 3.0',
    'cc by-sa 4.0',
    'cc-by-sa-1.0',
    'cc-by-sa-2.0',
    'cc-by-sa-2.5',
    'cc-by-sa-3.0',
    'cc-by-sa-4.0'
  ]),
  rejectSubstrings: Object.freeze([
    'nc',
    'noncommercial',
    'non-commercial',
    'nd',
    'noderiv',
    'no derivatives',
    'all rights reserved',
    'fair use',
    'nonfree',
    'copyrighted'
  ])
});

export const QUALITY_MINIMUMS = Object.freeze({
  minWidth: 400,
  minHeight: 300,
  allowedMime: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  rejectTitleOrDesc: Object.freeze([
    /watermark/i,
    /\bstock\s*preview\b/i,
    /\bplaceholder\b/i,
    /\blogo\b/i
  ])
});

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLicenseKey(licenseShortName) {
  return String(licenseShortName || '')
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{ ok: true, commercialUseAllowed: true, attributionRequired: boolean, normalized: string }
 *         | { ok: false, reason: string, normalized: string }}
 */
export function evaluateLicenseForCommercialCatalog(licenseShortName, options = {}) {
  const normalized = normalizeLicenseKey(licenseShortName);
  if (!normalized) {
    return { ok: false, reason: 'missing-license', normalized: '' };
  }
  if (options.nonFree === true || options.nonFree === 'true' || options.nonFree === '1') {
    return { ok: false, reason: 'non-free', normalized };
  }
  for (const bad of LICENSE_POLICY.rejectSubstrings) {
    // Word-boundary-ish: avoid rejecting "cc by" for containing nothing; NC/ND are substrings of license codes
    if (normalized.includes(bad)) {
      // Allow "public domain" despite no bad match; "copyrighted false" handled elsewhere
      if (bad === 'copyrighted' && /not copyrighted|public domain|cc0/.test(normalized)) continue;
      // "nd" as substring of "and" — use token check for short codes
      if (bad === 'nd') {
        if (/\bnd\b|noderiv|no.?deriv/.test(normalized) || /-nd-/.test(normalized.replace(/\s/g, '-'))) {
          return { ok: false, reason: 'no-derivatives', normalized };
        }
        continue;
      }
      if (bad === 'nc') {
        if (/\bnc\b|non-?commercial/.test(normalized) || /-nc-/.test(normalized.replace(/\s/g, '-'))) {
          return { ok: false, reason: 'non-commercial', normalized };
        }
        continue;
      }
      return { ok: false, reason: `rejected:${bad}`, normalized };
    }
  }
  const accepted = LICENSE_POLICY.accept.some(
    (a) => normalized === a || normalized.replace(/-/g, ' ') === a.replace(/-/g, ' ')
  );
  if (!accepted) {
    // Soft accept: "cc by" without version, or Wikimedia "PD-user"
    if (/^cc[- ]?by([- ]sa)?(\s|$)/.test(normalized) && !/\bnc\b|\bnd\b/.test(normalized)) {
      const attributionRequired = !/^cc0|public domain|pd\b/.test(normalized);
      return { ok: true, commercialUseAllowed: true, attributionRequired, normalized };
    }
    if (/^pd-|public domain|cc0|creative commons cc0/.test(normalized)) {
      return { ok: true, commercialUseAllowed: true, attributionRequired: false, normalized };
    }
    return { ok: false, reason: 'license-not-on-allowlist', normalized };
  }
  const attributionRequired = !/^(cc0|cc0 1\.0|public domain|pd|pdm|cc-zero)/.test(normalized);
  return { ok: true, commercialUseAllowed: true, attributionRequired, normalized };
}

/**
 * Parse binomial scientific name → { genus, species, epithet }.
 */
export function parseScientificBinomial(scientific) {
  const raw = String(scientific || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return null;
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return { genus: parts[0] || '', species: '', epithet: '', binomial: raw, genusOnly: true };
  }
  const genus = parts[0];
  const epithet = parts[1].replace(/[^a-zA-Z-]/g, '');
  return {
    genus,
    epithet,
    species: `${genus} ${epithet}`,
    binomial: `${genus} ${epithet}`,
    genusOnly: false
  };
}

/**
 * Identity match against candidate title/description/categories.
 * Scientific binomial is primary authority.
 */
export function scoreIdentityMatch(plant, candidate) {
  const sci = parseScientificBinomial(plant.scientific || plant.acceptedScientificName);
  const title = String(candidate.title || candidate.name || '');
  const desc = stripHtml(candidate.description || '');
  const cats = Array.isArray(candidate.categories)
    ? candidate.categories.join(' ')
    : String(candidate.categories || '');
  const blob = `${title} ${desc} ${cats}`.toLowerCase();
  const reasons = [];

  if (!sci || !sci.genus) {
    return {
      ok: false,
      confidence: 'none',
      score: 0,
      reasons: ['missing-scientific-name']
    };
  }

  const genusL = sci.genus.toLowerCase();
  const epithetL = (sci.epithet || '').toLowerCase();
  const binomialL = sci.binomial.toLowerCase();

  const hasBinomial =
    blob.includes(binomialL) ||
    new RegExp(`${genusL}\\s+${epithetL}`, 'i').test(blob);
  const hasGenus = new RegExp(`\\b${genusL}\\b`, 'i').test(blob);
  const hasEpithetNearGenus = epithetL
    ? new RegExp(
        `${genusL}[^a-z]{0,48}${epithetL}|${epithetL}[^a-z]{0,48}${genusL}`,
        'i'
      ).test(blob)
    : false;
  const hasEpithetAlone = epithetL && new RegExp(`\\b${epithetL}\\b`, 'i').test(blob);

  // Common-name-only collision trap: if common name present but no genus/species → reject
  const common = String(plant.commonName || plant.names?.en || plant.slug || '').toLowerCase();
  const hasCommon = common.length >= 3 && blob.includes(common);
  if (hasCommon && !hasGenus && !hasBinomial) {
    return {
      ok: false,
      confidence: 'none',
      score: 0,
      reasons: ['common-name-without-scientific']
    };
  }

  if (sci.genusOnly) {
    return {
      ok: false,
      confidence: 'low',
      score: hasGenus ? 20 : 0,
      reasons: ['genus-only-plant-identity-insufficient']
    };
  }

  if (hasGenus && !hasBinomial && !hasEpithetNearGenus) {
    return {
      ok: false,
      confidence: 'low',
      score: hasEpithetAlone ? 30 : 25,
      reasons: hasEpithetAlone
        ? ['epithet-far-from-genus-or-wrong-species-context']
        : ['genus-only-match']
    };
  }

  if (hasBinomial || hasEpithetNearGenus) {
    let score = hasBinomial ? 90 : 75;
    if (/flower|fruit|tree|plant|leaf|leaves|pod|palm|vine/i.test(blob)) score += 5;
    if (/map|logo|diagram|herbarium sheet label only/i.test(blob)) score -= 20;
    reasons.push(hasBinomial ? 'binomial-in-metadata' : 'genus-and-epithet-near');
    const confidence = score >= 85 ? 'high' : score >= 70 ? 'medium' : 'low';
    return {
      ok: confidence !== 'low',
      confidence,
      score,
      reasons
    };
  }

  return {
    ok: false,
    confidence: 'none',
    score: 0,
    reasons: ['no-scientific-identity-match']
  };
}

/**
 * Quality gate for catalog primary portrait.
 */
export function evaluateImageQuality(candidate) {
  const reasons = [];
  const mime = String(candidate.mimeType || candidate.mime || '').toLowerCase();
  if (mime && !QUALITY_MINIMUMS.allowedMime.includes(mime) && !mime.startsWith('image/jpeg')) {
    if (mime.includes('svg') || mime.includes('gif')) {
      return { ok: false, reasons: [`unsupported-mime:${mime}`] };
    }
    if (mime && !mime.startsWith('image/')) {
      return { ok: false, reasons: [`unsupported-mime:${mime}`] };
    }
  }
  const w = Number(candidate.width);
  const h = Number(candidate.height);
  if (Number.isFinite(w) && w > 0 && w < QUALITY_MINIMUMS.minWidth) {
    return { ok: false, reasons: [`width-below-minimum:${w}`] };
  }
  if (Number.isFinite(h) && h > 0 && h < QUALITY_MINIMUMS.minHeight) {
    return { ok: false, reasons: [`height-below-minimum:${h}`] };
  }
  const text = `${candidate.title || ''} ${stripHtml(candidate.description || '')}`;
  for (const re of QUALITY_MINIMUMS.rejectTitleOrDesc) {
    if (re.test(text)) {
      return { ok: false, reasons: [`quality-flag:${re}`] };
    }
  }
  if (!candidate.url && !candidate.thumbUrl && !candidate.assetUrl) {
    return { ok: false, reasons: ['missing-asset-url'] };
  }
  if (Number.isFinite(w) && Number.isFinite(h) && w >= QUALITY_MINIMUMS.minWidth) {
    reasons.push('dimensions-ok');
  } else {
    reasons.push('dimensions-unknown-allowed');
  }
  return { ok: true, reasons };
}

export function buildAttributionString({
  title,
  author,
  licenseName,
  licenseUrl,
  sourcePageUrl,
  sourceProvider = 'Wikimedia Commons'
} = {}) {
  const parts = [];
  const cleanAuthor = stripHtml(author) || 'Unknown author';
  const cleanTitle = stripHtml(title) || 'Untitled';
  parts.push(`"${cleanTitle}" by ${cleanAuthor}`);
  if (licenseName) {
    parts.push(licenseUrl ? `${licenseName} (${licenseUrl})` : licenseName);
  }
  if (sourcePageUrl) parts.push(`Source: ${sourcePageUrl}`);
  else if (sourceProvider) parts.push(`via ${sourceProvider}`);
  return parts.join('. ') + '.';
}

/**
 * Empty media provenance shell for IMAGE_PENDING.
 */
export function pendingMediaRecord(plant, reason, details = {}) {
  const scientific = plant.scientific || plant.acceptedScientificName || '';
  const common = plant.commonName || plant.names?.en || plant.slug || '';
  return {
    imageStatus: IMAGE_PENDING,
    searchQuery: `${scientific} ${common}`.trim(),
    pendingReason: reason,
    pendingDetails: details,
    pipelineVersion: LICENSED_IMAGE_PIPELINE_VERSION,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Build IMAGE_READY catalog media record from a passed candidate.
 */
export function readyMediaRecord(plant, candidate, identity, licenseEval) {
  const author = stripHtml(candidate.author || candidate.artist || '');
  const licenseName = candidate.licenseShortName || candidate.license || licenseEval.normalized;
  const licenseUrl = candidate.licenseUrl || '';
  const sourcePageUrl = candidate.sourcePageUrl || candidate.pageUrl || '';
  const assetUrl = candidate.url || candidate.assetUrl || candidate.thumbUrl;
  const attribution = buildAttributionString({
    title: candidate.title,
    author,
    licenseName,
    licenseUrl,
    sourcePageUrl,
    sourceProvider: candidate.sourceProvider || 'Wikimedia Commons'
  });

  return {
    imageStatus: IMAGE_READY,
    primaryUrl: assetUrl,
    url: assetUrl,
    thumbUrl: candidate.thumbUrl || null,
    searchQuery: `${plant.scientific || ''} ${plant.commonName || plant.names?.en || ''}`.trim(),
    sourceProvider: candidate.sourceProvider || 'wikimedia-commons',
    sourceAssetId: candidate.sourceAssetId || candidate.title || null,
    sourcePageUrl,
    author: author || null,
    license: licenseName,
    licenseUrl: licenseUrl || null,
    licenseNormalized: licenseEval.normalized,
    commercialUseAllowed: true,
    attributionRequired: !!licenseEval.attributionRequired,
    attribution,
    width: candidate.width ?? null,
    height: candidate.height ?? null,
    mimeType: candidate.mimeType || candidate.mime || null,
    verifiedAt: new Date().toISOString(),
    identityConfidence: identity.confidence,
    identityMatchMethod: identity.reasons?.join(',') || null,
    identityScore: identity.score,
    isPrimary: true,
    transformation: {
      resized: !!(candidate.thumbUrl && candidate.thumbUrl !== assetUrl),
      cropped: false,
      note: candidate.thumbUrl ? 'Optional display thumb referenced; original/source URL retained' : null
    },
    pipelineVersion: LICENSED_IMAGE_PIPELINE_VERSION,
    provenance: {
      provider: candidate.sourceProvider || 'wikimedia-commons',
      fetchedAt: new Date().toISOString(),
      licenseSource: 'commons-extmetadata',
      storageStrategy: STORAGE_STRATEGY_V1.mode
    }
  };
}

/**
 * Rank + select primary candidate after license + identity + quality filters.
 * Pure function — no network.
 */
export function selectPrimaryImageCandidate(plant, candidates = []) {
  const rejected = [];
  const passed = [];

  for (const raw of candidates) {
    const licenseEval = evaluateLicenseForCommercialCatalog(raw.licenseShortName || raw.license, {
      nonFree: raw.nonFree
    });
    if (!licenseEval.ok) {
      rejected.push({ candidate: raw.title || raw.url, stage: 'license', reason: licenseEval.reason });
      continue;
    }
    if (licenseEval.attributionRequired) {
      const author = stripHtml(raw.author || raw.artist || '');
      if (!author && !raw.attribution) {
        rejected.push({
          candidate: raw.title || raw.url,
          stage: 'attribution',
          reason: 'attribution-required-but-author-missing'
        });
        continue;
      }
    }
    const identity = scoreIdentityMatch(plant, raw);
    if (!identity.ok) {
      rejected.push({
        candidate: raw.title || raw.url,
        stage: 'identity',
        reason: identity.reasons.join(','),
        confidence: identity.confidence
      });
      continue;
    }
    const quality = evaluateImageQuality(raw);
    if (!quality.ok) {
      rejected.push({
        candidate: raw.title || raw.url,
        stage: 'quality',
        reason: quality.reasons.join(',')
      });
      continue;
    }
    passed.push({ raw, licenseEval, identity, quality, rank: identity.score + (Number(raw.width) > 800 ? 5 : 0) });
  }

  passed.sort((a, b) => b.rank - a.rank);

  // Dedupe by sourceAssetId / url
  const seen = new Set();
  const unique = [];
  for (const p of passed) {
    const key = String(p.raw.sourceAssetId || p.raw.url || p.raw.title || '').toLowerCase();
    if (!key || seen.has(key)) {
      rejected.push({ candidate: p.raw.title, stage: 'dedupe', reason: 'duplicate-asset' });
      continue;
    }
    seen.add(key);
    unique.push(p);
  }

  if (!unique.length) {
    return {
      status: IMAGE_PENDING,
      media: pendingMediaRecord(plant, 'no-candidate-passed-filters', { rejected }),
      rejected,
      passedCount: 0
    };
  }

  const top = unique[0];
  if (top.identity.confidence === 'medium' && unique.length === 1) {
    // Single medium-confidence hit → owner review rather than silent attach
    return {
      status: IMAGE_OWNER_REVIEW,
      media: {
        ...pendingMediaRecord(plant, 'single-medium-confidence-identity', {
          rejected,
          candidateTitle: top.raw.title
        }),
        imageStatus: IMAGE_OWNER_REVIEW,
        candidatePreview: readyMediaRecord(plant, top.raw, top.identity, top.licenseEval)
      },
      rejected,
      passedCount: unique.length
    };
  }

  return {
    status: IMAGE_READY,
    media: readyMediaRecord(plant, top.raw, top.identity, top.licenseEval),
    rejected,
    passedCount: unique.length,
    alternates: unique.slice(1, 4).map((u) => readyMediaRecord(plant, u.raw, u.identity, u.licenseEval))
  };
}

/**
 * Cache key for idempotent re-resolution.
 */
export function mediaCacheKey(plant) {
  const sci = String(plant.scientific || plant.acceptedScientificName || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  const slug = String(plant.slug || plant.canonicalSlug || 'unknown').toLowerCase();
  return `${slug}__${sci || 'nosci'}__v${LICENSED_IMAGE_PIPELINE_VERSION}`;
}

/**
 * Idempotent merge: reuse prior IMAGE_READY if still valid and plant identity unchanged.
 */
export function reuseCachedResolution(plant, cached, options = {}) {
  if (!cached || typeof cached !== 'object') return null;
  if (cached.status !== IMAGE_READY && cached.media?.imageStatus !== IMAGE_READY) return null;
  const media = cached.media || cached;
  if (media.imageStatus !== IMAGE_READY) return null;
  if (!media.primaryUrl || !media.license || !media.commercialUseAllowed) return null;
  if (options.maxAgeMs != null && cached.resolvedAt) {
    const age = Date.now() - new Date(cached.resolvedAt).getTime();
    if (Number.isFinite(age) && age > options.maxAgeMs) return null;
  }
  const sci = String(plant.scientific || '').toLowerCase();
  const cachedSci = String(cached.scientific || media.provenance?.scientific || '').toLowerCase();
  if (sci && cachedSci && sci !== cachedSci) return null;
  return {
    status: IMAGE_READY,
    media: { ...media, fromCache: true },
    fromCache: true,
    rejected: cached.rejected || [],
    passedCount: cached.passedCount ?? 1
  };
}

/** Source evaluation record (documentation for gate report). */
export const IMAGE_SOURCE_EVALUATION = Object.freeze([
  {
    id: 'wikimedia-commons',
    selected: true,
    cost: 'free',
    rateLimit: 'polite use; ~1–2 req/s recommended; no API key',
    licenseMetadata: 'machine-readable extmetadata (LicenseShortName, LicenseUrl, AttributionRequired, Artist)',
    commercialSupport: 'filterable via license short names (CC0/PD/CC BY/CC BY-SA)',
    notes: 'Primary V1 source.'
  },
  {
    id: 'openverse',
    selected: false,
    cost: 'free (Creative Commons catalog API)',
    rateLimit: 'documented API limits; attribution always provided',
    licenseMetadata: 'strong; license_type=commercial filter',
    commercialSupport: 'yes when filtered',
    notes: 'Deferred for V1 to keep one adapter; compatible follow-on.'
  },
  {
    id: 'inaturalist',
    selected: false,
    cost: 'free with API etiquette',
    rateLimit: 'yes',
    licenseMetadata: 'per-observation photo licenses vary; many NC',
    commercialSupport: 'often non-commercial — not default-safe',
    notes: 'Rejected as default source for commercial catalog.'
  },
  {
    id: 'google-images-pinterest-scrape',
    selected: false,
    cost: 'n/a',
    licenseMetadata: 'none reliable',
    commercialSupport: 'no',
    notes: 'Explicitly disallowed.'
  }
]);
