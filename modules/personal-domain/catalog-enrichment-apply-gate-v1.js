/**
 * Catalog Enrichment Apply Gate v1 — decide whether a candidate packet field
 * may be written to the canonical plant record.
 *
 * DRY-RUN / SIMULATED APPLY only in this checkpoint.
 * Does NOT mutate catalog, invent SOURCE_SUPPORTED at runtime, clear needsReview,
 * fetch sources, or ingest Batch 3.
 */
import crypto from 'node:crypto';
import {
  CLIMATE_CORE_FIELDS,
  EVIDENCE_CLASS,
  VALUE_ORIGIN,
  classifyPlantDataReadiness
} from './plant-data-contract-v1.js';
import {
  CONTRADICTION_CLASS,
  classifyValueContradiction
} from './catalog-source-policy-v1.js';
import {
  HARDINESS_ZONE_TO_COLD_TRAITS_ID,
  HARDINESS_ZONE_TO_COLD_TRAITS_VERSION,
  HARDINESS_ZONE_TO_COLD_TRAITS_REF
} from './hardiness-zone-to-cold-traits-v1.js';
import {
  FROST_INJURY_TO_FROST_SENSITIVITY_ID,
  FROST_INJURY_TO_FROST_SENSITIVITY_VERSION,
  FROST_INJURY_TO_FROST_SENSITIVITY_REF
} from './frost-injury-to-frost-sensitivity-v1.js';
import { candidatePacketFingerprint } from './source-retriever-pilot-v1.js';

export const CATALOG_ENRICHMENT_APPLY_GATE_ID = 'catalog-enrichment-apply-gate-v1';
export const CATALOG_ENRICHMENT_APPLY_GATE_VERSION = '1.0.0';
export const CATALOG_ENRICHMENT_APPLY_GATE_REF = `${CATALOG_ENRICHMENT_APPLY_GATE_ID}@${CATALOG_ENRICHMENT_APPLY_GATE_VERSION}`;

export const APPLY_DECISION = Object.freeze({
  APPLY_ALLOWED: 'APPLY_ALLOWED',
  APPLY_BLOCKED: 'APPLY_BLOCKED',
  NEEDS_MORE_EVIDENCE: 'NEEDS_MORE_EVIDENCE',
  HOLD_CONFLICT: 'HOLD_CONFLICT'
});

export const APPLY_REASON = Object.freeze({
  IDENTITY_MISMATCH: 'identity_mismatch',
  PACKET_SCHEMA_INVALID: 'packet_schema_invalid',
  PACKET_FINGERPRINT_MISMATCH: 'packet_fingerprint_mismatch',
  APPLY_STATUS_NOT_READY: 'apply_status_not_ready',
  SOURCE_POLICY_NOT_SS: 'source_policy_not_source_supported',
  CONTRADICTION_NOT_APPROVED: 'contradiction_not_approved',
  TRANSFORM_MISSING: 'transform_id_or_version_missing',
  TRANSFORM_UNREGISTERED: 'transform_not_registered_or_field_mismatch',
  SOURCE_CLAIM_MISSING: 'source_claim_missing',
  EXCERPT_MISSING: 'bounded_excerpt_missing',
  CONTENT_HASH_MISSING: 'content_or_evidence_fingerprint_missing',
  FIELD_NOT_ALLOWED: 'field_not_allowed_by_contract',
  CURRENT_SS_CONFLICT: 'current_source_supported_conflict',
  MATERIAL_VALUE_CONFLICT: 'material_value_conflict_with_current',
  SYNTHETIC_DEFAULT_PROVENANCE: 'synthetic_default_provenance_blocked',
  NEEDS_REVIEW_CLEAR_UNAUTHORIZED: 'needs_review_clear_unauthorized',
  UNRELATED_FIELD_MUTATION: 'unrelated_field_mutation',
  EVIDENCE_LINEAGE_INVALID: 'evidence_lineage_invalid',
  HEURISTIC_UPGRADE_COMPATIBLE: 'heuristic_current_compatible_ss_upgrade',
  SAME_VALUE_EVIDENCE_UPGRADE: 'same_value_evidence_provenance_upgrade',
  ALL_GATES_PASSED: 'all_apply_gates_passed',
  PLANT_NOT_SELECTED_FOR_WRITE: 'plant_not_selected_for_pilot_write',
  SET_INCOMPLETE_FOR_WRITE: 'candidate_set_incomplete_for_selected_write'
});

/** Fields this gate may mutate in a future write. */
export const APPLY_ALLOWED_FIELDS = Object.freeze(['frostSensitivity', 'coldTolerance']);

/** Registered transforms → allowed output field. */
export const APPROVED_TRANSFORMS = Object.freeze({
  [`${HARDINESS_ZONE_TO_COLD_TRAITS_ID}@${HARDINESS_ZONE_TO_COLD_TRAITS_VERSION}`]: {
    transformId: HARDINESS_ZONE_TO_COLD_TRAITS_ID,
    transformVersion: HARDINESS_ZONE_TO_COLD_TRAITS_VERSION,
    transformRef: HARDINESS_ZONE_TO_COLD_TRAITS_REF,
    outputField: 'coldTolerance'
  },
  [`${FROST_INJURY_TO_FROST_SENSITIVITY_ID}@${FROST_INJURY_TO_FROST_SENSITIVITY_VERSION}`]: {
    transformId: FROST_INJURY_TO_FROST_SENSITIVITY_ID,
    transformVersion: FROST_INJURY_TO_FROST_SENSITIVITY_VERSION,
    transformRef: FROST_INJURY_TO_FROST_SENSITIVITY_REF,
    outputField: 'frostSensitivity'
  }
});

export const REQUIRED_EVIDENCE_LINEAGE = 'DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM';

/** Slugs selected for pilot write planning (dry-run). Others are negative controls. */
export const PILOT_WRITE_SELECTED_SLUGS = Object.freeze(['pomegranate']);

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function traitsOf(plant) {
  return plant?.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
}

function evidenceClassOf(plant, field) {
  const t = traitsOf(plant);
  const map = t.traitEvidenceClasses || plant?.traitEvidenceClasses || {};
  return map[field] || null;
}

function fieldOriginOf(plant, field) {
  const t = traitsOf(plant);
  const map = t.fieldOrigins || {};
  return map[field] || null;
}

function decision(cls, reasons, extra = {}) {
  return {
    decision: cls,
    reasons: [...reasons],
    gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
    ...extra
  };
}

/**
 * Current-value policy vs authoritative candidate.
 */
export function evaluateCurrentValuePolicy({
  field,
  currentValue,
  currentEvidenceClass,
  currentOrigin,
  candidateValue
}) {
  if (currentOrigin === VALUE_ORIGIN.MERGE_DEFAULT) {
    return {
      ok: false,
      code: APPLY_REASON.SYNTHETIC_DEFAULT_PROVENANCE,
      action: 'block'
    };
  }

  const cur = currentValue == null ? null : String(currentValue);
  const cand = candidateValue == null ? null : String(candidateValue);
  const curEv = currentEvidenceClass || EVIDENCE_CLASS.UNKNOWN;
  const isHeuristic =
    curEv === EVIDENCE_CLASS.HEURISTIC_ASSERTION ||
    curEv === EVIDENCE_CLASS.UNKNOWN ||
    currentOrigin === VALUE_ORIGIN.LEGACY_ASSERTED_METADATA;
  const isCurrentSS = curEv === EVIDENCE_CLASS.SOURCE_SUPPORTED;

  if (cur == null || cur === '') {
    return { ok: true, code: 'absent_current_value', action: 'set' };
  }
  if (cur === cand) {
    return {
      ok: true,
      code: APPLY_REASON.SAME_VALUE_EVIDENCE_UPGRADE,
      action: 'upgrade_evidence'
    };
  }

  const pair = classifyValueContradiction(cur, cand, field);
  if (isCurrentSS) {
    if (pair === CONTRADICTION_CLASS.CONSISTENT) {
      return { ok: true, code: APPLY_REASON.SAME_VALUE_EVIDENCE_UPGRADE, action: 'upgrade_evidence' };
    }
    if (pair === CONTRADICTION_CLASS.COMPATIBLE_RANGE) {
      return {
        ok: false,
        code: APPLY_REASON.CURRENT_SS_CONFLICT,
        action: 'hold',
        contradictionClass: pair
      };
    }
    return {
      ok: false,
      code: APPLY_REASON.CURRENT_SS_CONFLICT,
      action: 'hold',
      contradictionClass: pair
    };
  }

  if (isHeuristic) {
    if (
      pair === CONTRADICTION_CLASS.CONSISTENT ||
      pair === CONTRADICTION_CLASS.COMPATIBLE_RANGE
    ) {
      return {
        ok: true,
        code: APPLY_REASON.HEURISTIC_UPGRADE_COMPATIBLE,
        action: 'replace_value_and_upgrade_evidence',
        contradictionClass: pair
      };
    }
    return {
      ok: false,
      code: APPLY_REASON.MATERIAL_VALUE_CONFLICT,
      action: 'hold',
      contradictionClass: pair
    };
  }

  return {
    ok: false,
    code: APPLY_REASON.MATERIAL_VALUE_CONFLICT,
    action: 'hold',
    contradictionClass: pair
  };
}

function validatePacketSchema(packet) {
  if (!packet || typeof packet !== 'object') return false;
  if (!packet.plant?.slug || !packet.plant?.scientificName) return false;
  if (!Array.isArray(packet.fieldPackets)) return false;
  if (!packet.fingerprint) return false;
  return true;
}

/**
 * Evaluate one field candidate for apply eligibility (no write).
 */
export function evaluateCandidateForApply(fieldPacket, context = {}) {
  const reasons = [];
  const plant = context.plant;
  const packet = context.packet;
  const expectedSlug = context.expectedSlug || packet?.plant?.slug || plant?.slug;
  const expectedScientific =
    context.expectedScientific || packet?.plant?.scientificName || plant?.scientific;

  if (!fieldPacket || typeof fieldPacket !== 'object') {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.PACKET_SCHEMA_INVALID]);
  }

  if (packet && !validatePacketSchema(packet)) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.PACKET_SCHEMA_INVALID]);
  }

  if (
    packet?.fingerprint &&
    context.verifyFingerprint !== false &&
    candidatePacketFingerprint(packet) !== packet.fingerprint
  ) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.PACKET_FINGERPRINT_MISMATCH]);
  }

  const field = fieldPacket.targetField || fieldPacket.proposedField;
  const slug = fieldPacket.canonicalSlug;
  const sci = fieldPacket.scientificName;

  if (
    (expectedSlug && slug !== expectedSlug) ||
    (plant?.slug && slug !== plant.slug) ||
    (expectedScientific &&
      sci &&
      String(sci).toLowerCase() !== String(expectedScientific).toLowerCase()) ||
    (plant?.scientific &&
      sci &&
      String(sci).toLowerCase() !== String(plant.scientific).toLowerCase())
  ) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.IDENTITY_MISMATCH], {
      field,
      proposedMutation: null
    });
  }

  if (fieldPacket.applyStatus === 'NEEDS_MORE_EVIDENCE') {
    return decision(APPLY_DECISION.NEEDS_MORE_EVIDENCE, [APPLY_REASON.APPLY_STATUS_NOT_READY], {
      field
    });
  }
  if (fieldPacket.applyStatus === 'HOLD_CONFLICT') {
    return decision(APPLY_DECISION.HOLD_CONFLICT, [APPLY_REASON.CONTRADICTION_NOT_APPROVED], {
      field
    });
  }
  if (fieldPacket.applyStatus !== 'READY_TO_APPLY') {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.APPLY_STATUS_NOT_READY], { field });
  }

  if (!APPLY_ALLOWED_FIELDS.includes(field) || !CLIMATE_CORE_FIELDS.includes(field)) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.FIELD_NOT_ALLOWED], { field });
  }

  if (!fieldPacket.sourceClaim || !fieldPacket.sourceClaim.claimType) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.SOURCE_CLAIM_MISSING], { field });
  }

  if (
    !fieldPacket.supportingExcerpt ||
    String(fieldPacket.supportingExcerpt).trim().length < 12
  ) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.EXCERPT_MISSING], { field });
  }

  if (!fieldPacket.contentHash && !fieldPacket.sourceClaim?.claimFingerprint) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.CONTENT_HASH_MISSING], { field });
  }

  if (
    !fieldPacket.sourcePolicyResult?.mayBeSourceSupported ||
    fieldPacket.sourcePolicyResult?.evidenceClass !== EVIDENCE_CLASS.SOURCE_SUPPORTED
  ) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.SOURCE_POLICY_NOT_SS], { field });
  }

  const cClass = fieldPacket.contradictionResult?.contradictionClass;
  if (
    cClass !== CONTRADICTION_CLASS.CONSISTENT &&
    cClass !== CONTRADICTION_CLASS.COMPATIBLE_RANGE
  ) {
    if (cClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT || cClass === CONTRADICTION_CLASS.IDENTITY_CONFLICT) {
      return decision(APPLY_DECISION.HOLD_CONFLICT, [APPLY_REASON.CONTRADICTION_NOT_APPROVED], {
        field,
        contradictionClass: cClass
      });
    }
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.CONTRADICTION_NOT_APPROVED], {
      field,
      contradictionClass: cClass
    });
  }

  if (!fieldPacket.transformId || !fieldPacket.transformVersion) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.TRANSFORM_MISSING], { field });
  }
  const tRef = `${fieldPacket.transformId}@${fieldPacket.transformVersion}`;
  const registered = APPROVED_TRANSFORMS[tRef];
  if (!registered || registered.outputField !== field) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.TRANSFORM_UNREGISTERED], {
      field,
      transformRef: tRef
    });
  }

  if (fieldPacket.evidenceLineage !== REQUIRED_EVIDENCE_LINEAGE) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.EVIDENCE_LINEAGE_INVALID], {
      field
    });
  }

  const candidateValue =
    fieldPacket.normalizedTraitCandidate?.value ??
    fieldPacket.proposedNormalizedValue ??
    fieldPacket.proposedValue;
  if (candidateValue == null) {
    return decision(APPLY_DECISION.APPLY_BLOCKED, [APPLY_REASON.PACKET_SCHEMA_INVALID], { field });
  }

  const currentValue = traitsOf(plant)[field] ?? fieldPacket.currentPlantValue ?? null;
  const currentEvidenceClass = evidenceClassOf(plant, field);
  const currentOrigin = fieldOriginOf(plant, field);
  const valuePolicy = evaluateCurrentValuePolicy({
    field,
    currentValue,
    currentEvidenceClass,
    currentOrigin,
    candidateValue
  });
  if (!valuePolicy.ok) {
    const cls =
      valuePolicy.action === 'hold' ? APPLY_DECISION.HOLD_CONFLICT : APPLY_DECISION.APPLY_BLOCKED;
    return decision(cls, [valuePolicy.code], {
      field,
      currentValue,
      currentEvidenceClass,
      candidateValue,
      valuePolicy
    });
  }

  reasons.push(valuePolicy.code, APPLY_REASON.ALL_GATES_PASSED);

  const proposedMutation = {
    field,
    before: {
      value: currentValue,
      evidenceClass: currentEvidenceClass,
      fieldOrigin: currentOrigin
    },
    after: {
      value: candidateValue,
      evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
      fieldOrigin: VALUE_ORIGIN.ASSERTED_SOURCE,
      sourceIds: fieldPacket.sourceIds || [],
      sourceUrl: fieldPacket.sourceUrl || null,
      sourceType: fieldPacket.sourceType || null,
      supportingExcerpt: fieldPacket.supportingExcerpt,
      sourceClaim: fieldPacket.sourceClaim,
      sourcePolicyResult: fieldPacket.sourcePolicyResult || null,
      contradictionClass: cClass,
      contradictionResult: fieldPacket.contradictionResult || null,
      transformId: fieldPacket.transformId,
      transformVersion: fieldPacket.transformVersion,
      transformRef: tRef,
      evidenceLineage: fieldPacket.evidenceLineage,
      contentHash: fieldPacket.contentHash || null,
      applyGateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF
    },
    action: valuePolicy.action
  };

  const fingerprint = sha256(
    JSON.stringify({
      gate: CATALOG_ENRICHMENT_APPLY_GATE_REF,
      slug,
      field,
      candidateValue,
      tRef,
      claimFp: fieldPacket.sourceClaim?.claimFingerprint,
      contentHash: fieldPacket.contentHash,
      decision: APPLY_DECISION.APPLY_ALLOWED
    })
  );

  return decision(APPLY_DECISION.APPLY_ALLOWED, reasons, {
    field,
    currentValue,
    currentEvidenceClass,
    candidateValue,
    candidateEvidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
    sourceClaim: fieldPacket.sourceClaim,
    transformRef: tRef,
    contradictionClass: cClass,
    valuePolicy,
    proposedMutation,
    decisionFingerprint: fingerprint
  });
}

/**
 * Build dry-run mutation plan from ALLOWED field decisions (in-memory only).
 */
export function buildDryRunMutationPlan(plant, allowedFieldResults) {
  const before = structuredClone(plant);
  const after = structuredClone(plant);
  if (!after.climateTraits) after.climateTraits = {};
  if (!after.climateTraits.traitEvidenceClasses) after.climateTraits.traitEvidenceClasses = {};
  if (!after.climateTraits.fieldOrigins) after.climateTraits.fieldOrigins = {};
  if (!after.climateTraits.enrichmentProvenance) after.climateTraits.enrichmentProvenance = {};

  const mutations = [];
  const forbiddenTouched = [];

  for (const r of allowedFieldResults) {
    if (r.decision !== APPLY_DECISION.APPLY_ALLOWED || !r.proposedMutation) continue;
    const m = r.proposedMutation;
    const field = m.field;
    if (!APPLY_ALLOWED_FIELDS.includes(field)) {
      forbiddenTouched.push(field);
      continue;
    }
    after.climateTraits[field] = m.after.value;
    after.climateTraits.traitEvidenceClasses[field] = m.after.evidenceClass;
    after.climateTraits.fieldOrigins[field] = m.after.fieldOrigin;
    after.climateTraits.enrichmentProvenance[field] = {
      sourceIds: m.after.sourceIds,
      sourceUrl: m.after.sourceUrl,
      sourceType: m.after.sourceType,
      supportingExcerpt: m.after.supportingExcerpt,
      sourceClaim: m.after.sourceClaim,
      sourcePolicyResult: m.after.sourcePolicyResult,
      contradictionClass: m.after.contradictionClass,
      contradictionResult: m.after.contradictionResult,
      transformId: m.after.transformId,
      transformVersion: m.after.transformVersion,
      transformRef: m.after.transformRef,
      evidenceLineage: m.after.evidenceLineage,
      contentHash: m.after.contentHash,
      applyGateRef: m.after.applyGateRef
    };
    mutations.push(m);
  }

  // Prove no unrelated keys introduced beyond authorized maps
  const beforeKeys = new Set(Object.keys(traitsOf(before)));
  for (const k of Object.keys(traitsOf(after))) {
    if (
      !beforeKeys.has(k) &&
      !APPLY_ALLOWED_FIELDS.includes(k) &&
      !['traitEvidenceClasses', 'fieldOrigins', 'enrichmentProvenance', 'migration'].includes(k)
    ) {
      forbiddenTouched.push(k);
    }
  }

  // Guard: flowering/fruiting/identity/needsReview unchanged
  const guards = {
    floweringRequirementsUnchanged:
      traitsOf(before).floweringRequirements === traitsOf(after).floweringRequirements,
    fruitingRequirementsUnchanged:
      traitsOf(before).fruitingRequirements === traitsOf(after).fruitingRequirements,
    needsReviewUnchanged: before.needsReview === after.needsReview,
    slugUnchanged: before.slug === after.slug,
    scientificUnchanged: before.scientific === after.scientific,
    aliasesUnchanged: JSON.stringify(before.aliases) === JSON.stringify(after.aliases)
  };

  if (Object.values(guards).some((v) => v === false) || forbiddenTouched.length) {
    return {
      ok: false,
      reasons: [APPLY_REASON.UNRELATED_FIELD_MUTATION],
      forbiddenTouched,
      guards,
      mutations: [],
      before,
      after: before,
      jsonDiff: []
    };
  }

  const jsonDiff = mutations.map((m) => ({
    path: `climateTraits.${m.field}`,
    before: m.before,
    after: {
      value: m.after.value,
      evidenceClass: m.after.evidenceClass,
      fieldOrigin: m.after.fieldOrigin
    },
    provenancePath: `climateTraits.enrichmentProvenance.${m.field}`,
    provenance: after.climateTraits.enrichmentProvenance[m.field]
  }));

  return {
    ok: true,
    dryRun: true,
    writesCatalog: false,
    mutations,
    guards,
    before,
    after,
    jsonDiff,
    planFingerprint: sha256(JSON.stringify(jsonDiff))
  };
}

/**
 * Simulate readiness after dry-run mutation (in-memory copy only).
 */
export function simulateReadinessFromMutationPlan(mutationPlan) {
  const before = classifyPlantDataReadiness(mutationPlan.before);
  const after = classifyPlantDataReadiness(mutationPlan.after);
  const beforeReasons = new Set(before.reasons || []);
  const afterReasons = new Set(after.reasons || []);
  const cleared = [...beforeReasons].filter((r) => !afterReasons.has(r));
  const added = [...afterReasons].filter((r) => !beforeReasons.has(r));
  // Prove original plant object identity values untouched if caller kept reference
  return {
    current: {
      readinessShort: before.readinessShort,
      gate: before.gate,
      reasons: before.reasons
    },
    simulated: {
      readinessShort: after.readinessShort,
      gate: after.gate,
      reasons: after.reasons
    },
    blockersCleared: cleared,
    blockersAdded: added,
    note: 'Simulation only — no catalog write.'
  };
}

/**
 * Evaluate full candidate packet for a plant. Dry-run mutation plan only when
 * slug is in PILOT_WRITE_SELECTED_SLUGS and all READY fields APPLY_ALLOWED.
 */
export function evaluateCandidateSetForPlant({
  packet,
  plant,
  writePlanRequested = true,
  verifyFingerprint = true
} = {}) {
  const slug = packet?.plant?.slug || plant?.slug;
  const fieldResults = [];
  for (const fp of packet?.fieldPackets || []) {
    fieldResults.push(
      evaluateCandidateForApply(fp, {
        plant,
        packet,
        expectedSlug: plant?.slug || slug,
        expectedScientific: plant?.scientific || packet?.plant?.scientificName,
        verifyFingerprint
      })
    );
  }

  const readyFields = (packet?.fieldPackets || []).filter((f) => f.applyStatus === 'READY_TO_APPLY');
  const allowed = fieldResults.filter((r) => r.decision === APPLY_DECISION.APPLY_ALLOWED);
  const blocked = fieldResults.filter((r) => r.decision !== APPLY_DECISION.APPLY_ALLOWED);

  const selectedForPilotWrite = PILOT_WRITE_SELECTED_SLUGS.includes(slug);
  let setDecision = APPLY_DECISION.APPLY_BLOCKED;
  let setReasons = [];

  if (!selectedForPilotWrite) {
    setDecision = APPLY_DECISION.APPLY_BLOCKED;
    setReasons = [APPLY_REASON.PLANT_NOT_SELECTED_FOR_WRITE];
  } else if (readyFields.length === 0) {
    setDecision = APPLY_DECISION.NEEDS_MORE_EVIDENCE;
    setReasons = [APPLY_REASON.APPLY_STATUS_NOT_READY];
  } else if (allowed.length !== readyFields.length) {
    const holds = fieldResults.some((r) => r.decision === APPLY_DECISION.HOLD_CONFLICT);
    setDecision = holds ? APPLY_DECISION.HOLD_CONFLICT : APPLY_DECISION.APPLY_BLOCKED;
    setReasons = [APPLY_REASON.SET_INCOMPLETE_FOR_WRITE, ...blocked.flatMap((b) => b.reasons)];
  } else if (
    !readyFields.some((f) => (f.targetField || f.proposedField) === 'frostSensitivity') ||
    !readyFields.some((f) => (f.targetField || f.proposedField) === 'coldTolerance')
  ) {
    // Pomegranate pilot write requires both frost+cold READY+ALLOWED
    setDecision = APPLY_DECISION.NEEDS_MORE_EVIDENCE;
    setReasons = [APPLY_REASON.SET_INCOMPLETE_FOR_WRITE, 'pilot_requires_frost_and_cold_ready'];
  } else {
    setDecision = APPLY_DECISION.APPLY_ALLOWED;
    setReasons = [APPLY_REASON.ALL_GATES_PASSED];
  }

  let mutationPlan = null;
  let readinessSimulation = null;
  if (
    writePlanRequested &&
    selectedForPilotWrite &&
    setDecision === APPLY_DECISION.APPLY_ALLOWED
  ) {
    mutationPlan = buildDryRunMutationPlan(plant, allowed);
    if (!mutationPlan.ok) {
      setDecision = APPLY_DECISION.APPLY_BLOCKED;
      setReasons = mutationPlan.reasons;
      mutationPlan = null;
    } else {
      readinessSimulation = simulateReadinessFromMutationPlan(mutationPlan);
    }
  }

  const setFingerprint = sha256(
    JSON.stringify({
      gate: CATALOG_ENRICHMENT_APPLY_GATE_REF,
      slug,
      setDecision,
      fields: fieldResults.map((r) => ({
        field: r.field,
        decision: r.decision,
        fp: r.decisionFingerprint || null
      })),
      planFp: mutationPlan?.planFingerprint || null
    })
  );

  return {
    gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
    slug,
    scientificName: packet?.plant?.scientificName || plant?.scientific,
    selectedForPilotWrite,
    writePlanGenerated: !!mutationPlan,
    setDecision,
    setReasons,
    fieldResults,
    mutationPlan,
    readinessSimulation,
    setFingerprint,
    externalRequests: 0,
    catalogMutated: false,
    dryRun: true
  };
}

/**
 * Future write transaction design (NOT executed).
 */
export const FUTURE_ATOMIC_WRITE_SPEC = Object.freeze({
  version: '1.0.0-design',
  steps: [
    'verify current plant content hash / catalog version',
    're-run evaluateCandidateSetForPlant; require APPLY_ALLOWED',
    'apply exact approved climateTraits fields + traitEvidenceClasses + fieldOrigins + enrichmentProvenance only',
    're-run plant-data-contract-v1 on mutated record',
    're-run product regression gates (survival/growth/flowering-fruiting unchanged guards)',
    'persist plant + readiness report atomically (file write / replace)',
    'on any failure: discard mutation; leave prior plant bytes unchanged'
  ],
  repositoryFit:
    'Deterministic file-backed catalog (app.html PLANT_LIBRARY + seed + bootstrap migrations) can support hash-check + write-temp + rename without a database. Prefer a single plant-record serializer once apply is authorized; do not partial-write mid-gate.',
  executed: false
});

export function plantContentHash(plant) {
  return sha256(
    JSON.stringify({
      slug: plant?.slug,
      scientific: plant?.scientific,
      climateTraits: plant?.climateTraits,
      needsReview: plant?.needsReview,
      aliases: plant?.aliases
    })
  );
}
