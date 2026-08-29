/**
 * Garden location granularity — general precision gate for climate authority.
 * Country / continent / state-province centroids are not Garden climate truth.
 * Ambiguous multi-hit queries must not silently bind to an unrelated namesake city.
 */

/** Open-Meteo / GeoNames-style codes too coarse for one Garden climate. */
export const TOO_BROAD_FEATURE_CODES = Object.freeze([
  'CONT', // continent
  'PCLI', // independent political entity (country)
  'PCLD', // dependent political entity
  'PCLF', // freely associated state
  'PCLS', // semi-independent political entity
  'PCLIX',
  'PCL',
  'ADM1', // first-order admin (state / province / region)
  'RGN', // region
  'AREA'
]);

/** Populated-place GeoNames feature codes (city / town / capital / locality). */
export const POPULATED_PLACE_FEATURE_PREFIX = 'PPL';

export const NEEDS_MORE_SPECIFIC_LOCATION = 'NEEDS MORE SPECIFIC LOCATION';
export const NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE =
  'That location is too broad for a reliable Garden climate. Enter a city, town, or locality.';

export const LOCATION_NEEDS_CONFIRMATION = 'LOCATION_NEEDS_CONFIRMATION';
export const LOCATION_NEEDS_CONFIRMATION_MESSAGE =
  'That location name matches several places. Choose a more specific city, town, or locality, or confirm the intended Garden.';

function cleanText(value) {
  return String(value || '').trim();
}

function featureCodeOf(loc) {
  return cleanText(loc?.feature_code || loc?.featureCode || loc?.featureCodeName || '').toUpperCase();
}

function nameOf(loc) {
  return cleanText(loc?.name || '');
}

function countryOf(loc) {
  return cleanText(loc?.country || '');
}

function admin1Of(loc) {
  return cleanText(loc?.admin1 || loc?.admin || loc?.state || '');
}

function localityKey(loc) {
  return `${countryOf(loc).toLowerCase()}|${admin1Of(loc).toLowerCase()}|${Number(loc?.lat).toFixed(3)}|${Number(loc?.lon).toFixed(3)}`;
}

export function isPopulatedPlaceFeatureCode(featureCode) {
  const fc = cleanText(featureCode).toUpperCase();
  return fc.startsWith(POPULATED_PLACE_FEATURE_PREFIX);
}

/**
 * City-state / capital locality where place name equals country name
 * (e.g. Singapore PPLC). Uses standard feature metadata only — no place lists.
 */
export function isCityStateOrCapitalLocality(loc) {
  if (!loc || typeof loc !== 'object') return false;
  const name = nameOf(loc).toLowerCase();
  const country = countryOf(loc).toLowerCase();
  if (!name || !country || name !== country) return false;
  const fc = featureCodeOf(loc);
  // PPLC = capital of a political entity; PPLA = seat of a first-order admin.
  // City-states commonly resolve as PPLC with name === country.
  return fc === 'PPLC' || fc === 'PPLA';
}

/**
 * True when resolver metadata indicates country / continent / state-province (or equivalent).
 * Uses feature codes, Nominatim class/type/addresstype, and coarse label heuristics.
 * Legitimate city-state capitals (name === country + PPLC/PPLA) are not too broad.
 */
export function isTooBroadForGardenClimate(loc) {
  if (!loc || typeof loc !== 'object') return true;

  const featureCode = featureCodeOf(loc);
  if (featureCode && TOO_BROAD_FEATURE_CODES.includes(featureCode)) return true;
  if (featureCode.startsWith('PCL') && featureCode !== 'PCLK') return true;
  if (featureCode === 'ADM1') return true;

  const addresstype = cleanText(loc.addresstype || loc.addressType || '').toLowerCase();
  if (
    ['country', 'continent', 'state', 'province', 'region', 'state_district'].includes(
      addresstype
    )
  ) {
    return true;
  }

  const osmClass = cleanText(loc.class || loc.osm_key || '').toLowerCase();
  const osmType = cleanText(loc.type || loc.osm_value || loc.resultType || '').toLowerCase();
  if (osmClass === 'boundary' && ['administrative', 'country', 'region'].includes(osmType)) {
    const name = nameOf(loc).toLowerCase();
    const country = countryOf(loc).toLowerCase();
    if (!name || name === country || osmType === 'country') return true;
    if (addresstype === 'state' || addresstype === 'province') return true;
  }
  if (osmType === 'country' || osmType === 'continent') return true;

  const name = nameOf(loc).toLowerCase();
  const label = cleanText(loc.label || '').toLowerCase();
  const country = countryOf(loc).toLowerCase();

  // "Brazil, Brazil" / name equals country — reject unless city-state capital locality
  if (country && name && name === country) {
    if (isCityStateOrCapitalLocality(loc)) return false;
    return true;
  }
  if (label && country && (label === country || label === `${country}, ${country}`)) {
    if (isCityStateOrCapitalLocality(loc)) return false;
    return true;
  }

  const parts = label
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[1]) {
    if (isCityStateOrCapitalLocality(loc)) return false;
    return true;
  }

  return false;
}

/**
 * Gate for accepting a resolved location as Garden climate authority.
 * Optional `query` + `candidates` enable ambiguity / country-intent checks.
 * @returns {{ ok: true } | { ok: false, reason: string, message: string, code?: string, candidates?: object[] }}
 */
export function mayAcceptResolvedLocationForGardenClimate(loc, options = {}) {
  if (!loc || typeof loc !== 'object') {
    return {
      ok: false,
      reason: 'unresolved',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE
    };
  }
  const lat = Number(loc.lat ?? loc.latitude);
  const lon = Number(loc.lon ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      ok: false,
      reason: 'missing-coordinates',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE
    };
  }

  const query = cleanText(options.query || '');
  const candidates = Array.isArray(options.candidates) ? options.candidates : null;
  if (query && candidates && candidates.length) {
    const resolved = resolveGardenLocationFromCandidates(candidates, query);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: resolved.reason,
        message: resolved.message,
        code: resolved.code,
        candidates: resolved.candidates
      };
    }
    // Accept only when the proposed loc matches the confident pick
    const pick = resolved.location;
    const same =
      Math.abs(Number(pick.lat) - lat) < 0.05 && Math.abs(Number(pick.lon) - lon) < 0.05;
    if (!same) {
      return {
        ok: false,
        reason: 'ambiguous-mismatch',
        message: LOCATION_NEEDS_CONFIRMATION_MESSAGE,
        code: LOCATION_NEEDS_CONFIRMATION,
        candidates: resolved.candidates || candidates.slice(0, 6)
      };
    }
  }

  if (isTooBroadForGardenClimate(loc)) {
    return {
      ok: false,
      reason: 'too-broad',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION
    };
  }
  return { ok: true };
}

/**
 * Select a Garden locality from a geocode candidate pool.
 * Never silently binds country/state intent to an unrelated namesake city.
 * Never silently chooses among multi-admin exact-name city hits.
 * Comma-qualified queries (e.g. "Kochi, India") narrow by country/admin tokens.
 */
export function resolveGardenLocationFromCandidates(results, query) {
  const raw = cleanText(query);
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const q = (parts[0] || raw).toLowerCase();
  const qualifiers = parts.slice(1).map((p) => p.toLowerCase());
  const pool = (Array.isArray(results) ? results : []).filter(
    (r) =>
      r &&
      Number.isFinite(Number(r.lat ?? r.latitude)) &&
      Number.isFinite(Number(r.lon ?? r.longitude))
  );

  if (!q || !pool.length) {
    return {
      ok: false,
      reason: 'unresolved',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION
    };
  }

  const normalized = pool.map((r) => ({
    ...r,
    lat: Number(r.lat ?? r.latitude),
    lon: Number(r.lon ?? r.longitude),
    name: nameOf(r) || cleanText(String(r.label || '').split(',')[0]),
    country: countryOf(r),
    admin1: admin1Of(r),
    feature_code: featureCodeOf(r) || r.feature_code || '',
    label:
      cleanText(r.label) ||
      [nameOf(r), admin1Of(r), countryOf(r)].filter(Boolean).join(', ')
  }));

  const exactName = (r) => cleanText(r.name).toLowerCase() === q;
  const matchesQualifiers = (r) => {
    if (!qualifiers.length) return true;
    const hay = `${r.country} ${r.admin1} ${r.label}`.toLowerCase();
    return qualifiers.every((f) => hay.includes(f));
  };

  const broadExact = normalized.filter((r) => exactName(r) && isTooBroadForGardenClimate(r));
  let preciseExact = normalized.filter((r) => exactName(r) && !isTooBroadForGardenClimate(r));
  if (qualifiers.length) {
    const narrowed = preciseExact.filter(matchesQualifiers);
    if (narrowed.length) preciseExact = narrowed;
  }

  // Prefer city-state / capital locality (Singapore PPLC) over country PCLI and namesakes.
  const cityStateExact = preciseExact.find((r) => isCityStateOrCapitalLocality(r));
  if (cityStateExact) {
    return { ok: true, location: cityStateExact, confidence: 'high', reason: 'city-state-capital' };
  }

  // Country / state / region intent present in pool → do not bind to namesake city.
  // When query is qualified to a city, ignore unmatched broad hits.
  const broadRelevant = qualifiers.length
    ? broadExact.filter(matchesQualifiers)
    : broadExact;
  if (broadRelevant.length > 0 && preciseExact.length === 0) {
    return {
      ok: false,
      reason: 'too-broad',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION,
      candidates: broadRelevant.slice(0, 4)
    };
  }
  if (!qualifiers.length && broadExact.length > 0) {
    return {
      ok: false,
      reason: 'too-broad',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION,
      candidates: broadExact.slice(0, 4)
    };
  }

  // Multiple exact-name localities in different countries/admin1 → confirmation required.
  if (preciseExact.length > 1) {
    const localityKeys = new Set(
      preciseExact.map((r) => `${countryOf(r).toLowerCase()}|${admin1Of(r).toLowerCase()}`)
    );
    if (localityKeys.size > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        message: LOCATION_NEEDS_CONFIRMATION_MESSAGE,
        code: LOCATION_NEEDS_CONFIRMATION,
        candidates: preciseExact.slice(0, 6)
      };
    }
  }

  if (preciseExact.length === 1) {
    return { ok: true, location: preciseExact[0], confidence: 'high', reason: 'unique-exact' };
  }

  // Rank remaining non-broad hits (fuzzy / partial). Still refuse multi-locality ties.
  let precise = normalized.filter((r) => !isTooBroadForGardenClimate(r));
  if (qualifiers.length) {
    const narrowed = precise.filter(matchesQualifiers);
    if (narrowed.length) precise = narrowed;
  }
  if (!precise.length) {
    return {
      ok: false,
      reason: 'too-broad',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION
    };
  }

  const score = (r) => {
    const name = cleanText(r.name).toLowerCase();
    const label = cleanText(r.label || '').toLowerCase();
    if (name === q) return 100;
    if (label.startsWith(q) || label.includes(q)) return 60;
    if (isCityStateOrCapitalLocality(r)) return 90;
    return 10;
  };

  const ranked = [...precise].sort((a, b) => score(b) - score(a));
  const topScore = score(ranked[0]);
  const topTier = ranked.filter((r) => score(r) === topScore);
  if (topTier.length > 1) {
    const keys = new Set(
      topTier.map((r) => `${countryOf(r).toLowerCase()}|${admin1Of(r).toLowerCase()}`)
    );
    if (keys.size > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        message: LOCATION_NEEDS_CONFIRMATION_MESSAGE,
        code: LOCATION_NEEDS_CONFIRMATION,
        candidates: topTier.slice(0, 6)
      };
    }
  }

  return {
    ok: true,
    location: ranked[0],
    confidence: topScore >= 100 ? 'high' : 'medium',
    reason: 'ranked'
  };
}

/** @deprecated prefer resolveGardenLocationFromCandidates */
export function pickBestGeocodeResult(results, query) {
  const resolved = resolveGardenLocationFromCandidates(results, query);
  return resolved.ok ? resolved.location : null;
}
