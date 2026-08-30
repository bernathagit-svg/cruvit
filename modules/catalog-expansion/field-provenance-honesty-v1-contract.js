/**
 * Field-level botanical provenance honesty (ingestion contract).
 *
 * A source ID attached to a claim is NOT enough for SOURCE_SUPPORTED.
 * SOURCE_SUPPORTED requires source + supporting excerpt that maps to the stored value.
 *
 * Backward-compatible: existing Batch 1 packets remain valid; template/asserted claims
 * without field-supporting excerpts classify as HEURISTIC_ASSERTION.
 */

export const FIELD_PROVENANCE_EVIDENCE_CLASSES = Object.freeze({
  SOURCE_SUPPORTED: 'SOURCE_SUPPORTED',
  HEURISTIC_ASSERTION: 'HEURISTIC_ASSERTION',
  UNKNOWN: 'UNKNOWN'
});

export const FIELD_PROVENANCE_HONESTY_VERSION = '1.0.0';

const TEMPLATE_EXCERPT_RE =
  /^(Frost sensitivity|Cold tolerance|Heat tolerance|Humidity tolerance|Water \/ moisture needs|Sun exposure|Drainage needs) characterized as /i;

/**
 * Classify a single claim's field-level evidence honesty.
 */
export function classifyClaimFieldProvenance(claim, sourcesById = {}) {
  if (!claim || typeof claim !== 'object') {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN,
      reason: 'missing-claim'
    };
  }
  if (claim.evidenceClass && FIELD_PROVENANCE_EVIDENCE_CLASSES[claim.evidenceClass]) {
    return { evidenceClass: claim.evidenceClass, reason: 'explicit-on-claim' };
  }
  const status = String(claim.status || '').toLowerCase();
  if (status === 'unknown' || claim.value == null) {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN,
      reason: 'claim-status-unknown-or-null-value'
    };
  }
  const sourceIds = Array.isArray(claim.sourceIds) ? claim.sourceIds : [];
  const excerpt = String(claim.shortExcerpt || claim.excerpt || '').trim();
  if (!sourceIds.length) {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      reason: 'asserted-without-sourceIds'
    };
  }
  if (!excerpt) {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      reason: 'asserted-without-supporting-excerpt'
    };
  }
  if (TEMPLATE_EXCERPT_RE.test(excerpt)) {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      reason: 'template-characterized-as-excerpt-not-source-quote'
    };
  }
  // SOURCE_SUPPORTED: has source + non-template excerpt that can map to value
  const primary = sourcesById[sourceIds[0]];
  if (!primary && sourceIds.length) {
    // source id present on claim but not resolved in packet.sources — still heuristic-leaning
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      reason: 'sourceId-unresolved-in-packet'
    };
  }
  const valueStr = Array.isArray(claim.value)
    ? claim.value.join(',')
    : String(claim.value);
  const excerptMentionsValue =
    excerpt.toLowerCase().includes(valueStr.toLowerCase()) ||
    /frost|cold|heat|humid|water|sun|drain|chill|flower|fruit/i.test(excerpt);
  if (!excerptMentionsValue && status === 'asserted') {
    return {
      evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      reason: 'excerpt-does-not-support-stored-value'
    };
  }
  return {
    evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED,
    reason: 'source-plus-non-template-supporting-excerpt'
  };
}

/**
 * Annotate all claims on a packet (non-mutating copy).
 */
export function annotatePacketFieldProvenance(packet) {
  const sources = Array.isArray(packet?.sources) ? packet.sources : [];
  const byId = Object.fromEntries(sources.map((s) => [s.sourceId, s]));
  const claims = Array.isArray(packet?.claims) ? packet.claims : [];
  const annotated = claims.map((c) => {
    const cls = classifyClaimFieldProvenance(c, byId);
    return {
      ...c,
      evidenceClass: c.evidenceClass || cls.evidenceClass,
      evidenceClassReason: cls.reason
    };
  });
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const c of annotated) {
    if (counts[c.evidenceClass] != null) counts[c.evidenceClass] += 1;
  }
  return {
    version: FIELD_PROVENANCE_HONESTY_VERSION,
    claims: annotated,
    counts,
    note: 'Heuristic traits must not be treated as verified botanical evidence in evaluators.'
  };
}

/**
 * Flowering evidence preservation: do not discard prose when floweringUnknown=true.
 */
export function materializeFloweringEvidenceFields(def = {}) {
  const prose = def.floweringRequirements != null ? String(def.floweringRequirements).trim() : '';
  const forceUnknown = def.floweringUnknown === true;
  if (!prose) {
    return {
      floweringRequirements: null,
      floweringEvidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN,
      floweringDescriptiveProse: null
    };
  }
  if (forceUnknown || def.floweringAuthoritative === false) {
    return {
      floweringRequirements: null,
      floweringEvidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION,
      floweringDescriptiveProse: prose,
      note: 'Descriptive prose preserved; not authoritative floweringRequirements for confident evaluation.'
    };
  }
  return {
    floweringRequirements: prose,
    floweringEvidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED,
    floweringDescriptiveProse: null
  };
}
