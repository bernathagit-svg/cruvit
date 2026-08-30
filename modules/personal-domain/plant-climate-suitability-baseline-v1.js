/**
 * Plant × climate suitability baseline (engine stub replacement).
 *
 * FORBIDS:
 * - freezingRisk=high → survivalFit=15 for all plants
 * - !frostFree / cool-seasonal / arid / highland → thriveFit=55 for all plants
 *
 * Survival discrimination uses qualitative plant frostSensitivity/coldTolerance
 * combined with climate freezingRisk/thermalRegime — without inventing °C from labels.
 * Optional provenanced quantitative hardiness remains additive when present.
 */

import { quantitativeColdSurvivalUnsupported } from '../catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';
import { outdoorDamagingColdUnsupported } from './structural-climate-authority-v1.js';

export const PLANT_CLIMATE_SUITABILITY_BASELINE_VERSION = '1.0.0-real-world-repair';

function frostOf(meta) {
  return String(meta?.frostSensitivity || '').toLowerCase();
}
function coldTolOf(meta) {
  return String(meta?.coldTolerance || '').toLowerCase();
}
function freezingOf(climate) {
  return String(climate?.freezingRisk || '').toLowerCase();
}
function thermalOf(climate) {
  return String(climate?.thermalRegime || '').toLowerCase();
}
function coldestOf(climate) {
  const v = climate?.coldestMonthMeanMinC;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function extremesColdKnown(climate) {
  return (
    climate?.extremeColdAuthority === true ||
    climate?.frostDayFrequency != null ||
    climate?.absoluteMinTempC != null
  );
}

/**
 * Plant-discriminated cold survival assessment (no generic freezingRisk stub).
 */
export function assessPlantClimateColdSurvival(meta, climateProfile = {}) {
  const frost = frostOf(meta);
  const coldTol = coldTolOf(meta);
  const freezingRisk = freezingOf(climateProfile);
  const thermal = thermalOf(climateProfile);
  const coldest = coldestOf(climateProfile);
  const frostProne =
    freezingRisk === 'high' || thermal === 'frost-prone' || (coldest != null && coldest <= 0);
  const extremes = extremesColdKnown(climateProfile);

  const quant = quantitativeColdSurvivalUnsupported(meta, climateProfile);
  if (quant?.unsupported) {
    return {
      survivalHint: 'unreliable',
      confidence: 'high',
      reason: quant.limiting,
      survivalFit: 20,
      thriveFit: 25,
      authority: 'quantitative-hardiness'
    };
  }

  if (outdoorDamagingColdUnsupported(meta, climateProfile)) {
    return {
      survivalHint: 'unreliable',
      confidence: 'high',
      reason:
        'Warm tropical / high frost-sensitivity plant below damaging-cold monthly mean band.',
      survivalFit: 25,
      thriveFit: 25,
      authority: 'tropical-damaging-cold'
    };
  }

  if (frost === 'high' && freezingRisk !== 'low' && freezingRisk !== '') {
    return {
      survivalHint: 'unreliable',
      confidence: extremes ? 'high' : 'medium',
      reason: 'High frostSensitivity conflicts with non-low freezingRisk.',
      survivalFit: 25,
      thriveFit: 25,
      authority: 'frostSensitivity-high'
    };
  }
  if (frost === 'high' && climateProfile?.isFrostFreeGrowingClimate === false) {
    return {
      survivalHint: 'unreliable',
      confidence: extremes ? 'high' : 'medium',
      reason: 'High frostSensitivity plant outside frost-free growing climate.',
      survivalFit: 25,
      thriveFit: 30,
      authority: 'frostSensitivity-high-not-frost-free'
    };
  }

  if (frostProne) {
    if (frost === 'low' && (coldTol === 'high' || coldTol === 'medium' || coldTol === '')) {
      return {
        survivalHint: 'reliable',
        confidence: extremes ? 'high' : 'medium',
        reason:
          'Cold-tolerant plant (low frostSensitivity); monthly frost-prone class alone is not treated as lethal.',
        survivalFit: 75,
        thriveFit: 70,
        authority: 'cold-tolerant-discrimination'
      };
    }
    if (frost === 'medium') {
      const leanHarder = coldest != null && coldest <= -5;
      return {
        survivalHint: 'constrained',
        confidence: extremes ? 'medium' : 'low',
        reason: leanHarder
          ? 'Medium frostSensitivity + strongly cold monthly means; no provenanced hardiness / extremes — conditional, not confident Not Recommended.'
          : 'Medium frostSensitivity + frost-prone monthly class; no provenanced hardiness / extremes — conditional.',
        survivalFit: leanHarder ? 55 : 65,
        thriveFit: leanHarder ? 50 : 65,
        authority: 'frostSensitivity-medium-bounded'
      };
    }
    if (frost === 'low' && coldTol === 'low') {
      return {
        survivalHint: 'constrained',
        confidence: 'low',
        reason: 'Low frostSensitivity but low coldTolerance under frost-prone class — bounded.',
        survivalFit: 60,
        thriveFit: 55,
        authority: 'mixed-cold-traits'
      };
    }
  }

  return {
    survivalHint: null,
    confidence: 'medium',
    reason: null,
    survivalFit: 75,
    thriveFit: 75,
    authority: 'neutral-baseline'
  };
}

/**
 * True only when plant evidence authorizes year-round-warm / tropical establishment need.
 */
export function plantRequiresYearRoundWarmClimate(meta) {
  const frost = frostOf(meta);
  const groups = Array.isArray(meta?.groupIds) ? meta.groupIds : [];
  if (groups.includes('tropical-frost-sensitive-fruit')) return true;
  if (frost === 'high' && coldTolOf(meta) === 'low') return true;
  const flower = String(meta?.floweringRequirements || '');
  const fruit = String(meta?.fruitingRequirements || '');
  if (/tropical|year-?\s*round\s*warm|always.?hot|humid tropics/i.test(`${flower} ${fruit}`)) {
    return true;
  }
  return false;
}

/**
 * Build suitability stub — never generic freezingRisk→15 or !frostFree→55.
 */
export function buildPlantDiscriminatedSuitabilityStub(meta, climateProfile = {}) {
  const cold = assessPlantClimateColdSurvival(meta, climateProfile);
  const needsWarm = plantRequiresYearRoundWarmClimate(meta);
  const frostFree = !!climateProfile.isFrostFreeGrowingClimate;
  const freezingRisk = freezingOf(climateProfile);
  const thermal = thermalOf(climateProfile);

  let survivalFit = cold.survivalFit;
  let thriveFit = cold.thriveFit;
  const warnings = [];
  let explanationText = '';
  let recommendationLevel = 'borderline';

  if (needsWarm) {
    if (!frostFree || freezingRisk === 'high' || /cool|frost-prone|highland/.test(thermal)) {
      thriveFit = Math.min(thriveFit, 35);
      warnings.push(
        'Plant evidence indicates warm / tropical establishment needs; climate is cool, frost-prone, or highland.'
      );
    }
  }

  if (cold.survivalHint === 'unreliable') {
    recommendationLevel = 'blocked';
    explanationText = cold.reason || explanationText;
    if (cold.reason) warnings.push(cold.reason);
  } else if (cold.survivalHint === 'constrained') {
    recommendationLevel = 'borderline';
    if (cold.reason) warnings.push(cold.reason);
  } else if (frostFree && !needsWarm) {
    recommendationLevel = 'good';
  }

  return {
    recommendationLevel,
    survivalFit,
    thriveFit,
    floweringFit: meta?.floweringRequirements ? 70 : 50,
    fruitingFit: meta?.fruitingRequirements ? 70 : 40,
    warnings,
    explanationText,
    forbidsGenericFrostStub: true,
    forbidsGenericThriveStub: true,
    coldAuthority: cold.authority,
    coldConfidence: cold.confidence,
    plantRequiresYearRoundWarm: needsWarm,
    coldAssessment: cold,
    baselineVersion: PLANT_CLIMATE_SUITABILITY_BASELINE_VERSION
  };
}
