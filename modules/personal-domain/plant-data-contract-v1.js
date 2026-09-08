/**
 * Plant Data Contract v1 — DATA READINESS ONLY.
 *
 * Single authority for whether a plant record is complete enough for CRUVIT
 * multidimensional suitability product surfaces. Does NOT score climate fit.
 *
 * Critical rule: runtime merge defaults (e.g. smartRecMergeClimateMeta inserting
 * "medium" for frost/cold/heat/humidity/drainage) are NOT authoritative plant
 * knowledge and MUST NOT manufacture Class A readiness.
 */

import { FIELD_PROVENANCE_EVIDENCE_CLASSES } from '../catalog-expansion/field-provenance-honesty-v1-contract.js';

export const PLANT_DATA_CONTRACT_VERSION = '1.0.0';
export const PLANT_DATA_CONTRACT_ID = 'plant-data-contract-v1';

/** Mirrors app.html smartRecMergeClimateMeta baseline defaults (do not invent new ones). */
export const SMART_REC_MERGE_DEFAULT_CORE = Object.freeze({
  heatTolerance: 'medium',
  coldTolerance: 'medium',
  frostSensitivity: 'medium',
  humidityTolerance: 'medium',
  drainageNeeds: 'medium'
});

export const VALUE_ORIGIN = Object.freeze({
  ASSERTED_SOURCE: 'ASSERTED_SOURCE',
  LEGACY_ASSERTED_METADATA: 'LEGACY_ASSERTED_METADATA',
  MERGE_DEFAULT: 'MERGE_DEFAULT',
  ABSENT_UNKNOWN: 'ABSENT_UNKNOWN',
  UNKNOWN_PROVENANCE: 'UNKNOWN_PROVENANCE'
});

export const PLANT_DATA_READINESS = Object.freeze({
  A_REAL_SUITABILITY_READY: 'A_REAL_SUITABILITY_READY',
  B_PARTIAL_OUTCOME_READY: 'B_PARTIAL_OUTCOME_READY',
  C_BASIC_CLIMATE_ONLY: 'C_BASIC_CLIMATE_ONLY',
  D_NOT_PRODUCT_READY: 'D_NOT_PRODUCT_READY'
});

export const PLANT_DATA_READINESS_SHORT = Object.freeze({
  A: PLANT_DATA_READINESS.A_REAL_SUITABILITY_READY,
  B: PLANT_DATA_READINESS.B_PARTIAL_OUTCOME_READY,
  C: PLANT_DATA_READINESS.C_BASIC_CLIMATE_ONLY,
  D: PLANT_DATA_READINESS.D_NOT_PRODUCT_READY
});

export const PLANT_DATA_REASON = Object.freeze({
  MISSING_TRAIT_EVIDENCE: 'MISSING_TRAIT_EVIDENCE',
  FLOWERING_REQUIREMENTS_MISSING: 'FLOWERING_REQUIREMENTS_MISSING',
  FRUITING_REQUIREMENTS_MISSING: 'FRUITING_REQUIREMENTS_MISSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  LEGACY_META_ONLY: 'LEGACY_META_ONLY',
  SYNTHETIC_DEFAULT_CORE_VALUE: 'SYNTHETIC_DEFAULT_CORE_VALUE',
  IDENTITY_AMBIGUITY: 'IDENTITY_AMBIGUITY',
  IDENTITY_MISSING: 'IDENTITY_MISSING',
  REPRODUCTIVE_CONTEXT_MISSING: 'REPRODUCTIVE_CONTEXT_MISSING',
  MISSING_FROST_SENSITIVITY: 'MISSING_FROST_SENSITIVITY',
  MISSING_CLIMATE_CORE: 'MISSING_CLIMATE_CORE',
  SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A: 'SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A',
  UNKNOWN_FIELD_PROVENANCE: 'UNKNOWN_FIELD_PROVENANCE',
  HUMIDITY_UNKNOWN: 'HUMIDITY_UNKNOWN',
  COMPLETE_FOR_CLASS_A: 'COMPLETE_FOR_CLASS_A'
});

export const CLIMATE_CORE_FIELDS = Object.freeze([
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'sunNeeds',
  'waterNeeds',
  'humidityTolerance',
  'drainageNeeds'
]);

/** Material climate for Survival/Growth partial path. */
export const MATERIAL_CLIMATE_FIELDS = Object.freeze([
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance'
]);

export const EVIDENCE_CLASS = FIELD_PROVENANCE_EVIDENCE_CLASSES;

export const ALLOWED_EVIDENCE_CLASSES = Object.freeze([
  EVIDENCE_CLASS.SOURCE_SUPPORTED,
  EVIDENCE_CLASS.HEURISTIC_ASSERTION,
  EVIDENCE_CLASS.UNKNOWN
]);

export const PLANT_DATA_FIELD_REQUIREMENTS = Object.freeze({
  identity: Object.freeze(['slug', 'commonName', 'scientific']),
  climateCore: CLIMATE_CORE_FIELDS,
  materialClimate: MATERIAL_CLIMATE_FIELDS,
  floweringStance: Object.freeze(['floweringRequirements', 'floweringOutcomeApplicable']),
  fruitingStance: Object.freeze(['fruitingRequirements', 'fruitingOutcomeApplicable']),
  evidence: Object.freeze(['traitEvidenceClasses']),
  ruleContext: Object.freeze(['groupIds', 'reproductiveBiology', 'needsWinterChill'])
});

function isPresentScalar(v) {
  if (v == null) return false;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return false;
    if (s.toUpperCase() === 'UNKNOWN') return false;
    return true;
  }
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function traitsOf(plant) {
  if (!plant || typeof plant !== 'object') return {};
  if (plant.climateTraits && typeof plant.climateTraits === 'object') return plant.climateTraits;
  return {};
}

export function resolvePlantCommonName(plant = {}) {
  return String(
    plant.name ||
      plant.commonName ||
      plant.names?.en ||
      plant.names?.common ||
      plant.identity?.commonNameEn ||
      ''
  ).trim();
}

export function resolvePlantSlug(plant = {}) {
  return String(
    plant.slug || plant.id || plant.canonicalSlug || plant.identity?.canonicalSlug || ''
  )
    .trim()
    .toLowerCase();
}

export function resolvePlantScientific(plant = {}) {
  return String(
    plant.scientific ||
      plant.scientificName ||
      plant.identity?.acceptedScientificName ||
      ''
  ).trim();
}

export function scientificIsAmbiguousForClassA(scientific) {
  const s = String(scientific || '').trim();
  if (!s) return true;
  if (/\bspp\.?\b/i.test(s)) return true;
  if (/^various\b/i.test(s)) return true;
  return false;
}

export function getTraitEvidenceMap(plant = {}) {
  const t = traitsOf(plant);
  const map =
    t.traitEvidenceClasses ||
    t.fieldEvidenceClasses ||
    plant.traitEvidenceClasses ||
    plant.fieldEvidenceClasses ||
    null;
  if (!map || typeof map !== 'object') return null;
  return map;
}

/**
 * Read a climate field from authoritative plant source data only
 * (climateTraits / top-level explicit), never from merge defaults.
 */
export function readAssertedClimateField(plant, field) {
  const t = traitsOf(plant);
  if (Object.prototype.hasOwnProperty.call(t, field) && isPresentScalar(t[field])) {
    return { value: t[field], origin: VALUE_ORIGIN.ASSERTED_SOURCE, present: true };
  }
  if (
    plant &&
    Object.prototype.hasOwnProperty.call(plant, field) &&
    isPresentScalar(plant[field]) &&
    !['slug', 'name', 'scientific', 'aliases', 'tags'].includes(field)
  ) {
    return { value: plant[field], origin: VALUE_ORIGIN.ASSERTED_SOURCE, present: true };
  }
  return { value: null, origin: VALUE_ORIGIN.ABSENT_UNKNOWN, present: false };
}

/**
 * Distinguish asserted source values from runtime merge defaults.
 *
 * @param {string} field
 * @param {object} opts
 * @param {object} [opts.plant] - plant with climateTraits (source of truth)
 * @param {object} [opts.mergedRuntimeMeta] - output of smartRecMergeClimateMeta-like merge
 * @param {object} [opts.fieldOrigins] - optional explicit map field → VALUE_ORIGIN
 * @param {object} [opts.legacyAssertedMeta] - optional legacy SMART_REC row (per-slug asserted)
 */
export function resolveClimateFieldValueOrigin(field, opts = {}) {
  const {
    plant = null,
    mergedRuntimeMeta = null,
    fieldOrigins = null,
    legacyAssertedMeta = null
  } = opts;

  if (fieldOrigins && fieldOrigins[field]) {
    const o = fieldOrigins[field];
    if (Object.values(VALUE_ORIGIN).includes(o)) return o;
  }

  const asserted = plant ? readAssertedClimateField(plant, field) : null;
  if (asserted?.present) return VALUE_ORIGIN.ASSERTED_SOURCE;

  if (
    legacyAssertedMeta &&
    Object.prototype.hasOwnProperty.call(legacyAssertedMeta, field) &&
    isPresentScalar(legacyAssertedMeta[field])
  ) {
    return VALUE_ORIGIN.LEGACY_ASSERTED_METADATA;
  }

  const mergeDefault = SMART_REC_MERGE_DEFAULT_CORE[field];
  if (
    mergeDefault != null &&
    mergedRuntimeMeta &&
    Object.prototype.hasOwnProperty.call(mergedRuntimeMeta, field)
  ) {
    const mv = mergedRuntimeMeta[field];
    // Source absent + merged equals known merge default → synthetic default.
    if (!asserted?.present && String(mv) === String(mergeDefault)) {
      return VALUE_ORIGIN.MERGE_DEFAULT;
    }
    // Source absent + merged has a value that is NOT the known default →
    // could be group template or unknown path — do not treat as Class A source.
    if (!asserted?.present && isPresentScalar(mv)) {
      return VALUE_ORIGIN.UNKNOWN_PROVENANCE;
    }
  }

  if (mergedRuntimeMeta && isPresentScalar(mergedRuntimeMeta[field]) && !asserted?.present) {
    // Merged value present without source or known-default match → conservative.
    return VALUE_ORIGIN.UNKNOWN_PROVENANCE;
  }

  return VALUE_ORIGIN.ABSENT_UNKNOWN;
}

export function isAuthoritativeOrigin(origin) {
  return (
    origin === VALUE_ORIGIN.ASSERTED_SOURCE || origin === VALUE_ORIGIN.LEGACY_ASSERTED_METADATA
  );
}

export function hasFloweringStance(plant = {}) {
  const t = traitsOf(plant);
  if (t.floweringOutcomeApplicable === false || plant.floweringOutcomeApplicable === false) {
    return { ready: true, applicable: false };
  }
  const text = String(t.floweringRequirements || plant.floweringRequirements || '').trim();
  if (text) return { ready: true, applicable: true, text };
  return { ready: false, applicable: null };
}

export function hasFruitingStance(plant = {}) {
  const t = traitsOf(plant);
  if (t.fruitingOutcomeApplicable === false || plant.fruitingOutcomeApplicable === false) {
    return { ready: true, applicable: false };
  }
  const text = String(t.fruitingRequirements || plant.fruitingRequirements || '').trim();
  if (text) return { ready: true, applicable: true, text };
  return { ready: false, applicable: null };
}

export function plantNeedsReview(plant = {}) {
  const t = traitsOf(plant);
  if (t.needsReview === true || plant.needsReview === true) return true;
  if (String(plant.qualityTier || '').toLowerCase() === 'needs_review') return true;
  return false;
}

/**
 * Classify a single plant for data readiness (not climate suitability score).
 *
 * @param {object} plant
 * @param {object} [options]
 * @param {object} [options.mergedRuntimeMeta]
 * @param {object} [options.legacyAssertedMeta]
 * @param {object} [options.fieldOrigins]
 * @param {boolean} [options.requireReproductiveBiologyForFruiting=false]
 */
export function classifyPlantDataReadiness(plant, options = {}) {
  const reasons = [];
  const fieldOrigins = {};
  const originOpts = {
    plant,
    mergedRuntimeMeta: options.mergedRuntimeMeta || null,
    legacyAssertedMeta: options.legacyAssertedMeta || null,
    fieldOrigins:
      options.fieldOrigins ||
      (plant?.climateTraits && typeof plant.climateTraits.fieldOrigins === 'object'
        ? plant.climateTraits.fieldOrigins
        : null)
  };

  const slug = resolvePlantSlug(plant);
  const commonName = resolvePlantCommonName(plant);
  const scientific = resolvePlantScientific(plant);
  const identityOk = !!slug && !!commonName && !!scientific;
  if (!identityOk) reasons.push(PLANT_DATA_REASON.IDENTITY_MISSING);

  if (scientificIsAmbiguousForClassA(scientific) && identityOk) {
    reasons.push(PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A);
  }

  const corePresence = {};
  const syntheticDefaults = [];
  const unknownProvenance = [];
  for (const field of CLIMATE_CORE_FIELDS) {
    const origin = resolveClimateFieldValueOrigin(field, originOpts);
    fieldOrigins[field] = origin;
    const asserted = readAssertedClimateField(plant, field);
    const authoritative =
      isAuthoritativeOrigin(origin) && (asserted.present || origin === VALUE_ORIGIN.LEGACY_ASSERTED_METADATA);
    corePresence[field] = authoritative;

    if (origin === VALUE_ORIGIN.MERGE_DEFAULT) {
      syntheticDefaults.push(field);
    }
    if (origin === VALUE_ORIGIN.UNKNOWN_PROVENANCE) {
      unknownProvenance.push(field);
    }
  }

  if (syntheticDefaults.length) {
    reasons.push(PLANT_DATA_REASON.SYNTHETIC_DEFAULT_CORE_VALUE);
  }
  if (unknownProvenance.length) {
    reasons.push(PLANT_DATA_REASON.UNKNOWN_FIELD_PROVENANCE);
  }

  const frostOk = corePresence.frostSensitivity === true;
  if (!frostOk) reasons.push(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY);

  const climateCoreOk = CLIMATE_CORE_FIELDS.every((f) => corePresence[f] === true);
  if (!climateCoreOk && frostOk) reasons.push(PLANT_DATA_REASON.MISSING_CLIMATE_CORE);

  const materialOk = MATERIAL_CLIMATE_FIELDS.every((f) => corePresence[f] === true);

  const flower = hasFloweringStance(plant);
  const fruit = hasFruitingStance(plant);
  if (!flower.ready) reasons.push(PLANT_DATA_REASON.FLOWERING_REQUIREMENTS_MISSING);
  if (!fruit.ready) reasons.push(PLANT_DATA_REASON.FRUITING_REQUIREMENTS_MISSING);

  const evMap = getTraitEvidenceMap(plant);
  const materialFieldsForEvidence = [
    ...MATERIAL_CLIMATE_FIELDS,
    ...(corePresence.humidityTolerance ? ['humidityTolerance'] : [])
  ];
  let evidenceOk = false;
  let sourceSupportedMaterialOk = false;
  if (evMap && typeof evMap === 'object') {
    evidenceOk = materialFieldsForEvidence.every((f) => {
      const c = evMap[f];
      return c && ALLOWED_EVIDENCE_CLASSES.includes(c);
    });
    // Class A = real suitability ready: confident product claims require SOURCE_SUPPORTED
    // on frost+cold (survival material axis). Aligns with evidence-strength propagation:
    // HEURISTIC may preserve severe negatives but must not authorize Class A / confident positives.
    // heatTolerance may remain HEURISTIC (existing Class A fixture); broader SOURCE_SUPPORTED
    // on all material cores is a separate future policy.
    sourceSupportedMaterialOk = ['frostSensitivity', 'coldTolerance'].every(
      (f) => evMap[f] === EVIDENCE_CLASS.SOURCE_SUPPORTED
    );
  }
  if (!evidenceOk) reasons.push(PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE);

  const needsReview = plantNeedsReview(plant);
  if (needsReview) reasons.push(PLANT_DATA_REASON.NEEDS_REVIEW);

  const t = traitsOf(plant);
  const hasClimateTraitsObject =
    plant?.climateTraits &&
    typeof plant.climateTraits === 'object' &&
    Object.keys(plant.climateTraits).length > 0;
  const legacyOnly =
    !hasClimateTraitsObject &&
    !!(options.legacyAssertedMeta || options.mergedRuntimeMeta) &&
    !materialOk;
  if (!hasClimateTraitsObject && !materialOk) {
    reasons.push(PLANT_DATA_REASON.LEGACY_META_ONLY);
  }

  const fruitOriented =
    fruit.applicable === true ||
    (Array.isArray(t.groupIds) &&
      t.groupIds.some((g) => /fruit|citrus|berry|edible/i.test(String(g)))) ||
    (Array.isArray(plant.tags) &&
      plant.tags.some((g) => /fruit|citrus|berry|edible/i.test(String(g))));
  const repro = t.reproductiveBiology || plant.reproductiveBiology;
  if (
    options.requireReproductiveBiologyForFruiting === true &&
    fruitOriented &&
    fruit.applicable !== false &&
    (!repro || typeof repro !== 'object')
  ) {
    reasons.push(PLANT_DATA_REASON.REPRODUCTIVE_CONTEXT_MISSING);
  }

  if (!corePresence.humidityTolerance && frostOk) {
    reasons.push(PLANT_DATA_REASON.HUMIDITY_UNKNOWN);
  }

  // Classification
  let readiness = PLANT_DATA_READINESS.D_NOT_PRODUCT_READY;
  let readinessShort = 'D';
  let gate = 'REJECT';

  const ambiguousBlocksA =
    reasons.includes(PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A) ||
    reasons.includes(PLANT_DATA_REASON.SYNTHETIC_DEFAULT_CORE_VALUE) ||
    reasons.includes(PLANT_DATA_REASON.UNKNOWN_FIELD_PROVENANCE);

  if (!identityOk || !frostOk) {
    readiness = PLANT_DATA_READINESS.D_NOT_PRODUCT_READY;
    readinessShort = 'D';
    gate = 'REJECT';
  } else if (
    climateCoreOk &&
    flower.ready &&
    fruit.ready &&
    evidenceOk &&
    sourceSupportedMaterialOk &&
    !needsReview &&
    !ambiguousBlocksA
  ) {
    readiness = PLANT_DATA_READINESS.A_REAL_SUITABILITY_READY;
    readinessShort = 'A';
    gate = 'PASS';
    reasons.push(PLANT_DATA_REASON.COMPLETE_FOR_CLASS_A);
  } else if (materialOk) {
    readiness = PLANT_DATA_READINESS.B_PARTIAL_OUTCOME_READY;
    readinessShort = 'B';
    // PRODUCT GATE: ordinary B is PARTIAL (needs enrichment / incomplete Class A).
    // HOLD is reserved for real hold conditions (needsReview / policy conflict),
    // not merely missing SOURCE_SUPPORTED frost+cold (that is enrichment debt).
    gate = needsReview ? 'HOLD' : 'PARTIAL';
  } else if (frostOk) {
    readiness = PLANT_DATA_READINESS.C_BASIC_CLIMATE_ONLY;
    readinessShort = 'C';
    gate = needsReview ? 'HOLD' : 'PARTIAL';
  } else {
    readiness = PLANT_DATA_READINESS.D_NOT_PRODUCT_READY;
    readinessShort = 'D';
    gate = 'REJECT';
  }

  // Allowed claim dimensions (data completeness — not live climate score)
  const allowedClaims = {
    survival: frostOk && isAuthoritativeOrigin(fieldOrigins.frostSensitivity),
    growth: materialOk,
    flowering: flower.ready,
    fruiting: fruit.ready,
    overall: readinessShort === 'A' || readinessShort === 'B'
  };

  const unknownOutcomes = [];
  if (!flower.ready) unknownOutcomes.push('flowering');
  if (!fruit.ready) unknownOutcomes.push('fruiting');

  return {
    contractId: PLANT_DATA_CONTRACT_ID,
    contractVersion: PLANT_DATA_CONTRACT_VERSION,
    slug: slug || null,
    commonName: commonName || null,
    scientific: scientific || null,
    readiness,
    readinessShort,
    gate,
    reasons: [...new Set(reasons)],
    fieldOrigins,
    corePresence,
    climateCoreOk,
    materialOk,
    floweringStanceReady: flower.ready,
    fruitingStanceReady: fruit.ready,
    evidenceOk,
    needsReview,
    allowedClaims,
    unknownOutcomes,
    syntheticDefaultFields: syntheticDefaults,
    legacyOnly: !!legacyOnly
  };
}

export function assertPlantRealSuitabilityReady(plant, options = {}) {
  const result = classifyPlantDataReadiness(plant, options);
  const ok = result.readinessShort === 'A';
  return {
    ok,
    ready: ok,
    result,
    message: ok
      ? 'Plant meets plant-data-contract-v1 REAL_SUITABILITY_READY'
      : `Not REAL_SUITABILITY_READY (${result.readinessShort}): ${result.reasons.join(', ')}`
  };
}

/**
 * Read-only catalog classification (does not mutate plants).
 */
export function classifyCatalogReadOnly(plants, options = {}) {
  const list = Array.isArray(plants) ? plants : [];
  const rows = list.map((p) => classifyPlantDataReadiness(p, options));
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  const gates = { PASS: 0, PARTIAL: 0, HOLD: 0, REJECT: 0 };
  for (const r of rows) {
    counts[r.readinessShort] = (counts[r.readinessShort] || 0) + 1;
    gates[r.gate] = (gates[r.gate] || 0) + 1;
  }
  return {
    contractId: PLANT_DATA_CONTRACT_ID,
    contractVersion: PLANT_DATA_CONTRACT_VERSION,
    total: rows.length,
    counts,
    gates,
    rows
  };
}

/**
 * Read-only Batch 3 packet → plant-like view for classification (no ingest).
 */
export function normalizeBatch3PacketForClassification(packet) {
  if (!packet || typeof packet !== 'object') return null;
  const id = packet.identity || {};
  const claims = Array.isArray(packet.claims) ? packet.claims : [];
  const byField = {};
  for (const c of claims) {
    if (c?.field) byField[c.field] = c;
  }
  const climateTraits = {};
  const traitEvidenceClasses = {};
  for (const field of [
    ...CLIMATE_CORE_FIELDS,
    'floweringRequirements',
    'fruitingRequirements',
    'needsWinterChill',
    'groupIds'
  ]) {
    const c = byField[field];
    if (!c) continue;
    if (c.evidenceClass) traitEvidenceClasses[field] = c.evidenceClass;
    if (c.value == null) continue;
    if (typeof c.value === 'string' && c.value.trim().toUpperCase() === 'UNKNOWN') continue;
    if (typeof c.value === 'string' && !c.value.trim()) continue;
    climateTraits[field] = c.value;
  }
  if (Object.keys(traitEvidenceClasses).length) {
    climateTraits.traitEvidenceClasses = traitEvidenceClasses;
  }
  if (packet.flags?.forceClimateNeedsReview === true) {
    climateTraits.needsReview = true;
  }
  return {
    slug: String(id.canonicalSlug || '').toLowerCase(),
    name: String(id.commonNameEn || '').trim(),
    scientific: String(id.acceptedScientificName || '').trim(),
    aliases: Array.isArray(id.aliases) ? id.aliases : [],
    climateTraits,
    _batch3PacketId: packet.packetId || null,
    _normalization: 'batch3-claims-readonly-view'
  };
}

export function simulateSmartRecMergeDefaults(partialMeta = {}) {
  const merged = {
    heatTolerance: SMART_REC_MERGE_DEFAULT_CORE.heatTolerance,
    coldTolerance: SMART_REC_MERGE_DEFAULT_CORE.coldTolerance,
    frostSensitivity: SMART_REC_MERGE_DEFAULT_CORE.frostSensitivity,
    humidityTolerance: SMART_REC_MERGE_DEFAULT_CORE.humidityTolerance,
    drainageNeeds: SMART_REC_MERGE_DEFAULT_CORE.drainageNeeds,
    needsWinterChill: false,
    floweringRequirements: '',
    fruitingRequirements: '',
    groupIds: [],
    needsReview: false
  };
  const meta = partialMeta && typeof partialMeta === 'object' ? partialMeta : {};
  for (const key of Object.keys(SMART_REC_MERGE_DEFAULT_CORE)) {
    if (meta[key]) merged[key] = meta[key];
  }
  for (const key of ['sunNeeds', 'waterNeeds']) {
    if (typeof meta[key] === 'string' && meta[key].trim()) merged[key] = meta[key];
  }
  for (const key of ['floweringRequirements', 'fruitingRequirements']) {
    if (meta[key]) merged[key] = meta[key];
  }
  if (meta.needsReview === true) merged.needsReview = true;
  if (Array.isArray(meta.groupIds)) merged.groupIds = meta.groupIds.slice();
  return merged;
}
