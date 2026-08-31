/**
 * CRUVIT Plant Knowledge & Warnings V1 — canonical data contract.
 *
 * Foundation only: data / evidence / persistence shape.
 * Does NOT power UI. Does NOT perform runtime research.
 *
 * Persistence: nest under catalog_plants.climate_traits.plantKnowledge (JSONB)
 * — no live schema change required.
 *
 * Permanent ingestion sequence (future batches):
 * IDENTITY → BOTANICAL EVIDENCE → REPRODUCTIVE EVIDENCE →
 * KNOWLEDGE/WARNINGS → MEDIA → SUITABILITY GATES → PERSISTENCE
 *
 * UNKNOWN knowledge/warnings do NOT block catalog inclusion unless a
 * safety-critical product behavior explicitly requires the field.
 */

import { FIELD_PROVENANCE_EVIDENCE_CLASSES } from './field-provenance-honesty-v1-contract.js';

export const PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION = '1.0.0';

export const EVIDENCE_CLASS = FIELD_PROVENANCE_EVIDENCE_CLASSES;

/** Bounded warning severity — independent of evidence quality. */
export const WARNING_SEVERITIES = Object.freeze([
  'INFO',
  'CAUTION',
  'WARNING',
  'SEVERE'
]);

/** Warning lifecycle status. */
export const WARNING_STATUSES = Object.freeze([
  'active',
  'provisional',
  'unknown',
  'owner_review',
  'retired'
]);

/** Region scope levels for invasiveness / restrictions / regional caveats. */
export const REGION_SCOPE_LEVELS = Object.freeze([
  'GLOBAL',
  'COUNTRY',
  'STATE_PROVINCE',
  'REGION',
  'UNKNOWN'
]);

/** Restriction types for regionalRestrictions. */
export const RESTRICTION_TYPES = Object.freeze([
  'prohibited',
  'restricted',
  'regulated',
  'discouraged',
  'unknown'
]);

/** Warning categories (bounded). */
export const WARNING_CATEGORIES = Object.freeze([
  'toxicity',
  'invasiveness',
  'regional_restriction',
  'physical_hazard',
  'allergenicity',
  'pest_disease',
  'cultivar_caveat',
  'harvest_use',
  'planting',
  'maintenance',
  'important_note',
  'pollination',
  'other'
]);

/**
 * Knowledge families required by the V1 contract.
 * Each family is optional at ingest; absence ⇒ UNKNOWN for that family.
 */
export const KNOWLEDGE_FAMILIES = Object.freeze([
  'toxicity',
  'invasiveness',
  'regionalRestrictions',
  'physicalHazards',
  'allergenicity',
  'pestsAndDiseases',
  'cultivarCaveats',
  'plantingRequirements',
  'soilRequirements',
  'maintenance',
  'harvestUseWarnings',
  'importantNotes'
]);

/** Toxicity leaf fields (assert independently — never cross-infer). */
export const TOXICITY_FIELDS = Object.freeze([
  'humanToxicity',
  'childRisk',
  'dogToxicity',
  'catToxicity',
  'livestockToxicity',
  'toxicParts',
  'exposureRoutes',
  'severity',
  'symptomsSummary'
]);

/**
 * Positive safety claim fields — require SOURCE_SUPPORTED to assert "safe".
 * Absence of a toxicity warning is NOT evidence of safety.
 */
export const POSITIVE_SAFETY_CLAIM_FIELDS = Object.freeze([
  'safeForChildren',
  'safeForPets',
  'safeForDogs',
  'safeForCats',
  'nonToxic',
  'humanToxicity.safe',
  'dogToxicity.safe',
  'catToxicity.safe'
]);

/** Safety-critical categories where HEURISTIC must not render as confirmed warning. */
export const SAFETY_CRITICAL_WARNING_CATEGORIES = Object.freeze([
  'toxicity',
  'regional_restriction',
  'harvest_use'
]);

/**
 * Provenanced knowledge field shape.
 * @typedef {{
 *   value: unknown,
 *   evidenceClass: 'SOURCE_SUPPORTED'|'HEURISTIC_ASSERTION'|'UNKNOWN',
 *   sourceIds: string[],
 *   shortExcerpt: string|null,
 *   status?: 'asserted'|'unknown',
 *   regionScope?: RegionScope,
 *   transformation?: string|null,
 *   enrichmentReason?: string|null
 * }} ProvenancedField
 */

/**
 * @typedef {{
 *   level: 'GLOBAL'|'COUNTRY'|'STATE_PROVINCE'|'REGION'|'UNKNOWN',
 *   codes?: string[],
 *   label?: string|null,
 *   note?: string|null
 * }} RegionScope
 */

/**
 * Reusable warning object — future UI power surface.
 * Severity does NOT substitute for evidence quality.
 * SEVERE + UNKNOWN must NOT become a confirmed severe warning.
 *
 * @typedef {{
 *   warningId: string,
 *   category: string,
 *   canonicalTitle: string,
 *   titleKey?: string|null,
 *   summary: string,
 *   severity: 'INFO'|'CAUTION'|'WARNING'|'SEVERE',
 *   evidenceClass: 'SOURCE_SUPPORTED'|'HEURISTIC_ASSERTION'|'UNKNOWN',
 *   regionScope: RegionScope,
 *   appliesTo?: string[],
 *   sourceIds: string[],
 *   provenance: { shortExcerpt?: string|null, transformation?: string|null },
 *   requiresOwnerReview?: boolean,
 *   status: 'active'|'provisional'|'unknown'|'owner_review'|'retired'
 * }} PlantWarningV1
 */

export const FUTURE_INGESTION_SEQUENCE = Object.freeze([
  'IDENTITY',
  'BOTANICAL_EVIDENCE',
  'REPRODUCTIVE_EVIDENCE',
  'KNOWLEDGE_WARNINGS',
  'MEDIA',
  'SUITABILITY_GATES',
  'PERSISTENCE'
]);

export const FUTURE_INGESTION_RULE = Object.freeze({
  version: '1.0.0',
  sequence: FUTURE_INGESTION_SEQUENCE,
  unknownKnowledgeAcceptable: true,
  unknownDoesNotBlockCatalogInclusion:
    'UNKNOWN knowledge/warnings do not block catalog inclusion unless a safety-critical product behavior explicitly requires the field.',
  noConfidentGuessing: true,
  positiveSafetyRequiresSourceSupported: true,
  absenceOfToxicityIsNotSafety: true,
  heuristicMustNotRenderAsConfirmedSafetyWarning: true,
  runtimeExternalResearchCalls: 0
});

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function fail(errors, msg) {
  errors.push(msg);
}

/**
 * Normalize / validate a RegionScope object.
 */
export function normalizeRegionScope(scope) {
  if (!scope || typeof scope !== 'object') {
    return { level: 'UNKNOWN', codes: [], label: null, note: null };
  }
  const level = REGION_SCOPE_LEVELS.includes(scope.level) ? scope.level : 'UNKNOWN';
  return {
    level,
    codes: Array.isArray(scope.codes) ? scope.codes.map(String) : [],
    label: scope.label != null ? String(scope.label) : null,
    note: scope.note != null ? String(scope.note) : null
  };
}

/**
 * Create a provenanced field. UNKNOWN when value missing.
 */
export function provenancedField(value, evidenceClass, sourceIds, shortExcerpt, extra = {}) {
  const isUnknown =
    value == null ||
    value === '' ||
    evidenceClass === EVIDENCE_CLASS.UNKNOWN ||
    extra.status === 'unknown';
  return {
    value: isUnknown ? null : value,
    evidenceClass: isUnknown
      ? EVIDENCE_CLASS.UNKNOWN
      : EVIDENCE_CLASS[evidenceClass]
        ? evidenceClass
        : EVIDENCE_CLASS.HEURISTIC_ASSERTION,
    sourceIds: Array.isArray(sourceIds) ? sourceIds : [],
    shortExcerpt: shortExcerpt != null ? String(shortExcerpt) : null,
    status: isUnknown ? 'unknown' : 'asserted',
    ...extra
  };
}

/**
 * Validate a single provenanced field.
 */
export function validateProvenancedField(field, path, errors, { allowNull = true } = {}) {
  if (field == null) {
    if (!allowNull) fail(errors, `${path}: missing provenanced field`);
    return;
  }
  if (!isObject(field)) {
    fail(errors, `${path}: must be provenanced object`);
    return;
  }
  if (!EVIDENCE_CLASS[field.evidenceClass]) {
    fail(errors, `${path}: invalid evidenceClass`);
  }
  if (!Array.isArray(field.sourceIds)) {
    fail(errors, `${path}: sourceIds must be array`);
  }
  if (field.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    if (!field.sourceIds?.length) {
      fail(errors, `${path}: SOURCE_SUPPORTED requires sourceIds`);
    }
    if (!String(field.shortExcerpt || '').trim()) {
      fail(errors, `${path}: SOURCE_SUPPORTED requires supporting shortExcerpt`);
    }
  }
  if (field.regionScope) {
    if (!REGION_SCOPE_LEVELS.includes(field.regionScope.level)) {
      fail(errors, `${path}.regionScope.level invalid`);
    }
  }
}

/**
 * Validate a PlantWarningV1 object.
 */
export function validatePlantWarning(warning, path, errors) {
  if (!isObject(warning)) {
    fail(errors, `${path}: warning must be object`);
    return;
  }
  if (!warning.warningId) fail(errors, `${path}: warningId required`);
  if (!WARNING_CATEGORIES.includes(warning.category)) {
    fail(errors, `${path}: invalid category ${warning.category}`);
  }
  if (!warning.canonicalTitle && !warning.titleKey) {
    fail(errors, `${path}: canonicalTitle or titleKey required`);
  }
  if (!WARNING_SEVERITIES.includes(warning.severity)) {
    fail(errors, `${path}: invalid severity`);
  }
  if (!EVIDENCE_CLASS[warning.evidenceClass]) {
    fail(errors, `${path}: invalid evidenceClass`);
  }
  if (!WARNING_STATUSES.includes(warning.status)) {
    fail(errors, `${path}: invalid status`);
  }
  if (!Array.isArray(warning.sourceIds)) {
    fail(errors, `${path}: sourceIds must be array`);
  }
  warning.regionScope = normalizeRegionScope(warning.regionScope);
  if (warning.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    if (!warning.sourceIds.length) {
      fail(errors, `${path}: SOURCE_SUPPORTED warning requires sourceIds`);
    }
    if (!String(warning.provenance?.shortExcerpt || warning.summary || '').trim()) {
      fail(errors, `${path}: SOURCE_SUPPORTED warning requires provenance excerpt or summary`);
    }
  }
}

/**
 * Confirmable for UI rendering?
 * HEURISTIC / UNKNOWN safety-critical warnings are NOT confirmed.
 * SEVERE + UNKNOWN is never a confirmed severe warning.
 */
export function isConfirmedWarning(warning) {
  if (!warning || typeof warning !== 'object') return false;
  if (warning.status === 'retired' || warning.status === 'unknown') return false;
  if (warning.evidenceClass !== EVIDENCE_CLASS.SOURCE_SUPPORTED) return false;
  if (
    SAFETY_CRITICAL_WARNING_CATEGORIES.includes(warning.category) &&
    warning.evidenceClass !== EVIDENCE_CLASS.SOURCE_SUPPORTED
  ) {
    return false;
  }
  return true;
}

/**
 * Render policy for a warning given evidence + severity.
 * Returns { renderAs, confirmed, reason }.
 */
export function resolveWarningRenderPolicy(warning) {
  if (!warning) {
    return { renderAs: 'omit', confirmed: false, reason: 'missing-warning' };
  }
  const cls = warning.evidenceClass;
  const severity = warning.severity;
  const safetyCritical = SAFETY_CRITICAL_WARNING_CATEGORIES.includes(warning.category);

  if (cls === EVIDENCE_CLASS.UNKNOWN) {
    return {
      renderAs: 'unknown_notice',
      confirmed: false,
      reason:
        severity === 'SEVERE'
          ? 'SEVERE+UNKNOWN must not become a confirmed severe warning'
          : 'UNKNOWN remains UNKNOWN'
    };
  }
  if (cls === EVIDENCE_CLASS.HEURISTIC_ASSERTION) {
    if (safetyCritical) {
      return {
        renderAs: 'provisional_not_confirmed',
        confirmed: false,
        reason: 'HEURISTIC must not render as confirmed safety-critical warning'
      };
    }
    return {
      renderAs: 'provisional',
      confirmed: false,
      reason: 'HEURISTIC_ASSERTION is provisional only'
    };
  }
  if (cls === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    return {
      renderAs: 'confirmed',
      confirmed: true,
      reason: 'SOURCE_SUPPORTED authorizes confirmed warning display'
    };
  }
  return { renderAs: 'omit', confirmed: false, reason: 'unrecognized-evidenceClass' };
}

/**
 * Positive safety claims ("safe for pets", "non-toxic") require SOURCE_SUPPORTED.
 * HEURISTIC / UNKNOWN / missing ⇒ not safe.
 */
export function evaluatePositiveSafetyClaim(field) {
  if (!field || typeof field !== 'object') {
    return {
      allowed: false,
      conclusion: 'UNKNOWN',
      reason: 'absence-of-toxicity-data-is-not-safety'
    };
  }
  if (
    field.evidenceClass === EVIDENCE_CLASS.UNKNOWN ||
    field.value == null ||
    field.value === '' ||
    field.status === 'unknown'
  ) {
    return {
      allowed: false,
      conclusion: 'UNKNOWN',
      reason: 'absence-of-toxicity-data-is-not-safety'
    };
  }
  const v = field.value;
  const claimsSafe =
    v === true ||
    v === 'safe' ||
    v === 'non_toxic' ||
    v === 'non-toxic' ||
    (typeof v === 'string' && /^safe/i.test(v));
  if (!claimsSafe) {
    return {
      allowed: true,
      conclusion: 'not_a_positive_safety_claim',
      reason: 'value-is-not-positive-safety'
    };
  }
  if (field.evidenceClass !== EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    return {
      allowed: false,
      conclusion: 'UNKNOWN',
      reason: 'positive-safety-requires-SOURCE_SUPPORTED'
    };
  }
  return {
    allowed: true,
    conclusion: 'safe_source_supported',
    reason: 'SOURCE_SUPPORTED positive safety claim'
  };
}

/**
 * Invasiveness must remain region-scoped. Global label only when level=GLOBAL
 * and evidence is SOURCE_SUPPORTED.
 */
export function resolveInvasivenessLabel(invasivenessBlock) {
  if (!invasivenessBlock || typeof invasivenessBlock !== 'object') {
    return { label: 'UNKNOWN', global: false, reason: 'missing-invasiveness' };
  }
  const status = invasivenessBlock.invasiveStatus;
  if (!status || status.evidenceClass === EVIDENCE_CLASS.UNKNOWN || status.value == null) {
    return { label: 'UNKNOWN', global: false, reason: 'invasiveStatus-unknown' };
  }
  const scope = normalizeRegionScope(
    status.regionScope || invasivenessBlock.regionScope || { level: 'UNKNOWN' }
  );
  const isInvasive =
    status.value === true ||
    status.value === 'invasive' ||
    status.value === 'invasive_in_regions';
  if (!isInvasive) {
    return {
      label: String(status.value),
      global: false,
      regionScope: scope,
      evidenceClass: status.evidenceClass,
      confirmed: status.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED
    };
  }
  if (scope.level === 'GLOBAL' && status.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    return {
      label: 'invasive',
      global: true,
      regionScope: scope,
      evidenceClass: status.evidenceClass,
      confirmed: true
    };
  }
  // Regional invasive — never promote to unqualified global
  return {
    label: 'invasive_regional',
    global: false,
    regionScope: scope,
    evidenceClass: status.evidenceClass,
    confirmed: status.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED,
    reason: 'regional-invasive-must-not-become-global-without-GLOBAL-scope'
  };
}

/**
 * Validate a full plantKnowledge object.
 */
export function validatePlantKnowledge(knowledge, { hardFail = true } = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(knowledge)) {
    fail(errors, 'plantKnowledge must be an object');
    return { ok: false, errors, warnings };
  }
  if (knowledge.plantKnowledgeContractVersion !== PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION) {
    warnings.push(
      `plantKnowledgeContractVersion expected ${PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION}, got ${knowledge.plantKnowledgeContractVersion}`
    );
  }
  if (!Array.isArray(knowledge.sources)) {
    fail(errors, 'plantKnowledge.sources must be an array');
  }

  for (const family of KNOWLEDGE_FAMILIES) {
    if (knowledge[family] == null) continue;
    if (family === 'pestsAndDiseases' || family === 'regionalRestrictions' || family === 'importantNotes') {
      if (!Array.isArray(knowledge[family])) {
        fail(errors, `plantKnowledge.${family} must be array when present`);
      }
      continue;
    }
    if (!isObject(knowledge[family]) && !Array.isArray(knowledge[family])) {
      fail(errors, `plantKnowledge.${family} must be object or array`);
    }
  }

  if (isObject(knowledge.toxicity)) {
    for (const f of TOXICITY_FIELDS) {
      if (knowledge.toxicity[f] != null) {
        validateProvenancedField(knowledge.toxicity[f], `toxicity.${f}`, errors);
      }
    }
    for (const key of Object.keys(knowledge.toxicity)) {
      if (POSITIVE_SAFETY_CLAIM_FIELDS.some((p) => p === key || p.endsWith(`.${key}`))) {
        const eval_ = evaluatePositiveSafetyClaim(knowledge.toxicity[key]);
        if (!eval_.allowed && knowledge.toxicity[key]?.value) {
          fail(
            errors,
            `toxicity.${key}: positive safety claim rejected — ${eval_.reason}`
          );
        }
      }
    }
  }

  if (isObject(knowledge.invasiveness)) {
    if (knowledge.invasiveness.invasiveStatus) {
      validateProvenancedField(
        knowledge.invasiveness.invasiveStatus,
        'invasiveness.invasiveStatus',
        errors
      );
      const label = resolveInvasivenessLabel(knowledge.invasiveness);
      if (
        knowledge.invasiveness.invasiveStatus.value === 'invasive' &&
        label.global === false &&
        knowledge.invasiveness.forceGlobalLabel === true
      ) {
        fail(errors, 'invasiveness: cannot force global invasive label without GLOBAL scope');
      }
    }
  }

  if (Array.isArray(knowledge.warnings)) {
    knowledge.warnings.forEach((w, i) => validatePlantWarning(w, `warnings[${i}]`, errors));
  }

  const ok = errors.length === 0;
  if (!ok && hardFail) {
    return { ok: false, errors, warnings };
  }
  return { ok, errors, warnings };
}

/**
 * Empty / UNKNOWN plantKnowledge skeleton for plants without enrichment.
 */
export function emptyPlantKnowledge({ notes } = {}) {
  return {
    plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
    sources: [],
    toxicity: {},
    invasiveness: {},
    regionalRestrictions: [],
    physicalHazards: {},
    allergenicity: {},
    pestsAndDiseases: [],
    cultivarCaveats: {},
    plantingRequirements: {},
    soilRequirements: {},
    maintenance: {},
    harvestUseWarnings: {},
    importantNotes: notes
      ? [
          {
            noteId: 'empty-skeleton',
            value: notes,
            evidenceClass: EVIDENCE_CLASS.UNKNOWN,
            sourceIds: [],
            shortExcerpt: null,
            status: 'unknown'
          }
        ]
      : [],
    warnings: []
  };
}

/**
 * Embed plantKnowledge into climate_traits for catalog_plants JSONB persistence.
 * Does not mutate botanical climate fields.
 */
export function mergePlantKnowledgeIntoClimateTraits(climateTraits = {}, plantKnowledge) {
  const next = isObject(climateTraits) ? { ...climateTraits } : {};
  if (plantKnowledge == null) return next;
  const v = validatePlantKnowledge(plantKnowledge, { hardFail: true });
  if (!v.ok) {
    throw new Error(`plantKnowledge invalid: ${v.errors.join('; ')}`);
  }
  next.plantKnowledge = structuredClone(plantKnowledge);
  return next;
}

/**
 * Read plantKnowledge from climate_traits / plant object.
 */
export function readPlantKnowledge(meta = {}) {
  return (
    meta?.plantKnowledge ||
    meta?.climateTraits?.plantKnowledge ||
    meta?.climate_traits?.plantKnowledge ||
    null
  );
}

/**
 * Deep equality helper for round-trip proofs (JSON-stable).
 */
export function stableStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    }
    return v;
  });
}

/**
 * Round-trip: knowledge → climate_traits nest → simulated DB row → runtime read.
 */
export function roundTripPlantKnowledge(plantKnowledge, { slug = 'probe' } = {}) {
  const climate_traits = mergePlantKnowledgeIntoClimateTraits({}, plantKnowledge);
  const simulatedDbRow = {
    slug,
    climate_traits,
    scientific_name: null,
    common_names: {},
    aliases: [],
    provenance: [],
    needs_review: false,
    verification_state: 'verified',
    media: {},
    media_status: 'IMAGE_PENDING',
    catalog_version: '1.0.0',
    source_packet: null
  };
  const runtimeKnowledge = readPlantKnowledge(simulatedDbRow);
  const preserved =
    stableStringify(plantKnowledge) === stableStringify(runtimeKnowledge);
  return {
    ok: preserved,
    simulatedDbRow,
    runtimeKnowledge,
    preserved
  };
}
