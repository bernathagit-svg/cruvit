/**
 * Catalog Contradiction Gate v1 — automation-safety for multi-claim fields.
 *
 * Reuses contradiction classes + pairwise classify/behavior from
 * catalog-source-policy-v1 (no parallel contradiction taxonomy).
 * Consumes only evidence evaluated under catalog-source-policy-v1@1.0.0.
 *
 * Does NOT fetch, enrich plants, invent SOURCE_SUPPORTED facts, write catalog,
 * clear needsReview, or ingest Batch 3.
 *
 * Pipeline:
 *   retrieved evidence → source-policy validation → contradiction gate
 *   → normalized supported fact (+ provenance) stored with CRUVIT
 * Runtime user queries read stored facts only (no per-user botanical fetch).
 */
import {
  CATALOG_SOURCE_POLICY_REF,
  CATALOG_SOURCE_POLICY_ID,
  CATALOG_SOURCE_POLICY_VERSION,
  CONTRADICTION_CLASS,
  EVIDENCE_CLASS,
  claimFamilyForField,
  CATALOG_CLAIM_FAMILY,
  classifyValueContradiction as policyClassifyValueContradiction,
  contradictionBehavior as policyContradictionBehavior,
  evaluateSourceSupportedEligibility,
  resolveSourceTypeFromSource,
  authorityTierForSourceType,
  normalizeCatalogSourceType,
  isProhibitedAsAuthority,
  isAiGeneratedSummary
} from './catalog-source-policy-v1.js';

export const CATALOG_CONTRADICTION_GATE_ID = 'catalog-contradiction-gate-v1';
export const CATALOG_CONTRADICTION_GATE_VERSION = '1.0.0';
export const CATALOG_CONTRADICTION_GATE_REF = `${CATALOG_CONTRADICTION_GATE_ID}@${CATALOG_CONTRADICTION_GATE_VERSION}`;

export { CONTRADICTION_CLASS, EVIDENCE_CLASS };

/** Future enrichment-queue handoff actions (no retrieval in this checkpoint). */
export const CONTRADICTION_QUEUE_ACTION = Object.freeze({
  AUTO_CONTINUE: 'AUTO_CONTINUE',
  AUTO_NORMALIZE_CONTINUE: 'AUTO_NORMALIZE_CONTINUE',
  AUTO_RETRIEVE_MORE: 'AUTO_RETRIEVE_MORE',
  HOLD_FOR_REVIEW: 'HOLD_FOR_REVIEW',
  HOLD_IDENTITY: 'HOLD_IDENTITY'
});

export const CONTRADICTION_REASON = Object.freeze({
  IDENTICAL_NORMALIZED_VALUES: 'identical_normalized_values',
  ORDINAL_ADJACENT: 'ordinal_adjacent_compatible',
  ORDINAL_MATERIAL_GAP: 'ordinal_material_gap',
  TEMP_RANGE_COMPATIBLE: 'temperature_range_compatible',
  TEMP_RANGE_MATERIAL: 'temperature_range_material',
  IDENTITY_TAXON_MISMATCH: 'identity_taxon_mismatch',
  PROSE_MATERIAL_DISAGREE: 'prose_material_disagree',
  WEAK_OR_REJECTED_EVIDENCE: 'weak_or_rejected_evidence',
  PROHIBITED_CANNOT_OVERRIDE: 'prohibited_cannot_override_authority',
  AI_CANNOT_OVERRIDE: 'ai_cannot_override_authority',
  SINGLE_AUTHORITATIVE: 'single_authoritative_claim',
  NO_AUTHORITATIVE_CLAIMS: 'no_authoritative_claims',
  BOOLEAN_CONFLICT: 'boolean_conflict'
});

const ORDINAL = Object.freeze(['very_low', 'low', 'medium', 'high', 'very_high']);

const FROST_COLD_FIELDS = new Set([
  'frostSensitivity',
  'frost',
  'coldTolerance',
  'cold',
  'hardinessMinC',
  'hardinessMaxC',
  'minTempC'
]);
const HEAT_FIELDS = new Set(['heatTolerance', 'heat', 'maxTempC']);
const ORDINAL_CLIMATE_FIELDS = new Set([
  'humidityTolerance',
  'humidity',
  'waterNeeds',
  'water',
  'sunNeeds',
  'sun',
  'drainageNeeds',
  'drainage'
]);
const IDENTITY_FIELDS = new Set(['scientific', 'acceptedScientificName', 'aliases']);
const OUTCOME_PROSE_FIELDS = new Set([
  'floweringRequirements',
  'flowering',
  'fruitingRequirements',
  'fruiting',
  'reproductiveBiology'
]);
const CHILL_FIELDS = new Set(['needsWinterChill', 'winterChill', 'chill', 'chillHours']);

function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function normStr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim().toLowerCase()).sort().join('|');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

function parseTempC(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*°?\s*c/i) || s.match(/^(-?\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) : null;
}

function ordinalIndex(v) {
  return ORDINAL.indexOf(normStr(v));
}

/**
 * Field-aware pairwise classification — extends policy classifyValueContradiction.
 */
export function classifyPairContradiction(a, b, field) {
  if (a == null || b == null) return CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
  const f = String(field || '');

  if (IDENTITY_FIELDS.has(f) || claimFamilyForField(f) === CATALOG_CLAIM_FAMILY.IDENTITY) {
    if (normStr(a) === normStr(b)) return CONTRADICTION_CLASS.CONSISTENT;
    // aliases arrays: compatible if intersection non-empty and no conflicting binomials
    if (f === 'aliases' && Array.isArray(a) && Array.isArray(b)) {
      const sa = new Set(a.map((x) => normStr(x)));
      const sb = new Set(b.map((x) => normStr(x)));
      let inter = 0;
      for (const x of sa) if (sb.has(x)) inter++;
      if (inter > 0) return CONTRADICTION_CLASS.COMPATIBLE_RANGE;
      return CONTRADICTION_CLASS.IDENTITY_CONFLICT;
    }
    return CONTRADICTION_CLASS.IDENTITY_CONFLICT;
  }

  if (CHILL_FIELDS.has(f)) {
    if (typeof a === 'boolean' || typeof b === 'boolean' || normStr(a) === 'true' || normStr(a) === 'false') {
      if (normStr(a) === normStr(b)) return CONTRADICTION_CLASS.CONSISTENT;
      return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
    }
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na === nb) return CONTRADICTION_CLASS.CONSISTENT;
      if (Math.abs(na - nb) <= 100) return CONTRADICTION_CLASS.COMPATIBLE_RANGE; // chill hours
      return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
    }
  }

  const ta = parseTempC(a);
  const tb = parseTempC(b);
  if (ta != null && tb != null && (FROST_COLD_FIELDS.has(f) || HEAT_FIELDS.has(f) || /temp|hardiness/i.test(f))) {
    if (ta === tb) return CONTRADICTION_CLASS.CONSISTENT;
    // Compatible if within 3°C
    if (Math.abs(ta - tb) <= 3) return CONTRADICTION_CLASS.COMPATIBLE_RANGE;
    return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
  }

  const ia = ordinalIndex(a);
  const ib = ordinalIndex(b);
  if (ia >= 0 && ib >= 0) {
    if (ia === ib) return CONTRADICTION_CLASS.CONSISTENT;
    if (Math.abs(ia - ib) <= 1) return CONTRADICTION_CLASS.COMPATIBLE_RANGE;
    return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
  }

  if (OUTCOME_PROSE_FIELDS.has(f)) {
    const sa = normStr(a);
    const sb = normStr(b);
    if (!sa || !sb) return CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
    if (sa === sb) return CONTRADICTION_CLASS.CONSISTENT;
    // Shared significant tokens → compatible descriptive range
    const tok = (s) => new Set(s.split(/[^a-z0-9]+/).filter((t) => t.length > 3));
    const ta2 = tok(sa);
    const tb2 = tok(sb);
    let shared = 0;
    for (const t of ta2) if (tb2.has(t)) shared++;
    if (shared >= 2) return CONTRADICTION_CLASS.COMPATIBLE_RANGE;
    // Opposite cues
    const neg = /(no\s+fruit|does not flower|non-?flowering|never fruit)/;
    const pos = /(requires|needs|flower|fruit|bloom)/;
    if ((neg.test(sa) && pos.test(sb) && !neg.test(sb)) || (neg.test(sb) && pos.test(sa) && !neg.test(sa))) {
      return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
    }
    return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
  }

  return policyClassifyValueContradiction(a, b, field);
}

export function contradictionBehavior(contradictionClass) {
  return policyContradictionBehavior(contradictionClass);
}

export function requiresHold(contradictionClass) {
  return (
    contradictionClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT ||
    contradictionClass === CONTRADICTION_CLASS.IDENTITY_CONFLICT
  );
}

export function identityConflict(a, b, field = 'scientific') {
  return classifyPairContradiction(a, b, field) === CONTRADICTION_CLASS.IDENTITY_CONFLICT;
}

/**
 * Conservative normalization for COMPATIBLE_RANGE.
 * Prefer safest product truth — never blind average.
 *
 * Frost sensitivity: prefer higher (more frost-sensitive = safer warning).
 * Cold tolerance: prefer lower (less cold-hardy = safer).
 * Heat tolerance: prefer lower (less heat-tolerant = safer).
 * Humidity: prefer more restrictive adjacent ordinal toward medium-low caution.
 * Temps (°C min hardiness): prefer the higher minimum (warmer limit = safer for frost).
 * Chill hours: prefer the higher requirement when both numeric.
 * Prose: keep longer source-backed excerpt; retain both source ids.
 */
export function normalizeCompatibleRange(field, values, options = {}) {
  const list = asArray(values).filter((v) => v != null);
  if (!list.length) return { ok: false, value: null, reason: 'no_values' };
  if (list.length === 1) return { ok: true, value: list[0], reason: 'single_value', retainedSourceIds: options.sourceIds || [] };

  const f = String(field || '');
  const retainedSourceIds = [...new Set(asArray(options.sourceIds))];

  if (IDENTITY_FIELDS.has(f) && f === 'aliases') {
    const set = new Set();
    for (const v of list) for (const a of asArray(v)) set.add(a);
    return { ok: true, value: [...set], reason: 'alias_union', retainedSourceIds };
  }

  const temps = list.map(parseTempC);
  if (temps.every((t) => t != null) && (FROST_COLD_FIELDS.has(f) || /hardiness|minTemp/i.test(f))) {
    // Safer for frost: higher min temp (less hardy claim)
    const v = Math.max(...temps);
    return { ok: true, value: v, reason: 'conservative_higher_min_temp_c', retainedSourceIds };
  }
  if (temps.every((t) => t != null) && HEAT_FIELDS.has(f)) {
    // Safer for heat: lower max tolerance
    const v = Math.min(...temps);
    return { ok: true, value: v, reason: 'conservative_lower_heat_temp_c', retainedSourceIds };
  }

  const idxs = list.map(ordinalIndex);
  if (idxs.every((i) => i >= 0)) {
    if (f === 'frostSensitivity' || f === 'frost') {
      const i = Math.max(...idxs);
      return { ok: true, value: ORDINAL[i], reason: 'conservative_higher_frost_sensitivity', retainedSourceIds };
    }
    if (f === 'coldTolerance' || f === 'cold') {
      const i = Math.min(...idxs);
      return { ok: true, value: ORDINAL[i], reason: 'conservative_lower_cold_tolerance', retainedSourceIds };
    }
    if (f === 'heatTolerance' || f === 'heat') {
      const i = Math.min(...idxs);
      return { ok: true, value: ORDINAL[i], reason: 'conservative_lower_heat_tolerance', retainedSourceIds };
    }
    if (ORDINAL_CLIMATE_FIELDS.has(f)) {
      // Prefer the more restrictive of the two adjacent values (closer to extremes that warn)
      const i = Math.max(...idxs.map((x) => Math.abs(x - 2))) === Math.abs(idxs[0] - 2) ? idxs[0] : idxs[1];
      // Actually: pick the lower ordinal for water/humidity demand caution → min
      const pick = Math.min(...idxs);
      return { ok: true, value: ORDINAL[pick], reason: 'conservative_lower_ordinal_climate', retainedSourceIds };
    }
    const pick = Math.min(...idxs);
    return { ok: true, value: ORDINAL[pick], reason: 'conservative_lower_ordinal', retainedSourceIds };
  }

  if (CHILL_FIELDS.has(f)) {
    const nums = list.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length === list.length) {
      return { ok: true, value: Math.max(...nums), reason: 'conservative_higher_chill_hours', retainedSourceIds };
    }
  }

  if (OUTCOME_PROSE_FIELDS.has(f)) {
    const longest = [...list].sort((a, b) => String(b).length - String(a).length)[0];
    return { ok: true, value: longest, reason: 'retain_longest_supporting_prose', retainedSourceIds };
  }

  // Fallback: first authoritative value
  return { ok: true, value: list[0], reason: 'fallback_first_value', retainedSourceIds };
}

export function queueActionForContradiction(contradictionClass, options = {}) {
  switch (contradictionClass) {
    case CONTRADICTION_CLASS.CONSISTENT:
      return CONTRADICTION_QUEUE_ACTION.AUTO_CONTINUE;
    case CONTRADICTION_CLASS.COMPATIBLE_RANGE:
      return CONTRADICTION_QUEUE_ACTION.AUTO_NORMALIZE_CONTINUE;
    case CONTRADICTION_CLASS.MATERIAL_CONFLICT:
      return options.autoRetrieveMore !== false
        ? CONTRADICTION_QUEUE_ACTION.AUTO_RETRIEVE_MORE
        : CONTRADICTION_QUEUE_ACTION.HOLD_FOR_REVIEW;
    case CONTRADICTION_CLASS.IDENTITY_CONFLICT:
      return CONTRADICTION_QUEUE_ACTION.HOLD_IDENTITY;
    case CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE:
    default:
      return CONTRADICTION_QUEUE_ACTION.AUTO_RETRIEVE_MORE;
  }
}

function auditFingerprint(parts) {
  return JSON.stringify(parts);
}

/**
 * Annotate a raw claim candidate with source-policy status.
 */
export function annotateClaimWithSourcePolicy(claim, context = {}) {
  const source = claim.source || null;
  const sourceType =
    claim.sourceType ||
    (source ? resolveSourceTypeFromSource(source) : null) ||
    claim.authorityTier ||
    null;
  const eligibility = evaluateSourceSupportedEligibility({
    field: claim.field,
    value: claim.value,
    sourceId: claim.sourceId || source?.sourceId,
    sourceType,
    authorityTier: claim.authorityTier || source?.authorityTier,
    excerpt: claim.excerpt || claim.shortExcerpt,
    url: claim.url || source?.url,
    sourceTitle: claim.sourceTitle || source?.title,
    sourceInstitution: claim.sourceInstitution || source?.institution || source?.publisher,
    declaredScientificName: claim.declaredScientificName,
    expectedIdentity: context.expectedIdentity || {},
    provenanceRetained: claim.provenanceRetained !== false,
    corroboratingSources: claim.corroboratingSources || []
  });

  const prohibited = isProhibitedAsAuthority(sourceType) || isAiGeneratedSummary(sourceType);
  return {
    ...claim,
    sourceType: normalizeCatalogSourceType(sourceType) || sourceType,
    authorityTier: authorityTierForSourceType(sourceType),
    sourcePolicy: {
      policyRef: CATALOG_SOURCE_POLICY_REF,
      mayBeSourceSupported: eligibility.mayBeSourceSupported,
      evidenceClass: eligibility.evidenceClass,
      reasons: eligibility.reasons,
      hold: eligibility.hold,
      prohibited
    },
    authoritative: eligibility.mayBeSourceSupported === true && !prohibited
  };
}

/**
 * Evaluate a set of claims for one plant field.
 *
 * @param {object} input
 * @param {string} input.field
 * @param {object} input.identity — { slug, acceptedScientificName, scientific }
 * @param {object[]} input.claims — [{ value, sourceId, sourceType, excerpt, ... }]
 */
export function evaluateClaimSet(input = {}) {
  const field = input.field;
  const identity = input.identity || {};
  const expectedIdentity = {
    acceptedScientificName: identity.acceptedScientificName || identity.scientific,
    scientific: identity.acceptedScientificName || identity.scientific,
    canonicalSlug: identity.slug || identity.canonicalSlug,
    slug: identity.slug || identity.canonicalSlug
  };

  const rawClaims = asArray(input.claims);
  const annotated = rawClaims.map((c) =>
    annotateClaimWithSourcePolicy({ ...c, field: c.field || field }, { expectedIdentity })
  );

  const authoritative = annotated.filter((c) => c.authoritative);
  const rejected = annotated.filter((c) => c.sourcePolicy?.prohibited);
  const weak = annotated.filter((c) => !c.authoritative && !c.sourcePolicy?.prohibited);

  const reasons = [];
  let contradictionClass = CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
  let normalized = null;
  let holdReason = null;
  let confidence = 'low';

  // Identity fields: compare non-prohibited sourced claims by value (do not drop
  // identity-mismatched candidates before detecting taxon conflict).
  if (IDENTITY_FIELDS.has(String(field)) || claimFamilyForField(field) === CATALOG_CLAIM_FAMILY.IDENTITY) {
    const sourcedIdentity = annotated.filter(
      (c) =>
        !c.sourcePolicy?.prohibited &&
        c.sourceId &&
        String(c.excerpt || c.shortExcerpt || '').trim() &&
        c.value != null
    );
    const distinct = [
      ...new Set(sourcedIdentity.map((c) => normStr(c.value)).filter(Boolean))
    ];
    if (sourcedIdentity.length === 0) {
      contradictionClass = CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
      reasons.push(CONTRADICTION_REASON.NO_AUTHORITATIVE_CLAIMS);
    } else if (distinct.length > 1) {
      contradictionClass = CONTRADICTION_CLASS.IDENTITY_CONFLICT;
      reasons.push(CONTRADICTION_REASON.IDENTITY_TAXON_MISMATCH);
      holdReason = 'identity_conflict_blocks_field_application';
      confidence = 'high';
    } else {
      const expected = normStr(expectedIdentity.acceptedScientificName || '');
      const claimed = distinct[0];
      if (
        expected &&
        claimed &&
        expected !== claimed &&
        (field === 'scientific' || field === 'acceptedScientificName')
      ) {
        contradictionClass = CONTRADICTION_CLASS.IDENTITY_CONFLICT;
        reasons.push(CONTRADICTION_REASON.IDENTITY_TAXON_MISMATCH);
        holdReason = 'claim_scientific_mismatches_plant_identity';
        confidence = 'high';
      } else if (authoritative.length >= 1) {
        contradictionClass = CONTRADICTION_CLASS.CONSISTENT;
        reasons.push(
          authoritative.length === 1
            ? CONTRADICTION_REASON.SINGLE_AUTHORITATIVE
            : CONTRADICTION_REASON.IDENTICAL_NORMALIZED_VALUES
        );
        normalized = {
          value: authoritative[0]?.value ?? sourcedIdentity[0].value,
          retainedSourceIds: (authoritative.length ? authoritative : sourcedIdentity)
            .map((c) => c.sourceId)
            .filter(Boolean)
        };
        confidence = 'high';
      } else {
        contradictionClass = CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
        reasons.push(CONTRADICTION_REASON.WEAK_OR_REJECTED_EVIDENCE);
      }
    }

    const behaviorId = contradictionBehavior(contradictionClass);
    const queueActionId = queueActionForContradiction(contradictionClass);
    const resultId = {
      gateId: CATALOG_CONTRADICTION_GATE_ID,
      gateVersion: CATALOG_CONTRADICTION_GATE_VERSION,
      gateRef: CATALOG_CONTRADICTION_GATE_REF,
      sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
      plantIdentity: {
        slug: expectedIdentity.slug || null,
        acceptedScientificName: expectedIdentity.acceptedScientificName || null
      },
      field,
      claimFamily: claimFamilyForField(field),
      candidateClaims: annotated.map((c) => ({
        sourceId: c.sourceId || null,
        sourceType: c.sourceType || null,
        authorityTier: c.authorityTier || null,
        value: c.value,
        sourcePolicyStatus: c.sourcePolicy?.mayBeSourceSupported
          ? 'SOURCE_SUPPORTED_ELIGIBLE'
          : c.sourcePolicy?.prohibited
            ? 'REJECTED_PROHIBITED'
            : c.sourcePolicy?.evidenceClass || 'UNKNOWN',
        evidenceClass: c.sourcePolicy?.evidenceClass || null,
        authoritative: c.authoritative
      })),
      contradictionClass,
      normalizedResult:
        behaviorId.normalizeConservative || contradictionClass === CONTRADICTION_CLASS.CONSISTENT
          ? normalized
          : null,
      hold: requiresHold(contradictionClass),
      holdReason,
      confidence,
      reasons: [...new Set(reasons)],
      queueAction: queueActionId,
      behavior: behaviorId,
      mutated: false,
      writesProductFact: false
    };
    resultId.auditFingerprint = auditFingerprint({
      gateRef: resultId.gateRef,
      sourcePolicyRef: resultId.sourcePolicyRef,
      slug: resultId.plantIdentity.slug,
      field: resultId.field,
      contradictionClass: resultId.contradictionClass,
      values: sourcedIdentity.map((c) => normStr(c.value)).sort(),
      sourceIds: sourcedIdentity.map((c) => c.sourceId || '').sort(),
      queueAction: resultId.queueAction,
      normalized: resultId.normalizedResult?.value ?? null
    });
    return resultId;
  }

  // Prohibited/AI cannot override authoritative SS-eligible claims
  if (authoritative.length >= 1 && rejected.length >= 1) {
    const authVal = authoritative[0].value;
    for (const r of rejected) {
      if (normStr(r.value) && normStr(r.value) !== normStr(authVal)) {
        reasons.push(
          isAiGeneratedSummary(r.sourceType)
            ? CONTRADICTION_REASON.AI_CANNOT_OVERRIDE
            : CONTRADICTION_REASON.PROHIBITED_CANNOT_OVERRIDE
        );
      }
    }
  }

  if (authoritative.length === 0) {
    contradictionClass = CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
    reasons.push(CONTRADICTION_REASON.NO_AUTHORITATIVE_CLAIMS);
    if (weak.length || rejected.length) reasons.push(CONTRADICTION_REASON.WEAK_OR_REJECTED_EVIDENCE);
    holdReason = null;
    confidence = 'low';
  } else if (authoritative.length === 1) {
    contradictionClass = CONTRADICTION_CLASS.CONSISTENT;
    reasons.push(CONTRADICTION_REASON.SINGLE_AUTHORITATIVE);
    normalized = {
      value: authoritative[0].value,
      retainedSourceIds: [authoritative[0].sourceId].filter(Boolean)
    };
    confidence = 'high';
  } else {
    // Pairwise among authoritative only
    let worst = CONTRADICTION_CLASS.CONSISTENT;
    const rank = {
      [CONTRADICTION_CLASS.CONSISTENT]: 0,
      [CONTRADICTION_CLASS.COMPATIBLE_RANGE]: 1,
      [CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE]: 2,
      [CONTRADICTION_CLASS.MATERIAL_CONFLICT]: 3,
      [CONTRADICTION_CLASS.IDENTITY_CONFLICT]: 4
    };
    for (let i = 0; i < authoritative.length; i++) {
      for (let j = i + 1; j < authoritative.length; j++) {
        const cls = classifyPairContradiction(authoritative[i].value, authoritative[j].value, field);
        if (rank[cls] > rank[worst]) worst = cls;
      }
    }
    contradictionClass = worst;

    if (worst === CONTRADICTION_CLASS.CONSISTENT) {
      reasons.push(CONTRADICTION_REASON.IDENTICAL_NORMALIZED_VALUES);
      normalized = {
        value: authoritative[0].value,
        retainedSourceIds: authoritative.map((c) => c.sourceId).filter(Boolean)
      };
      confidence = 'high';
    } else if (worst === CONTRADICTION_CLASS.COMPATIBLE_RANGE) {
      reasons.push(CONTRADICTION_REASON.ORDINAL_ADJACENT);
      const norm = normalizeCompatibleRange(
        field,
        authoritative.map((c) => c.value),
        { sourceIds: authoritative.map((c) => c.sourceId) }
      );
      normalized = norm.ok
        ? { value: norm.value, reason: norm.reason, retainedSourceIds: norm.retainedSourceIds }
        : null;
      confidence = 'medium';
    } else if (worst === CONTRADICTION_CLASS.IDENTITY_CONFLICT) {
      reasons.push(CONTRADICTION_REASON.IDENTITY_TAXON_MISMATCH);
      holdReason = 'identity_conflict_blocks_field_application';
      confidence = 'high';
    } else if (worst === CONTRADICTION_CLASS.MATERIAL_CONFLICT) {
      reasons.push(
        FROST_COLD_FIELDS.has(field) ? CONTRADICTION_REASON.ORDINAL_MATERIAL_GAP : CONTRADICTION_REASON.PROSE_MATERIAL_DISAGREE
      );
      holdReason = 'material_conflict_blocks_source_supported_write';
      confidence = 'high';
    }
  }

  const behavior = contradictionBehavior(contradictionClass);
  const queueAction = queueActionForContradiction(contradictionClass, {
    autoRetrieveMore: contradictionClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT
  });

  const result = {
    gateId: CATALOG_CONTRADICTION_GATE_ID,
    gateVersion: CATALOG_CONTRADICTION_GATE_VERSION,
    gateRef: CATALOG_CONTRADICTION_GATE_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    plantIdentity: {
      slug: expectedIdentity.slug || null,
      acceptedScientificName: expectedIdentity.acceptedScientificName || null
    },
    field,
    claimFamily: claimFamilyForField(field),
    candidateClaims: annotated.map((c) => ({
      sourceId: c.sourceId || null,
      sourceType: c.sourceType || null,
      authorityTier: c.authorityTier || null,
      value: c.value,
      sourcePolicyStatus: c.sourcePolicy?.mayBeSourceSupported
        ? 'SOURCE_SUPPORTED_ELIGIBLE'
        : c.sourcePolicy?.prohibited
          ? 'REJECTED_PROHIBITED'
          : c.sourcePolicy?.evidenceClass || 'UNKNOWN',
      evidenceClass: c.sourcePolicy?.evidenceClass || null,
      authoritative: c.authoritative
    })),
    contradictionClass,
    normalizedResult: behavior.normalizeConservative || contradictionClass === CONTRADICTION_CLASS.CONSISTENT ? normalized : null,
    hold: requiresHold(contradictionClass),
    holdReason,
    confidence,
    reasons: [...new Set(reasons)],
    queueAction,
    behavior,
    mutated: false,
    writesProductFact: false
  };

  result.auditFingerprint = auditFingerprint({
    gateRef: result.gateRef,
    sourcePolicyRef: result.sourcePolicyRef,
    slug: result.plantIdentity.slug,
    field: result.field,
    contradictionClass: result.contradictionClass,
    values: authoritative.map((c) => normStr(c.value)).sort(),
    sourceIds: authoritative.map((c) => c.sourceId || '').sort(),
    queueAction: result.queueAction,
    normalized: result.normalizedResult?.value ?? null
  });

  return result;
}

/**
 * Dry-evaluate one catalog expansion packet through source policy → contradiction gate.
 */
export function evaluatePacketContradictionDry(packet) {
  const sources = Array.isArray(packet?.sources) ? packet.sources : [];
  const byId = Object.fromEntries(sources.map((s) => [s.sourceId, s]));
  const identity = packet?.identity || {};
  const claims = Array.isArray(packet?.claims) ? packet.claims : [];

  // Group claims by field
  const byField = new Map();
  for (const c of claims) {
    const f = c.field;
    if (!byField.has(f)) byField.set(f, []);
    const primary = (c.sourceIds || [])[0];
    const src = primary ? byId[primary] : null;
    byField.get(f).push({
      field: f,
      value: c.value,
      sourceId: primary || null,
      source: src,
      sourceType: src ? resolveSourceTypeFromSource(src) : null,
      authorityTier: src?.authorityTier,
      excerpt: c.shortExcerpt || c.excerpt,
      url: src?.url,
      sourceTitle: src?.title,
      sourceInstitution: src?.institution || src?.publisher,
      declaredScientificName:
        f === 'scientific' || f === 'acceptedScientificName' ? c.value : identity.acceptedScientificName,
      existingEvidenceClass: c.evidenceClass
    });
  }

  const fieldResults = [];
  const counts = {
    CONSISTENT: 0,
    COMPATIBLE_RANGE: 0,
    MATERIAL_CONFLICT: 0,
    IDENTITY_CONFLICT: 0,
    INSUFFICIENT_EVIDENCE: 0
  };

  for (const [field, set] of byField) {
    const r = evaluateClaimSet({
      field,
      identity: {
        slug: identity.canonicalSlug,
        acceptedScientificName: identity.acceptedScientificName,
        scientific: identity.acceptedScientificName
      },
      claims: set
    });
    counts[r.contradictionClass] = (counts[r.contradictionClass] || 0) + 1;
    fieldResults.push(r);
  }

  const holdFields = fieldResults.filter((r) => r.hold).map((r) => r.field);
  const autoNormalizeFields = fieldResults
    .filter((r) => r.contradictionClass === CONTRADICTION_CLASS.COMPATIBLE_RANGE)
    .map((r) => r.field);

  return {
    gateRef: CATALOG_CONTRADICTION_GATE_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    packetId: packet?.packetId || null,
    slug: identity.canonicalSlug || null,
    scientific: identity.acceptedScientificName || null,
    fieldCount: fieldResults.length,
    counts,
    holdFields,
    autoNormalizeFields,
    fieldResults,
    needsHold: holdFields.length > 0,
    safeForAutoNormalization: holdFields.length === 0,
    mutated: false,
    ingested: false
  };
}

/**
 * Batch 3 dry contradiction run — packets only.
 */
export function evaluateBatch3ContradictionDry(packets) {
  const list = Array.isArray(packets) ? packets : [];
  const reports = list.map((p) => evaluatePacketContradictionDry(p));
  const totals = {
    packets: list.length,
    fields: 0,
    CONSISTENT: 0,
    COMPATIBLE_RANGE: 0,
    MATERIAL_CONFLICT: 0,
    IDENTITY_CONFLICT: 0,
    INSUFFICIENT_EVIDENCE: 0,
    packetsNeedingHold: 0,
    packetsSafeForAutoNormalization: 0
  };
  const fieldConflictFreq = {};
  for (const r of reports) {
    totals.fields += r.fieldCount;
    for (const k of Object.keys(r.counts)) totals[k] = (totals[k] || 0) + r.counts[k];
    if (r.needsHold) totals.packetsNeedingHold += 1;
    if (r.safeForAutoNormalization) totals.packetsSafeForAutoNormalization += 1;
    for (const fr of r.fieldResults) {
      if (
        fr.contradictionClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT ||
        fr.contradictionClass === CONTRADICTION_CLASS.IDENTITY_CONFLICT
      ) {
        fieldConflictFreq[fr.field] = (fieldConflictFreq[fr.field] || 0) + 1;
      }
    }
  }
  const fieldsMostOftenConflicting = Object.entries(fieldConflictFreq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field, count]) => ({ field, count }));

  return {
    gateRef: CATALOG_CONTRADICTION_GATE_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    dryRun: true,
    ingested: false,
    note: 'Batch 3 contradiction dry run only. No catalog writes. No fetch.',
    totals,
    fieldsMostOftenConflicting,
    packetsNeedingHold: reports.filter((r) => r.needsHold).map((r) => r.slug),
    packetsSafeForAutoNormalization: reports.filter((r) => r.safeForAutoNormalization).map((r) => r.slug),
    packetReports: reports.map((r) => ({
      packetId: r.packetId,
      slug: r.slug,
      counts: r.counts,
      holdFields: r.holdFields,
      autoNormalizeFields: r.autoNormalizeFields,
      needsHold: r.needsHold
    }))
  };
}

export const CATALOG_CONTRADICTION_GATE_META = Object.freeze({
  id: CATALOG_CONTRADICTION_GATE_ID,
  version: CATALOG_CONTRADICTION_GATE_VERSION,
  ref: CATALOG_CONTRADICTION_GATE_REF,
  consumesSourcePolicy: CATALOG_SOURCE_POLICY_REF,
  reusedFrom: Object.freeze({
    contradictionClasses: 'catalog-source-policy-v1 CONTRADICTION_CLASS',
    pairwiseFallback: 'classifyValueContradiction / contradictionBehavior',
    sourceGate: 'evaluateSourceSupportedEligibility'
  }),
  storageModel:
    'retrieval→source-policy→contradiction-gate→store normalized fact+provenance; runtime reads stored facts only',
  noFetch: true
});
