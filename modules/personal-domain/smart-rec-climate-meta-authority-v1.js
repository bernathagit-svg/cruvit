/**
 * Smart Rec climate meta authority v1 — canonical climateTraits primary.
 * DATA AUTHORITY ORDERING ONLY (not suitability scoring formulas).
 *
 * Precedence:
 * 1) plant.climateTraits (canonical) when present
 * 2) legacy inline SMART_REC table when canonical traits absent
 * 3) group enrichment from plant groupIds (asserted on traits)
 * 4) synthetic merge defaults are marked and stripped on canonical path
 */

export const SMART_REC_CLIMATE_META_AUTHORITY_VERSION = '1.1.0';
export const CLIMATE_BOOLEAN_FIELDS = Object.freeze(['needsWinterChill', 'needsDrySeason']);
export const CLIMATE_BOOLEAN_POLICY_VERSION = 'climate-boolean-unknown-v1.0.0';

/** Read a three-state decision without turning missing data into false. */
export function readClimateBooleanTrait(meta, field) {
  if (!meta || typeof meta !== 'object' || !CLIMATE_BOOLEAN_FIELDS.includes(field)) {
    return { declared: false, value: null };
  }
  const owns = (obj) => !!obj && Object.prototype.hasOwnProperty.call(obj, field);
  const maps = [meta.traitEvidenceClasses, meta.fieldEvidenceClasses, meta.traitProvenance];
  const evidenceDeclared = maps.some(owns);
  const provenance = owns(meta.traitProvenance) ? meta.traitProvenance[field] : null;
  const unknown = [
    owns(meta.traitEvidenceClasses) ? meta.traitEvidenceClasses[field] : null,
    owns(meta.fieldEvidenceClasses) ? meta.fieldEvidenceClasses[field] : null,
    provenance?.evidenceClass,
    provenance?.status
  ].some((value) => typeof value === 'string' && value.trim().toUpperCase() === 'UNKNOWN');
  const synthetic = meta[field] === null
    && Array.isArray(meta.syntheticDefaultFields)
    && meta.syntheticDefaultFields.includes(field)
    && !evidenceDeclared;
  const declared = (owns(meta) && !synthetic) || evidenceDeclared;
  return {
    declared,
    value: declared && owns(meta) && !unknown && typeof meta[field] === 'boolean' ? meta[field] : null
  };
}

export const MERGE_CORE_DEFAULT_FIELDS = Object.freeze([
  'heatTolerance',
  'coldTolerance',
  'frostSensitivity',
  'humidityTolerance',
  'drainageNeeds'
]);

export const MERGE_CORE_DEFAULT_VALUES = Object.freeze({
  heatTolerance: 'medium',
  coldTolerance: 'medium',
  frostSensitivity: 'medium',
  humidityTolerance: 'medium',
  drainageNeeds: 'medium'
});

export const META_AUTHORITY = Object.freeze({
  CANONICAL_CLIMATE_TRAITS: 'canonical-climateTraits',
  LEGACY_INLINE_SMART_REC: 'legacy-inline-smart-rec'
});

function uniqueValues(lists) {
  const out = [];
  const seen = new Set();
  (lists || []).flat().forEach((v) => {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function presentScalar(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** True when plant carries canonical structured climateTraits usable as primary authority. */
export function plantHasCanonicalClimateTraits(plant) {
  const t = plant?.climateTraits;
  if (!t || typeof t !== 'object') return false;
  if (CLIMATE_BOOLEAN_FIELDS.some((key) => hasOwn(t, key) || readClimateBooleanTrait(t, key).declared)) return true;
  const keys = [
    ...MERGE_CORE_DEFAULT_FIELDS,
    'sunNeeds',
    'waterNeeds',
    'floweringRequirements',
    'fruitingRequirements',
    'groupIds',
    'needsWinterChill',
    'traitEvidenceClasses',
    'reproductiveBiology'
  ];
  return keys.some((k) => presentScalar(t[k]));
}

/**
 * Merge climate meta objects. Tracks syntheticDefaultFields for core keys that
 * remain at baseline defaults because no argument asserted them.
 */
export function mergeSmartRecClimateMeta(...metas) {
  const merged = {
    heatTolerance: MERGE_CORE_DEFAULT_VALUES.heatTolerance,
    coldTolerance: MERGE_CORE_DEFAULT_VALUES.coldTolerance,
    frostSensitivity: MERGE_CORE_DEFAULT_VALUES.frostSensitivity,
    humidityTolerance: MERGE_CORE_DEFAULT_VALUES.humidityTolerance,
    needsWinterChill: null,
    needsDrySeason: null,
    booleanTraitPolicyVersion: CLIMATE_BOOLEAN_POLICY_VERSION,
    drainageNeeds: MERGE_CORE_DEFAULT_VALUES.drainageNeeds,
    floweringRequirements: '',
    fruitingRequirements: '',
    survivalVsThriveNotes: '',
    warningFlags: [],
    hardBlockRules: [],
    groupIds: [],
    needsReview: false
  };
  const assertedCore = new Set();
  const assertedBooleans = new Set();

  metas.filter(Boolean).forEach((meta) => {
    MERGE_CORE_DEFAULT_FIELDS.forEach((key) => {
      if (meta[key]) {
        merged[key] = meta[key];
        assertedCore.add(key);
      }
    });
    ['sunNeeds', 'waterNeeds'].forEach((key) => {
      if (!hasOwn(meta, key)) return;
      const value = meta[key];
      if (typeof value !== 'string' || !value.trim()) return;
      merged[key] = value;
    });
    ['floweringRequirements', 'fruitingRequirements', 'survivalVsThriveNotes'].forEach((key) => {
      if (meta[key]) merged[key] = meta[key];
    });
    CLIMATE_BOOLEAN_FIELDS.forEach((key) => {
      const decision = readClimateBooleanTrait(meta, key);
      if (!decision.declared) return;
      merged[key] = decision.value;
      assertedBooleans.add(key);
      // A later decision owns its evidence; never borrow support for an older value.
      ['traitEvidenceClasses', 'fieldEvidenceClasses', 'traitProvenance'].forEach((mapKey) => {
        const incoming = meta[mapKey];
        if (incoming && hasOwn(incoming, key)) {
          merged[mapKey] = { ...(merged[mapKey] || {}), [key]: incoming[key] };
        } else if (merged[mapKey] && hasOwn(merged[mapKey], key)) {
          const copy = { ...merged[mapKey] };
          delete copy[key];
          merged[mapKey] = copy;
        }
      });
    });
    if (meta.needsReview === true) merged.needsReview = true;
    if (meta.floweringOutcomeApplicable === false) merged.floweringOutcomeApplicable = false;
    if (meta.fruitingOutcomeApplicable === false) merged.fruitingOutcomeApplicable = false;
    merged.warningFlags = uniqueValues([merged.warningFlags, meta.warningFlags || []]);
    merged.hardBlockRules = uniqueValues([merged.hardBlockRules, meta.hardBlockRules || []]);
    merged.groupIds = uniqueValues([merged.groupIds, meta.groupIds || []]);

    if (meta.traitEvidenceClasses && typeof meta.traitEvidenceClasses === 'object') {
      merged.traitEvidenceClasses = {
        ...(merged.traitEvidenceClasses || {}),
        ...meta.traitEvidenceClasses
      };
    }
    if (meta.fieldEvidenceClasses && typeof meta.fieldEvidenceClasses === 'object') {
      merged.fieldEvidenceClasses = {
        ...(merged.fieldEvidenceClasses || {}),
        ...meta.fieldEvidenceClasses
      };
    }
    if (meta.reproductiveBiology && typeof meta.reproductiveBiology === 'object') {
      merged.reproductiveBiology = {
        ...(merged.reproductiveBiology || {}),
        ...meta.reproductiveBiology
      };
    }
    if (meta.quantitativeEvidence && typeof meta.quantitativeEvidence === 'object') {
      merged.quantitativeEvidence = {
        ...(merged.quantitativeEvidence || {}),
        ...meta.quantitativeEvidence
      };
    }
    if (meta.quantitative && typeof meta.quantitative === 'object') {
      merged.quantitative = { ...(merged.quantitative || {}), ...meta.quantitative };
    }
    if (meta.quantitativeProvenance && typeof meta.quantitativeProvenance === 'object') {
      merged.quantitativeProvenance = {
        ...(merged.quantitativeProvenance || {}),
        ...meta.quantitativeProvenance
      };
    }
  });

  merged.syntheticDefaultFields = MERGE_CORE_DEFAULT_FIELDS.filter((k) => !assertedCore.has(k))
    .concat(CLIMATE_BOOLEAN_FIELDS.filter((k) => !assertedBooleans.has(k)));
  return merged;
}

/** Remove core values that exist only because of merge baseline defaults. */
export function stripSyntheticCoreDefaults(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = { ...meta };
  const syn = Array.isArray(out.syntheticDefaultFields) ? out.syntheticDefaultFields : [];
  syn.forEach((k) => {
    if (MERGE_CORE_DEFAULT_FIELDS.includes(k)) delete out[k];
  });
  return out;
}

export function climateMetaFromCatalogTraits(traits, scientific, climateGroups = {}) {
  if (!traits || typeof traits !== 'object') return null;
  const groupIds = Array.isArray(traits.groupIds) ? traits.groupIds : [];
  const groupMeta = groupIds.map((groupId) =>
    mergeSmartRecClimateMeta({ groupIds: [groupId] }, climateGroups[groupId] || null)
  );
  // Canonical absence is authoritative UNKNOWN; group templates cannot fill these booleans.
  const canonicalTraits = { ...traits };
  CLIMATE_BOOLEAN_FIELDS.forEach((key) => {
    canonicalTraits[key] = readClimateBooleanTrait(traits, key).value;
  });
  if (Array.isArray(canonicalTraits.syntheticDefaultFields)) {
    canonicalTraits.syntheticDefaultFields = canonicalTraits.syntheticDefaultFields.filter(
      (key) => !CLIMATE_BOOLEAN_FIELDS.includes(key)
    );
  }
  let merged = mergeSmartRecClimateMeta(...groupMeta, canonicalTraits);
  const sci = String(scientific || '');
  if (
    merged.needsReview ||
    traits.needsReview === true ||
    /\bspp\.?\b/i.test(sci) ||
    /various/i.test(sci)
  ) {
    merged = mergeSmartRecClimateMeta(merged, { needsReview: true });
  }
  // Preserve structured fields explicitly (already merged, but ensure traits win)
  if (traits.traitEvidenceClasses) {
    merged.traitEvidenceClasses = { ...traits.traitEvidenceClasses };
  }
  if (traits.reproductiveBiology) {
    merged.reproductiveBiology = { ...traits.reproductiveBiology };
  }
  if (traits.quantitativeEvidence) {
    merged.quantitativeEvidence = { ...traits.quantitativeEvidence };
  }
  if (traits.quantitative) {
    merged.quantitative = { ...traits.quantitative };
  }
  merged = stripSyntheticCoreDefaults(merged);
  merged._metaAuthority = META_AUTHORITY.CANONICAL_CLIMATE_TRAITS;
  return merged;
}

/**
 * Resolve runtime climate meta for a plant.
 * @param {object} plant
 * @param {object} opts
 * @param {object} [opts.legacyInlineTable] SMART_REC_CLIMATE_METADATA
 * @param {object} [opts.climateGroups] SMART_REC_CLIMATE_GROUPS
 * @param {function} [opts.metaKeyForPlant]
 */
export function resolveSmartRecClimateMetaForPlant(plant, opts = {}) {
  if (!plant || typeof plant !== 'object') return null;
  const scientific = String(plant.scientific || '');
  const climateGroups = opts.climateGroups || {};
  const legacyInlineTable = opts.legacyInlineTable || null;
  const metaKeyForPlant =
    typeof opts.metaKeyForPlant === 'function'
      ? opts.metaKeyForPlant
      : (p) => String(p?.slug || '').trim().toLowerCase();

  if (plantHasCanonicalClimateTraits(plant)) {
    let meta = climateMetaFromCatalogTraits(plant.climateTraits, scientific, climateGroups);
    if (!meta) return null;
    if (meta.needsReview || /\bspp\.?\b/i.test(scientific) || /various/i.test(scientific)) {
      meta = stripSyntheticCoreDefaults(
        mergeSmartRecClimateMeta(meta, { needsReview: true })
      );
      meta.traitEvidenceClasses = plant.climateTraits?.traitEvidenceClasses || meta.traitEvidenceClasses;
      meta.reproductiveBiology = plant.climateTraits?.reproductiveBiology || meta.reproductiveBiology;
      meta.quantitativeEvidence = plant.climateTraits?.quantitativeEvidence || meta.quantitativeEvidence;
      meta.quantitative = plant.climateTraits?.quantitative || meta.quantitative;
    }
    meta._metaAuthority = META_AUTHORITY.CANONICAL_CLIMATE_TRAITS;
    return meta;
  }

  // Legacy fallback — bootstrap plants without climateTraits
  let meta = null;
  if (legacyInlineTable && typeof legacyInlineTable === 'object') {
    const key = metaKeyForPlant(plant);
    meta = legacyInlineTable[key] || null;
  }
  if (!meta) {
    meta = climateMetaFromCatalogTraits(plant.climateTraits, scientific, climateGroups);
    if (!meta) return null;
  }
  const out = { ...meta, _metaAuthority: META_AUTHORITY.LEGACY_INLINE_SMART_REC };
  if (out.needsReview || /\bspp\.?\b/i.test(scientific) || /various/i.test(scientific)) {
    return {
      ...mergeSmartRecClimateMeta(out, { needsReview: true }),
      _metaAuthority: META_AUTHORITY.LEGACY_INLINE_SMART_REC
    };
  }
  return out;
}
