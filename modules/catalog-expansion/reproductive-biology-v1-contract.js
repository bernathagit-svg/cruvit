/**
 * Reproductive biology contract — separates climate suitability from biological fruit-set.
 *
 * REPRODUCTIVE_CLIMATE_SUITABILITY: environment can support flowering/fruit development
 * BIOLOGICAL_FRUIT_SET_ELIGIBILITY: plant can actually set fruit (sex/pollinator/etc.)
 *
 * Optional provenance-backed fields only. UNKNOWN is valid. Do not invent values.
 */

export const REPRODUCTIVE_BIOLOGY_CONTRACT_VERSION = '1.0.0';

export const REPRODUCTIVE_CLIMATE_SUITABILITY = 'REPRODUCTIVE_CLIMATE_SUITABILITY';
export const BIOLOGICAL_FRUIT_SET_ELIGIBILITY = 'BIOLOGICAL_FRUIT_SET_ELIGIBILITY';

/** Optional claim fields (ingestion). All optional; absence → UNKNOWN eligibility. */
export const REPRODUCTIVE_BIOLOGY_CLAIM_FIELDS = Object.freeze([
  'reproductive.dioecious',
  'reproductive.monoecious',
  'reproductive.self_fertile',
  'reproductive.requires_pollinator',
  'reproductive.compatible_pollinator_requirement',
  'reproductive.sex_requirement',
  'reproductive.cultivar_dependency',
  'reproductive.reproductive_maturity_requirement'
]);

export const REPRODUCTIVE_TRAIT_KEYS = Object.freeze([
  'dioecious',
  'monoecious',
  'self_fertile',
  'requires_pollinator',
  'compatible_pollinator_requirement',
  'sex_requirement',
  'cultivar_dependency',
  'reproductive_maturity_requirement'
]);

/**
 * Read optional reproductive biology from climateTraits / quantitative / reproductive block.
 */
export function readBiologicalFruitSetEvidence(meta = {}) {
  const block =
    meta?.reproductiveBiology ||
    meta?.reproductive ||
    meta?.climateTraits?.reproductiveBiology ||
    {};
  const out = {};
  let anyKnown = false;
  for (const k of REPRODUCTIVE_TRAIT_KEYS) {
    if (block[k] !== undefined && block[k] !== null && block[k] !== '') {
      out[k] = block[k];
      anyKnown = true;
    }
  }
  return {
    known: anyKnown,
    traits: out,
    eligibility: anyKnown ? 'PARTIAL_OR_KNOWN' : 'UNKNOWN'
  };
}

/**
 * Fruiting dimension gate: climate may support development, but biological unknowns
 * block confident Supported fruiting.
 *
 * @param {{ climateFruitingStatus: string, meta: object, fruitOriented?: boolean }} args
 */
export function resolveFruitingWithBiologicalEligibility({
  climateFruitingStatus,
  meta,
  fruitOriented = false
} = {}) {
  const bio = readBiologicalFruitSetEvidence(meta);
  const climate = String(climateFruitingStatus || 'unknown').toLowerCase();

  if (climate === 'unreliable' || climate === 'unlikely' || climate === 'poor') {
    return {
      status: climate,
      reproductiveClimateSuitability: climate,
      biologicalFruitSetEligibility: bio.eligibility,
      note: 'Climate reproductive suitability already negative.'
    };
  }

  if (!fruitOriented && (climate === 'unknown' || !climate)) {
    return {
      status: 'unknown',
      reproductiveClimateSuitability: 'unknown',
      biologicalFruitSetEligibility: bio.eligibility,
      note: 'No fruiting requirement / not fruit-oriented.'
    };
  }

  // Climate looks positive or constrained — biological prerequisites
  if (bio.eligibility === 'UNKNOWN') {
    if (climate === 'supported' || climate === 'reliable') {
      return {
        status: 'unknown',
        reproductiveClimateSuitability: climate,
        biologicalFruitSetEligibility: 'UNKNOWN',
        note: 'Climate may support fruit development, but biological fruit-set prerequisites are unknown — cannot confidently Support fruiting.'
      };
    }
  }

  // Known dioecious without pollinator/sex resolution → conditional
  if (bio.traits.dioecious === true) {
    const sexOk = bio.traits.sex_requirement != null || bio.traits.self_fertile === true;
    const pollOk =
      bio.traits.requires_pollinator === false ||
      bio.traits.compatible_pollinator_requirement != null ||
      bio.traits.self_fertile === true;
    if (!sexOk || (bio.traits.requires_pollinator === true && !pollOk)) {
      return {
        status: 'unknown',
        reproductiveClimateSuitability: climate,
        biologicalFruitSetEligibility: 'CONDITIONAL',
        note: 'Dioecious / pollinator prerequisites not resolved — fruiting CONDITIONAL/UNKNOWN.'
      };
    }
  }

  return {
    status: climate,
    reproductiveClimateSuitability: climate,
    biologicalFruitSetEligibility: bio.eligibility,
    note: null
  };
}
