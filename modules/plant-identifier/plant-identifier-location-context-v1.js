/**
 * Plant Identifier location context V1.
 *
 * Reuses CRUVIT Global Location Foundation / active Garden location.
 * Does not create a second location system or Identifier climate engine.
 * Trusted confirmed coordinates may be used for existing suitability.
 * Untrusted / default / missing coordinates must not be used silently.
 * Coordinates are never fabricated.
 */
export const IDENTIFIER_LOCATION_CONTEXT_VERSION = '1.0.0';

export const TRUSTED_CONFIRMED = 'TRUSTED_CONFIRMED';
export const UNTRUSTED_NEEDS_CONFIRMATION = 'UNTRUSTED_NEEDS_CONFIRMATION';
export const LOCATION_MISSING = 'LOCATION_MISSING';

export const IDENTIFIER_SUITABILITY_ENGINE = 'smartRecEvaluateSuitability';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isDefaultSource(source) {
  return asText(source).toLowerCase() === 'default';
}

/**
 * Classify host Garden / Global Location for Identifier suitability.
 * Identifier must not invent trust: `trusted` comes from hasTrustedAppLocation().
 */
export function classifyIdentifierGardenLocationContext(input = {}) {
  const label = asText(input.label);
  const source = asText(input.source);
  const confirmationStatus = asText(input.confirmationStatus).toLowerCase();
  const locationConfidence = asText(input.locationConfidence).toLowerCase();
  const gardenProfileId = input.gardenProfileId ? asText(input.gardenProfileId) : '';
  const climateAuthority = asText(input.climateAuthority) || null;
  const incomingLat = finiteCoord(input.lat);
  const incomingLon = finiteCoord(input.lon);
  const hasCoords = incomingLat != null && incomingLon != null;
  const trusted = input.trusted === true;

  const base = {
    gardenProfileId: gardenProfileId || null,
    climateAuthority,
    locationConfidence: locationConfidence || null,
    confirmationStatus: confirmationStatus || null,
    source: source || null,
    label: label || '',
    engine: IDENTIFIER_SUITABILITY_ENGINE
  };

  if (isDefaultSource(source) || locationConfidence === 'default') {
    return Object.assign({}, base, {
      status: UNTRUSTED_NEEDS_CONFIRMATION,
      askForLocation: true,
      useForSuitability: false,
      lat: null,
      lon: null,
      reason: 'default-untrusted'
    });
  }

  if (!trusted || confirmationStatus !== 'confirmed') {
    const present = !!(label || hasCoords);
    return Object.assign({}, base, {
      status: present ? UNTRUSTED_NEEDS_CONFIRMATION : LOCATION_MISSING,
      askForLocation: true,
      useForSuitability: false,
      lat: null,
      lon: null,
      reason: present ? 'untrusted-or-unconfirmed' : 'location-missing'
    });
  }

  if (!hasCoords) {
    return Object.assign({}, base, {
      status: LOCATION_MISSING,
      askForLocation: true,
      useForSuitability: false,
      lat: null,
      lon: null,
      reason: 'confirmed-without-coordinates'
    });
  }

  return Object.assign({}, base, {
    status: TRUSTED_CONFIRMED,
    askForLocation: false,
    useForSuitability: true,
    lat: incomingLat,
    lon: incomingLon,
    reason: 'trusted-confirmed'
  });
}

export function identifierShouldShowAddLocationCopy(classified, options = {}) {
  if (options.climateOverride) return false;
  if (classified?.status === TRUSTED_CONFIRMED) return false;
  if (classified?.askForLocation === false) return false;
  if (classified?.useForSuitability) return false;
  return true;
}

export function identifierShouldShowLocationEntry(classified, options = {}) {
  if (options.climateOverride) return true;
  if (classified?.status === TRUSTED_CONFIRMED && !options.climateOverride) return false;
  return classified?.askForLocation !== false;
}

export function identifierClimateUiMode(classified, evaluation, options = {}) {
  if (options.climateOverride) return 'ask-location';
  if (evaluation?.ok && classified?.useForSuitability) return 'garden-suitability';
  if (classified?.status === TRUSTED_CONFIRMED) return 'location-ready';
  return 'ask-location';
}

/**
 * Attach host suitability. Does not score climate itself.
 * evaluation.engine must remain the existing canonical engine name.
 */
export function applyIdentifierGardenSuitability(result, classified, evaluation) {
  if (!result || typeof result !== 'object') return result;
  result._gardenLocationContext = classified || null;
  if (!classified || classified.useForSuitability !== true) {
    result._gardenSuitability = null;
    return result;
  }
  if (!evaluation || typeof evaluation !== 'object') {
    result._gardenSuitability = {
      ok: false,
      reason: 'await-evaluation',
      askForLocation: false,
      engine: IDENTIFIER_SUITABILITY_ENGINE,
      paidAiCalls: 0,
      locationLabel: classified.label || '',
      gardenProfileId: classified.gardenProfileId || null,
      lat: classified.lat,
      lon: classified.lon
    };
    return result;
  }
  result._gardenSuitability = Object.assign(
    {
      engine: IDENTIFIER_SUITABILITY_ENGINE,
      paidAiCalls: 0,
      askForLocation: false,
      locationLabel: classified.label || '',
      gardenProfileId: classified.gardenProfileId || null,
      lat: classified.lat,
      lon: classified.lon,
      climateAuthority: classified.climateAuthority || null
    },
    evaluation,
    {
      engine: evaluation.engine || IDENTIFIER_SUITABILITY_ENGINE,
      paidAiCalls: Number(evaluation.paidAiCalls) || 0,
      askForLocation: false
    }
  );
  return result;
}

export function identifierSuitabilityViewModel(evaluation) {
  const ev = evaluation && typeof evaluation === 'object' ? evaluation : {};
  const outcomes = ev.outcomes && typeof ev.outcomes === 'object' ? ev.outcomes : null;
  return {
    showCollapsedScore: false,
    engine: ev.engine || IDENTIFIER_SUITABILITY_ENGINE,
    ok: ev.ok === true,
    locationLabel: asText(ev.locationLabel),
    gardenProfileId: ev.gardenProfileId || null,
    outcomes: outcomes
      ? {
          survival: asText(outcomes.survival) || 'UNKNOWN',
          growth: asText(outcomes.growth) || 'UNKNOWN',
          flowering: asText(outcomes.flowering) || 'UNKNOWN',
          fruiting: asText(outcomes.fruiting) || 'UNKNOWN'
        }
      : null,
    primaryLimiter: asText(ev.primaryLimiter),
    warnings: Array.isArray(ev.warnings) ? ev.warnings.slice() : [],
    recommendationLevel: asText(ev.recommendationLevel),
    survivalFit: ev.survivalFit,
    thriveFit: ev.thriveFit,
    floweringFit: ev.floweringFit,
    fruitingFit: ev.fruitingFit
  };
}

const api = {
  IDENTIFIER_LOCATION_CONTEXT_VERSION,
  TRUSTED_CONFIRMED,
  UNTRUSTED_NEEDS_CONFIRMATION,
  LOCATION_MISSING,
  IDENTIFIER_SUITABILITY_ENGINE,
  classifyIdentifierGardenLocationContext,
  identifierShouldShowAddLocationCopy,
  identifierShouldShowLocationEntry,
  identifierClimateUiMode,
  applyIdentifierGardenSuitability,
  identifierSuitabilityViewModel
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentifierLocationContext = api;
}
