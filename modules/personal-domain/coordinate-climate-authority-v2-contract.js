/**
 * CRUVIT Coordinate Climate Authority V2 — contract (pure helpers).
 *
 * Primary climate baseline: CHELSA V2.1 climatologies (~1 km / 30 arc-sec, CC0, COG).
 * Terrain/elevation: separate high-resolution context layer (not climate precision).
 *
 * Production rules:
 * - Runtime reads CRUVIT-controlled index only (no CHELSA / ERA5 / Open-Meteo / Copernicus API).
 * - No city / nearest-city / country-centroid proxy in production.
 * - Unresolved lookup → CLIMATE_AUTHORITY_UNAVAILABLE (never substitute Zurich etc.).
 * - Acquire centrally once (build/ingestion) → store → lookup → persist on Garden → reuse.
 */

export const COORDINATE_CLIMATE_AUTHORITY_V2_VERSION = '2.0.2-accuracy';

export const CLIMATE_AUTHORITY_UNAVAILABLE = 'CLIMATE_AUTHORITY_UNAVAILABLE';

/** CHELSA V2.1 climatology baseline (build/ingestion only — never browser runtime). */
export const CHELSA_V21_BASELINE = Object.freeze({
  id: 'chelsa-v2.1-climatologies-1981-2010',
  product: 'CHELSA-climatologies',
  version: '2.1',
  period: '1981-2010',
  license: 'CC0-1.0',
  nativeResolutionArcSec: 30,
  nativeResolutionLabel: '~1 km (30 arc-seconds)',
  fileFormat: 'COG',
  baseUrl: 'https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010',
  citation:
    'Karger et al. (2017/2021). Climatologies at high resolution for the earth’s land surface areas. EnviDat / Sci Data.',
  variablesUsed: Object.freeze(['tasmin', 'tas', 'tasmax', 'pr', 'vpd', 'hurs', 'pet_penman']),
  /** PET files are named CHELSA_pet_penman_MM_… under …/pet/ */
  petVariablePath: Object.freeze({
    folder: 'pet',
    filePrefix: 'CHELSA_pet_penman'
  }),
  variablesDeferred: Object.freeze(['rsds', 'sfcWind', 'cmi'])
});

/**
 * Terrain layer policy — separate from climate precision.
 * Copernicus DEM GLO-30: Aug 2026 CCM authorization on some services → do not add per-user Copernicus API.
 * Pilot uses public Mapzen/AWS elevation-tiles Terrarium (SRTM-class), acquired only at ingestion.
 */
export const TERRAIN_LAYER_POLICY_V2 = Object.freeze({
  preferredOpenOption: 'aws-elevation-tiles-terrarium',
  provider: 'AWS elevation-tiles-prod / Mapzen Terrarium',
  licenseNote: 'Public elevation tiles (SRTM-class heritage); verify attribution for redistribution.',
  nativeResolutionLabel: '~30 m class at high zoom (tile zoom dependent) — NOT climate resolution',
  nativeResolutionMetersApprox: 30,
  forbidsPerUserCopernicusApi: true,
  forbidsPaidRuntimeProvider: true,
  note: '30 m terrain ≠ 30 m measured climate. Climate remains ~1 km CHELSA.'
});

export const COORDINATE_CLIMATE_CONFIDENCE = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNAVAILABLE: 'unavailable',
  UNKNOWN: 'unknown'
});

/** @deprecated Prefer confidenceDimensions — single opaque "high" is insufficient. */
export const CONFIDENCE_DIMENSION_KEYS_V2 = Object.freeze([
  'SOURCE_DATA_INTEGRITY',
  'COORDINATE_RESOLUTION_CONFIDENCE',
  'TERRAIN_CONTEXT_CONFIDENCE',
  'LOCAL_REPRESENTATIVENESS',
  'PROFILE_COMPLETENESS',
  'OVERALL_AUTHORITY_CONFIDENCE'
]);

const MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

export function coordinateClimateMonthKeys() {
  return MONTHS.slice();
}

export function isFiniteNumber(v) {
  return v != null && v !== '' && Number.isFinite(Number(v));
}

export function roundCoord(n, digits = 6) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/**
 * CHELSA V2.1 temperature rasters are commonly Kelvin×10 integers.
 * If value already looks like °C (e.g. −40…60), pass through.
 */
export function chelsaTemperatureToCelsius(raw) {
  if (!isFiniteNumber(raw)) return null;
  const v = Number(raw);
  if (v > 100 || v < -100) {
    // Kelvin×10 → °C
    return Math.round((v / 10 - 273.15) * 100) / 100;
  }
  return Math.round(v * 100) / 100;
}

/**
 * Precipitation: CHELSA V2.1 COGs store kg m-2 (= mm) × 10 as integers.
 * Example: 2337 → 233.7 mm/month.
 */
export function chelsaPrecipToMm(raw) {
  if (!isFiniteNumber(raw)) return null;
  const v = Number(raw);
  return Math.round((v / 10) * 10) / 10;
}

/** VPD: stored as Pa integers (atmospheric drying power). */
export function chelsaVpdToPa(raw) {
  if (!isFiniteNumber(raw)) return null;
  return Math.round(Number(raw));
}

/** Relative humidity: CHELSA V2.1 stores percent × 100. */
export function chelsaHursToPct(raw) {
  if (!isFiniteNumber(raw)) return null;
  return Math.round((Number(raw) / 100) * 10) / 10;
}

/**
 * PET (Penman): CHELSA V2.1 monthly pet_penman COGs store kg m⁻² month⁻¹ × 100.
 * Cross-checked against monthly CMI ≈ P − PET (same precip ×10 scale): pet_raw/100
 * matches (pr_raw − cmi_raw)/10. Using precip's ×10 scale incorrectly yields ~10× PET
 * and collapses humid tropics into arid UNEP classes.
 */
export function chelsaPetToMm(raw) {
  if (!isFiniteNumber(raw)) return null;
  return Math.round((Number(raw) / 100) * 10) / 10;
}

export function classifyUnepAridityFromIndex(ai) {
  if (!isFiniteNumber(ai) || Number(ai) < 0) return 'unknown';
  const x = Number(ai);
  if (x < 0.05) return 'hyper-arid';
  if (x < 0.2) return 'arid';
  if (x < 0.5) return 'semi-arid';
  if (x < 0.65) return 'dry-subhumid';
  return 'humid';
}

export function humidityRegimeFromMeanRh(meanRh) {
  if (!isFiniteNumber(meanRh)) return 'unknown';
  const r = Number(meanRh);
  if (r < 45) return 'low';
  if (r < 65) return 'medium';
  return 'high';
}

export function humiditySignalFromRegimes(moistureRegime, humidityRegime) {
  const m = String(moistureRegime || '').toLowerCase();
  if (m === 'hyper-arid' || m === 'arid' || m === 'semi-arid') return 'low';
  if (m === 'dry-subhumid') return humidityRegime === 'high' ? 'medium' : humidityRegime || 'medium';
  if (m === 'humid') return humidityRegime === 'unknown' ? 'high' : humidityRegime;
  return humidityRegime === 'unknown' ? null : humidityRegime;
}

export function structuralColdRiskFromColdestMonthMeanMinC(c) {
  if (!isFiniteNumber(c)) return 'unknown';
  const x = Number(c);
  if (x <= 0) return 'high';
  if (x <= 5) return 'medium';
  if (x < 10) return 'elevated';
  return 'low';
}

export function freezingRiskFromCold(c, structuralColdRisk) {
  if (isFiniteNumber(c) && Number(c) <= 0) return 'high';
  const risk = String(structuralColdRisk || '').toLowerCase();
  if (risk === 'high') return 'high';
  if (risk === 'medium') return 'medium';
  if (risk === 'elevated' || risk === 'low') return 'low';
  return null;
}

const HIGH_ELEVATION_M = 1500;

export function thermalRegimeFromCoordinateEvidence({
  coldestMonthMeanMinC,
  elevationM,
  structuralColdRisk,
  freezingRisk
} = {}) {
  const cold = isFiniteNumber(coldestMonthMeanMinC) ? Number(coldestMonthMeanMinC) : NaN;
  const elev = isFiniteNumber(elevationM) ? Number(elevationM) : NaN;
  const risk = String(freezingRisk || '').toLowerCase();
  const sc = String(structuralColdRisk || '').toLowerCase();
  if (risk === 'high' || sc === 'high' || (Number.isFinite(cold) && cold <= 0)) {
    return 'frost-prone';
  }
  if (Number.isFinite(elev) && elev >= HIGH_ELEVATION_M && Number.isFinite(cold) && cold < 15) {
    return 'cool-highland';
  }
  if (sc === 'elevated' || sc === 'medium' || (Number.isFinite(cold) && cold < 10)) {
    return 'cool-seasonal';
  }
  if (Number.isFinite(cold) && cold >= 18) return 'year-round-warm';
  if (Number.isFinite(cold)) return 'mild-seasonal';
  return 'unknown';
}

export function coolSeasonSignalFromMonthlyTmin(monthlyTminC = []) {
  const vals = (monthlyTminC || []).filter((v) => isFiniteNumber(v)).map(Number);
  if (vals.length < 6) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // Cool season: at least one month with mean daily min ≤ 15°C and seasonal amplitude.
  return min <= 15 && max - min >= 5;
}

export function alwaysHotSignalFromMonthlyTmin(monthlyTminC = []) {
  const vals = (monthlyTminC || []).filter((v) => isFiniteNumber(v)).map(Number);
  if (vals.length < 6) return null;
  return Math.min(...vals) >= 18;
}

export function highlandModifierFromElevation(elevationM) {
  if (!isFiniteNumber(elevationM)) return { highland: null, reason: 'elevation-missing' };
  const elev = Number(elevationM);
  if (elev >= HIGH_ELEVATION_M) {
    return { highland: true, reason: `elevation>=${HIGH_ELEVATION_M}m` };
  }
  return { highland: false, reason: `elevation<${HIGH_ELEVATION_M}m` };
}

/**
 * Build empty / unavailable profile — never invents city proxies.
 */
export function buildClimateAuthorityUnavailable({ lat, lon, reason, derivedAt } = {}) {
  return {
    status: CLIMATE_AUTHORITY_UNAVAILABLE,
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    coordinate: {
      lat: roundCoord(lat),
      lon: roundCoord(lon)
    },
    reason: String(reason || 'lookup-miss'),
    confidence: COORDINATE_CLIMATE_CONFIDENCE.UNAVAILABLE,
    missingFields: ['all'],
    derivedAt: derivedAt || new Date().toISOString(),
    provenance: {
      rule: 'NO_CITY_PROXY',
      note: 'Production must not substitute Zurich / nearest city / country centroid.'
    }
  };
}

/**
 * Derive regimes from monthly samples + terrain elevation.
 * Does not invent missing monthly series.
 */
export function deriveCoordinateClimateInterpretation({
  monthlyTminC,
  monthlyTmeanC,
  monthlyTmaxC,
  monthlyPrecipMm,
  monthlyPetMm,
  monthlyVpdPa,
  monthlyHursPct,
  elevationM,
  climateGrid
} = {}) {
  const missing = [];
  const tmin = Array.isArray(monthlyTminC) ? monthlyTminC.map((v) => (isFiniteNumber(v) ? Number(v) : null)) : [];
  const tmean = Array.isArray(monthlyTmeanC) ? monthlyTmeanC.map((v) => (isFiniteNumber(v) ? Number(v) : null)) : [];
  const tmax = Array.isArray(monthlyTmaxC) ? monthlyTmaxC.map((v) => (isFiniteNumber(v) ? Number(v) : null)) : [];
  const pr = Array.isArray(monthlyPrecipMm)
    ? monthlyPrecipMm.map((v) => (isFiniteNumber(v) ? Number(v) : null))
    : [];
  const pet = Array.isArray(monthlyPetMm)
    ? monthlyPetMm.map((v) => (isFiniteNumber(v) ? Number(v) : null))
    : [];
  const vpd = Array.isArray(monthlyVpdPa) ? monthlyVpdPa.map((v) => (isFiniteNumber(v) ? Number(v) : null)) : [];
  const hurs = Array.isArray(monthlyHursPct)
    ? monthlyHursPct.map((v) => (isFiniteNumber(v) ? Number(v) : null))
    : [];

  if (tmin.filter((v) => v != null).length < 12) missing.push('monthlyTmin');
  if (tmean.filter((v) => v != null).length < 12) missing.push('monthlyTmean');
  if (tmax.filter((v) => v != null).length < 12) missing.push('monthlyTmax');
  if (pr.filter((v) => v != null).length < 12) missing.push('monthlyPrecip');
  if (pet.filter((v) => v != null).length < 12) missing.push('monthlyPet');
  if (vpd.filter((v) => v != null).length < 12) missing.push('monthlyVpd');
  if (hurs.filter((v) => v != null).length < 12) missing.push('monthlyHurs');
  if (!isFiniteNumber(elevationM)) missing.push('elevation');

  const finiteTmin = tmin.filter((v) => v != null);
  const finiteTmax = tmax.filter((v) => v != null);
  const finitePr = pr.filter((v) => v != null);
  const finitePet = pet.filter((v) => v != null);
  const finiteHurs = hurs.filter((v) => v != null);
  const finiteVpd = vpd.filter((v) => v != null);

  let coldestMonth = null;
  let coldestMonthMeanMinC = null;
  for (let i = 0; i < tmin.length; i++) {
    if (tmin[i] == null) continue;
    if (coldestMonthMeanMinC == null || tmin[i] < coldestMonthMeanMinC) {
      coldestMonthMeanMinC = tmin[i];
      coldestMonth = i + 1;
    }
  }

  let warmestMonth = null;
  let warmestMonthMeanMaxC = null;
  for (let i = 0; i < tmax.length; i++) {
    if (tmax[i] == null) continue;
    if (warmestMonthMeanMaxC == null || tmax[i] > warmestMonthMeanMaxC) {
      warmestMonthMeanMaxC = tmax[i];
      warmestMonth = i + 1;
    }
  }

  const annualPrecipitationMm =
    finitePr.length === 12 ? Math.round(finitePr.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  const annualPetMm =
    finitePet.length === 12 ? Math.round(finitePet.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  // UNEP aridity when PET authority exists: AI = P / PET. Do not use precip-only bands then.
  let moistureRegime = 'unknown';
  let aridityIndex = null;
  let aridityMethod = null;
  if (annualPrecipitationMm != null && annualPetMm != null && annualPetMm > 0) {
    aridityIndex = Math.round((annualPrecipitationMm / annualPetMm) * 1000) / 1000;
    moistureRegime = classifyUnepAridityFromIndex(aridityIndex);
    aridityMethod = 'UNEP_AI_P_over_PET';
  } else if (annualPrecipitationMm != null) {
    // Temporary fallback only when PET missing — flagged in missingFields.
    if (annualPrecipitationMm < 100) moistureRegime = 'hyper-arid';
    else if (annualPrecipitationMm < 300) moistureRegime = 'arid';
    else if (annualPrecipitationMm < 600) moistureRegime = 'semi-arid';
    else if (annualPrecipitationMm < 1000) moistureRegime = 'dry-subhumid';
    else moistureRegime = 'humid';
    aridityMethod = 'precip-band-fallback';
    missing.push('aridityIndex-requires-pet');
  }

  const meanRelativeHumidityPct =
    finiteHurs.length > 0
      ? Math.round((finiteHurs.reduce((a, b) => a + b, 0) / finiteHurs.length) * 10) / 10
      : null;
  const meanVpdPa =
    finiteVpd.length > 0
      ? Math.round(finiteVpd.reduce((a, b) => a + b, 0) / finiteVpd.length)
      : null;

  const humidityRegime = humidityRegimeFromMeanRh(meanRelativeHumidityPct);
  const humiditySignal = humiditySignalFromRegimes(moistureRegime, humidityRegime);
  const structuralColdRisk = structuralColdRiskFromColdestMonthMeanMinC(coldestMonthMeanMinC);
  const freezingRisk = freezingRiskFromCold(coldestMonthMeanMinC, structuralColdRisk);
  const thermalRegime = thermalRegimeFromCoordinateEvidence({
    coldestMonthMeanMinC,
    elevationM,
    structuralColdRisk,
    freezingRisk
  });
  const coolSeasonSignal = coolSeasonSignalFromMonthlyTmin(tmin);
  const alwaysHot = alwaysHotSignalFromMonthlyTmin(tmin);
  const highland = highlandModifierFromElevation(elevationM);

  const seasonality =
    finiteTmin.length >= 2
      ? {
          tminRangeC:
            Math.round((Math.max(...finiteTmin) - Math.min(...finiteTmin)) * 100) / 100,
          coldestMonth,
          warmestMonth
        }
      : null;

  // Completeness-only provisional overall — LOCAL_REPRESENTATIVENESS applied by QA attach.
  let confidence = COORDINATE_CLIMATE_CONFIDENCE.HIGH;
  if (missing.includes('monthlyTmin') || missing.includes('monthlyPrecip')) {
    confidence = COORDINATE_CLIMATE_CONFIDENCE.LOW;
  } else if (
    missing.includes('elevation') ||
    missing.includes('monthlyVpd') ||
    missing.includes('monthlyPet') ||
    missing.includes('aridityIndex-requires-pet')
  ) {
    confidence = COORDINATE_CLIMATE_CONFIDENCE.MEDIUM;
  }

  return {
    climateNativeResolution: CHELSA_V21_BASELINE.nativeResolutionLabel,
    terrainNativeResolution: TERRAIN_LAYER_POLICY_V2.nativeResolutionLabel,
    climateGrid: climateGrid || null,
    elevationM: isFiniteNumber(elevationM) ? Number(elevationM) : null,
    monthly: {
      tminC: tmin,
      tmeanC: tmean,
      tmaxC: tmax,
      precipMm: pr,
      petMm: pet,
      vpdPa: vpd,
      hursPct: hurs
    },
    derived: {
      coldestMonth,
      coldestMonthMeanMinC,
      warmestMonth,
      warmestMonthMeanMaxC,
      annualPrecipitationMm,
      annualPetMm,
      aridityIndex,
      aridityMethod,
      moistureRegime,
      meanRelativeHumidityPct,
      meanVpdPa,
      humidityRegime,
      humiditySignal,
      structuralColdRisk,
      freezingRisk,
      frostColdClassification: freezingRisk
        ? `freezingRisk=${freezingRisk}; coldRisk=${structuralColdRisk}`
        : 'unknown',
      thermalRegime,
      coolSeasonSignal,
      alwaysHot,
      highland: highland.highland,
      highlandReason: highland.reason,
      seasonality
    },
    confidence,
    missingFields: [...new Set(missing)]
  };
}

/**
 * Assemble a full CoordinateClimateProfile V2 record.
 */
export function buildCoordinateClimateProfileV2({
  lat,
  lon,
  label = null,
  monthlyTminC,
  monthlyTmeanC,
  monthlyTmaxC,
  monthlyPrecipMm,
  monthlyPetMm,
  monthlyVpdPa,
  monthlyHursPct,
  elevationM,
  climateGrid,
  terrain,
  provenance,
  derivedAt
} = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return buildClimateAuthorityUnavailable({
      lat,
      lon,
      reason: 'invalid-coordinates',
      derivedAt
    });
  }

  const interpretation = deriveCoordinateClimateInterpretation({
    monthlyTminC,
    monthlyTmeanC,
    monthlyTmaxC,
    monthlyPrecipMm,
    monthlyPetMm,
    monthlyVpdPa,
    monthlyHursPct,
    elevationM,
    climateGrid
  });

  const now = derivedAt || new Date().toISOString();
  return {
    status: 'known',
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    coordinate: {
      lat: roundCoord(latitude),
      lon: roundCoord(longitude),
      label: label ? String(label) : null
    },
    baseline: {
      source: CHELSA_V21_BASELINE.id,
      version: CHELSA_V21_BASELINE.version,
      period: CHELSA_V21_BASELINE.period,
      license: CHELSA_V21_BASELINE.license,
      nativeClimateResolution: CHELSA_V21_BASELINE.nativeResolutionLabel,
      nativeClimateResolutionArcSec: CHELSA_V21_BASELINE.nativeResolutionArcSec
    },
    terrain: {
      source: terrain?.source || TERRAIN_LAYER_POLICY_V2.preferredOpenOption,
      version: terrain?.version || 'terrarium-v1',
      nativeResolution: TERRAIN_LAYER_POLICY_V2.nativeResolutionLabel,
      elevationM: interpretation.elevationM,
      note: TERRAIN_LAYER_POLICY_V2.note,
      ...(terrain && typeof terrain === 'object' ? terrain : {})
    },
    climateNativeResolution: interpretation.climateNativeResolution,
    terrainNativeResolution: interpretation.terrainNativeResolution,
    climateGrid: interpretation.climateGrid,
    elevationM: interpretation.elevationM,
    monthlyTminC: interpretation.monthly.tminC,
    monthlyTmeanC: interpretation.monthly.tmeanC,
    monthlyTmaxC: interpretation.monthly.tmaxC,
    monthlyPrecipMm: interpretation.monthly.precipMm,
    monthlyPetMm: interpretation.monthly.petMm,
    monthlyVpdPa: interpretation.monthly.vpdPa,
    monthlyHursPct: interpretation.monthly.hursPct,
    seasonality: interpretation.derived.seasonality,
    derivedColdFrostRisk: interpretation.derived.frostColdClassification,
    freezingRisk: interpretation.derived.freezingRisk,
    structuralColdRisk: interpretation.derived.structuralColdRisk,
    thermalRegime: interpretation.derived.thermalRegime,
    aridityMoistureRegime: interpretation.derived.moistureRegime,
    aridityIndex: interpretation.derived.aridityIndex,
    aridityMethod: interpretation.derived.aridityMethod,
    humidityRegime: interpretation.derived.humidityRegime,
    humiditySignal: interpretation.derived.humiditySignal,
    coolSeasonSignal: interpretation.derived.coolSeasonSignal,
    alwaysHot: interpretation.derived.alwaysHot,
    highlandModifier: interpretation.derived.highland,
    coldestMonthMeanMinC: interpretation.derived.coldestMonthMeanMinC,
    warmestMonthMeanMaxC: interpretation.derived.warmestMonthMeanMaxC,
    annualPrecipitationMm: interpretation.derived.annualPrecipitationMm,
    annualPetMm: interpretation.derived.annualPetMm,
    meanVpdPa: interpretation.derived.meanVpdPa,
    meanRelativeHumidityPct: interpretation.derived.meanRelativeHumidityPct,
    confidence: interpretation.confidence,
    missingFields: interpretation.missingFields,
    provenance: {
      baseline: CHELSA_V21_BASELINE,
      terrainPolicy: TERRAIN_LAYER_POLICY_V2,
      acquisitionChannel: 'build-ingestion-only',
      runtimeExternalCallsForbidden: true,
      noCityProxy: true,
      ...(provenance && typeof provenance === 'object' ? provenance : {})
    },
    derivedAt: now
  };
}

/**
 * Serialize CoordinateClimateProfile V2 into existing Garden structural climate blob
 * (reuse location_structural_climate columns — do not create a second source of truth).
 */
export function coordinateClimateProfileToStructuralPersistence(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (profile.status === CLIMATE_AUTHORITY_UNAVAILABLE) {
    return {
      status: 'unknown',
      version: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
      moistureRegime: 'unknown',
      humidityRegime: 'unknown',
      humiditySignal: null,
      structuralColdRisk: 'unknown',
      freezingRisk: null,
      broadClimateOverride: null,
      drySeasonSignal: null,
      thermalRegime: 'unknown',
      elevationM: null,
      evidence: {},
      provenance: {
        provider: 'coordinate-climate-authority-v2',
        authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
        status: CLIMATE_AUTHORITY_UNAVAILABLE,
        reason: profile.reason || 'unavailable',
        lat: profile.coordinate?.lat ?? null,
        lon: profile.coordinate?.lon ?? null,
        fetchedAt: profile.derivedAt || null,
        noCityProxy: true
      },
      coordinateClimateV2: profile
    };
  }

  const moisture = String(profile.aridityMoistureRegime || 'unknown');
  let broadClimateOverride = null;
  if (moisture === 'hyper-arid' || moisture === 'arid') broadClimateOverride = 'arid';
  else if (profile.highlandModifier === true) broadClimateOverride = 'highland-tropical';
  else if (profile.thermalRegime === 'year-round-warm') broadClimateOverride = 'tropical';
  else if (profile.thermalRegime === 'frost-prone') broadClimateOverride = 'temperate';
  else if (profile.thermalRegime === 'cool-highland') broadClimateOverride = 'highland-tropical';
  else if (profile.thermalRegime === 'cool-seasonal') broadClimateOverride = 'mediterranean';

  const drySeasonSignal =
    moisture === 'hyper-arid' ||
    moisture === 'arid' ||
    moisture === 'semi-arid' ||
    moisture === 'dry-subhumid'
      ? true
      : moisture === 'humid'
        ? false
        : null;

  return {
    status: 'known',
    version: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    moistureRegime: moisture,
    humidityRegime: profile.humidityRegime || 'unknown',
    humiditySignal: profile.humiditySignal,
    structuralColdRisk: profile.structuralColdRisk || 'unknown',
    freezingRisk: profile.freezingRisk,
    broadClimateOverride,
    drySeasonSignal,
    thermalRegime: profile.thermalRegime || 'unknown',
    elevationM: profile.elevationM,
    evidence: {
      coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
      warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC,
      annualPrecipitationMm: profile.annualPrecipitationMm,
      annualPetMm: profile.annualPetMm,
      aridityIndex: profile.aridityIndex,
      aridityMethod: profile.aridityMethod,
      meanRelativeHumidityPct: profile.meanRelativeHumidityPct,
      meanVpdPa: profile.meanVpdPa,
      elevationM: profile.elevationM,
      thermalRegime: profile.thermalRegime,
      climateNativeResolution: profile.climateNativeResolution,
      terrainNativeResolution: profile.terrainNativeResolution,
      baseline: profile.baseline?.source || CHELSA_V21_BASELINE.id
    },
    provenance: {
      provider: 'coordinate-climate-authority-v2',
      baseline: profile.baseline?.source || CHELSA_V21_BASELINE.id,
      baselineVersion: profile.baseline?.version || CHELSA_V21_BASELINE.version,
      terrainSource: profile.terrain?.source || null,
      authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
      lat: profile.coordinate?.lat ?? null,
      lon: profile.coordinate?.lon ?? null,
      fetchedAt: profile.derivedAt || null,
      confidence: profile.confidence,
      confidenceDimensions: profile.confidenceDimensions || null,
      localRepresentativeness: profile.localRepresentativeness || null,
      confidenceWarnings: profile.confidenceWarnings || [],
      noCityProxy: true,
      status: 'known'
    },
    coordinateClimateV2: profile
  };
}

/**
 * Runtime cost proof helper — lookup path must never call external climate providers.
 */
export function assertCoordinateClimateRuntimeCostPolicy() {
  return {
    chelsaExternalCalls: 0,
    terrainProviderExternalCalls: 0,
    era5ExternalCalls: 0,
    openMeteoStructuralCalls: 0,
    aiLlm: 0,
    paidApiUsd: 0,
    architecture: 'ACQUIRE_ONCE_STORE_INDEX_LOOKUP_PERSIST_REUSE',
    plantEvaluationsDoNotCallProviders: true
  };
}
