/**
 * CRUVIT Pre-Scale Suitability Systemic Hardening V1 — contracts (pure).
 *
 * Freezes semantic dimensions and safe demotion helpers across:
 * plant evidence × Coordinate Climate V2 × Garden context × recommendation eligibility.
 *
 * Does not invent climate extremes, chill hours, VPD plant thresholds, or cultivar variation.
 * Uncertainty → Borderline / UNKNOWN / CONDITIONAL / HOLD — never automatic Not Recommended
 * from missing evidence alone.
 */

import {
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2
} from './coordinate-climate-authority-v2-contract.js';
import { atmosphericHumidityMismatchForLowTolerancePlant } from './structural-climate-authority-v1.js';

export const PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION = '1.0.0';
export const SPECIFIC_PLANT_EVALUATOR_VERSION = '1.1.0-pre-scale-hardening';

/** Explicit product dimensions — do not collapse into one Overall claim. */
export const SUITABILITY_DIMENSIONS = Object.freeze({
  CLIMATE_SUITABILITY: 'CLIMATE_SUITABILITY',
  GARDEN_SITE_SUITABILITY: 'GARDEN_SITE_SUITABILITY',
  RECOMMENDATION_ELIGIBILITY: 'RECOMMENDATION_ELIGIBILITY'
});

export const SURVIVAL_CONFIDENCE_MEANING = Object.freeze({
  code: 'normals-monthly-mean-climatology',
  means:
    'Survival outcomes currently use monthly-mean climatology (coldest/warmest month means, freezingRisk from means) plus qualitative plant traits — NOT absolute extreme minima/maxima, frost-day counts, or heat-event frequency.',
  falsePositiveRisk:
    'A plant may survive mean winters yet fail rare hard freezes / heat waves. Without extreme-risk authority, Survival=Reliable must not be marketed as extreme-event proof.',
  extremeAuthorityPresentInDataset: false,
  extremeFieldsAudited: [
    'extreme cold / hard-freeze absolute min — NOT in V2 profiles',
    'extreme heat absolute max / heat-wave frequency — NOT in V2 profiles',
    'frost-day frequency — NOT in V2 profiles'
  ]
});

export const CLIMATE_PERIOD_CLAIM = Object.freeze({
  baselineId: CHELSA_V21_BASELINE.id,
  period: CHELSA_V21_BASELINE.period,
  isCurrentMeasuredClimate: false,
  productClaimAllowed: 'historical climatological normals (1981–2010 CHELSA V2.1)',
  productClaimForbidden: 'current measured climate / live weather',
  futureLayerNeeded: 'CURRENT_NORMAL / CLIMATE_DELTA (centrally prepared — not user-runtime API)',
  priority: 'P1'
});

export const TERRAIN_PRECISION_CLAIM = Object.freeze({
  climateNative: CHELSA_V21_BASELINE.nativeResolutionLabel,
  terrainNative: TERRAIN_LAYER_POLICY_V2.nativeResolutionLabel,
  mode: 'A_interpretation_highland_context_only',
  numericallyDownscalesTemperature: false,
  note: 'High-resolution elevation is terrain context / highland modifier — not measured climate at 30 m.'
});

/**
 * Monthly water-balance / seasonality from stored monthly P & PET (no external calls).
 */
export function deriveMonthlyWaterBalance(climateProfile = {}) {
  const pr =
    climateProfile.monthlyPrecipMm ||
    climateProfile.monthly?.precipMm ||
    climateProfile.coordinateClimateV2?.monthlyPrecipMm ||
    [];
  const pet =
    climateProfile.monthlyPetMm ||
    climateProfile.monthly?.petMm ||
    climateProfile.coordinateClimateV2?.monthlyPetMm ||
    [];
  if (!Array.isArray(pr) || !Array.isArray(pet) || pr.length < 12 || pet.length < 12) {
    return {
      ok: false,
      reason: 'monthly-p-pet-incomplete',
      monthlyAi: null,
      dryMonthCount: null,
      maxConsecutiveDryMonths: null,
      warmSeasonDryOverlap: null,
      seasonalityClass: 'unknown'
    };
  }
  const monthlyAi = [];
  const dryFlags = [];
  for (let i = 0; i < 12; i++) {
    const p = Number(pr[i]);
    const e = Number(pet[i]);
    const ai = Number.isFinite(p) && Number.isFinite(e) && e > 0 ? p / e : null;
    monthlyAi.push(ai == null ? null : Math.round(ai * 1000) / 1000);
    dryFlags.push(ai != null && ai < 0.5);
  }
  let maxRun = 0;
  let run = 0;
  for (let i = 0; i < 24; i++) {
    if (dryFlags[i % 12]) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else run = 0;
  }
  const coldest =
    climateProfile.coldestMonthMeanMinC ??
    climateProfile.coordinateClimateV2?.coldestMonthMeanMinC;
  const tmin =
    climateProfile.monthlyTminC ||
    climateProfile.monthly?.tminC ||
    climateProfile.coordinateClimateV2?.monthlyTminC ||
    [];
  let warmMonths = [];
  if (Array.isArray(tmin) && tmin.length === 12) {
    const vals = tmin.map(Number);
    const finite = vals.filter(Number.isFinite);
    const maxT = finite.length ? Math.max(...finite) : NaN;
    warmMonths = vals
      .map((v, i) => (Number.isFinite(v) && Number.isFinite(maxT) && v >= maxT - 3 ? i : -1))
      .filter((i) => i >= 0);
  }
  const warmSeasonDryOverlap =
    warmMonths.length > 0 ? warmMonths.filter((m) => dryFlags[m]).length / warmMonths.length : null;

  const dryMonthCount = dryFlags.filter(Boolean).length;
  let seasonalityClass = 'unknown';
  if (dryMonthCount >= 10) seasonalityClass = 'hyper-arid-or-year-round-dry';
  else if (dryMonthCount === 0) seasonalityClass = 'year-round-humid';
  else if (warmSeasonDryOverlap != null && warmSeasonDryOverlap >= 0.6 && dryMonthCount >= 3) {
    seasonalityClass = 'warm-season-drought';
  } else if (dryMonthCount >= 3) seasonalityClass = 'seasonal-dry';
  else seasonalityClass = 'mostly-humid';

  return {
    ok: true,
    monthlyAi,
    dryMonthCount,
    maxConsecutiveDryMonths: maxRun,
    warmSeasonDryOverlap,
    seasonalityClass,
    annualAi: climateProfile.aridityIndex ?? climateProfile.coordinateClimateV2?.aridityIndex ?? null,
    coldestMonthMeanMinC: coldest
  };
}

export function seasonalityDemotesStrongClimatePositive(meta, climateProfile) {
  const wb = deriveMonthlyWaterBalance(climateProfile);
  if (!wb.ok) return null;
  const waterNeeds = String(meta?.waterNeeds || '').toLowerCase();
  const annualHumid =
    String(climateProfile?.moistureRegime || '').toLowerCase() === 'humid' ||
    (Number.isFinite(wb.annualAi) && wb.annualAi >= 0.65);
  if (
    waterNeeds === 'high' &&
    wb.seasonalityClass === 'warm-season-drought' &&
    (annualHumid || wb.dryMonthCount >= 3)
  ) {
    return {
      demote: true,
      reason:
        'Annual moisture class does not imply year-round moisture; warm-season drought overlaps plant water demand (irrigation unknown).'
    };
  }
  return { demote: false, waterBalance: wb };
}

export function extremesAuthorityGapDemotesSurvivalPositive(meta, climateProfile) {
  const frost = String(meta?.frostSensitivity || '').toLowerCase();
  const heat = String(meta?.heatTolerance || '').toLowerCase();
  const extremesKnown =
    climateProfile?.extremeColdAuthority === true ||
    climateProfile?.extremeHeatAuthority === true ||
    climateProfile?.frostDayFrequency != null ||
    climateProfile?.absoluteMinTempC != null;
  if (extremesKnown) return { demote: false, extremesKnown: true };
  const material = frost === 'high' || heat === 'low' || frost === 'medium';
  if (!material) return { demote: false, extremesKnown: false, material: false };
  return {
    demote: true,
    extremesKnown: false,
    material: true,
    reason:
      'Survival uses monthly-mean normals only; damaging extreme cold/heat authority is absent — strong positive capped.'
  };
}

export function hemisphereFromLatitude(lat) {
  const n = Number(lat);
  if (!Number.isFinite(n)) return 'unknown';
  if (Math.abs(n) < 8) return 'equatorial';
  return n >= 0 ? 'northern' : 'southern';
}

export function interpretPhenologyCueAgainstClimate(text, climateProfile, lat) {
  const raw = String(text || '').toLowerCase();
  const hemi = hemisphereFromLatitude(lat ?? climateProfile?.coordinate?.lat);
  const alwaysHot = climateProfile?.alwaysHot === true;
  const tminRange =
    climateProfile?.seasonality?.tminRangeC ??
    climateProfile?.coordinateClimateV2?.seasonality?.tminRangeC;
  const lowAmplitude =
    alwaysHot || hemi === 'equatorial' || (Number.isFinite(tminRange) && tminRange < 5);

  const hasSpring = /\bspring\b/.test(raw);
  const hasAutumn = /\b(autumn|fall)\b/.test(raw);
  const hasWinter = /\bwinter\b/.test(raw);

  if (!(hasSpring || hasAutumn || hasWinter)) {
    return { applicable: false, forceUnknown: false, note: 'no-calendar-season-cue' };
  }
  if (lowAmplitude) {
    return {
      applicable: false,
      forceUnknown: true,
      note: 'Near-equatorial / low thermal amplitude — temperate spring/autumn calendar cues are not forced.'
    };
  }
  const coldestMonth =
    climateProfile?.seasonality?.coldestMonth ??
    climateProfile?.coordinateClimateV2?.seasonality?.coldestMonth ??
    null;
  const warmestMonth =
    climateProfile?.seasonality?.warmestMonth ??
    climateProfile?.coordinateClimateV2?.seasonality?.warmestMonth ??
    null;
  return {
    applicable: true,
    forceUnknown: false,
    hemisphere: hemi,
    thermalWinterMonth: coldestMonth,
    thermalSummerMonth: warmestMonth,
    note:
      hemi === 'southern'
        ? 'Southern hemisphere: spring/autumn cues follow local thermal seasons (coldest/warmest months), not NH calendar.'
        : 'Northern hemisphere: spring/autumn cues aligned to local thermal seasons when available.'
  };
}

export function chillConfidenceFromEvidence(meta, climateProfile) {
  const needs =
    meta?.needsWinterChill === true ||
    (Array.isArray(meta?.groupIds) && meta.groupIds.includes('temperate-chill-fruit-tree'));
  if (!needs) return { required: false, confidence: 'n/a' };
  const q = meta?.quantitativeEvidence || {};
  const hasNumeric =
    Number.isFinite(Number(q.chill_hours_min)) || Number.isFinite(Number(q.chill_hours_max));
  const cool = climateProfile?.coolSeasonSignal === true;
  const alwaysHot = climateProfile?.alwaysHot === true;
  if (alwaysHot && !cool) {
    return { required: true, confidence: 'negative-deficit', enoughForReliableFruit: false };
  }
  if (hasNumeric) {
    return {
      required: true,
      confidence: 'numeric-plant-evidence-present',
      enoughForReliableFruit: null,
      note: 'Numeric chill hours on plant require climate chill series to confirm — not invented here.'
    };
  }
  if (cool) {
    return {
      required: true,
      confidence: 'qualitative-cool-season-only',
      enoughForReliableFruit: false,
      note: 'Cool season exists ≠ proven chill-hour sufficiency; fruiting stays bounded.'
    };
  }
  return { required: true, confidence: 'unknown', enoughForReliableFruit: false };
}

export function irrigationWaterSemantics(meta, climateProfile, gardenContext = {}) {
  const waterNeeds = String(meta?.waterNeeds || '').toLowerCase();
  const mr = String(climateProfile?.moistureRegime || '').toLowerCase();
  const arid = mr === 'hyper-arid' || mr === 'arid' || mr === 'semi-arid';
  const irrigation =
    gardenContext.irrigationAvailable === true
      ? 'available'
      : gardenContext.irrigationAvailable === false
        ? 'unavailable'
        : 'unknown';
  if (waterNeeds === 'high' && arid && irrigation === 'unknown') {
    return {
      naturalClimateWater: 'limited',
      gardenIrrigation: 'unknown',
      climateSuitability: 'conditional',
      recommendation: 'CONDITIONAL',
      note: 'High water need in dry climate — suitability conditional on irrigation; do not hard-positive or hard-negative from climate alone.'
    };
  }
  if (waterNeeds === 'high' && arid && irrigation === 'available') {
    return {
      naturalClimateWater: 'limited',
      gardenIrrigation: 'available',
      climateSuitability: 'possible-with-irrigation',
      recommendation: 'CLIMATE_OK_SITE_DEPENDENT'
    };
  }
  if (waterNeeds === 'high' && arid && irrigation === 'unavailable') {
    return {
      naturalClimateWater: 'limited',
      gardenIrrigation: 'unavailable',
      climateSuitability: 'poor',
      recommendation: 'SITE_LIMITED'
    };
  }
  return {
    naturalClimateWater: arid ? 'limited' : 'adequate-or-unknown',
    gardenIrrigation: irrigation,
    climateSuitability: 'climate-assessed',
    recommendation: 'OK'
  };
}

export function gardenSiteSuitabilityDimensions(meta, gardenContext = {}) {
  const sunPlant = meta?.sunNeeds || null;
  const drainPlant = meta?.drainageNeeds || null;
  const sunGarden = gardenContext.sunExposure ?? gardenContext.sun ?? null;
  const drainGarden = gardenContext.drainage ?? null;
  return {
    sun: {
      plantEvidence: sunPlant,
      gardenEvidence: sunGarden,
      status:
        sunPlant && sunGarden
          ? 'comparable'
          : sunPlant && !sunGarden
            ? 'UNKNOWN_GARDEN_CONTEXT'
            : 'UNKNOWN'
    },
    drainage: {
      plantEvidence: drainPlant,
      gardenEvidence: drainGarden,
      status:
        drainPlant && drainGarden
          ? 'comparable'
          : drainPlant && !drainGarden
            ? 'UNKNOWN_GARDEN_CONTEXT'
            : 'UNKNOWN'
    },
    containerVsGround: gardenContext.containerContext == null ? 'UNKNOWN' : 'known',
    protectedMicroclimate: gardenContext.protectedGrowing == null ? 'UNKNOWN' : 'known'
  };
}

export function cultivarPrecisionStatus(plant = {}, meta = {}) {
  const cultivar =
    plant.cultivar || plant.cultivarName || meta.cultivar || plant.variety || null;
  const speciesLevel = !cultivar || String(cultivar).trim() === '';
  return {
    level: speciesLevel ? 'species' : 'cultivar',
    cultivarKnown: !speciesLevel,
    rule: 'Species-level climateTraits must not be treated as cultivar-specific hardiness/chill/flowering precision.',
    surfaceUncertainty: speciesLevel
  };
}

export function recommendationEligibilityFromEvidence({
  needsReview,
  invasiveUncertainty,
  regulatoryHold
} = {}) {
  if (needsReview === true || invasiveUncertainty === true || regulatoryHold === true) {
    return {
      eligibility: 'HOLD_REVIEW',
      maySmartRecommend: false,
      note: 'needsReview / regional-invasive / regulatory uncertainty — HOLD, not confident recommendation.'
    };
  }
  return { eligibility: 'ELIGIBLE_IF_CLIMATE_OK', maySmartRecommend: true };
}

export function buildSuitabilityAuthorityIdentity({
  plantEvidenceVersion = null,
  climateAuthorityVersion = COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  climateBakeVersion = null,
  confidenceQaVersion = null,
  evaluatorVersion = SPECIFIC_PLANT_EVALUATOR_VERSION,
  gardenContextVersion = null
} = {}) {
  return {
    plantEvidenceVersion,
    climateAuthorityVersion,
    climateBakeVersion,
    confidenceQaVersion,
    evaluatorVersion,
    gardenContextVersion
  };
}

export function isPersistedClimateAuthorityStale(
  existingStructural,
  {
    currentAuthorityVersion = COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    currentBakeVersion = null
  } = {}
) {
  if (!existingStructural || typeof existingStructural !== 'object') {
    return { stale: false, reason: 'no-existing' };
  }
  if (String(existingStructural.status || '').toLowerCase() !== 'known') {
    return { stale: true, reason: 'status-not-known' };
  }
  const persistedAuth =
    existingStructural.authorityVersion ||
    existingStructural.provenance?.authorityVersion ||
    existingStructural.coordinateClimateV2?.authorityVersion ||
    null;
  if (persistedAuth && persistedAuth !== currentAuthorityVersion) {
    return {
      stale: true,
      reason: 'authorityVersion-mismatch',
      persisted: persistedAuth,
      current: currentAuthorityVersion
    };
  }
  const persistedBake =
    existingStructural.provenance?.bakeVersion ||
    existingStructural.coordinateClimateV2?.provenance?.bakeVersion ||
    null;
  if (currentBakeVersion != null && persistedBake != null && persistedBake !== currentBakeVersion) {
    return {
      stale: true,
      reason: 'bakeVersion-mismatch',
      persisted: persistedBake,
      current: currentBakeVersion
    };
  }
  return { stale: false, reason: 'versions-match-or-bake-unspecified' };
}

/**
 * Apply systemic demotions to an overall recommendation.
 * Never invents Not Recommended from missing evidence alone.
 */
export function applyPreScaleSystemicDemotions({
  overall,
  meta,
  climateProfile,
  plant,
  gardenContext = {},
  needsReview = false
} = {}) {
  const warnings = [];
  let next = overall;
  const dims = {
    [SUITABILITY_DIMENSIONS.CLIMATE_SUITABILITY]: overall,
    [SUITABILITY_DIMENSIONS.GARDEN_SITE_SUITABILITY]: 'UNKNOWN',
    [SUITABILITY_DIMENSIONS.RECOMMENDATION_ELIGIBILITY]: 'UNKNOWN'
  };

  const hum = atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile);
  if (hum && (next === 'good' || next === 'excellent')) {
    next = 'borderline';
    warnings.push(
      hum.severity === 'strong'
        ? 'Atmospheric humidity demotion: low humidityTolerance vs high atmospheric humidity (hurs/RH); not from moistureRegime.'
        : 'Atmospheric humidity demotion: low humidityTolerance vs transition-band RH — confidence constrained without inventing a hard plant RH cutoff.'
    );
  }

  const extremes = extremesAuthorityGapDemotesSurvivalPositive(meta, climateProfile);
  if (extremes.demote && (next === 'good' || next === 'excellent')) {
    next = 'borderline';
    warnings.push(extremes.reason);
  }

  const season = seasonalityDemotesStrongClimatePositive(meta, climateProfile);
  if (season?.demote && (next === 'good' || next === 'excellent')) {
    next = 'borderline';
    warnings.push(season.reason);
  }

  const chill = chillConfidenceFromEvidence(meta, climateProfile);
  if (
    chill.required &&
    chill.confidence === 'qualitative-cool-season-only' &&
    (next === 'good' || next === 'excellent')
  ) {
    next = 'borderline';
    warnings.push(chill.note);
  }

  const irrig = irrigationWaterSemantics(meta, climateProfile, gardenContext);
  if (irrig.recommendation === 'CONDITIONAL' && (next === 'good' || next === 'excellent')) {
    next = 'borderline';
    warnings.push(irrig.note);
  }

  const site = gardenSiteSuitabilityDimensions(meta, gardenContext);
  if (
    site.sun.status === 'UNKNOWN_GARDEN_CONTEXT' ||
    site.drainage.status === 'UNKNOWN_GARDEN_CONTEXT'
  ) {
    dims[SUITABILITY_DIMENSIONS.GARDEN_SITE_SUITABILITY] = 'UNKNOWN_OR_CONDITIONAL';
    if (next === 'excellent') next = 'good';
    warnings.push(
      'Garden sun/drainage context unknown — Overall is climate suitability, not a complete garden-site assessment.'
    );
  } else if (site.sun.status === 'comparable' || site.drainage.status === 'comparable') {
    dims[SUITABILITY_DIMENSIONS.GARDEN_SITE_SUITABILITY] = 'PARTIAL';
  }

  const cultivar = cultivarPrecisionStatus(plant, meta);
  if (cultivar.surfaceUncertainty && (next === 'good' || next === 'excellent')) {
    warnings.push(
      'Species-level evidence only — cultivar-specific hardiness/chill/flowering unknown; confidence bounded.'
    );
  }

  const lat = climateProfile?.coordinate?.lat ?? climateProfile?.provenance?.lat;
  const pheno = interpretPhenologyCueAgainstClimate(
    meta?.floweringRequirements || meta?.fruitingRequirements,
    climateProfile,
    lat
  );
  if (pheno.forceUnknown) warnings.push(pheno.note);

  const rec = recommendationEligibilityFromEvidence({ needsReview });
  dims[SUITABILITY_DIMENSIONS.RECOMMENDATION_ELIGIBILITY] = rec.eligibility;
  if (!rec.maySmartRecommend && (next === 'good' || next === 'excellent')) {
    next = 'borderline';
    warnings.push(rec.note);
  }

  dims[SUITABILITY_DIMENSIONS.CLIMATE_SUITABILITY] = next;

  return {
    overall: next,
    warnings,
    dimensions: dims,
    survivalConfidenceMeaning: SURVIVAL_CONFIDENCE_MEANING,
    climatePeriod: CLIMATE_PERIOD_CLAIM,
    terrainPrecision: TERRAIN_PRECISION_CLAIM,
    waterBalance: deriveMonthlyWaterBalance(climateProfile),
    chill,
    irrigation: irrig,
    gardenSite: site,
    cultivar,
    phenology: pheno,
    recommendationEligibility: rec,
    humidityMismatch: hum,
    extremesGap: extremes,
    evaluatorVersion: SPECIFIC_PLANT_EVALUATOR_VERSION,
    hardeningVersion: PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION
  };
}
