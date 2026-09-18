/**
 * Taxonomic precision vs visual Design representability.
 * Genus-level canonicals may be generation-eligible for morphology-neutral
 * vegetative assets. Do not invent a species. Do not hard-code plant names.
 */
import {
  DESIGN_MORPHOLOGY_AUTHORITY,
  DESIGN_STAGE_UNSPECIFIED,
  isBroadPlantIdentity
} from '../garden-design-variant-policy-v1.js';

export const IDENTITY_PRECISION = Object.freeze({
  SPECIES_SUPPORTED: 'SPECIES_SUPPORTED',
  GENUS_VISUALLY_REPRESENTABLE: 'GENUS_VISUALLY_REPRESENTABLE',
  GENUS_BLOCKED: 'GENUS_BLOCKED',
  IDENTITY_UNKNOWN: 'IDENTITY_UNKNOWN'
});

const RELIABLE_MORPHOLOGY = new Set([
  DESIGN_MORPHOLOGY_AUTHORITY.EXPLICIT_HABIT_FIELD,
  DESIGN_MORPHOLOGY_AUTHORITY.SOURCE_SUPPORTED_HABIT,
  DESIGN_MORPHOLOGY_AUTHORITY.CANONICAL_GROWTH_METADATA,
  DESIGN_MORPHOLOGY_AUTHORITY.TRUSTED_GROUP_HABIT
]);

/** Woody silhouettes vary too much at genus scope to mint a neutral cutout. */
const GENUS_HETEROGENEOUS_FORMS = new Set(['tree', 'shrub']);

/** Architecture-specific forms can support a morphology-neutral genus asset. */
const GENUS_COHERENT_FORMS = new Set([
  'herbaceous-clump',
  'herbaceous-upright',
  'rosette',
  'palm',
  'climber',
  'grass-like',
  'groundcover',
  'succulent-form',
  'subshrub'
]);

function scientificName(plant = {}) {
  return String(plant.acceptedScientificName || plant.scientific || plant.scientificName || '').trim();
}

function isCatchAllIdentity(sci) {
  return /^various\b/i.test(sci) || /^mixed\b/i.test(sci);
}

function intentionalGenusToken(sci) {
  return /^[A-Z][a-z]+(\s+spp\.?)?$/.test(sci) || /\bspp\.?\b/i.test(sci);
}

export function isIntentionalGenusIdentity(plant = {}) {
  const sci = scientificName(plant);
  if (isCatchAllIdentity(sci)) return false;
  if (plant.identityScope === 'genus' || isBroadPlantIdentity(plant)) {
    return intentionalGenusToken(sci) || Boolean(sci);
  }
  return /\bspp\.?\b/i.test(sci);
}

export function isSpeciesSupportedIdentity(plant = {}) {
  const sci = scientificName(plant);
  if (!sci || isCatchAllIdentity(sci) || /\bspp\.?\b/i.test(sci)) return false;
  if (plant.identityScope === 'genus' || isBroadPlantIdentity(plant)) return false;
  return /^[A-Z][a-z]+\s+[a-z]/.test(sci) || Boolean(plant.acceptedScientificName);
}

function morphologyNeutralRole(role = {}) {
  const phenology = String(role.phenology || 'vegetative').toLowerCase();
  if (phenology === 'flowering' || phenology === 'fruiting') return false;
  if (role.cultivarSpecific === true) return false;
  return phenology === 'vegetative' || phenology === 'dormant' || !phenology;
}

function reliableMorphology(demand = {}) {
  const form = demand.visualForm;
  const authority = demand.morphologyAuthority;
  if (!form || form === 'unknown') return false;
  if (demand.morphologyUnknown) return false;
  return RELIABLE_MORPHOLOGY.has(authority);
}

/**
 * @param {object} plant
 * @param {object} demand deriveVariantDemand result
 * @param {object} [role] specific required variant; omit for plant-level precision
 */
export function classifyIdentityPrecision(plant = {}, demand = {}, role = null) {
  if (plant.duplicateConflict) {
    return {
      identityPrecision: IDENTITY_PRECISION.IDENTITY_UNKNOWN,
      generationEligible: false,
      reason: 'ambiguous-canonical-identity',
      metadataFix: 'Resolve the duplicate-slug conflict onto one canonical identity before generation.'
    };
  }

  const sci = scientificName(plant);
  if (!sci && !isIntentionalGenusIdentity(plant)) {
    return {
      identityPrecision: IDENTITY_PRECISION.IDENTITY_UNKNOWN,
      generationEligible: false,
      reason: 'missing-scientific-evidence',
      metadataFix: 'Add acceptedScientificName or an intentional genus identity (Genus spp.).'
    };
  }

  if (isCatchAllIdentity(sci) || (sci && !intentionalGenusToken(sci) && isBroadPlantIdentity(plant) && !isSpeciesSupportedIdentity(plant))) {
    if (isCatchAllIdentity(sci) || !intentionalGenusToken(sci)) {
      return {
        identityPrecision: IDENTITY_PRECISION.IDENTITY_UNKNOWN,
        generationEligible: false,
        reason: 'identity-not-a-botanical-genus',
        metadataFix: 'Replace catch-all horticultural labels with a species or an intentional genus (Genus spp.).'
      };
    }
  }

  if (demand.morphologyUnknown || demand.visualForm === 'unknown') {
    const genus = isIntentionalGenusIdentity(plant);
    return {
      identityPrecision: genus ? IDENTITY_PRECISION.GENUS_BLOCKED : IDENTITY_PRECISION.IDENTITY_UNKNOWN,
      generationEligible: false,
      reason: 'UNKNOWN-morphology',
      metadataFix: 'Add source-supported visualForm and habit modifiers before generation.'
    };
  }

  if (role && (!role.growthStage || role.growthStage === DESIGN_STAGE_UNSPECIFIED)) {
    return {
      identityPrecision: isIntentionalGenusIdentity(plant)
        ? IDENTITY_PRECISION.GENUS_BLOCKED
        : IDENTITY_PRECISION.IDENTITY_UNKNOWN,
      generationEligible: false,
      reason: 'variant-ambiguity',
      metadataFix: 'Resolve morphology so required variants have explicit growthStage values.'
    };
  }

  if (isSpeciesSupportedIdentity(plant)) {
    return {
      identityPrecision: IDENTITY_PRECISION.SPECIES_SUPPORTED,
      generationEligible: true,
      reason: null,
      metadataFix: null
    };
  }

  if (!isIntentionalGenusIdentity(plant)) {
    return {
      identityPrecision: IDENTITY_PRECISION.IDENTITY_UNKNOWN,
      generationEligible: false,
      reason: 'identity-unresolved',
      metadataFix: 'Assign species-level or intentional genus-level scientific identity.'
    };
  }

  if (role && !morphologyNeutralRole(role)) {
    return {
      identityPrecision: IDENTITY_PRECISION.GENUS_BLOCKED,
      generationEligible: false,
      reason: 'genus-requires-species-specific-trait',
      metadataFix: 'Flower, fruit, or cultivar-specific variants stay blocked at genus scope. Keep a morphology-neutral vegetative asset or resolve to species.'
    };
  }

  if (!reliableMorphology(demand)) {
    return {
      identityPrecision: IDENTITY_PRECISION.GENUS_BLOCKED,
      generationEligible: false,
      reason: 'genus-morphology-not-reliable',
      metadataFix: 'Genus assets require SOURCE_SUPPORTED / canonical growth morphology, not a heuristic guess.'
    };
  }

  const form = demand.visualForm;
  if (GENUS_HETEROGENEOUS_FORMS.has(form)) {
    return {
      identityPrecision: IDENTITY_PRECISION.GENUS_BLOCKED,
      generationEligible: false,
      reason: 'genus-visually-too-heterogeneous',
      metadataFix: 'This visualForm varies too much across the genus for a morphology-neutral cutout. Resolve to species before generation.'
    };
  }

  if (!GENUS_COHERENT_FORMS.has(form)) {
    return {
      identityPrecision: IDENTITY_PRECISION.GENUS_BLOCKED,
      generationEligible: false,
      reason: 'genus-form-not-visually-coherent',
      metadataFix: 'VisualForm is not a coherent genus-level architecture for a Design cutout.'
    };
  }

  return {
    identityPrecision: IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE,
    generationEligible: true,
    reason: 'genus-morphology-neutral-vegetative',
    metadataFix: null,
    provenanceRequired: 'identity_scope=genus; do not invent a species or cultivar'
  };
}
