/**
 * Structural Climate Authority V1
 * ---------------------------------------------------------------------------
 * Long-term (multi-year) climate normals → Garden structural environment.
 * Resolved once per Garden location hydrate; reused by many plant evaluations.
 *
 * Source: Open-Meteo Historical Weather API (ERA5) daily archive aggregates.
 * NOT short-term forecast weather.
 *
 * Does not invent values: missing fetch/fields → UNKNOWN slots.
 */

export const STRUCTURAL_CLIMATE_AUTHORITY_VERSION = '1.0.0';

export const STRUCTURAL_CLIMATE_SOURCE = Object.freeze({
  provider: 'open-meteo-archive-era5',
  endpoint: 'https://archive-api.open-meteo.com/v1/archive',
  /** Inclusive multi-year window used for normals-style aggregates. */
  normalsWindow: { start: '2014-01-01', end: '2023-12-31', years: 10 },
  notes:
    'Annual means from ERA5 reanalysis daily fields over a fixed 10-year window. Not a transient forecast.'
});

/** UNEP aridity index classes (AI = P / PET). */
export const UNEP_ARIDITY_CLASSES = Object.freeze({
  'hyper-arid': { maxExclusive: 0.05 },
  arid: { minInclusive: 0.05, maxExclusive: 0.2 },
  'semi-arid': { minInclusive: 0.2, maxExclusive: 0.5 },
  'dry-subhumid': { minInclusive: 0.5, maxExclusive: 0.65 },
  humid: { minInclusive: 0.65 }
});

/**
 * Damaging-cold band for plants with high frostSensitivity + low coldTolerance.
 * Below this coldest-month mean daily minimum (°C), outdoor reliability is unsupported
 * even without literal frost. Trait-driven — not city/plant exceptions.
 */
export const DAMAGING_COLD_MONTH_MEAN_MIN_C = 10;

/** Elevation (m) at/above which tropical-latitude sites often lose lowland year-round warmth. */
export const HIGH_ELEVATION_THRESHOLD_M = 1500;

/**
 * Thermal regime from long-term lows + elevation — general, not city-specific.
 * cool-highland / cool-seasonal / frost-prone are never "frost-free growing" climates
 * for warm tropical logic, even when latitude band says tropical.
 */
export function thermalRegimeFromStructuralEvidence({
  coldestMonthMeanMinC,
  elevationM,
  structuralColdRisk,
  freezingRisk
} = {}) {
  const cold =
    coldestMonthMeanMinC == null || coldestMonthMeanMinC === ''
      ? NaN
      : Number(coldestMonthMeanMinC);
  const elev =
    elevationM == null || elevationM === '' ? NaN : Number(elevationM);
  const risk = String(freezingRisk || '').toLowerCase();
  const sc = String(structuralColdRisk || '').toLowerCase();
  if (risk === 'high' || sc === 'high' || (Number.isFinite(cold) && cold <= 0)) {
    return 'frost-prone';
  }
  if (
    Number.isFinite(elev) &&
    elev >= HIGH_ELEVATION_THRESHOLD_M &&
    Number.isFinite(cold) &&
    cold < 15
  ) {
    return 'cool-highland';
  }
  if (sc === 'elevated' || sc === 'medium' || (Number.isFinite(cold) && cold < DAMAGING_COLD_MONTH_MEAN_MIN_C)) {
    return 'cool-seasonal';
  }
  if (Number.isFinite(cold) && cold >= 18) return 'year-round-warm';
  if (Number.isFinite(cold)) return 'mild-seasonal';
  return 'unknown';
}

/**
 * Frost-free growing climate for warm tropical/subtropical logic.
 * Long-term cold / highland evidence overrides latitude-band tropical labels.
 */
export function isFrostFreeGrowingClimateFromStructural(climateProfile = {}) {
  const broad = String(climateProfile?.broadClimate || '').toLowerCase();
  const risk = String(climateProfile?.freezingRisk || '').toLowerCase();
  const coldRaw = climateProfile?.coldestMonthMeanMinC;
  const cold = coldRaw == null || coldRaw === '' ? NaN : Number(coldRaw);
  const elevRaw =
    climateProfile?.elevationM ?? climateProfile?.elevation ?? climateProfile?.evidence?.elevationM;
  const elev = elevRaw == null || elevRaw === '' ? NaN : Number(elevRaw);
  const thermal =
    climateProfile?.thermalRegime ||
    thermalRegimeFromStructuralEvidence({
      coldestMonthMeanMinC: Number.isFinite(cold) ? cold : null,
      elevationM: Number.isFinite(elev) ? elev : null,
      structuralColdRisk: climateProfile?.structuralColdRisk,
      freezingRisk: risk
    });

  if (thermal === 'frost-prone' || thermal === 'cool-highland' || thermal === 'cool-seasonal') {
    return false;
  }
  if (Number.isFinite(cold) && cold < DAMAGING_COLD_MONTH_MEAN_MIN_C) return false;
  if (Number.isFinite(elev) && elev >= HIGH_ELEVATION_THRESHOLD_M && (!Number.isFinite(cold) || cold < 15)) {
    return false;
  }

  if (broad === 'tropical') return risk !== 'high';
  if (broad === 'subtropical') return risk === 'low';
  if (broad === 'arid') return false;
  return false;
}

function sum(arr) {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

function mean(arr) {
  if (!arr.length) return null;
  return sum(arr) / arr.length;
}

function classifyUnepAridity(ai) {
  if (!Number.isFinite(ai) || ai < 0) return 'unknown';
  if (ai < 0.05) return 'hyper-arid';
  if (ai < 0.2) return 'arid';
  if (ai < 0.5) return 'semi-arid';
  if (ai < 0.65) return 'dry-subhumid';
  return 'humid';
}

/**
 * Map mean RH (%) → humidity regime. Conservative bands; UNKNOWN if missing.
 */
export function humidityRegimeFromMeanRh(meanRh) {
  if (!Number.isFinite(meanRh)) return 'unknown';
  if (meanRh < 45) return 'low';
  if (meanRh < 65) return 'medium';
  return 'high';
}

/**
 * Prefer moisture-driven humidity for arid regimes (ambient climate, not irrigation).
 * Hyper-arid / arid → low humiditySignal even if mean RH sits mid-band.
 */
export function humiditySignalFromStructural({ moistureRegime, humidityRegime }) {
  const m = String(moistureRegime || '').toLowerCase();
  if (m === 'hyper-arid' || m === 'arid') return 'low';
  if (m === 'semi-arid') return 'low';
  if (m === 'dry-subhumid') return humidityRegime === 'high' ? 'medium' : humidityRegime || 'medium';
  if (m === 'humid') return humidityRegime === 'unknown' ? 'high' : humidityRegime;
  return humidityRegime === 'unknown' ? null : humidityRegime;
}

export function structuralColdRiskFromColdestMonthMeanMinC(c) {
  if (!Number.isFinite(c)) return 'unknown';
  if (c <= 0) return 'high';
  if (c <= 5) return 'medium';
  if (c < DAMAGING_COLD_MONTH_MEAN_MIN_C) return 'elevated';
  return 'low';
}

export function freezingRiskFromStructuralCold(coldestMonthMeanMinC, structuralColdRisk) {
  if (Number.isFinite(coldestMonthMeanMinC) && coldestMonthMeanMinC <= 0) return 'high';
  const risk = String(structuralColdRisk || '').toLowerCase();
  if (risk === 'high') return 'high';
  if (risk === 'medium') return 'medium';
  if (risk === 'elevated' || risk === 'low') return 'low';
  return null;
}

/**
 * Aggregate Open-Meteo archive daily payload → normals summary.
 */
export function aggregateArchiveDailyToNormals(daily, options = {}) {
  const years = Number(options.years) || STRUCTURAL_CLIMATE_SOURCE.normalsWindow.years;
  if (!daily || typeof daily !== 'object') {
    return { ok: false, reason: 'missing-daily', normals: null };
  }
  const times = Array.isArray(daily.time) ? daily.time : [];
  const precip = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : [];
  const et0 = Array.isArray(daily.et0_fao_evapotranspiration)
    ? daily.et0_fao_evapotranspiration
    : [];
  const rh = Array.isArray(daily.relative_humidity_2m_mean)
    ? daily.relative_humidity_2m_mean
    : [];
  const tmin = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];

  const precipVals = [];
  const et0Vals = [];
  const rhVals = [];
  const byMonthMins = Object.create(null);

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (precip[i] != null && Number.isFinite(Number(precip[i]))) precipVals.push(Number(precip[i]));
    if (et0[i] != null && Number.isFinite(Number(et0[i]))) et0Vals.push(Number(et0[i]));
    if (rh[i] != null && Number.isFinite(Number(rh[i]))) rhVals.push(Number(rh[i]));
    if (tmin[i] != null && Number.isFinite(Number(tmin[i])) && t && t.length >= 7) {
      const month = t.slice(5, 7);
      (byMonthMins[month] || (byMonthMins[month] = [])).push(Number(tmin[i]));
    }
  }

  if (!precipVals.length && !rhVals.length && !Object.keys(byMonthMins).length) {
    return { ok: false, reason: 'empty-series', normals: null };
  }

  const annualPrecipitationMm =
    precipVals.length > 0 ? sum(precipVals) / years : null;
  const annualEt0Mm = et0Vals.length > 0 ? sum(et0Vals) / years : null;
  const aridityIndex =
    Number.isFinite(annualPrecipitationMm) &&
    Number.isFinite(annualEt0Mm) &&
    annualEt0Mm > 0
      ? annualPrecipitationMm / annualEt0Mm
      : null;
  const meanRelativeHumidityPct = mean(rhVals);

  let coldestMonth = null;
  let coldestMonthMeanMinC = null;
  for (const [month, vals] of Object.entries(byMonthMins)) {
    const m = mean(vals);
    if (!Number.isFinite(m)) continue;
    if (coldestMonthMeanMinC == null || m < coldestMonthMeanMinC) {
      coldestMonthMeanMinC = m;
      coldestMonth = month;
    }
  }

  return {
    ok: true,
    normals: {
      windowYears: years,
      sampleDays: times.length,
      annualPrecipitationMm: Number.isFinite(annualPrecipitationMm)
        ? round1(annualPrecipitationMm)
        : null,
      annualEt0Mm: Number.isFinite(annualEt0Mm) ? round1(annualEt0Mm) : null,
      aridityIndex: Number.isFinite(aridityIndex) ? round3(aridityIndex) : null,
      meanRelativeHumidityPct: Number.isFinite(meanRelativeHumidityPct)
        ? round1(meanRelativeHumidityPct)
        : null,
      coldestMonth,
      coldestMonthMeanMinC: Number.isFinite(coldestMonthMeanMinC)
        ? round2(coldestMonthMeanMinC)
        : null
    }
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Derive structural Garden climate fields from normals aggregates.
 */
export function deriveStructuralClimateFromNormals(normals, meta = {}) {
  const n = normals && typeof normals === 'object' ? normals : null;
  if (!n) {
    return {
      status: 'unknown',
      version: STRUCTURAL_CLIMATE_AUTHORITY_VERSION,
      moistureRegime: 'unknown',
      humidityRegime: 'unknown',
      humiditySignal: null,
      structuralColdRisk: 'unknown',
      freezingRisk: null,
      broadClimateOverride: null,
      drySeasonSignal: null,
      evidence: {},
      provenance: {
        ...STRUCTURAL_CLIMATE_SOURCE,
        fetchedAt: meta.fetchedAt || null,
        lat: meta.lat ?? null,
        lon: meta.lon ?? null,
        status: 'unknown'
      }
    };
  }

  const moistureRegime = classifyUnepAridity(n.aridityIndex);
  const humidityRegime = humidityRegimeFromMeanRh(n.meanRelativeHumidityPct);
  const humiditySignal = humiditySignalFromStructural({ moistureRegime, humidityRegime });
  const structuralColdRisk = structuralColdRiskFromColdestMonthMeanMinC(
    n.coldestMonthMeanMinC
  );
  const freezingRisk = freezingRiskFromStructuralCold(
    n.coldestMonthMeanMinC,
    structuralColdRisk
  );

  let broadClimateOverride = null;
  if (moistureRegime === 'hyper-arid' || moistureRegime === 'arid') {
    broadClimateOverride = 'arid';
  }

  const drySeasonSignal =
    moistureRegime === 'hyper-arid' ||
    moistureRegime === 'arid' ||
    moistureRegime === 'semi-arid' ||
    moistureRegime === 'dry-subhumid'
      ? true
      : moistureRegime === 'humid'
        ? false
        : null;

  const elevationM =
    Number.isFinite(Number(meta.elevationM)) ? Number(meta.elevationM) : null;
  const thermalRegime = thermalRegimeFromStructuralEvidence({
    coldestMonthMeanMinC: n.coldestMonthMeanMinC,
    elevationM,
    structuralColdRisk,
    freezingRisk
  });

  const knownCore =
    moistureRegime !== 'unknown' ||
    humidityRegime !== 'unknown' ||
    structuralColdRisk !== 'unknown';

  return {
    status: knownCore ? 'known' : 'unknown',
    version: STRUCTURAL_CLIMATE_AUTHORITY_VERSION,
    moistureRegime,
    humidityRegime,
    humiditySignal,
    structuralColdRisk,
    freezingRisk,
    broadClimateOverride,
    drySeasonSignal,
    thermalRegime,
    elevationM,
    evidence: {
      annualPrecipitationMm: n.annualPrecipitationMm,
      annualEt0Mm: n.annualEt0Mm,
      aridityIndex: n.aridityIndex,
      meanRelativeHumidityPct: n.meanRelativeHumidityPct,
      coldestMonth: n.coldestMonth,
      coldestMonthMeanMinC: n.coldestMonthMeanMinC,
      elevationM,
      thermalRegime,
      windowYears: n.windowYears,
      sampleDays: n.sampleDays
    },
    provenance: {
      ...STRUCTURAL_CLIMATE_SOURCE,
      fetchedAt: meta.fetchedAt || null,
      lat: meta.lat ?? null,
      lon: meta.lon ?? null,
      elevationM,
      status: knownCore ? 'known' : 'unknown'
    }
  };
}

const _structuralClimateCache = new Map();

export function clearStructuralClimateCache() {
  _structuralClimateCache.clear();
}

function cacheKey(lat, lon, window) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}|${window.start}|${window.end}`;
}

/**
 * Fetch ERA5 archive daily series and derive structural climate (one-shot hydrate).
 * Retries on transient 429/5xx — location hydrate only, never per plant check.
 * In-process cache avoids repeat archive calls for the same coordinates.
 */
export async function fetchStructuralClimateForCoordinates(lat, lon, options = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      error: 'invalid-coordinates',
      structuralClimate: deriveStructuralClimateFromNormals(null),
      acquisitionMs: 0
    };
  }

  const window = options.window || STRUCTURAL_CLIMATE_SOURCE.normalsWindow;
  const key = cacheKey(latitude, longitude, window);
  if (!options.bypassCache && _structuralClimateCache.has(key)) {
    const cached = _structuralClimateCache.get(key);
    return { ...cached, acquisitionMs: 0, fromCache: true };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 5;
  const url =
    STRUCTURAL_CLIMATE_SOURCE.endpoint +
    '?' +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: window.start,
      end_date: window.end,
      daily:
        'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min,relative_humidity_2m_mean',
      timezone: 'UTC'
    });

  const t0 = performance.now();
  let lastError = null;
  let res = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'CruvitStructuralClimate/1.0' },
        signal: options.signal
      });
    } catch (err) {
      lastError = err?.message || 'fetch-failed';
      res = null;
    }

    if (res?.ok) break;

    const status = res?.status || 0;
    lastError = res ? `http-${status}` : lastError || 'fetch-failed';
    const retryable = !res || status === 429 || status >= 500;
    if (!retryable || attempt === maxAttempts) {
      return {
        ok: false,
        error: lastError,
        structuralClimate: deriveStructuralClimateFromNormals(null, {
          lat: latitude,
          lon: longitude,
          fetchedAt: new Date().toISOString()
        }),
        acquisitionMs: performance.now() - t0
      };
    }
    const backoffMs = Math.min(12000, 600 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  const acquisitionMs = performance.now() - t0;
  const data = await res.json().catch(() => null);
  const agg = aggregateArchiveDailyToNormals(data?.daily, { years: window.years });
  if (!agg.ok) {
    return {
      ok: false,
      error: agg.reason,
      structuralClimate: deriveStructuralClimateFromNormals(null, {
        lat: latitude,
        lon: longitude,
        fetchedAt: new Date().toISOString()
      }),
      acquisitionMs
    };
  }

  const elevationM =
    Number.isFinite(Number(data?.elevation)) ? Number(data.elevation) : null;

  const structuralClimate = deriveStructuralClimateFromNormals(agg.normals, {
    lat: latitude,
    lon: longitude,
    elevationM,
    fetchedAt: new Date().toISOString()
  });

  const out = { ok: true, error: null, structuralClimate, acquisitionMs, normals: agg.normals };
  _structuralClimateCache.set(key, {
    ok: true,
    error: null,
    structuralClimate,
    normals: agg.normals
  });
  return out;
}

/**
 * Merge structural climate into a climate profile used by outcome / Smart Rec.
 * Does not invent: only overlays KNOWN structural fields.
 */
export function applyStructuralClimateToProfile(climateProfile = {}, structuralClimate = null) {
  const base =
    climateProfile && typeof climateProfile === 'object' ? { ...climateProfile } : {};
  const sc = structuralClimate && typeof structuralClimate === 'object' ? structuralClimate : null;
  if (!sc || sc.status !== 'known') {
    return {
      ...base,
      structuralClimateStatus: sc?.status || 'unknown',
      structuralClimate: sc || null
    };
  }

  let broadClimate = String(base.broadClimate || '').toLowerCase();
  if (sc.broadClimateOverride) {
    broadClimate = sc.broadClimateOverride;
  }

  const humiditySignal =
    sc.humiditySignal ||
    base.humiditySignal ||
    null;

  const freezingRisk =
    sc.freezingRisk ||
    base.freezingRisk ||
    null;

  const drySeasonSignal =
    sc.drySeasonSignal != null ? sc.drySeasonSignal : base.drySeasonSignal;

  const climateLabel =
    sc.broadClimateOverride === 'arid'
      ? base.climateLabel && /arid|desert/i.test(String(base.climateLabel))
        ? base.climateLabel
        : 'Arid'
      : base.climateLabel;

  const elevationM =
    sc.elevationM ?? sc.evidence?.elevationM ?? base.elevationM ?? null;
  const coldestMonthMeanMinC =
    sc.evidence?.coldestMonthMeanMinC ?? base.coldestMonthMeanMinC ?? null;
  const thermalRegime =
    sc.thermalRegime ||
    thermalRegimeFromStructuralEvidence({
      coldestMonthMeanMinC,
      elevationM,
      structuralColdRisk: sc.structuralColdRisk,
      freezingRisk
    });

  // Highland / cool-seasonal evidence overrides latitude-band "tropical" warmth.
  if (
    thermalRegime === 'cool-highland' ||
    thermalRegime === 'cool-seasonal' ||
    thermalRegime === 'frost-prone'
  ) {
    if (broadClimate === 'tropical') {
      broadClimate = 'highland-tropical';
    }
  }

  return {
    ...base,
    climateLabel: climateLabel || base.climateLabel,
    broadClimate: broadClimate || base.broadClimate,
    humiditySignal: humiditySignal || base.humiditySignal,
    freezingRisk: freezingRisk || base.freezingRisk,
    drySeasonSignal: !!drySeasonSignal,
    moistureRegime: sc.moistureRegime,
    humidityRegime: sc.humidityRegime,
    structuralColdRisk: sc.structuralColdRisk,
    coldestMonthMeanMinC,
    elevationM,
    thermalRegime,
    annualPrecipitationMm: sc.evidence?.annualPrecipitationMm ?? null,
    aridityIndex: sc.evidence?.aridityIndex ?? null,
    structuralClimateStatus: 'known',
    structuralClimate: sc,
    structuralClimateProvenance: sc.provenance
  };
}

/**
 * Trait-driven damaging-cold check (general).
 * high frostSensitivity + low coldTolerance + known coldestMonthMeanMinC < threshold.
 */
export function outdoorDamagingColdUnsupported(meta, climateProfile) {
  const frost = String(meta?.frostSensitivity || '').toLowerCase();
  const cold = String(meta?.coldTolerance || '').toLowerCase();
  if (frost !== 'high' || cold !== 'low') return false;
  const raw = climateProfile?.coldestMonthMeanMinC;
  if (raw == null || raw === '') return false;
  const c = Number(raw);
  if (!Number.isFinite(c)) return false;
  return c < DAMAGING_COLD_MONTH_MEAN_MIN_C;
}

export function moistureMismatchForHighHumidityPlant(meta, climateProfile) {
  const humidityTol = String(meta?.humidityTolerance || '').toLowerCase();
  if (humidityTol !== 'high') return false;
  const regime = String(climateProfile?.moistureRegime || '').toLowerCase();
  return regime === 'hyper-arid' || regime === 'arid' || regime === 'semi-arid';
}
