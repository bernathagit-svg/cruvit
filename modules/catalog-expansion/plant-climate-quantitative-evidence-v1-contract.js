/**
 * Optional quantitative plant climate evidence (ingestion + evaluator readiness).
 *
 * OPTIONAL — absence is valid. Do not invent numbers from qualitative labels
 * (coldTolerance=medium, humidityTolerance=low, etc.).
 *
 * Every numeric field requires authoritative provenance (sourceIds + excerpt).
 * Verified plant + invented threshold is forbidden.
 */

export const PLANT_CLIMATE_QUANTITATIVE_EVIDENCE_VERSION = '1.0.0';

/** Claim field names accepted on expansion packets (asserted + provenanced). */
export const QUANTITATIVE_CLAIM_FIELDS = Object.freeze([
  'quantitative.minimum_survival_temperature_c',
  'quantitative.preferred_minimum_temperature_c',
  'quantitative.chill_hours_min',
  'quantitative.chill_hours_max',
  'quantitative.maximum_tolerated_temperature_c',
  'quantitative.preferred_maximum_temperature_c',
  'quantitative.vpd_min_kpa',
  'quantitative.vpd_max_kpa',
  'quantitative.drought_tolerance',
  'quantitative.aridity_tolerance_note',
  'quantitative.flowering_min_temperature_c',
  'quantitative.fruiting_min_temperature_c'
]);

/** Keys stored under climateTraits.quantitativeEvidence */
export const QUANTITATIVE_TRAIT_KEYS = Object.freeze([
  'minimum_survival_temperature_c',
  'preferred_minimum_temperature_c',
  'chill_hours_min',
  'chill_hours_max',
  'maximum_tolerated_temperature_c',
  'preferred_maximum_temperature_c',
  'vpd_min_kpa',
  'vpd_max_kpa',
  'drought_tolerance',
  'aridity_tolerance_note',
  'flowering_min_temperature_c',
  'fruiting_min_temperature_c'
]);

const NUMERIC_KEYS = new Set([
  'minimum_survival_temperature_c',
  'preferred_minimum_temperature_c',
  'chill_hours_min',
  'chill_hours_max',
  'maximum_tolerated_temperature_c',
  'preferred_maximum_temperature_c',
  'vpd_min_kpa',
  'vpd_max_kpa',
  'flowering_min_temperature_c',
  'fruiting_min_temperature_c'
]);

const STRING_KEYS = new Set(['drought_tolerance', 'aridity_tolerance_note']);

export function quantitativeFieldFromClaimField(claimField) {
  const f = String(claimField || '');
  if (!f.startsWith('quantitative.')) return null;
  const key = f.slice('quantitative.'.length);
  return QUANTITATIVE_TRAIT_KEYS.includes(key) ? key : null;
}

/**
 * Validate asserted quantitative claims: must be numeric (or allowed string),
 * must carry sourceIds + shortExcerpt. Never invent values.
 */
export function validateQuantitativeClaims(claims, sourceIds, errors = []) {
  const list = Array.isArray(claims) ? claims : [];
  for (const c of list) {
    const key = quantitativeFieldFromClaimField(c?.field);
    if (!key) continue;
    const status = String(c?.status || '');
    if (status === 'unknown') continue;
    if (status !== 'asserted') {
      // needsReview/disputed quantitative: allowed but must not materialize as confident
      continue;
    }
    const refs = Array.isArray(c.sourceIds) ? c.sourceIds : [];
    if (refs.length < 1) {
      errors.push(`claim ${c.claimId}: quantitative asserted fields require sourceIds`);
    }
    for (const sid of refs) {
      if (!sourceIds.has(sid)) {
        errors.push(`claim ${c.claimId}: unknown sourceId ${sid}`);
      }
    }
    if (!c.shortExcerpt || !String(c.shortExcerpt).trim()) {
      errors.push(`claim ${c.claimId}: quantitative asserted fields require shortExcerpt`);
    }
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(c.value);
      if (!Number.isFinite(n)) {
        errors.push(`claim ${c.claimId}: ${key} must be a finite number (no qualitative→numeric invention)`);
      }
    } else if (STRING_KEYS.has(key)) {
      if (typeof c.value !== 'string' || !c.value.trim()) {
        errors.push(`claim ${c.claimId}: ${key} must be a non-empty evidence string`);
      }
    }
  }
  return errors;
}

/**
 * Materialize optional quantitativeEvidence + per-field provenance from asserted claims.
 * Omits keys without asserted provenanced values. Does not invent thresholds.
 */
export function materializeQuantitativeEvidenceFromClaims(claims = []) {
  const values = {};
  const provenance = {};
  for (const c of claims) {
    if (String(c?.status || '') !== 'asserted') continue;
    const key = quantitativeFieldFromClaimField(c.field);
    if (!key) continue;
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(c.value);
      if (!Number.isFinite(n)) continue;
      values[key] = n;
    } else if (STRING_KEYS.has(key)) {
      values[key] = String(c.value).trim();
    } else continue;
    provenance[key] = {
      sourceIds: Array.isArray(c.sourceIds) ? [...c.sourceIds] : [],
      shortExcerpt: String(c.shortExcerpt || '').trim(),
      claimId: c.claimId || null
    };
  }
  if (!Object.keys(values).length) {
    return { quantitativeEvidence: null, quantitativeProvenance: null };
  }
  return {
    quantitativeEvidence: values,
    quantitativeProvenance: provenance
  };
}

/** Read optional quantitative block from plant meta / climateTraits (additive). */
export function readOptionalQuantitativeEvidence(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const q =
    meta.quantitativeEvidence ||
    meta.quantitative ||
    meta.climateTraits?.quantitativeEvidence ||
    null;
  if (!q || typeof q !== 'object') return null;
  return q;
}

export function readOptionalNumericThreshold(meta, key) {
  const q = readOptionalQuantitativeEvidence(meta);
  if (!q) return null;
  const raw = q[key];
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Additive cold survival check. Absence of numeric plant evidence → null (no negative).
 */
export function quantitativeColdSurvivalUnsupported(meta, climateProfile) {
  const minC = readOptionalNumericThreshold(meta, 'minimum_survival_temperature_c');
  if (minC == null) return null;
  const raw = climateProfile?.coldestMonthMeanMinC;
  if (raw == null || raw === '') return null;
  const coldest = Number(raw);
  if (!Number.isFinite(coldest)) return null;
  if (coldest < minC) {
    return {
      unsupported: true,
      limiting: `Coldest-month mean lows (~${coldest}°C) are below sourced minimum survival temperature (~${minC}°C).`
    };
  }
  return { unsupported: false };
}

/**
 * Additive heat check. Absence → null (no negative).
 */
export function quantitativeHeatUnsupported(meta, climateProfile) {
  const maxC = readOptionalNumericThreshold(meta, 'maximum_tolerated_temperature_c');
  if (maxC == null) return null;
  const raw = climateProfile?.warmestMonthMeanMaxC;
  if (raw == null || raw === '') return null;
  const warmest = Number(raw);
  if (!Number.isFinite(warmest)) return null;
  if (warmest > maxC) {
    return {
      unsupported: true,
      limiting: `Warmest-month mean highs (~${warmest}°C) exceed sourced maximum tolerated temperature (~${maxC}°C).`
    };
  }
  return { unsupported: false };
}

/**
 * Additive VPD range check when plant supplies kPa bounds AND climate has meanVpdPa.
 * Absence of either side → null (no negative). Does not invent plant VPD from qualitative humidity.
 */
export function quantitativeVpdUnsupported(meta, climateProfile) {
  const vmin = readOptionalNumericThreshold(meta, 'vpd_min_kpa');
  const vmax = readOptionalNumericThreshold(meta, 'vpd_max_kpa');
  if (vmin == null && vmax == null) return null;
  const rawPa = climateProfile?.meanVpdPa ?? climateProfile?.annualMeanVpdPa;
  if (rawPa == null || rawPa === '') return null;
  const pa = Number(rawPa);
  if (!Number.isFinite(pa)) return null;
  const kpa = pa / 1000;
  if (vmin != null && kpa < vmin) {
    return {
      unsupported: true,
      limiting: `Mean VPD (~${kpa.toFixed(2)} kPa) is below sourced plant range (min ${vmin} kPa).`
    };
  }
  if (vmax != null && kpa > vmax) {
    return {
      unsupported: true,
      limiting: `Mean VPD (~${kpa.toFixed(2)} kPa) is above sourced plant range (max ${vmax} kPa).`
    };
  }
  return { unsupported: false };
}
