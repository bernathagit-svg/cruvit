/**
 * Coordinate Climate V2 — multi-dimension confidence (not one opaque "high").
 *
 * SOURCE_DATA_INTEGRITY ≠ LOCAL_REPRESENTATIVENESS.
 * Runtime must never run model-vs-observed QA network calls.
 */

export const CONFIDENCE_LEVELS_V2 = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unknown',
  UNAVAILABLE: 'unavailable'
});

export const CONFIDENCE_DIMENSIONS_V2 = Object.freeze([
  'SOURCE_DATA_INTEGRITY',
  'COORDINATE_RESOLUTION_CONFIDENCE',
  'TERRAIN_CONTEXT_CONFIDENCE',
  'LOCAL_REPRESENTATIVENESS',
  'PROFILE_COMPLETENESS',
  'OVERALL_AUTHORITY_CONFIDENCE'
]);

/** Material precip divergence vs independent normals → demote representativeness. */
export const PRECIP_REPRESENTATIVENESS_WARN_RATIO = 1.25;
export const PRECIP_REPRESENTATIVENESS_SEVERE_RATIO = 1.4;
export const TEMP_REPRESENTATIVENESS_WARN_C = 2.5;
export const TEMP_REPRESENTATIVENESS_SEVERE_C = 4.0;

function levelRank(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'high') return 3;
  if (l === 'medium') return 2;
  if (l === 'low') return 1;
  if (l === 'unavailable') return 0;
  return 0;
}

export function minConfidenceLevel(...levels) {
  let best = CONFIDENCE_LEVELS_V2.HIGH;
  let bestRank = 3;
  for (const lv of levels) {
    const r = levelRank(lv);
    if (r < bestRank) {
      bestRank = r;
      best = String(lv || CONFIDENCE_LEVELS_V2.UNKNOWN).toLowerCase();
    }
  }
  if (bestRank <= 0) return CONFIDENCE_LEVELS_V2.UNKNOWN;
  return best;
}

/**
 * Build explicit confidence dimensions for a known profile (+ optional QA sidecar row).
 */
export function buildCoordinateClimateConfidenceV2({
  profile,
  qaRecord = null,
  sourceIntegrityOverride = null
} = {}) {
  const missing = Array.isArray(profile?.missingFields) ? profile.missingFields : [];
  const hasGrid = !!(profile?.climateGrid?.cellPixel?.x != null);
  const hasElev = Number.isFinite(Number(profile?.elevationM));
  const hasPet = Number.isFinite(Number(profile?.annualPetMm));
  const hasPrecip = Number.isFinite(Number(profile?.annualPrecipitationMm));
  const hasTmin = Number.isFinite(Number(profile?.coldestMonthMeanMinC));
  const hasTmax = Number.isFinite(Number(profile?.warmestMonthMeanMaxC));

  const SOURCE_DATA_INTEGRITY =
    sourceIntegrityOverride ||
    (hasPrecip && hasTmin && hasPet
      ? CONFIDENCE_LEVELS_V2.HIGH
      : hasPrecip && hasTmin
        ? CONFIDENCE_LEVELS_V2.MEDIUM
        : CONFIDENCE_LEVELS_V2.LOW);

  const COORDINATE_RESOLUTION_CONFIDENCE = hasGrid
    ? CONFIDENCE_LEVELS_V2.HIGH
    : CONFIDENCE_LEVELS_V2.LOW;

  const TERRAIN_CONTEXT_CONFIDENCE = hasElev
    ? CONFIDENCE_LEVELS_V2.HIGH
    : CONFIDENCE_LEVELS_V2.MEDIUM;

  let PROFILE_COMPLETENESS = CONFIDENCE_LEVELS_V2.HIGH;
  if (missing.includes('monthlyTmin') || missing.includes('monthlyPrecip')) {
    PROFILE_COMPLETENESS = CONFIDENCE_LEVELS_V2.LOW;
  } else if (
    missing.length > 0 ||
    !hasPet ||
    !hasTmax ||
    missing.includes('aridityIndex-requires-pet')
  ) {
    PROFILE_COMPLETENESS = CONFIDENCE_LEVELS_V2.MEDIUM;
  }

  const representativeness = deriveLocalRepresentativenessFromQa(qaRecord, profile);

  const OVERALL_AUTHORITY_CONFIDENCE = minConfidenceLevel(
    SOURCE_DATA_INTEGRITY,
    COORDINATE_RESOLUTION_CONFIDENCE,
    TERRAIN_CONTEXT_CONFIDENCE,
    representativeness.level,
    PROFILE_COMPLETENESS
  );

  return {
    version: '2.0.2-accuracy',
    dimensions: {
      SOURCE_DATA_INTEGRITY,
      COORDINATE_RESOLUTION_CONFIDENCE,
      TERRAIN_CONTEXT_CONFIDENCE,
      LOCAL_REPRESENTATIVENESS: representativeness.level,
      PROFILE_COMPLETENESS,
      OVERALL_AUTHORITY_CONFIDENCE
    },
    /** Legacy single field — equals OVERALL, never inflate past representativeness. */
    overall: OVERALL_AUTHORITY_CONFIDENCE,
    legacyConfidenceField: OVERALL_AUTHORITY_CONFIDENCE,
    localRepresentativeness: representativeness,
    warnings: representativeness.warnings || [],
    notes: {
      rule: 'SOURCE_DATA_INTEGRITY is not LOCAL_REPRESENTATIVENESS',
      climateNativeResolution: profile?.climateNativeResolution || null,
      forbidsClaiming30mClimate: true
    }
  };
}

export function deriveLocalRepresentativenessFromQa(qaRecord, profile = null) {
  const warnings = [];
  if (!qaRecord || qaRecord.qaEvidenceAvailable !== true) {
    return {
      level: CONFIDENCE_LEVELS_V2.UNKNOWN,
      reason: 'no-independent-qa-evidence',
      materialDivergence: false,
      variables: {},
      warnings: [
        'No independent observed/reference climatology QA on file — do not claim local agreement.'
      ]
    };
  }

  const variables = {};
  let worst = CONFIDENCE_LEVELS_V2.HIGH;
  let material = false;

  const chelsaP = Number(qaRecord.chelsa?.annualPrecipitationMm ?? profile?.annualPrecipitationMm);
  const refP = qaRecord.reference?.annualPrecipitationMm;
  const refPMin = Number(refP?.min ?? refP);
  const refPMax = Number(refP?.max ?? refP);
  if (Number.isFinite(chelsaP) && Number.isFinite(refPMin) && Number.isFinite(refPMax)) {
    const inRange = chelsaP >= refPMin && chelsaP <= refPMax;
    let level = CONFIDENCE_LEVELS_V2.HIGH;
    let ratio = 1;
    if (!inRange) {
      const nearest = chelsaP < refPMin ? refPMin : refPMax;
      ratio = Math.max(chelsaP, nearest) / Math.max(1, Math.min(chelsaP, nearest));
      if (ratio >= PRECIP_REPRESENTATIVENESS_SEVERE_RATIO) {
        level = CONFIDENCE_LEVELS_V2.LOW;
        material = true;
        warnings.push(
          `Annual precipitation model-vs-reference material divergence (CHELSA ${chelsaP} mm vs ref ${refPMin}–${refPMax} mm).`
        );
      } else if (ratio >= PRECIP_REPRESENTATIVENESS_WARN_RATIO) {
        level = CONFIDENCE_LEVELS_V2.MEDIUM;
        material = true;
        warnings.push(
          `Annual precipitation modest model-vs-reference divergence (CHELSA ${chelsaP} mm vs ref ${refPMin}–${refPMax} mm).`
        );
      } else {
        level = CONFIDENCE_LEVELS_V2.MEDIUM;
        material = true;
        warnings.push(
          `Annual precipitation outside reference range (CHELSA ${chelsaP} mm vs ref ${refPMin}–${refPMax} mm).`
        );
      }
    }
    variables.annualPrecipitationMm = {
      chelsa: chelsaP,
      referenceMin: refPMin,
      referenceMax: refPMax,
      inRange,
      divergenceRatioApprox: Math.round(ratio * 100) / 100,
      level
    };
    worst = minConfidenceLevel(worst, level);
  }

  for (const key of ['coldestMonthMeanMinC', 'warmestMonthMeanMaxC']) {
    const chelsaT = Number(qaRecord.chelsa?.[key] ?? profile?.[key]);
    const refT = qaRecord.reference?.[key];
    const refVal = Number(refT?.value ?? refT);
    const refTol = Number(refT?.toleranceC ?? TEMP_REPRESENTATIVENESS_WARN_C);
    if (Number.isFinite(chelsaT) && Number.isFinite(refVal)) {
      const abs = Math.abs(chelsaT - refVal);
      let level = CONFIDENCE_LEVELS_V2.HIGH;
      if (abs >= TEMP_REPRESENTATIVENESS_SEVERE_C) {
        level = CONFIDENCE_LEVELS_V2.LOW;
        material = true;
        warnings.push(`${key} material model-vs-reference Δ=${abs.toFixed(1)}°C.`);
      } else if (abs >= refTol) {
        level = CONFIDENCE_LEVELS_V2.MEDIUM;
        material = true;
        warnings.push(`${key} modest model-vs-reference Δ=${abs.toFixed(1)}°C.`);
      }
      variables[key] = { chelsa: chelsaT, reference: refVal, absDeltaC: Math.round(abs * 10) / 10, level };
      worst = minConfidenceLevel(worst, level);
    }
  }

  return {
    level: worst,
    reason: material ? 'material-model-vs-observed-divergence' : 'qa-within-tolerance',
    materialDivergence: material,
    variables,
    warnings,
    qaSource: qaRecord.qaSource || null,
    qaDate: qaRecord.qaDate || null,
    qaVersion: qaRecord.qaVersion || null
  };
}

/**
 * Downstream: do not silently issue strong positives that depend on uncertain variables.
 * Does NOT auto-flip to Not Recommended.
 */
export function applyRepresentativenessToSuitabilityClaim({
  overallRecommendation,
  confidence,
  claimDependsOn = [],
  moistureOrPrecipDependent = false
} = {}) {
  const dims = confidence?.dimensions || {};
  const local = String(dims.LOCAL_REPRESENTATIVENESS || confidence?.localRepresentativeness?.level || '').toLowerCase();
  const overall = String(dims.OVERALL_AUTHORITY_CONFIDENCE || confidence?.overall || '').toLowerCase();
  const depends =
    moistureOrPrecipDependent ||
    (claimDependsOn || []).some((c) => /precip|moisture|arid|humid|rainfall|water/i.test(String(c)));

  const rec = String(overallRecommendation || '').toLowerCase();
  const strongPositive = /excellent|good|recommended|reliable|supported|strong/.test(rec);

  const out = {
    originalRecommendation: overallRecommendation,
    adjustedRecommendation: overallRecommendation,
    demoted: false,
    forceUnknownOutcomes: false,
    preserveNotRecommendedAutoFlip: false,
    warnings: []
  };

  if (!depends) return out;

  if (local === 'low' || local === 'unknown' || overall === 'low' || overall === 'unknown') {
    if (strongPositive) {
      out.adjustedRecommendation = 'borderline';
      out.demoted = true;
      out.forceUnknownOutcomes = local === 'unknown';
      out.warnings.push(
        local === 'unknown'
          ? 'Local representativeness unknown — strong moisture/precip-dependent suitability claim withheld.'
          : 'Local representativeness uncertain — strong moisture/precip-dependent suitability claim demoted; not auto Not Recommended.'
      );
    } else if (!rec || rec === 'unknown') {
      out.forceUnknownOutcomes = true;
      out.warnings.push('Local representativeness uncertain — keep moisture-dependent outcomes UNKNOWN where evidence is thin.');
    }
  }

  return out;
}
