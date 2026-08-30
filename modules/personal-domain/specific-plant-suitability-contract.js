/**
 * Specific Plant Suitability Check V1 ג€” pure helpers (no DOM / network).
 * Product authority for scoring remains app.html smartRecEvaluateSuitability.
 * This module only formats results, search ranking, and garden-gate rules.
 */

import {
  DAMAGING_COLD_MONTH_MEAN_MIN_C,
  applyStructuralClimateToProfile,
  atmosphericHumidityMismatchForLowTolerancePlant,
  isFrostFreeGrowingClimateFromStructural,
  moistureMismatchForHighHumidityPlant,
  outdoorDamagingColdUnsupported,
  thermalRegimeFromStructuralEvidence
} from './structural-climate-authority-v1.js';
import { applyRepresentativenessToSuitabilityClaim } from './coordinate-climate-confidence-v2-contract.js';
import {
  quantitativeColdSurvivalUnsupported,
  quantitativeHeatUnsupported,
  quantitativeVpdUnsupported
} from '../catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';
import { applyPreScaleSystemicDemotions } from './pre-scale-suitability-systemic-hardening-v1-contract.js';
import {
  assessPlantClimateColdSurvival,
  plantRequiresYearRoundWarmClimate,
  buildPlantDiscriminatedSuitabilityStub
} from './plant-climate-suitability-baseline-v1.js';
import { resolveFruitingWithBiologicalEligibility, readBiologicalFruitSetEvidence } from '../catalog-expansion/reproductive-biology-v1-contract.js';
import { applyEvidenceStrengthPropagation } from './evidence-strength-propagation-v1-contract.js';

export { atmosphericHumidityMismatchForLowTolerancePlant };
export {
  assessPlantClimateColdSurvival,
  plantRequiresYearRoundWarmClimate,
  buildPlantDiscriminatedSuitabilityStub
};
export {
  applyEvidenceStrengthPropagation,
  resolveTraitEvidenceClass,
  BATCH_2_EVIDENCE_INGESTION_RULE,
  EVIDENCE_STRENGTH_PROPAGATION_VERSION
} from './evidence-strength-propagation-v1-contract.js';

export const SPECIFIC_PLANT_SUITABILITY_LEVELS = Object.freeze([
  'excellent',
  'good',
  'borderline',
  'blocked'
]);

export const SPECIFIC_PLANT_LEVEL_LABELS = Object.freeze({
  excellent: 'Excellent',
  good: 'Good',
  borderline: 'Borderline',
  blocked: 'Not recommended'
});

/** Preference/browse filters must not gate this check. */
export const SPECIFIC_CHECK_CLEARS_SMART_REC_ANSWERS = true;

export function formatSpecificPlantLevelLabel(level) {
  const key = String(level || '').trim().toLowerCase();
  return SPECIFIC_PLANT_LEVEL_LABELS[key] || 'Borderline';
}

export function normalizeSpecificPlantQuery(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[׳´"׳³ג€™`]/g, '')
    .replace(/^׳¢׳¥\s+/, '')
    .replace(/\s+/g, ' ');
}

/**
 * Catalog search for specific-plant check ג€” no Smart Rec browse preference filters.
 * @param {object[]} plants PLANT_LIBRARY-like rows
 * @param {string} query
 * @param {(p: object) => string} [textForSearch]
 */
export function searchCatalogPlantsForSpecificCheck(plants, query, textForSearch) {
  const list = Array.isArray(plants) ? plants : [];
  const q = normalizeSpecificPlantQuery(query);
  if (!q) return list.slice(0, 40);
  const textFn =
    typeof textForSearch === 'function'
      ? textForSearch
      : (p) =>
          [p.slug, p.name, p.he, p.scientific, ...(p.aliases || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
  const exact = [];
  const contains = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const aliases = [p.slug, p.name, p.he, p.scientific, ...(p.aliases || [])]
      .filter(Boolean)
      .map(normalizeSpecificPlantQuery);
    if (aliases.some((a) => a === q || a.replace(/^׳¢׳¥\s+/, '') === q)) exact.push(p);
    else if (textFn(p).includes(q)) contains.push(p);
  }
  const merged = [...exact, ...contains];
  const seen = new Set();
  return merged.filter((p) => {
    const key = String(p.slug || p.name || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Gate: personal Garden suitability check requires owned active Garden + trusted location.
 */
export function mayRunSpecificPlantSuitabilityCheck(state = {}) {
  const gardenCount = Number(state.gardenCount) || 0;
  const activeGardenId = String(state.activeGardenId || '').trim();
  const hasTrustedLocation = state.hasTrustedLocation === true;
  if (gardenCount <= 0) {
    return { ok: false, reason: 'no-garden', message: 'Create or open an owned Garden Profile first.' };
  }
  if (gardenCount > 1 && !activeGardenId) {
    return {
      ok: false,
      reason: 'select-garden',
      message: 'Select which Garden to check before evaluating a plant.'
    };
  }
  if (!hasTrustedLocation) {
    return {
      ok: false,
      reason: 'no-location',
      message: 'Confirm a trusted location on this Garden before checking plant suitability.'
    };
  }
  return { ok: true, reason: 'ready', message: '' };
}

/**
 * Build a display model from evaluator output + four-outcome quality gate.
 * Overall verdict comes from deriveSpecificPlantOutcomes (not raw browse score alone).
 */
export function buildSpecificPlantSuitabilityViewModel({
  plant,
  gardenName,
  locationLabel,
  climateLabel,
  suitability,
  outcomes
} = {}) {
  const p = plant && typeof plant === 'object' ? plant : {};
  const s = suitability && typeof suitability === 'object' ? suitability : {};
  const o =
    outcomes && typeof outcomes === 'object'
      ? outcomes
      : deriveSpecificPlantOutcomes({
          meta: null,
          climateProfile: {},
          suitability: s,
          plant: p,
          protectedGrowing: false
        });
  const level = String(o.overall || s.recommendationLevel || 'borderline').toLowerCase();
  const warnings = Array.isArray(o.limitingFactors)
    ? o.limitingFactors
    : Array.isArray(s.warnings)
      ? s.warnings.map((w) => String(w || '').trim()).filter(Boolean)
      : [];
  const explanation = String(s.explanationText || warnings[0] || '').trim();
  return {
    plantName: String(p.name || p.slug || 'Plant'),
    scientific: String(p.scientific || '').trim() || null,
    gardenName: String(gardenName || '').trim() || null,
    locationLabel: String(locationLabel || '').trim() || null,
    climateLabel: String(climateLabel || '').trim() || null,
    recommendationLevel: SPECIFIC_PLANT_SUITABILITY_LEVELS.includes(level)
      ? level
      : 'borderline',
    levelLabel: formatSpecificPlantLevelLabel(level),
    suitabilityScore:
      typeof s.suitabilityScore === 'number' ? s.suitabilityScore : null,
    warnings,
    explanationText: explanation || null,
    needsReview: p.climateTraits?.needsReview === true || p.needsReview === true,
    outcomes: o,
    survival: o.survival,
    growth: o.growth,
    flowering: o.flowering,
    fruiting: o.fruiting,
    survivalLabel: o.survivalLabel,
    growthLabel: o.growthLabel,
    floweringLabel: o.floweringLabel,
    fruitingLabel: o.fruitingLabel,
    limitingFactors: warnings
  };
}

/**
 * Run evaluator with empty Smart Rec session answers so browse prefs cannot block.
 */
export function runSpecificPlantSuitabilityEvaluation(evaluateFn, plant, sessionRef) {
  if (typeof evaluateFn !== 'function') {
    throw new Error('evaluateFn is required');
  }
  const session = sessionRef && typeof sessionRef === 'object' ? sessionRef : null;
  const saved = session ? session.answers : undefined;
  if (session) session.answers = {};
  try {
    return evaluateFn(plant);
  } finally {
    if (session) session.answers = saved;
  }
}

export function findCatalogPlantBySlugOrName(plants, needle) {
  const q = normalizeSpecificPlantQuery(needle);
  if (!q) return null;
  const list = Array.isArray(plants) ? plants : [];
  return (
    list.find((p) => normalizeSpecificPlantQuery(p.slug) === q) ||
    list.find((p) => normalizeSpecificPlantQuery(p.name) === q) ||
    list.find((p) =>
      (p.aliases || []).some((a) => normalizeSpecificPlantQuery(a) === q)
    ) ||
    list.find((p) => normalizeSpecificPlantQuery(p.scientific) === q) ||
    null
  );
}

/** Catalog gap reporters for Owner follow-on expansion (no invented metadata). */
export function reportCoconutCatalogStatus(plants) {
  const hit = findCatalogPlantBySlugOrName(plants, 'coconut') ||
    findCatalogPlantBySlugOrName(plants, 'Cocos nucifera');
  if (!hit) {
    return {
      present: false,
      identity: null,
      climateMetadata: 'absent',
      canJudgeResponsibly: false,
      note: 'Coconut / Cocos nucifera not found in current catalog.'
    };
  }
  const traits = hit.climateTraits && typeof hit.climateTraits === 'object' ? hit.climateTraits : null;
  const hasCore =
    !!traits &&
    !!(traits.frostSensitivity || traits.heatTolerance || traits.coldTolerance);
  return {
    present: true,
    identity: {
      slug: hit.slug || null,
      name: hit.name || hit.names?.en || null,
      scientific: hit.scientific || null
    },
    climateMetadata: hasCore ? 'seed-climateTraits-present' : 'insufficient',
    needsReview: traits?.needsReview === true,
    canJudgeResponsibly: hasCore,
    note: hasCore
      ? 'Present with climateTraits; engine can evaluate (needsReview may cap confidence).'
      : 'Present but climateTraits incomplete for responsible judgment.'
  };
}

export function reportCacaoCatalogStatus(plants) {
  const hit =
    findCatalogPlantBySlugOrName(plants, 'cacao') ||
    findCatalogPlantBySlugOrName(plants, 'cocoa') ||
    findCatalogPlantBySlugOrName(plants, 'Theobroma cacao');
  if (!hit) {
    return {
      present: false,
      identity: null,
      climateMetadata: 'absent',
      canJudgeResponsibly: false,
      note: 'Cacao / Theobroma cacao not found in current catalog.'
    };
  }
  const traits = hit.climateTraits && typeof hit.climateTraits === 'object' ? hit.climateTraits : null;
  const hasCore =
    !!traits &&
    !!(traits.frostSensitivity || traits.heatTolerance || traits.coldTolerance);
  return {
    present: true,
    identity: {
      slug: hit.slug || null,
      name: hit.name || hit.names?.en || null,
      scientific: hit.scientific || null
    },
    climateMetadata: hasCore ? 'seed-climateTraits-present' : 'insufficient',
    needsReview: traits?.needsReview === true,
    canJudgeResponsibly: hasCore,
    note: hasCore
      ? 'Present with climateTraits; engine can evaluate.'
      : 'Present but climateTraits incomplete.'
  };
}

/** Exact engine copy when climate meta is missing (smartRecEvaluateSuitability). */
export const INSUFFICIENT_CLIMATE_META_MESSAGE =
  'Detailed climate data is unavailable for this plant, so it cannot yet be confidently recommended for your location.';

export function insufficientClimateMetaSuitabilityResult() {
  return {
    suitabilityScore: 50,
    recommendationLevel: 'borderline',
    survivalFit: 50,
    thriveFit: 50,
    floweringFit: 50,
    fruitingFit: 50,
    warnings: [INSUFFICIENT_CLIMATE_META_MESSAGE],
    explanationText: INSUFFICIENT_CLIMATE_META_MESSAGE
  };
}

/** Mirrors app.html broadClimateFromLabel ג€” used only to map hydrated Garden climate. */
export function broadClimateFromLocationClimate(label) {
  const climateLabel = String(label || '').toLowerCase();
  if (climateLabel.includes('cool temperate')) return 'cool-temperate';
  if (climateLabel.includes('mediterranean')) return 'mediterranean';
  if (climateLabel.includes('subtropical')) return 'subtropical';
  if (climateLabel.includes('tropical')) return 'tropical';
  if (climateLabel.includes('temperate')) return 'temperate';
  if (climateLabel.includes('arid') || climateLabel.includes('desert')) return 'arid';
  return 'unknown';
}

/** Mirrors smartRecClimateProfile structural freezingRisk (no weather override). */
export function structuralFreezingRiskFromBroadClimate(broadClimate) {
  const broad = String(broadClimate || '').toLowerCase();
  if (broad === 'cool-temperate') return 'high';
  if (broad === 'temperate') return 'medium';
  return 'low';
}

/**
 * Climate signals from a hydrated app location partial (serverLocationToAppPartial ג†’ setAppLocation).
 * Does not invent climate; uses the Gardenג€™s stored location_climate.
 */
export function climateSignalsFromHydratedAppPartial(partial) {
  if (!partial || typeof partial !== 'object') return null;
  const label = String(partial.label || '').trim();
  const climate = String(partial.climate || '').trim();
  if (!label || !climate) return null;
  const broadClimate = broadClimateFromLocationClimate(climate);
  return {
    locationLabel: label,
    climateLabel: climate,
    broadClimate,
    freezingRisk: structuralFreezingRiskFromBroadClimate(broadClimate),
    isFrostFreeGrowingClimate: isFrostFreeGrowingClimate({
      broadClimate,
      freezingRisk: structuralFreezingRiskFromBroadClimate(broadClimate)
    })
  };
}

/**
 * Frost-free growing climate for warm tropical/subtropical logic.
 * Structural thermal evidence (coldest-month lows, elevation, cold risk)
 * overrides latitude-band tropical labels.
 */
export function isFrostFreeGrowingClimate(climateProfile) {
  return isFrostFreeGrowingClimateFromStructural(climateProfile || {});
}

/** Same chill authority as Smart Recommendations — not a second engine. */
export function plantNeedsWinterChill(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.needsWinterChill === true) return true;
  const groups = Array.isArray(meta.groupIds) ? meta.groupIds : [];
  return groups.includes('temperate-chill-fruit-tree');
}

export function climateLacksWinterChillSignal(env = {}) {
  return !!env.alwaysHot && !env.coolSeasonSignal;
}

/**
 * Structural environment signals from Garden climate profile.
 * Prefers long-term Structural Climate Authority V1 fields when present (KNOWN).
 * Falls back to broadClimate bands only when structural slots are absent/UNKNOWN.
 * Cacheable at location hydrate — not recomputed per plant via network.
 */
export function structuralEnvironmentFromClimateProfile(climateProfile = {}) {
  const merged = applyStructuralClimateToProfile(climateProfile, climateProfile.structuralClimate);
  let broad = String(
    merged.broadClimate ||
      broadClimateFromLocationClimate(merged.climateLabel || climateProfile.climate || '')
  ).toLowerCase();
  if (merged.moistureRegime === 'hyper-arid' || merged.moistureRegime === 'arid') {
    broad = 'arid';
  }
  const elevationM = merged.elevationM ?? climateProfile.elevationM ?? null;
  const coldRaw = merged.coldestMonthMeanMinC ?? climateProfile.coldestMonthMeanMinC;
  const coldestMonthMeanMinC =
    coldRaw == null || coldRaw === '' ? null : Number(coldRaw);
  const freezingFromBands = structuralFreezingRiskFromBroadClimate(
    broad === 'highland-tropical' ? 'tropical' : broad
  );
  const freezingRisk = String(
    merged.freezingRisk || climateProfile.freezingRisk || freezingFromBands
  ).toLowerCase();
  const thermalRegime =
    merged.thermalRegime ||
    climateProfile.thermalRegime ||
    thermalRegimeFromStructuralEvidence({
      coldestMonthMeanMinC,
      elevationM,
      structuralColdRisk: merged.structuralColdRisk || climateProfile.structuralColdRisk,
      freezingRisk
    });
  const humidityFromBands =
    broad === 'tropical'
      ? 'high'
      : broad === 'highland-tropical'
        ? 'medium'
        : broad === 'subtropical'
          ? 'medium'
          : broad === 'mediterranean' || broad === 'arid'
            ? 'low'
            : 'medium';
  // Prefer ATMOSPHERIC authority from stored hurs series — never moistureRegime.
  let humiditySignal = String(merged.humiditySignal || '').toLowerCase();
  const hursMonths =
    climateProfile.monthlyHursPct ||
    climateProfile.coordinateClimateV2?.monthlyHursPct ||
    merged.monthlyHursPct;
  const meanRh =
    climateProfile.meanRelativeHumidityPct ??
    climateProfile.coordinateClimateV2?.meanRelativeHumidityPct ??
    merged.meanRelativeHumidityPct;
  if (Array.isArray(hursMonths) || meanRh != null) {
    let mean = meanRh != null && meanRh !== '' ? Number(meanRh) : null;
    if ((!Number.isFinite(mean) || mean == null) && Array.isArray(hursMonths)) {
      const fin = hursMonths.map(Number).filter((n) => Number.isFinite(n));
      if (fin.length >= 6) mean = fin.reduce((a, b) => a + b, 0) / fin.length;
    }
    if (Number.isFinite(mean)) {
      if (mean < 45) humiditySignal = 'low';
      else if (mean < 60) humiditySignal = 'medium';
      else if (mean < 70) humiditySignal = 'borderline';
      else humiditySignal = 'high';
    }
  }
  if (!humiditySignal || humiditySignal === 'unknown' || humiditySignal === 'null') {
    humiditySignal = String(humidityFromBands).toLowerCase();
  }
  const drySeasonSignal =
    merged.drySeasonSignal === true ||
    climateProfile.drySeasonSignal === true ||
    broad === 'mediterranean' ||
    broad === 'arid';
  const frostFree = isFrostFreeGrowingClimate({
    ...merged,
    broadClimate: broad,
    freezingRisk,
    coldestMonthMeanMinC,
    elevationM,
    thermalRegime,
    structuralColdRisk: merged.structuralColdRisk || climateProfile.structuralColdRisk
  });
  // Year-round heat requires structural thermal support — highland tropics are not alwaysHot.
  const alwaysHot =
    climateProfile.alwaysHot === true ||
    thermalRegime === 'year-round-warm' ||
    (broad === 'tropical' &&
      frostFree &&
      thermalRegime !== 'cool-highland' &&
      thermalRegime !== 'cool-seasonal' &&
      thermalRegime !== 'frost-prone');
  const coolSeasonSignal =
    climateProfile.coolSeasonSignal === true ||
    broad === 'temperate' ||
    broad === 'cool-temperate' ||
    broad === 'mediterranean' ||
    broad === 'highland-tropical' ||
    thermalRegime === 'cool-highland' ||
    thermalRegime === 'cool-seasonal' ||
    thermalRegime === 'frost-prone' ||
    (Number.isFinite(coldestMonthMeanMinC) &&
      coldestMonthMeanMinC < DAMAGING_COLD_MONTH_MEAN_MIN_C);
  return {
    broadClimate: broad,
    freezingRisk,
    humiditySignal,
    drySeasonSignal: !!drySeasonSignal,
    alwaysHot: !!alwaysHot,
    coolSeasonSignal: !!coolSeasonSignal,
    isFrostFreeGrowingClimate: frostFree,
    thermalRegime,
    elevationM,
    moistureRegime: merged.moistureRegime || climateProfile.moistureRegime || 'unknown',
    humidityRegime: merged.humidityRegime || climateProfile.humidityRegime || 'unknown',
    atmosphericHumidityRegime:
      climateProfile.atmosphericHumidityRegime ||
      merged.atmosphericHumidityRegime ||
      (humiditySignal && humiditySignal !== 'unknown' ? humiditySignal : 'unknown'),
    meanRelativeHumidityPct:
      meanRh != null && meanRh !== '' && Number.isFinite(Number(meanRh))
        ? Number(meanRh)
        : climateProfile.meanRelativeHumidityPct ?? merged.meanRelativeHumidityPct ?? null,
    monthlyHursPct: Array.isArray(hursMonths)
      ? hursMonths
      : climateProfile.monthlyHursPct || merged.monthlyHursPct || null,
    monthlyVpdPa:
      climateProfile.monthlyVpdPa ||
      climateProfile.coordinateClimateV2?.monthlyVpdPa ||
      merged.monthlyVpdPa ||
      null,
    meanVpdPa:
      climateProfile.meanVpdPa ??
      climateProfile.coordinateClimateV2?.meanVpdPa ??
      merged.meanVpdPa ??
      null,
    structuralColdRisk: merged.structuralColdRisk || climateProfile.structuralColdRisk || 'unknown',
    coldestMonthMeanMinC,
    annualPrecipitationMm:
      merged.annualPrecipitationMm ?? climateProfile.annualPrecipitationMm ?? null,
    annualPetMm: merged.annualPetMm ?? climateProfile.annualPetMm ?? null,
    aridityIndex: merged.aridityIndex ?? climateProfile.aridityIndex ?? null,
    structuralClimateStatus:
      merged.structuralClimateStatus || climateProfile.structuralClimateStatus || 'unknown',
    structuralClimate: merged.structuralClimate || climateProfile.structuralClimate || null,
    coordinateClimateV2: climateProfile.coordinateClimateV2 || merged.coordinateClimateV2 || null
  };
}

/** Enrich hydrated Garden climate signals with structural humidity/dry regimes. */
export function enrichClimateSignalsWithStructuralEnvironment(signals) {
  if (!signals) return null;
  const env = structuralEnvironmentFromClimateProfile(signals);
  return { ...signals, ...env };
}

/** Mirrors climateSuitabilityV1IsWarmTropicalFrostSensitiveGroup. */
export function isWarmTropicalFrostSensitiveGroup(meta) {
  const groupIds = Array.isArray(meta?.groupIds) ? meta.groupIds : [];
  return (
    groupIds.includes('tropical-frost-sensitive-fruit') ||
    groupIds.includes('frost-sensitive-ornamental') ||
    groupIds.includes('warm-climate-palm') ||
    groupIds.includes('hot-dry-palm')
  );
}

export const SPECIFIC_OUTCOME_STATUS = Object.freeze({
  RELIABLE: 'reliable',
  SUPPORTED: 'supported',
  CONSTRAINED: 'constrained',
  POOR: 'poor',
  UNRELIABLE: 'unreliable',
  UNLIKELY: 'unlikely',
  UNKNOWN: 'unknown'
});

export const SPECIFIC_OUTCOME_LABELS = Object.freeze({
  reliable: 'Reliable',
  supported: 'Supported',
  constrained: 'Constrained',
  poor: 'Poor',
  unreliable: 'Unreliable',
  unlikely: 'Unlikely',
  unknown: 'UNKNOWN'
});

export function formatSpecificOutcomeLabel(status) {
  const key = String(status || '').trim().toLowerCase();
  return SPECIFIC_OUTCOME_LABELS[key] || 'UNKNOWN';
}

/** Positive flowering requires explicit floweringRequirements. */
export function hasPositiveFloweringEvidence(meta) {
  return !!(meta && String(meta.floweringRequirements || '').trim());
}

/** @deprecated use hasPositiveFloweringEvidence */
export function hasFloweringEvidence(meta, plant) {
  void plant;
  return hasPositiveFloweringEvidence(meta);
}

/** Positive fruiting requires explicit fruitingRequirements — not fruit group alone. */
export function hasPositiveFruitingEvidence(meta) {
  return !!(meta && String(meta.fruitingRequirements || '').trim());
}

/** Failure-context for fruiting (frost rules) may use fruit groups / tags / notes. */
export function hasFruitingFailureContext(meta, plant) {
  if (hasPositiveFruitingEvidence(meta)) return true;
  const groupIds = Array.isArray(meta?.groupIds) ? meta.groupIds : [];
  if (
    groupIds.some(
      (id) =>
        String(id).includes('fruit') ||
        String(id).includes('citrus') ||
        String(id).includes('berry') ||
        String(id).includes('chill')
    )
  ) {
    return true;
  }
  const tags = Array.isArray(plant?.tags) ? plant.tags.map((t) => String(t).toLowerCase()) : [];
  if (tags.some((t) => t === 'fruit' || t === 'citrus' || t === 'berry' || t === 'edible')) {
    return true;
  }
  return String(meta?.survivalVsThriveNotes || '')
    .toLowerCase()
    .includes('fruit');
}

/** @deprecated */
export function hasFruitingEvidence(meta, plant) {
  return hasPositiveFruitingEvidence(meta) || hasFruitingFailureContext(meta, plant);
}

/**
 * Parse a minimum temperature (°C) from flowering/fruiting requirement prose.
 * Supports patterns like "68°F (20°C)", "above 20°C", "at or above 20 C".
 * Returns null when no comparable numeric threshold is present.
 */
export function parseMinTempCFromRequirements(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const parenC = raw.match(/\(\s*(-?\d+(?:\.\d+)?)\s*°?\s*C\s*\)/i);
  if (parenC) {
    const n = Number(parenC[1]);
    return Number.isFinite(n) ? n : null;
  }
  const aboveC = raw.match(
    /(?:at\s+or\s+)?(?:above|over|≥|>=|minimum|min(?:imum)?)\s*(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i
  );
  if (aboveC) {
    const n = Number(aboveC[1]);
    return Number.isFinite(n) ? n : null;
  }
  const bareC = raw.match(/\b(-?\d+(?:\.\d+)?)\s*°\s*C\b/i);
  if (bareC) {
    const n = Number(bareC[1]);
    return Number.isFinite(n) ? n : null;
  }
  const fMatch = raw.match(
    /(?:at\s+or\s+)?(?:above|over|≥|>=)?\s*(-?\d+(?:\.\d+)?)\s*°?\s*F\b/i
  );
  if (fMatch) {
    const f = Number(fMatch[1]);
    if (!Number.isFinite(f)) return null;
    return ((f - 32) * 5) / 9;
  }
  return null;
}

function requirementsText(meta, kind) {
  if (kind === 'flowering') return String(meta?.floweringRequirements || '');
  return String(meta?.fruitingRequirements || '');
}

function requirementsWantTropicalWarmth(text) {
  return /tropical|frost-?\s*free|year-?\s*round\s*warm|warm\s+tropical|near year-round|always.?hot/i.test(
    String(text || '')
  );
}

function requirementsMentionDroughtOrMoisture(text) {
  return /drought|soil moisture|year-round (soil )?moisture|humid|high humidity|moisture/i.test(
    String(text || '')
  );
}

function requirementsMentionCoolSlows(text) {
  return /cool weather|cold snap|prolonged cool|wet cold|mild frost-free|frost damages/i.test(
    String(text || '')
  );
}

/**
 * Compare Garden climate to floweringRequirements without using numeric fit scores.
 * @returns {{ status: string, limiting?: string, unknownGap?: string, evidence: string }}
 */
export function evaluateFloweringFromCatalogEvidence({
  meta,
  env,
  survival,
  chillDeficit = false,
  review = false,
  sheltered = false
} = {}) {
  const text = requirementsText(meta, 'flowering');
  const hasPositive = hasPositiveFloweringEvidence(meta);
  const frostSensitivity = String(meta?.frostSensitivity || '').toLowerCase();
  const humidityTolerance = String(meta?.humidityTolerance || '').toLowerCase();
  const tropicalMoisturePlant =
    isWarmTropicalFrostSensitiveGroup(meta) && humidityTolerance === 'high';
  const frostFree = !!env?.isFrostFreeGrowingClimate;
  const freezingRisk = String(env?.freezingRisk || '').toLowerCase();
  const humiditySignal = String(env?.humiditySignal || '').toLowerCase();
  const broad = String(env?.broadClimate || '').toLowerCase();
  const thermal = String(env?.thermalRegime || '').toLowerCase();
  const coldRaw = env?.coldestMonthMeanMinC;
  const coldest =
    coldRaw == null || coldRaw === '' ? null : Number(coldRaw);
  const minTempC = parseMinTempCFromRequirements(text);

  // Explicit negative evidence (may apply even without positive requirement text).
  if (!sheltered && chillDeficit) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting:
        'Reliable flowering and fruiting need winter chill or a clear cool season; always-hot climates without a cool-season signal are a poor match.',
      evidence: 'negative:chill-deficit'
    };
  }
  if (
    !sheltered &&
    survival === SPECIFIC_OUTCOME_STATUS.UNRELIABLE &&
    (frostSensitivity === 'high' || tropicalMoisturePlant)
  ) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      evidence: 'negative:survival-failure-blocks-normal-flowering'
    };
  }
  if (!sheltered && frostSensitivity === 'high' && freezingRisk !== 'low') {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: 'Frost risk is too high for reliable flowering.',
      evidence: 'negative:freezing-risk'
    };
  }
  if (!sheltered && frostSensitivity === 'high' && !frostFree) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: 'Needs frost-free conditions for flowering.',
      evidence: 'negative:not-frost-free'
    };
  }
  if (!sheltered && outdoorDamagingColdUnsupported(meta, env)) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: `Coldest-month mean lows (~${coldest}°C) are below the warm tropical reliability band for flowering.`,
      evidence: 'negative:damaging-cold'
    };
  }
  if (!sheltered && moistureMismatchForHighHumidityPlant(meta, env)) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: `Structural moisture regime (${env.moistureRegime}) conflicts with flowering moisture needs.`,
      evidence: 'negative:aridity-moisture-mismatch'
    };
  }
  if (!sheltered && tropicalMoisturePlant && humiditySignal === 'low') {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: 'Low humidity / dry-air climate is a poor match for flowering.',
      evidence: 'negative:low-humidity'
    };
  }
  if (minTempC != null && Number.isFinite(coldest) && coldest < minTempC) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
      limiting: `Coldest-month mean lows (~${coldest}°C) are below sourced flowering minimum (~${minTempC}°C).`,
      evidence: `negative:min-temp:${minTempC}C`
    };
  }

  if (!hasPositive) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
      unknownGap: 'floweringRequirements',
      evidence: 'missing:floweringRequirements'
    };
  }

  // Positive path: only when climate can be compared to sourced requirements.
  const wantsWarm = requirementsWantTropicalWarmth(text) || frostSensitivity === 'high';
  const droughtCue = requirementsMentionDroughtOrMoisture(text);
  const coolSlows = requirementsMentionCoolSlows(text);

  if (minTempC != null) {
    if (!Number.isFinite(coldest)) {
      return {
        status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
        unknownGap: 'flowering-coldest-month',
        evidence: 'incomplete:min-temp-without-coldest-month'
      };
    }
    if (coldest >= minTempC) {
      if (droughtCue && (humiditySignal === 'low' || moistureMismatchForHighHumidityPlant(meta, env))) {
        return {
          status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
          limiting: 'Drought / low-moisture climate conflicts with sourced flowering moisture needs.',
          evidence: 'negative:drought-vs-flowering-moisture'
        };
      }
      if (
        tropicalMoisturePlant &&
        humiditySignal === 'medium' &&
        broad !== 'tropical'
      ) {
        return {
          status: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
          limiting:
            'Humidity and moisture regime are only a partial match for flowering; frost-free status alone is not enough.',
          evidence: 'partial:humidity-medium-non-tropical'
        };
      }
      return {
        status: review
          ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED
          : SPECIFIC_OUTCOME_STATUS.SUPPORTED,
        evidence: `positive:coldest-month:${coldest}>=min:${minTempC}`
      };
    }
  }

  if (wantsWarm) {
    const warmOk =
      frostFree &&
      (broad === 'tropical' ||
        env?.alwaysHot === true ||
        thermal === 'year-round-warm');
    const humidOk =
      !tropicalMoisturePlant ||
      humiditySignal === 'high' ||
      (humiditySignal === 'medium' && broad === 'tropical');
    if (warmOk && humidOk && !moistureMismatchForHighHumidityPlant(meta, env)) {
      if (coolSlows && (env?.coolSeasonSignal === true || /cool|frost-prone|highland/.test(thermal))) {
        return {
          status: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
          limiting: 'Cool-season signal may slow flowering relative to sourced warm-tropical needs.',
          evidence: 'partial:cool-season-vs-warm-tropical-flowering'
        };
      }
      return {
        status: review
          ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED
          : SPECIFIC_OUTCOME_STATUS.SUPPORTED,
        evidence: 'positive:frost-free-tropical-warmth-match'
      };
    }
    if (
      tropicalMoisturePlant &&
      humiditySignal === 'medium' &&
      broad !== 'tropical' &&
      frostFree
    ) {
      return {
        status: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
        limiting:
          'Humidity and moisture regime are only a partial match for flowering; frost-free status alone is not enough.',
        evidence: 'partial:humidity-medium-non-tropical'
      };
    }
    // Requirements present and comparable, but climate fails the warm-tropical match
    // without already hitting a hard negative above — still a real comparison, not a default score.
    if (!frostFree || freezingRisk === 'high' || /cool|frost-prone|highland/.test(thermal)) {
      return {
        status: SPECIFIC_OUTCOME_STATUS.UNLIKELY,
        limiting: 'Climate is too cool / not frost-free for sourced warm flowering needs.',
        evidence: 'negative:cool-or-not-frost-free-vs-warm-flowering'
      };
    }
  }

  // Requirement text exists but cannot be compared to available climate signals.
  return {
    status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
    unknownGap: 'flowering-climate-comparison',
    evidence: 'incomplete:cannot-compare-flowering-requirements'
  };
}

/**
 * Compare Garden climate to fruitingRequirements without using numeric fit scores.
 */
export function evaluateFruitingFromCatalogEvidence({
  meta,
  plant,
  env,
  survival,
  flowering,
  chillDeficit = false,
  review = false,
  sheltered = false
} = {}) {
  const text = requirementsText(meta, 'fruiting');
  const fruitPositive = hasPositiveFruitingEvidence(meta);
  const fruitFailCtx = hasFruitingFailureContext(meta, plant);
  const frostSensitivity = String(meta?.frostSensitivity || '').toLowerCase();
  const humidityTolerance = String(meta?.humidityTolerance || '').toLowerCase();
  const tropicalMoisturePlant =
    isWarmTropicalFrostSensitiveGroup(meta) && humidityTolerance === 'high';
  const frostFree = !!env?.isFrostFreeGrowingClimate;
  const freezingRisk = String(env?.freezingRisk || '').toLowerCase();
  const humiditySignal = String(env?.humiditySignal || '').toLowerCase();
  const broad = String(env?.broadClimate || '').toLowerCase();
  const thermal = String(env?.thermalRegime || '').toLowerCase();
  const coldRaw = env?.coldestMonthMeanMinC;
  const coldest =
    coldRaw == null || coldRaw === '' ? null : Number(coldRaw);
  const minTempC = parseMinTempCFromRequirements(text);

  const applyBio = (climateResult) => {
    const resolved = resolveFruitingWithBiologicalEligibility({
      climateFruitingStatus: climateResult.status,
      meta,
      fruitOriented: fruitPositive || fruitFailCtx
    });
    return {
      ...climateResult,
      status: resolved.status,
      reproductiveClimateSuitability: resolved.reproductiveClimateSuitability,
      biologicalFruitSetEligibility: resolved.biologicalFruitSetEligibility,
      evidence:
        resolved.status !== climateResult.status && resolved.note
          ? `${climateResult.evidence || 'climate'};bio:${resolved.note}`
          : climateResult.evidence,
      limiting:
        resolved.status !== climateResult.status && resolved.note
          ? resolved.note
          : climateResult.limiting
    };
  };

  if (!sheltered && chillDeficit && (fruitPositive || fruitFailCtx || plantNeedsWinterChill(meta))) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      limiting:
        'Reliable flowering and fruiting need winter chill or a clear cool season; always-hot climates without a cool-season signal are a poor match.',
      evidence: 'negative:chill-deficit'
    };
  }

  if (
    fruitFailCtx &&
    !sheltered &&
    isWarmTropicalFrostSensitiveGroup(meta) &&
    (freezingRisk === 'medium' || freezingRisk === 'high' || !frostFree || humiditySignal === 'low')
  ) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      limiting:
        survival !== SPECIFIC_OUTCOME_STATUS.UNRELIABLE
          ? 'Can grow, but reliable fruit production is not expected.'
          : undefined,
      evidence: 'negative:tropical-fruit-frost-or-dry-failure-context'
    };
  }

  if (!sheltered && moistureMismatchForHighHumidityPlant(meta, env) && (fruitPositive || fruitFailCtx)) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      limiting: `Structural moisture regime (${env.moistureRegime}) is too arid for reliable fruiting.`,
      evidence: 'negative:aridity-vs-fruiting'
    };
  }

  if (
    !sheltered &&
    survival === SPECIFIC_OUTCOME_STATUS.UNRELIABLE &&
    (fruitPositive || fruitFailCtx)
  ) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      evidence: 'negative:survival-failure-blocks-fruiting'
    };
  }

  if (minTempC != null && Number.isFinite(coldest) && coldest < minTempC && fruitPositive) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      limiting: `Coldest-month mean lows (~${coldest}°C) are below sourced fruiting thermal needs (~${minTempC}°C).`,
      evidence: `negative:min-temp:${minTempC}C`
    };
  }

  if (!fruitPositive) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
      unknownGap: 'fruitingRequirements',
      evidence: 'missing:fruitingRequirements',
      reproductiveClimateSuitability: 'unknown',
      biologicalFruitSetEligibility: 'UNKNOWN'
    };
  }

  const wantsWarm = requirementsWantTropicalWarmth(text) || frostSensitivity === 'high';
  const droughtCue = requirementsMentionDroughtOrMoisture(text);

  if (droughtCue && (humiditySignal === 'low' || moistureMismatchForHighHumidityPlant(meta, env))) {
    return {
      status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
      limiting: 'Drought / low-moisture climate conflicts with sourced fruiting moisture needs.',
      evidence: 'negative:drought-vs-fruiting-moisture'
    };
  }

  if (minTempC != null) {
    if (!Number.isFinite(coldest)) {
      return {
        status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
        unknownGap: 'fruiting-coldest-month',
        evidence: 'incomplete:min-temp-without-coldest-month'
      };
    }
    if (coldest >= minTempC) {
      if (
        tropicalMoisturePlant &&
        humiditySignal === 'medium' &&
        broad !== 'tropical'
      ) {
        return applyBio({
          status: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
          limiting: 'Humidity/moisture only partially match sourced fruiting needs.',
          evidence: 'partial:humidity-medium-non-tropical'
        });
      }
      return applyBio({
        status: review
          ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED
          : SPECIFIC_OUTCOME_STATUS.SUPPORTED,
        evidence: `positive:coldest-month:${coldest}>=min:${minTempC}`
      });
    }
  }

  if (wantsWarm) {
    const warmOk =
      frostFree &&
      (broad === 'tropical' ||
        env?.alwaysHot === true ||
        thermal === 'year-round-warm');
    const humidOk =
      !tropicalMoisturePlant ||
      humiditySignal === 'high' ||
      (humiditySignal === 'medium' && broad === 'tropical');
    if (warmOk && humidOk && !moistureMismatchForHighHumidityPlant(meta, env)) {
      return applyBio({
        status: review
          ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED
          : SPECIFIC_OUTCOME_STATUS.SUPPORTED,
        evidence: 'positive:frost-free-tropical-warmth-match'
      });
    }
    if (
      tropicalMoisturePlant &&
      humiditySignal === 'medium' &&
      broad !== 'tropical' &&
      frostFree
    ) {
      return applyBio({
        status: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
        limiting: 'Humidity/moisture only partially match sourced fruiting needs.',
        evidence: 'partial:humidity-medium-non-tropical'
      });
    }
    if (!frostFree || freezingRisk === 'high' || /cool|frost-prone|highland/.test(thermal)) {
      return {
        status: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
        limiting: 'Climate is too cool / not frost-free for sourced fruiting needs.',
        evidence: 'negative:cool-or-not-frost-free-vs-warm-fruiting',
        reproductiveClimateSuitability: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
        biologicalFruitSetEligibility: readBiologicalFruitSetEvidence(meta).eligibility
      };
    }
  }

  return applyBio({
    status: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
    unknownGap: 'fruiting-climate-comparison',
    evidence: 'incomplete:cannot-compare-fruiting-requirements'
  });
}

export function catalogNeedsReview(meta, plant) {
  return !!(
    meta?.needsReview === true ||
    plant?.climateTraits?.needsReview === true ||
    plant?.needsReview === true ||
    String(plant?.qualityTier || '').toLowerCase() === 'needs_review'
  );
}

function collectEngineFactors(suitability, extra = []) {
  const warnings = Array.isArray(suitability?.warnings)
    ? suitability.warnings.map((w) => String(w || '').trim()).filter(Boolean)
    : [];
  const out = [...warnings];
  for (const msg of extra) {
    const m = String(msg || '').trim();
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Specific Plant Outcome Quality Gate ג€” general rules (no plant-slug exceptions).
 * Frost-free alone is not enough for high-humidity tropical plants.
 * Positive outcomes require positive evidence; needsReview blocks confident Good/Excellent.
 */
export function deriveSpecificPlantOutcomes({
  meta,
  climateProfile,
  suitability,
  plant,
  protectedGrowing = false
} = {}) {
  const env = structuralEnvironmentFromClimateProfile(climateProfile || {});
  const climateConfidence =
    climateProfile?.confidenceDimensions ||
    climateProfile?.coordinateClimateV2?.confidenceDimensions ||
    climateProfile?.structuralClimate?.provenance?.confidenceDimensions ||
    climateProfile?.confidence ||
    null;
  const confidenceBundle =
    climateProfile?.localRepresentativeness ||
    climateProfile?.coordinateClimateV2?.localRepresentativeness
      ? {
          dimensions: climateProfile.confidenceDimensions ||
            climateProfile.coordinateClimateV2?.confidenceDimensions || {
              LOCAL_REPRESENTATIVENESS: climateProfile.localRepresentativeness?.level,
              OVERALL_AUTHORITY_CONFIDENCE: climateProfile.confidence
            },
          localRepresentativeness:
            climateProfile.localRepresentativeness ||
            climateProfile.coordinateClimateV2?.localRepresentativeness,
          overall: climateProfile.confidence
        }
      : climateConfidence && typeof climateConfidence === 'object' && climateConfidence.SOURCE_DATA_INTEGRITY
        ? { dimensions: climateConfidence, overall: climateConfidence.OVERALL_AUTHORITY_CONFIDENCE }
        : null;
  const s = suitability && typeof suitability === 'object' ? suitability : {};
  const sheltered = protectedGrowing === true;
  const limiting = [];
  const unknownGaps = [];
  const frostFree = env.isFrostFreeGrowingClimate;
  const freezingRisk = env.freezingRisk;
  const humiditySignal = env.humiditySignal;
  const frostSensitivity = String(meta?.frostSensitivity || '').toLowerCase();
  const humidityTolerance = String(meta?.humidityTolerance || '').toLowerCase();
  const survivalFit = Number(s.survivalFit);
  const thriveFit = Number(s.thriveFit);
  // floweringFit / fruitingFit are NOT botanical evidence — ignored for reproductive outcomes.
  void s.floweringFit;
  void s.fruitingFit;
  const engineBlocked = String(s.recommendationLevel || '').toLowerCase() === 'blocked';
  const review = catalogNeedsReview(meta, plant);
  const tropicalMoisturePlant =
    isWarmTropicalFrostSensitiveGroup(meta) && humidityTolerance === 'high';
  const fruitFailCtx = hasFruitingFailureContext(meta, plant);
  const chillRequired = plantNeedsWinterChill(meta);
  const chillDeficit = chillRequired && climateLacksWinterChillSignal(env);
  const chillLimitMsg =
    'Reliable flowering and fruiting need winter chill or a clear cool season; always-hot climates without a cool-season signal are a poor match.';

  let survival = SPECIFIC_OUTCOME_STATUS.UNKNOWN;
  let growth = SPECIFIC_OUTCOME_STATUS.UNKNOWN;
  let flowering = SPECIFIC_OUTCOME_STATUS.UNKNOWN;
  let fruiting = SPECIFIC_OUTCOME_STATUS.UNKNOWN;

  if (!meta) {
    limiting.push(INSUFFICIENT_CLIMATE_META_MESSAGE);
    unknownGaps.push('climate-meta');
    return finalizeOutcomes({
      survival,
      growth,
      flowering,
      fruiting,
      limiting,
      unknownGaps,
      suitability: s,
      forceOverall: 'borderline',
      needsReview: false,
      fruitOriented: false
    });
  }

  const quantCold = !sheltered ? quantitativeColdSurvivalUnsupported(meta, env) : null;
  const lowHumMismatchEarly = !sheltered
    ? atmosphericHumidityMismatchForLowTolerancePlant(meta, env)
    : null;
  const evidenceHints = {
    survivalFields: [],
    growthFields: [],
    usedQuantitativeCold: false,
    usedHumiditySurvival: false,
    usedMoistureSurvival: false,
    usedTropicalGroup: false,
    usedHumidityGrowth: false,
    usedMoistureGrowth: false,
    usedWarmNeed: false,
    usedHeat: false,
    usedVpd: false
  };

  if (!sheltered && frostSensitivity === 'high' && freezingRisk !== 'low') {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push('Frost risk is too high for this plant.');
    evidenceHints.survivalFields.push('frostSensitivity');
  } else if (!sheltered && moistureMismatchForHighHumidityPlant(meta, env)) {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push(
      `Structural moisture regime (${env.moistureRegime}) is too arid for a high-humidity / high-moisture plant; frost-free status does not neutralize aridity.`
    );
    evidenceHints.usedMoistureSurvival = true;
    evidenceHints.survivalFields.push('humidityTolerance');
  } else if (!sheltered && outdoorDamagingColdUnsupported(meta, env)) {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push(
      `Coldest-month mean lows (~${env.coldestMonthMeanMinC}°C) are below the warm tropical reliability band; damaging cold can occur without literal frost.`
    );
    evidenceHints.survivalFields.push('frostSensitivity', 'coldTolerance');
    if (isWarmTropicalFrostSensitiveGroup(meta)) evidenceHints.usedTropicalGroup = true;
  } else if (quantCold?.unsupported) {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push(quantCold.limiting);
    evidenceHints.usedQuantitativeCold = true;
    evidenceHints.survivalFields.push('quantitative.minimum_survival_temperature_c');
  } else if (lowHumMismatchEarly?.affectsSurvival) {
    // Only when plant has documented humidity mortality / survival-threat evidence.
    survival = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    limiting.push(
      'Documented humidity-related survival threat conflicts with atmospheric humidity at this site.'
    );
    evidenceHints.usedHumiditySurvival = true;
    evidenceHints.survivalFields.push('humidityTolerance');
  } else if (!sheltered && frostSensitivity === 'high' && !frostFree) {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push(
      'Needs a frost-free climate; outdoor reliability is limited where winters are cool or frost-prone.'
    );
    evidenceHints.survivalFields.push('frostSensitivity');
  } else if (!sheltered && tropicalMoisturePlant && humiditySignal === 'low') {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    limiting.push('Low humidity / dry-air climate is a poor match for this plant.');
    evidenceHints.survivalFields.push('humidityTolerance');
    evidenceHints.usedTropicalGroup = true;
  } else if (
    !sheltered &&
    tropicalMoisturePlant &&
    humiditySignal === 'medium' &&
    env.broadClimate !== 'tropical'
  ) {
    survival = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    limiting.push(
      'Humidity and moisture regime are only a partial match; frost-free status alone is not enough.'
    );
    evidenceHints.survivalFields.push('humidityTolerance');
  } else if (engineBlocked && /frost risk is too high/i.test(String(s.explanationText || ''))) {
    survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
    evidenceHints.survivalFields.push('frostSensitivity');
  } else if (!frostSensitivity) {
    survival = SPECIFIC_OUTCOME_STATUS.UNKNOWN;
    unknownGaps.push('frostSensitivity');
  } else {
    const coldAssess = assessPlantClimateColdSurvival(meta, env);
    evidenceHints.survivalFields.push('frostSensitivity');
    if (meta?.coldTolerance) evidenceHints.survivalFields.push('coldTolerance');
    if (coldAssess.survivalHint === 'unreliable') {
      survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
      if (coldAssess.reason) limiting.push(coldAssess.reason);
    } else if (coldAssess.survivalHint === 'constrained') {
      survival = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
      if (coldAssess.reason && !limiting.includes(coldAssess.reason)) {
        limiting.push(coldAssess.reason);
      }
    } else if (coldAssess.survivalHint === 'reliable') {
      survival = review ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED : SPECIFIC_OUTCOME_STATUS.RELIABLE;
    } else if (Number.isFinite(survivalFit) && survivalFit < 40) {
      // Weak engine fit only when plant-cold assessment did not authorize reliable/constrained.
      survival = SPECIFIC_OUTCOME_STATUS.UNRELIABLE;
      limiting.push('Survival fit is too weak for reliable outdoor establishment.');
    } else if (Number.isFinite(survivalFit) && survivalFit < 65) {
      survival = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    } else {
      survival = review ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED : SPECIFIC_OUTCOME_STATUS.RELIABLE;
      if (review) {
        limiting.push(
          'Catalog marks climate traits as needing review - survival stays conservative.'
        );
      }
    }
  }

  const lowHumMismatch = lowHumMismatchEarly;
  const heatQ = !sheltered ? quantitativeHeatUnsupported(meta, env) : null;
  const vpdQ = !sheltered ? quantitativeVpdUnsupported(meta, env) : null;

  if (survival === SPECIFIC_OUTCOME_STATUS.UNRELIABLE && !sheltered) {
    growth = SPECIFIC_OUTCOME_STATUS.POOR;
    evidenceHints.growthFields.push(...(evidenceHints.survivalFields || []));
  } else if (lowHumMismatch) {
    // Qualitative humidityTolerance → Growth (and Overall via growth/demotion), not Survival.
    growth =
      lowHumMismatch.severity === 'strong'
        ? SPECIFIC_OUTCOME_STATUS.POOR
        : SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    evidenceHints.usedHumidityGrowth = true;
    evidenceHints.growthFields.push('humidityTolerance');
    if (!limiting.some((m) => /humidity/i.test(String(m)))) {
      if (lowHumMismatch.severity === 'strong') {
        limiting.push(
          'High atmospheric humidity constrains growth for this low-humidity-tolerance plant (distinct from irrigation water need; not a survival claim without mortality evidence).'
        );
      } else {
        limiting.push(
          'Atmospheric humidity sits in a transition band; qualitative low humidityTolerance constrains growth/confidence without inventing plant-specific RH cutoffs or survival failure.'
        );
      }
    }
  } else if (
    moistureMismatchForHighHumidityPlant(meta, env) ||
    (tropicalMoisturePlant &&
      (humiditySignal === 'low' ||
        (humiditySignal === 'medium' && env.broadClimate !== 'tropical')))
  ) {
    growth =
      humiditySignal === 'low' || moistureMismatchForHighHumidityPlant(meta, env)
        ? SPECIFIC_OUTCOME_STATUS.POOR
        : SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    evidenceHints.usedMoistureGrowth = true;
    evidenceHints.growthFields.push('humidityTolerance');
  } else if (heatQ?.unsupported || vpdQ?.unsupported) {
    growth = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    evidenceHints.usedHeat = !!heatQ?.unsupported;
    evidenceHints.usedVpd = !!vpdQ?.unsupported;
    if (meta?.heatTolerance) evidenceHints.growthFields.push('heatTolerance');
    if (heatQ?.unsupported && heatQ.limiting && !limiting.includes(heatQ.limiting)) {
      limiting.push(heatQ.limiting);
    }
    if (vpdQ?.unsupported && vpdQ.limiting && !limiting.includes(vpdQ.limiting)) {
      limiting.push(vpdQ.limiting);
    }
  } else if (Number.isFinite(thriveFit) && thriveFit < 35) {
    // Severe thrive cut only when plant-authorized warm need OR explicit mismatch already handled
    if (plantRequiresYearRoundWarmClimate(meta)) {
      growth = SPECIFIC_OUTCOME_STATUS.POOR;
      evidenceHints.usedWarmNeed = true;
      evidenceHints.growthFields.push('frostSensitivity');
    } else {
      growth = review ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED : SPECIFIC_OUTCOME_STATUS.SUPPORTED;
      if (meta?.frostSensitivity) evidenceHints.growthFields.push('frostSensitivity');
    }
  } else if (Number.isFinite(thriveFit) && thriveFit < 60) {
    if (plantRequiresYearRoundWarmClimate(meta)) {
      growth = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
      evidenceHints.usedWarmNeed = true;
      evidenceHints.growthFields.push('frostSensitivity');
    } else {
      // Cool-seasonal / arid / highland alone must NOT force Constrained for non-tropical plants
      growth = review ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED : SPECIFIC_OUTCOME_STATUS.SUPPORTED;
      if (meta?.frostSensitivity) evidenceHints.growthFields.push('frostSensitivity');
      if (meta?.humidityTolerance) evidenceHints.growthFields.push('humidityTolerance');
    }
  } else if (Number.isFinite(thriveFit)) {
    growth = review ? SPECIFIC_OUTCOME_STATUS.CONSTRAINED : SPECIFIC_OUTCOME_STATUS.SUPPORTED;
    if (meta?.frostSensitivity) evidenceHints.growthFields.push('frostSensitivity');
    if (meta?.humidityTolerance) evidenceHints.growthFields.push('humidityTolerance');
  } else {
    growth = SPECIFIC_OUTCOME_STATUS.UNKNOWN;
    unknownGaps.push('growth-evidence');
  }

  if (chillDeficit) {
    if (
      growth === SPECIFIC_OUTCOME_STATUS.SUPPORTED ||
      growth === SPECIFIC_OUTCOME_STATUS.RELIABLE
    ) {
      growth = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    } else if (growth === SPECIFIC_OUTCOME_STATUS.UNKNOWN && Number.isFinite(thriveFit)) {
      growth = SPECIFIC_OUTCOME_STATUS.CONSTRAINED;
    }
    if (!limiting.includes(chillLimitMsg)) limiting.push(chillLimitMsg);
  }

  const flowerEval = evaluateFloweringFromCatalogEvidence({
    meta,
    env,
    survival,
    chillDeficit,
    review,
    sheltered
  });
  flowering = flowerEval.status;
  if (flowerEval.limiting && !limiting.includes(flowerEval.limiting)) {
    limiting.push(flowerEval.limiting);
  }
  if (flowerEval.unknownGap) unknownGaps.push(flowerEval.unknownGap);

  const fruitEval = evaluateFruitingFromCatalogEvidence({
    meta,
    plant,
    env,
    survival,
    flowering,
    chillDeficit,
    review,
    sheltered
  });
  fruiting = fruitEval.status;
  if (fruitEval.limiting && !limiting.includes(fruitEval.limiting)) {
    limiting.push(fruitEval.limiting);
  }
  if (fruitEval.unknownGap) unknownGaps.push(fruitEval.unknownGap);

  // Evidence-strength propagation: heuristic/unknown traits cannot authorize confident truth.
  const strength = applyEvidenceStrengthPropagation({
    meta,
    env,
    survival,
    growth,
    flowering,
    fruiting,
    evidenceHints
  });
  survival = strength.survival;
  growth = strength.growth;
  flowering = strength.flowering;
  fruiting = strength.fruiting;
  for (const w of strength.warnings || []) {
    if (!limiting.includes(w)) limiting.push(w);
  }

  return finalizeOutcomes({
    survival,
    growth,
    flowering,
    fruiting,
    limiting: collectEngineFactors(s, limiting),
    unknownGaps,
    suitability: s,
    sheltered,
    needsReview: review,
    fruitOriented: fruitFailCtx || chillRequired,
    reproductiveEvidence: {
      flowering: flowerEval.evidence,
      fruiting: fruitEval.evidence
    },
    climateConfidence: confidenceBundle,
    moistureOrPrecipDependent:
      tropicalMoisturePlant ||
      humidityTolerance === 'high' ||
      humidityTolerance === 'low' ||
      moistureMismatchForHighHumidityPlant(meta, env),
    meta,
    climateProfile: climateProfile || env,
    plant,
    evidenceStrength: strength
  });
}

function finalizeOutcomes({
  survival,
  growth,
  flowering,
  fruiting,
  limiting,
  unknownGaps = [],
  suitability,
  forceOverall,
  sheltered,
  needsReview = false,
  fruitOriented = false,
  reproductiveEvidence = null,
  climateConfidence = null,
  moistureOrPrecipDependent = false,
  meta = null,
  climateProfile = null,
  plant = null,
  gardenContext = null,
  evidenceStrength = null
}) {
  let overall = forceOverall
    ? forceOverall
    : deriveOverallVerdict({
        survival,
        growth,
        flowering,
        fruiting,
        suitability,
        sheltered,
        needsReview,
        fruitOriented,
        unknownGaps
      });

  const confAdj = applyRepresentativenessToSuitabilityClaim({
    overallRecommendation: overall,
    confidence: climateConfidence,
    moistureOrPrecipDependent
  });
  if (confAdj.demoted) {
    overall = confAdj.adjustedRecommendation;
    for (const w of confAdj.warnings || []) {
      if (!limiting.includes(w)) limiting.push(w);
    }
  } else if (confAdj.forceUnknownOutcomes && moistureOrPrecipDependent) {
    // Do not auto Not Recommended — keep / move thin moisture claims toward unknown/borderline.
    if (overall === 'excellent' || overall === 'good') overall = 'borderline';
    for (const w of confAdj.warnings || []) {
      if (!limiting.includes(w)) limiting.push(w);
    }
  }

  const systemic = applyPreScaleSystemicDemotions({
    overall,
    meta,
    climateProfile: climateProfile || {},
    plant: plant || {},
    gardenContext: gardenContext || {},
    needsReview
  });
  overall = systemic.overall;
  for (const w of systemic.warnings || []) {
    if (!limiting.includes(w)) limiting.push(w);
  }

  return {
    survival,
    growth,
    flowering,
    fruiting,
    overall,
    overallLabel: formatSpecificPlantLevelLabel(overall),
    survivalLabel: formatSpecificOutcomeLabel(survival),
    growthLabel: formatSpecificOutcomeLabel(growth),
    floweringLabel: formatSpecificOutcomeLabel(flowering),
    fruitingLabel: formatSpecificOutcomeLabel(fruiting),
    limitingFactors: limiting,
    unknownEvidence: unknownGaps,
    needsReview: !!needsReview,
    protectedGrowing: sheltered === true,
    reproductiveEvidence: reproductiveEvidence || null,
    climateAuthorityConfidence: climateConfidence || null,
    representativenessAdjustment: confAdj.demoted || confAdj.forceUnknownOutcomes ? confAdj : null,
    systemicHardening: systemic,
    suitabilityDimensions: systemic.dimensions,
    survivalConfidenceMeaning: systemic.survivalConfidenceMeaning,
    recommendationEligibility: systemic.recommendationEligibility,
    evidenceStrength: evidenceStrength || null
  };
}

/**
 * Overall: survival failure ג‡’ Not recommended.
 * Survival alone + unknown productive outcomes must not become Good.
 * needsReview caps confident positives to Borderline.
 */
export function deriveOverallVerdict({
  survival,
  growth,
  flowering,
  fruiting,
  suitability,
  sheltered,
  needsReview = false,
  fruitOriented = false,
  unknownGaps = []
} = {}) {
  void flowering;
  void sheltered;
  void suitability;
  void unknownGaps;
  if (survival === SPECIFIC_OUTCOME_STATUS.UNRELIABLE) return 'blocked';
  if (survival === SPECIFIC_OUTCOME_STATUS.UNKNOWN) return 'borderline';
  if (
    growth === SPECIFIC_OUTCOME_STATUS.POOR ||
    growth === SPECIFIC_OUTCOME_STATUS.UNRELIABLE
  ) {
    return 'borderline';
  }
  if (needsReview) return 'borderline';
  if (
    fruitOriented &&
    (fruiting === SPECIFIC_OUTCOME_STATUS.UNKNOWN ||
      fruiting === SPECIFIC_OUTCOME_STATUS.UNRELIABLE)
  ) {
    return 'borderline';
  }
  if (
    growth === SPECIFIC_OUTCOME_STATUS.UNKNOWN ||
    growth === SPECIFIC_OUTCOME_STATUS.CONSTRAINED ||
    survival === SPECIFIC_OUTCOME_STATUS.CONSTRAINED
  ) {
    return 'borderline';
  }
  if (
    survival === SPECIFIC_OUTCOME_STATUS.RELIABLE &&
    growth === SPECIFIC_OUTCOME_STATUS.SUPPORTED
  ) {
    return 'good';
  }
  return 'borderline';
}

/** Warm in-memory evaluation timing (no network). */
export function measureSpecificPlantEvaluationLatency(runFn, iterations = 200) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    runFn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
  return {
    iterations,
    minMs: times[0],
    medianMs: pct(50),
    p95Ms: pct(95),
    maxMs: times[times.length - 1]
  };
}

/**
 * Same plant ֳ— two owned Gardens: hydrate ג†’ climate signals ג†’ four-outcome quality gate.
 */
export function compareSpecificPlantAcrossHydratedGardens(
  meta,
  gardenRowA,
  gardenRowB,
  hydrateFn,
  plant = null
) {
  const hydrate =
    typeof hydrateFn === 'function'
      ? hydrateFn
      : () => {
          throw new Error('hydrateFn required');
        };
  const partialA = hydrate(gardenRowA);
  const partialB = hydrate(gardenRowB);
  let climateA = climateSignalsFromHydratedAppPartial(partialA);
  let climateB = climateSignalsFromHydratedAppPartial(partialB);
  climateA = enrichClimateSignalsWithStructuralEnvironment(climateA);
  climateB = enrichClimateSignalsWithStructuralEnvironment(climateB);
  if (!climateA || !climateB) {
    throw new Error('Both gardens must hydrate to complete trusted app location partials');
  }
  const suitabilityStub = (climate) =>
    buildPlantDiscriminatedSuitabilityStub(meta, climate);
  return {
    gardenA: {
      locationLabel: climateA.locationLabel,
      climateLabel: climateA.climateLabel,
      climate: climateA,
      outcomes: deriveSpecificPlantOutcomes({
        meta,
        climateProfile: climateA,
        suitability: suitabilityStub(climateA),
        plant,
        protectedGrowing: false
      })
    },
    gardenB: {
      locationLabel: climateB.locationLabel,
      climateLabel: climateB.climateLabel,
      climate: climateB,
      outcomes: deriveSpecificPlantOutcomes({
        meta,
        climateProfile: climateB,
        suitability: suitabilityStub(climateB),
        plant,
        protectedGrowing: false
      })
    }
  };
}

/** @deprecated Prefer deriveSpecificPlantOutcomes */
export function mirrorSmartRecFrostSuitability(meta, climateProfile) {
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant: {
      tags: meta?.groupIds?.some((g) => String(g).includes('fruit')) ? ['fruit'] : []
    },
    protectedGrowing: false
  });
  return {
    recommendationLevel: outcomes.overall,
    warnings: outcomes.limitingFactors,
    blocked: outcomes.overall === 'blocked',
    levelLabel: outcomes.overallLabel,
    outcomes
  };
}

/** Location authority: Yehiam aliases present in app + garden-weather (not a climate hardcode). */
export function yehiamLocationAliasSupportedInSource(sourceText) {
  const text = String(sourceText || '');
  const he = 'יחיעם';
  return (
    text.includes('Yehiam, Israel') &&
    (text.includes(he) || text.includes("'" + he + "'"))
  );
}
