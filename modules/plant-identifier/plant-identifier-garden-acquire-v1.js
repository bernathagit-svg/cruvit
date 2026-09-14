/**
 * Plant Identifier → My Garden V1 — catalog match + confirmation gate.
 *
 * Identifier is an acquisition hook. It does not own catalog identity,
 * does not write Garden truth without explicit confirmation, and never
 * promotes a scan photo to catalog media.
 *
 * Scan image persistence: DEFERRED (local observational evidence only).
 */

export const IDENTIFIER_GARDEN_ACQUIRE_VERSION = '1.0.0';

export const MATCHED_CANONICAL = 'MATCHED_CANONICAL';
export const AMBIGUOUS = 'AMBIGUOUS';
export const NO_SAFE_CANONICAL_MATCH = 'NO_SAFE_CANONICAL_MATCH';

/** Smallest robust V1: do not require Garden Media upload to Add Plant. */
export const IDENTIFIER_SCAN_PERSISTENCE = 'DEFERRED';

export const IDENTIFIER_GARDEN_SOURCE = 'Scan & Identify';

/**
 * Wave 1 species-packet aliases — same collapse as Catalog Images coverage.
 * Not a second identity registry.
 */
export const IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL = Object.freeze({
  'english-lavender': 'lavender',
  spearmint: 'mint',
  'common-jasmine': 'jasmine',
  'bigleaf-hydrangea': 'hydrangea',
  'lesser-bougainvillea': 'bougainvillea',
  'bell-pepper': 'sweet-pepper'
});

const ID_STORAGE_PREFIX = 'cruvit_pi_acquire_';

function asText(value) {
  return String(value || '').trim();
}

export function slugifyIdentifierToken(value) {
  return asText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeScientificName(value) {
  return asText(value)
    .replace(/×/g, 'x')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*x\s*/g, ' x ')
    .replace(/\bspp\.?\b/g, 'spp.')
    .replace(/\s+\./g, '.')
    .trim();
}

function binomialKey(scientific) {
  const n = normalizeScientificName(scientific);
  if (!n) return '';
  const tokens = n.split(' ').filter(Boolean);
  if (!tokens.length) return '';
  const genus = tokens[0];
  if (tokens.length === 1) return genus;
  const second = tokens[1] === 'x' && tokens[2] ? tokens[2] : tokens[1];
  if (!second || second === 'x') return genus;
  if (second === 'spp' || second === 'spp.') return `${genus} spp.`;
  return `${genus} ${second}`;
}

function parseGenus(scientific) {
  const n = normalizeScientificName(scientific);
  const genus = n.split(' ')[0] || '';
  return genus === 'x' ? '' : genus;
}

function isBroadScientific(scientific) {
  const n = normalizeScientificName(scientific);
  return /\bspp\./.test(n) || /^various\b/.test(n);
}

export function resolveIdentifierCanonicalSlug(slug, aliasMaps = {}) {
  const key = slugifyIdentifierToken(slug);
  if (!key) return '';
  const maps = aliasMaps && typeof aliasMaps === 'object' ? aliasMaps : {};
  const hop = maps[key] || IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL[key] || key;
  const hopKey = slugifyIdentifierToken(hop);
  return maps[hopKey] || IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL[hopKey] || hopKey;
}

function catalogNames(entry) {
  const names = [
    entry?.name,
    entry?.he,
    entry?.commonName,
    ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
  ];
  if (entry?.names && typeof entry.names === 'object') {
    names.push(entry.names.en, entry.names.he);
  }
  return names.map((n) => asText(n).toLowerCase()).filter(Boolean);
}

function uniqueBySlug(entries, aliasMaps) {
  const out = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const slug = resolveIdentifierCanonicalSlug(entry?.slug || entry?.canonicalSlug, aliasMaps);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name: asText(entry.name || entry.commonName || slug),
      scientific: asText(entry.scientific || entry.scientificName),
      aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
      he: asText(entry.he),
      score: Number(entry.score) || 0,
      reasons: Array.isArray(entry.reasons) ? entry.reasons.slice() : []
    });
  }
  return out;
}

function addHit(hits, entry, aliasMaps, reason, score) {
  const slug = resolveIdentifierCanonicalSlug(entry?.slug, aliasMaps);
  if (!slug) return;
  const cur = hits.get(slug);
  if (!cur) {
    hits.set(slug, {
      slug,
      name: asText(entry.name || slug),
      scientific: asText(entry.scientific),
      aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
      he: asText(entry.he),
      score,
      reasons: [reason]
    });
    return;
  }
  if (score > cur.score) cur.score = score;
  if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
}

function matchQueryAgainstCatalog(query, catalog, aliasMaps) {
  const hits = new Map();
  const sci = normalizeScientificName(query.scientific);
  const bin = binomialKey(query.scientific);
  const genus = parseGenus(query.scientific);
  const common = asText(query.commonName).toLowerCase();
  const slugGuess = slugifyIdentifierToken(query.slug || query.commonName);

  const resolvedGuess = slugGuess ? resolveIdentifierCanonicalSlug(slugGuess, aliasMaps) : '';

  for (const entry of catalog || []) {
    const entrySlug = resolveIdentifierCanonicalSlug(entry.slug, aliasMaps);
    if (!entrySlug) continue;
    const entrySci = normalizeScientificName(entry.scientific);
    const entryBin = binomialKey(entry.scientific);
    const names = catalogNames(entry);

    if (sci && entrySci && sci === entrySci) {
      addHit(hits, { ...entry, slug: entrySlug }, aliasMaps, 'scientific-exact', 100);
    } else if (bin && entryBin && bin === entryBin) {
      addHit(hits, { ...entry, slug: entrySlug }, aliasMaps, 'binomial-exact', 95);
    }

    if (common && names.includes(common)) {
      addHit(hits, { ...entry, slug: entrySlug }, aliasMaps, 'common-name-exact', 70);
    }

    if (slugGuess && (entrySlug === slugGuess || slugifyIdentifierToken(entry.slug) === slugGuess)) {
      addHit(hits, { ...entry, slug: entrySlug }, aliasMaps, 'slug-exact', 90);
    }
    if (resolvedGuess && entrySlug === resolvedGuess) {
      addHit(hits, { ...entry, slug: entrySlug }, aliasMaps, 'alias-slug', 88);
    }
  }

  if (sci && genus) {
    const exactAlready = [...hits.values()].some((h) => h.score >= 95);
    if (!exactAlready) {
      const inGenus = uniqueBySlug(
        (catalog || []).filter((entry) => parseGenus(entry.scientific) === genus),
        aliasMaps
      );
      if (inGenus.length === 1 && isBroadScientific(inGenus[0].scientific)) {
        addHit(hits, inGenus[0], aliasMaps, 'genus-to-unique-broad-catalog', 80);
      }
    }
  }

  return [...hits.values()].sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
}

function queryFromResultPart(part) {
  if (!part) return { commonName: '', scientific: '', slug: '' };
  if (typeof part === 'string') {
    const text = asText(part);
    const looksSci = /^[A-Z][a-z]+(\s|$)/.test(text) || /\bspp\.?\b/i.test(text);
    return looksSci
      ? { commonName: '', scientific: text, slug: slugifyIdentifierToken(text) }
      : { commonName: text, scientific: '', slug: slugifyIdentifierToken(text) };
  }
  return {
    commonName: asText(part.common_name || part.commonName || part.name),
    scientific: asText(part.scientific_name || part.scientificName || part.scientific),
    slug: asText(part.slug)
  };
}

/**
 * Classify an Identifier result against the current canonical catalog only.
 * Does not create catalog plants. Does not invent cultivar specificity.
 */
export function classifyIdentifierCatalogMatch(result, catalog, options = {}) {
  const aliasMaps = Object.assign(
    {},
    IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL,
    options.aliasMaps && typeof options.aliasMaps === 'object' ? options.aliasMaps : {}
  );
  const catalogEntries = uniqueBySlug(catalog, aliasMaps);
  const primary = queryFromResultPart(result);
  if (!primary.commonName && !primary.scientific && !primary.slug) {
    return {
      status: NO_SAFE_CANONICAL_MATCH,
      canonicalSlug: null,
      match: null,
      candidates: [],
      reason: 'empty-identity'
    };
  }

  const primaryHits = matchQueryAgainstCatalog(primary, catalogEntries, aliasMaps);
  const strongPrimary = primaryHits.filter((h) => h.score >= 80);
  const uniqueStrong = uniqueBySlug(strongPrimary, aliasMaps);

  if (uniqueStrong.length === 1) {
    const match = uniqueStrong[0];
    return {
      status: MATCHED_CANONICAL,
      canonicalSlug: match.slug,
      match,
      candidates: uniqueStrong,
      reason: match.reasons[0] || 'matched-canonical',
      catalogBroad: isBroadScientific(match.scientific)
    };
  }

  if (uniqueStrong.length > 1) {
    return {
      status: AMBIGUOUS,
      canonicalSlug: null,
      match: null,
      candidates: uniqueStrong,
      reason: 'multiple-canonical-matches'
    };
  }

  const weakPrimary = uniqueBySlug(
    primaryHits.filter((h) => h.score >= 70),
    aliasMaps
  );
  if (weakPrimary.length === 1) {
    return {
      status: MATCHED_CANONICAL,
      canonicalSlug: weakPrimary[0].slug,
      match: weakPrimary[0],
      candidates: weakPrimary,
      reason: weakPrimary[0].reasons[0] || 'common-name-exact',
      catalogBroad: isBroadScientific(weakPrimary[0].scientific)
    };
  }
  if (weakPrimary.length > 1) {
    return {
      status: AMBIGUOUS,
      canonicalSlug: null,
      match: null,
      candidates: weakPrimary,
      reason: 'multiple-common-name-matches'
    };
  }

  const altParts = Array.isArray(result?.alternatives) ? result.alternatives : [];
  const altHits = [];
  for (const alt of altParts) {
    altHits.push(...matchQueryAgainstCatalog(queryFromResultPart(alt), catalogEntries, aliasMaps));
  }
  const altStrong = uniqueBySlug(
    altHits.filter((h) => h.score >= 80),
    aliasMaps
  );
  if (altStrong.length >= 1) {
    return {
      status: AMBIGUOUS,
      canonicalSlug: null,
      match: null,
      candidates: altStrong,
      reason: 'alternatives-require-choice'
    };
  }

  return {
    status: NO_SAFE_CANONICAL_MATCH,
    canonicalSlug: null,
    match: null,
    candidates: [],
    reason: 'outside-current-catalog'
  };
}

export function assertIdentifierAcquireActor(input = {}) {
  const actorUserId = asText(input.actorUserId);
  const gardenOwnerUserId = asText(input.gardenOwnerUserId);
  const activeGardenId = asText(input.activeGardenId);
  const targetGardenId = asText(input.targetGardenId);
  const serverAuthoritative = input.serverAuthoritative === true;
  const sessionPresent = input.sessionPresent === true || !!actorUserId;

  if (serverAuthoritative && !sessionPresent) {
    return { ok: false, reason: 'auth-expiry' };
  }
  if (actorUserId && gardenOwnerUserId && actorUserId !== gardenOwnerUserId) {
    return { ok: false, reason: 'cross-user-denied' };
  }
  if (activeGardenId && targetGardenId && activeGardenId !== targetGardenId) {
    return { ok: false, reason: 'wrong-active-garden' };
  }
  return { ok: true };
}

export function createIdentifierAcquireIdempotency(storage = null) {
  const mem = new Set();
  const keyOf = (token) => ID_STORAGE_PREFIX + asText(token);
  return {
    seen(token) {
      const t = asText(token);
      if (!t) return false;
      if (mem.has(t)) return true;
      try {
        return storage && typeof storage.getItem === 'function' && storage.getItem(keyOf(t)) === '1';
      } catch {
        return false;
      }
    },
    mark(token) {
      const t = asText(token);
      if (!t) return;
      mem.add(t);
      try {
        if (storage && typeof storage.setItem === 'function') storage.setItem(keyOf(t), '1');
      } catch {
        /* ignore quota / private mode */
      }
    }
  };
}

export function buildIdentifierCommitToken(result, canonicalSlug) {
  const img = asText(result?._img || result?.scanPhotoUrl);
  const slug = resolveIdentifierCanonicalSlug(canonicalSlug);
  const head = img.slice(0, 48);
  const tail = img.slice(-24);
  return `pi_${slug}_${img.length}_${slugifyIdentifierToken(head + tail) || 'scan'}`;
}

/**
 * Gate persistent Garden write. Never writes by itself.
 * Caller must call existing savePlantFromLibrary after ok && persist.
 */
export function confirmIdentifierGardenAcquire(input = {}) {
  const actor = assertIdentifierAcquireActor(input);
  if (!actor.ok) return { ...actor, persisted: false, duplicate: false };

  if (input.userConfirmed !== true) {
    return { ok: false, reason: 'confirmation-required', persisted: false, duplicate: false };
  }

  const aliasMaps = Object.assign(
    {},
    IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL,
    input.aliasMaps && typeof input.aliasMaps === 'object' ? input.aliasMaps : {}
  );
  const classified =
    input.classified && input.classified.status
      ? input.classified
      : classifyIdentifierCatalogMatch(input.result, input.catalog, { aliasMaps });

  let canonicalSlug = null;
  if (classified.status === MATCHED_CANONICAL) {
    canonicalSlug = classified.canonicalSlug;
  } else if (classified.status === AMBIGUOUS) {
    const chosen = resolveIdentifierCanonicalSlug(input.chosenSlug, aliasMaps);
    const allowed = new Set((classified.candidates || []).map((c) => resolveIdentifierCanonicalSlug(c.slug, aliasMaps)));
    if (!chosen || !allowed.has(chosen)) {
      return {
        ok: false,
        reason: 'ambiguous-choice-required',
        persisted: false,
        duplicate: false,
        classified
      };
    }
    canonicalSlug = chosen;
  } else {
    return {
      ok: false,
      reason: 'no-safe-canonical-match',
      persisted: false,
      duplicate: false,
      classified
    };
  }

  canonicalSlug = resolveIdentifierCanonicalSlug(canonicalSlug, aliasMaps);
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  const inCatalog = catalog.some((p) => resolveIdentifierCanonicalSlug(p.slug, aliasMaps) === canonicalSlug);
  if (!inCatalog) {
    return {
      ok: false,
      reason: 'no-safe-canonical-match',
      persisted: false,
      duplicate: false,
      classified
    };
  }

  const token = asText(input.commitToken) || buildIdentifierCommitToken(input.result, canonicalSlug);
  if (input.idempotency && typeof input.idempotency.seen === 'function' && input.idempotency.seen(token)) {
    return {
      ok: true,
      duplicate: true,
      persist: false,
      persisted: false,
      canonicalSlug,
      classified,
      commitToken: token
    };
  }

  return {
    ok: true,
    duplicate: false,
    persist: true,
    persisted: false,
    canonicalSlug,
    classified,
    commitToken: token,
    write: {
      canonicalSlug,
      source: IDENTIFIER_GARDEN_SOURCE,
      scanPersistence: IDENTIFIER_SCAN_PERSISTENCE,
      persistScanToGardenMedia: false,
      promoteScanToCatalog: false
    }
  };
}

export function attachObservationalScanToOwnedPlant(plant, scanDataUrl) {
  if (!plant || typeof plant !== 'object') return plant;
  const scan = asText(scanDataUrl);
  if (scan) plant.scanPhotoUrl = scan;
  return plant;
}

export function identifierScanIsCatalogMedia(plant) {
  if (!plant || typeof plant !== 'object') return false;
  const scan = asText(plant.scanPhotoUrl);
  const media = plant.catalogMedia || plant.media;
  if (!scan || !media || typeof media !== 'object') return false;
  const url = asText(media.primaryUrl || media.url);
  return !!url && url === scan;
}

const api = {
  IDENTIFIER_GARDEN_ACQUIRE_VERSION,
  MATCHED_CANONICAL,
  AMBIGUOUS,
  NO_SAFE_CANONICAL_MATCH,
  IDENTIFIER_SCAN_PERSISTENCE,
  IDENTIFIER_GARDEN_SOURCE,
  IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL,
  slugifyIdentifierToken,
  normalizeScientificName,
  resolveIdentifierCanonicalSlug,
  classifyIdentifierCatalogMatch,
  assertIdentifierAcquireActor,
  createIdentifierAcquireIdempotency,
  buildIdentifierCommitToken,
  confirmIdentifierGardenAcquire,
  attachObservationalScanToOwnedPlant,
  identifierScanIsCatalogMedia
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentifierGardenAcquire = api;
}
