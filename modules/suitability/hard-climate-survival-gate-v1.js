/**
 * Hard-climate survival gate V1.
 *
 * Ambient outdoor Garden climate is the authority.
 * Lethal frost / hard cold cannot be averaged away by soft positive traits.
 * Ordinary patio, wind shelter, or container does not erase a regional freeze.
 * Only explicit frost-free protected context (greenhouse / indoor overwinter) may
 * change the cold-exposure model.
 *
 * Not a second climate engine: callers still use smartRecEvaluateSuitability.
 * Not plant- or place-specific.
 */
export const HARD_CLIMATE_SURVIVAL_GATE_VERSION = '1.1.2';

const RISK_RANK = Object.freeze({ unknown: 0, low: 1, medium: 2, high: 3 });

/** Catalog climate ordinals — same scale as catalog-contradiction-gate-v1. */
export const CLIMATE_TRAIT_ORDINAL = Object.freeze([
  'very_low',
  'low',
  'medium',
  'high',
  'very_high'
]);

const EXPLICIT_FROST_FREE_PROTECTION = Object.freeze({
  greenhouse: true,
  conservatory: true,
  'frost-free-greenhouse': true,
  'indoor-overwinter': true,
  indoor: true
});

function asText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function climateTraitOrdinalRank(value) {
  return CLIMATE_TRAIT_ORDINAL.indexOf(asText(value).replace(/-/g, '_'));
}

/** high and very_high are both hard frost sensitivity. */
export function frostSensitivityIsHard(value) {
  return climateTraitOrdinalRank(value) >= climateTraitOrdinalRank('high');
}

/** low and very_low are both insufficient outdoor cold tolerance. */
export function coldToleranceIsLow(value) {
  const rank = climateTraitOrdinalRank(value);
  return rank >= 0 && rank <= climateTraitOrdinalRank('low');
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bumpRisk(current, next) {
  const cur = asText(current) || 'unknown';
  const nxt = asText(next) || 'unknown';
  return (RISK_RANK[nxt] || 0) > (RISK_RANK[cur] || 0) ? nxt : cur;
}

export function isOrdinaryAreaShelter(protectionContext = {}) {
  const planting = asText(protectionContext.plantingMode || protectionContext.siteType);
  if (EXPLICIT_FROST_FREE_PROTECTION[planting]) return false;
  return (
    protectionContext.containerContext === true ||
    planting === 'container' ||
    planting === 'pot' ||
    planting === 'balcony' ||
    planting === 'patio' ||
    planting === 'ground' ||
    planting === 'shelter' ||
    asText(protectionContext.sunExposure) === 'part_shade' ||
    asText(protectionContext.windExposure) === 'sheltered'
  );
}

export function isExplicitFrostFreeProtectedContext(protectionContext = {}) {
  if (!protectionContext || typeof protectionContext !== 'object') return false;
  if (protectionContext.frostFreeProtected === true) return true;
  if (protectionContext.greenhouse === true) return true;
  const planting = asText(protectionContext.plantingMode || protectionContext.protectionMode);
  if (EXPLICIT_FROST_FREE_PROTECTION[planting]) return true;
  if (protectionContext.indoorOverwinter === true) return true;
  if (protectionContext.indoorContext === true) {
    if (
      planting === 'ground' ||
      planting === 'patio' ||
      planting === 'container' ||
      planting === 'pot' ||
      planting === 'balcony' ||
      planting === 'shelter'
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Raise freeze risk from structural cold evidence.
 * Never soften an already-high structural risk.
 * Latitude band is used only when structural month-min is missing (same bands as inferClientClimate).
 */
export function elevateAmbientFreezingRisk(climateProfile = {}, coords = {}) {
  let risk = asText(climateProfile.freezingRisk) || 'unknown';
  const cold = finiteNumber(climateProfile.coldestMonthMeanMinC);
  const thermal = asText(climateProfile.thermalRegime);
  const structuralCold = asText(
    climateProfile.structuralColdRisk || climateProfile.structuralClimate?.structuralColdRisk
  );
  const status = asText(
    climateProfile.structuralClimateStatus || climateProfile.structuralClimate?.status
  );

  // Lethal frost only. Climate authority maps cool-seasonal + elevated structural
  // cold to freezingRisk=low when month-min is well above freezing (cool winter ≠ freeze).
  if (thermal === 'frost-prone' || thermal === 'cool-highland') {
    risk = bumpRisk(risk, 'high');
  }
  if (structuralCold === 'high') {
    risk = bumpRisk(risk, 'high');
  }
  if (cold != null && cold <= 0) risk = bumpRisk(risk, 'high');
  else if (cold != null && cold < 5) risk = bumpRisk(risk, 'medium');

  if (climateProfile.isFrostFreeGrowingClimate === true && risk === 'unknown') {
    risk = 'low';
  }

  if (cold == null && status !== 'known') {
    const lat = finiteNumber(coords.lat);
    if (lat != null) {
      const absLat = Math.abs(lat);
      if (absLat > 50) risk = bumpRisk(risk, 'high');
      else if (absLat > 35) risk = bumpRisk(risk, 'medium');
    }
  }

  return risk === 'unknown' ? 'unknown' : risk;
}

export function evaluateHardClimateSurvival({
  meta = null,
  climateProfile = {},
  protectionContext = {},
  coords = {}
} = {}) {
  const protectedEnv = isExplicitFrostFreeProtectedContext(protectionContext);
  const frostSens = asText(meta?.frostSensitivity);
  const coldTol = asText(meta?.coldTolerance);
  const frostFree = climateProfile.isFrostFreeGrowingClimate === true;
  const ambientRisk = elevateAmbientFreezingRisk(climateProfile, coords);
  const cold = finiteNumber(climateProfile.coldestMonthMeanMinC);
  const lethalAmbient =
    ambientRisk === 'high' ||
    (cold != null && cold <= 0) ||
    asText(climateProfile.thermalRegime) === 'frost-prone';

  const base = {
    protectedContext: protectedEnv,
    ambientFreezingRisk: ambientRisk,
    hardBlocked: false,
    conservativeUnknown: false,
    reason: null,
    limiter: 'winter freeze / hard frost',
    survivalCap: null,
    thriveCap: null,
    floweringCap: null,
    fruitingCap: null
  };

  if (protectedEnv) {
    return Object.assign({}, base, {
      reason: 'explicit-frost-free-protection',
      limiter: null
    });
  }

  if (isOrdinaryAreaShelter(protectionContext) && lethalAmbient) {
    // Fall through to ambient rules — shelter/container must not erase freeze.
  }

  const frostHard = frostSensitivityIsHard(frostSens);
  const coldLow = coldToleranceIsLow(coldTol);
  const tender =
    frostHard ||
    (coldLow && (frostHard || frostSens === 'medium' || frostSens === ''));

  if (frostHard && ambientRisk !== 'low' && ambientRisk !== 'unknown') {
    return Object.assign({}, base, {
      hardBlocked: true,
      reason: 'Frost risk is too high for this plant.',
      survivalCap: 8,
      thriveCap: 8,
      floweringCap: 8,
      fruitingCap: 5
    });
  }

  if (frostHard && ambientRisk === 'low' && cold != null && cold < 1) {
    return Object.assign({}, base, {
      hardBlocked: true,
      reason: 'Winter freeze / hard frost exceeds this plant’s outdoor survival tolerance.',
      survivalCap: 8,
      thriveCap: 8,
      floweringCap: 8,
      fruitingCap: 5
    });
  }

  if ((coldLow || frostHard) && lethalAmbient) {
    return Object.assign({}, base, {
      hardBlocked: true,
      reason: 'Winter freeze / hard frost exceeds this plant’s outdoor survival tolerance.',
      survivalCap: 8,
      thriveCap: 8,
      floweringCap: 8,
      fruitingCap: 5
    });
  }

  if (!frostSens && !coldTol && lethalAmbient) {
    return Object.assign({}, base, {
      conservativeUnknown: true,
      reason: 'Cold-tolerance evidence is missing, so outdoor survival is not assumed in a freezing climate.',
      survivalCap: 35,
      thriveCap: 30,
      floweringCap: 30,
      fruitingCap: 25
    });
  }

  if (frostSens === 'medium' && ambientRisk === 'high' && !tender) {
    return Object.assign({}, base, {
      reason: 'Cold snaps may seriously reduce performance.',
      survivalCap: 25,
      thriveCap: 20,
      floweringCap: 25,
      fruitingCap: 20
    });
  }

  void frostFree;
  return base;
}

export function applyHardClimateSurvivalToFits(state, verdict) {
  const next = state && typeof state === 'object' ? state : {};
  if (!verdict || verdict.protectedContext) return next;
  if (verdict.survivalCap != null) {
    next.survivalFit = Math.min(Number(next.survivalFit) || 0, verdict.survivalCap);
  }
  if (verdict.thriveCap != null) {
    next.thriveFit = Math.min(Number(next.thriveFit) || 0, verdict.thriveCap);
  }
  if (verdict.floweringCap != null) {
    next.floweringFit = Math.min(Number(next.floweringFit) || 0, verdict.floweringCap);
  }
  if (verdict.fruitingCap != null) {
    next.fruitingFit = Math.min(Number(next.fruitingFit) || 0, verdict.fruitingCap);
  }
  if (verdict.hardBlocked) {
    next.blocked = true;
    next.hardSurvivalBlocked = true;
    next.heatColdFit = Math.min(Number(next.heatColdFit) || 0, 8);
  }
  return next;
}

/** If reliable survival is hard-blocked, downstream outcomes cannot stay strong. */
export function enforceSurvivalDownstreamCaps(state) {
  const next = state && typeof state === 'object' ? state : {};
  const survival = Number(next.survivalFit);
  if (next.hardSurvivalBlocked === true || (Number.isFinite(survival) && survival <= 15)) {
    const cap = Number.isFinite(survival) ? Math.min(survival, 15) : 15;
    next.thriveFit = Math.min(Number(next.thriveFit) || 0, cap);
    next.floweringFit = Math.min(Number(next.floweringFit) || 0, cap);
    next.fruitingFit = Math.min(Number(next.fruitingFit) || 0, Math.min(cap, 10));
  }
  return next;
}

const STRONG_OUTCOME_BANDS = Object.freeze({
  strong: true,
  reliable: true,
  supported: true,
  excellent: true,
  good: true
});

export function isStrongOutcomeBand(value) {
  return !!STRONG_OUTCOME_BANDS[asText(value)];
}

export function isHardFrostLimiter(text) {
  return /frost risk is too high|winter freeze|hard frost|lethal frost|does not survive being frozen/i.test(
    String(text || '')
  );
}

/**
 * Generic contradiction invariant — not plant- or place-specific.
 * IF limiter says frost is hard/lethal/too high, Survival cannot be STRONG.
 * IF Survival is hard-blocked, Growth / Flowering / Fruiting cannot remain STRONG.
 */
export function hardFrostOutcomeInvariant({
  limiter,
  outcomes = {},
  survivalFit,
  hardSurvivalBlocked,
  recommendationLevel
} = {}) {
  const violations = [];
  const frostHard = isHardFrostLimiter(limiter);
  const survivalHardBlocked =
    hardSurvivalBlocked === true ||
    (Number.isFinite(Number(survivalFit)) && Number(survivalFit) <= 15) ||
    asText(outcomes.survival) === 'unreliable' ||
    asText(outcomes.survival) === 'poor';
  if ((frostHard || survivalHardBlocked) && isStrongOutcomeBand(outcomes.survival)) {
    violations.push('frost-limiter-with-strong-survival');
  }
  if (survivalHardBlocked || frostHard) {
    for (const dim of ['growth', 'flowering', 'fruiting']) {
      if (isStrongOutcomeBand(outcomes[dim])) {
        violations.push('survival-blocked-with-strong-' + dim);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

export function survivalFitIsHardCapped(survivalFit, hardSurvivalBlocked) {
  return hardSurvivalBlocked === true || (Number.isFinite(Number(survivalFit)) && Number(survivalFit) <= 15);
}

/** Hard frost / lethal winter must outrank provenance/confidence warnings. */
export function prioritizeHardFrostLimiters(messages = []) {
  const list = Array.isArray(messages) ? messages.map((m) => String(m || '').trim()).filter(Boolean) : [];
  const hard = [];
  const rest = [];
  for (const msg of list) {
    if (isHardFrostLimiter(msg)) hard.push(msg);
    else rest.push(msg);
  }
  return hard.concat(rest);
}

export function suppressStrongBandsWhenHardFrost(outcomes, limiter, survivalFit) {
  const next = Object.assign({}, outcomes && typeof outcomes === 'object' ? outcomes : {});
  const hardCap =
    isHardFrostLimiter(limiter) ||
    (Number.isFinite(Number(survivalFit)) && Number(survivalFit) <= 15);
  if (!hardCap) return next;
  const capBand = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === 'UNKNOWN') return raw || 'UNKNOWN';
    if (isStrongOutcomeBand(raw)) return 'weak';
    return raw;
  };
  next.survival = capBand(next.survival);
  next.growth = capBand(next.growth);
  next.flowering = capBand(next.flowering);
  next.fruiting = capBand(next.fruiting);
  return next;
}

const api = {
  HARD_CLIMATE_SURVIVAL_GATE_VERSION,
  CLIMATE_TRAIT_ORDINAL,
  climateTraitOrdinalRank,
  frostSensitivityIsHard,
  coldToleranceIsLow,
  isOrdinaryAreaShelter,
  isExplicitFrostFreeProtectedContext,
  elevateAmbientFreezingRisk,
  evaluateHardClimateSurvival,
  applyHardClimateSurvivalToFits,
  enforceSurvivalDownstreamCaps,
  isStrongOutcomeBand,
  isHardFrostLimiter,
  survivalFitIsHardCapped,
  prioritizeHardFrostLimiters,
  hardFrostOutcomeInvariant,
  suppressStrongBandsWhenHardFrost
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitHardClimateSurvivalGate = api;
}
