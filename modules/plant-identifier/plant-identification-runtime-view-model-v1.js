function text(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePercent(value) {
  const n = numberOrNull(value);
  if (n == null) return null;
  if (n <= 1 && n >= 0) return Math.round(n * 100);
  if (n >= 0 && n <= 100) return Math.round(n);
  return null;
}

function careField(care, ...keys) {
  for (const key of keys) {
    const v = text(care?.[key]);
    if (v) return v;
  }
  return null;
}

export function buildPlantIdentificationRuntimeViewModel({
  identification = null,
  catalogMatch = null,
  catalogDisplay = null,
  gardenSuitability = null,
  gardenLocationContext = null,
  savedPlant = null,
} = {}) {
  const canonicalMatched =
    catalogMatch?.status === 'MATCHED_CANONICAL' &&
    !!text(catalogMatch?.canonicalSlug);

  const chosenSlug = text(
    catalogMatch?.canonicalSlug ??
    catalogDisplay?.slug ??
    savedPlant?.profile_slug
  );

  const commonName = text(
    catalogDisplay?.name ??
    identification?.common_name ??
    identification?.commonName
  );

  const scientificName = text(
    catalogDisplay?.scientific ??
    identification?.scientific_name ??
    identification?.scientificName
  );

  const confidence = normalizePercent(
    identification?.confidence ??
    identification?.confidence_score ??
    identification?.score
  );

  const rawCare =
    identification?.care && typeof identification.care === 'object'
      ? identification.care
      : {};

  const verifiedLocation =
    gardenLocationContext?.status === 'TRUSTED_CONFIRMED' &&
    gardenLocationContext?.useForSuitability === true;

  const suitabilityOk =
    verifiedLocation === true &&
    gardenSuitability?.ok === true;

  const survival = suitabilityOk
    ? normalizePercent(gardenSuitability?.survivalFit)
    : null;
  const thrive = suitabilityOk
    ? normalizePercent(gardenSuitability?.thriveFit)
    : null;

  const outcomes =
    suitabilityOk &&
    gardenSuitability?.outcomes &&
    typeof gardenSuitability.outcomes === 'object'
      ? gardenSuitability.outcomes
      : null;

  return Object.freeze({
    identity: Object.freeze({
      canonicalMatched,
      canonicalSlug: canonicalMatched ? chosenSlug : null,
      commonName,
      scientificName,
      confidence,
      imageUrl: text(catalogDisplay?.imageUrl),
      matchStatus: text(catalogMatch?.status) ?? 'NO_SAFE_CANONICAL_MATCH',
      canSaveCanonical: canonicalMatched && !!scientificName && !!commonName,
    }),

    care: Object.freeze({
      light: careField(rawCare, 'light', 'sun'),
      water: careField(rawCare, 'water'),
      soil: careField(rawCare, 'soil'),
      humidity: careField(rawCare, 'humidity'),
      temperature: careField(rawCare, 'temperature'),
      fertilizer: careField(rawCare, 'fertilizer'),
      pruning: careField(rawCare, 'pruning'),
      petSafety: careField(rawCare, 'petSafety', 'pet_safety', 'toxicity'),
    }),

    location: Object.freeze({
      trusted: verifiedLocation,
      label: verifiedLocation ? text(gardenLocationContext?.label) : null,
      lat: verifiedLocation ? numberOrNull(gardenLocationContext?.lat) : null,
      lon: verifiedLocation ? numberOrNull(gardenLocationContext?.lon) : null,
    }),

    suitability: Object.freeze({
      available: suitabilityOk,
      survival,
      thrive,
      flowering: suitabilityOk
        ? normalizePercent(gardenSuitability?.floweringFit)
        : null,
      fruiting: suitabilityOk
        ? normalizePercent(gardenSuitability?.fruitingFit)
        : null,
      score: suitabilityOk
        ? normalizePercent(gardenSuitability?.suitabilityScore)
        : null,
      recommendationLevel: suitabilityOk
        ? text(gardenSuitability?.recommendationLevel)
        : null,
      primaryLimiter: suitabilityOk
        ? text(gardenSuitability?.primaryLimiter)
        : null,
      warnings: suitabilityOk && Array.isArray(gardenSuitability?.warnings)
        ? Object.freeze(gardenSuitability.warnings.slice())
        : Object.freeze([]),
      outcomes,
    }),

    save: Object.freeze({
      saved: !!savedPlant?.id,
      plantId: text(savedPlant?.id),
      gardenProfileId: text(savedPlant?.garden_profile_id),
      healthStatus: text(savedPlant?.status),
      healthMark: text(savedPlant?.mark),
      canonicalSlug: text(savedPlant?.profile_slug),
    }),
  });
}

export function assertRuntimeViewModelHasNoFabricatedTruth(vm) {
  if (!vm || typeof vm !== 'object') {
    throw new Error('plant_identification_runtime_view_model_required');
  }

  if (!vm.location?.trusted && vm.suitability?.available) {
    throw new Error('untrusted_location_must_not_have_suitability');
  }

  if (!vm.identity?.canonicalMatched && vm.identity?.canSaveCanonical) {
    throw new Error('unmatched_identity_must_not_be_saveable');
  }

  if (vm.save?.saved) {
    if (!vm.save.plantId || !vm.save.gardenProfileId) {
      throw new Error('saved_plant_requires_server_identity');
    }
    if (vm.save.healthStatus === 'Healthy' && vm.save.healthMark === '✓') {
      // This pair is legal only if it actually came from the saved row.
      // The builder never synthesizes it.
    }
  }

  return true;
}

const api = Object.freeze({
  buildPlantIdentificationRuntimeViewModel,
  assertRuntimeViewModelHasNoFabricatedTruth,
});

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentificationRuntimeViewModel = api;
}

export default api;
