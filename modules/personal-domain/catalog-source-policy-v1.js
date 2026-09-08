/**
 * Catalog Source Policy Registry v1 — shared automation-safety authority.
 *
 * Reuses Smart Recommendations source-type + tier enums and field-provenance
 * evidence classes. Does NOT fetch, enrich plants, invent SOURCE_SUPPORTED facts,
 * clear needsReview, or ingest Batch 3.
 *
 * Architecture intent:
 *   SOURCE RETRIEVAL (future enrichment stage)
 *   → EVIDENCE VALIDATION (this policy)
 *   → NORMALIZED FACT + PROVENANCE STORED WITH CRUVIT
 *   → RUNTIME REUSES STORED PLANT FACT
 * User queries must NOT trigger repeated botanical-source retrieval.
 */
import {
  SR_EVIDENCE_SOURCE_TYPES,
  SR_EVIDENCE_AUTHORITY_TIERS
} from '../smart-recommendations/developer-evidence-packet-registry.js';
import {
  FIELD_PROVENANCE_EVIDENCE_CLASSES,
  FIELD_PROVENANCE_HONESTY_VERSION,
  classifyClaimFieldProvenance
} from '../catalog-expansion/field-provenance-honesty-v1-contract.js';

export const CATALOG_SOURCE_POLICY_ID = 'catalog-source-policy-v1';
export const CATALOG_SOURCE_POLICY_VERSION = '1.0.0';
/** Queue / artifact stamp — replaces former catalog-source-policy-pending-v0. */
export const CATALOG_SOURCE_POLICY_REF = `${CATALOG_SOURCE_POLICY_ID}@${CATALOG_SOURCE_POLICY_VERSION}`;

export const EVIDENCE_CLASS = FIELD_PROVENANCE_EVIDENCE_CLASSES;

/** Re-export SR enums as shared catalog authority (no parallel type list). */
export const CATALOG_SOURCE_TYPES = SR_EVIDENCE_SOURCE_TYPES;
export const CATALOG_AUTHORITY_TIERS = SR_EVIDENCE_AUTHORITY_TIERS;

/**
 * Preference buckets — aligned with developer-reviewed-data-source-scout.js
 * (PREFERRED / ACCEPTABLE / CORROBORATION / PROHIBITED). Lifted here so catalog
 * enrichment does not deep-import private scout helpers.
 */
export const SOURCE_TYPE_PREFERRED = Object.freeze([
  'government',
  'university_extension',
  'botanical_institution',
  'peer_reviewed_publication',
  'professional_horticultural_society',
  'institutional_database'
]);

export const SOURCE_TYPE_ACCEPTABLE = Object.freeze([
  'professional_grower_or_nursery',
  'breeder_or_cultivar_documentation'
]);

export const SOURCE_TYPE_CORROBORATION_ONLY = Object.freeze(['commercial_page']);

export const SOURCE_TYPE_PROHIBITED_AS_AUTHORITY = Object.freeze([
  'blog_or_unsourced_database',
  'ai_generated_summary'
]);

/**
 * Catalog packets historically store source-class strings in `authorityTier`
 * (misnamed vs SR Tier A/B/C). Alias map → canonical SR sourceType.
 */
export const CATALOG_SOURCE_LABEL_ALIASES = Object.freeze({
  university_extension: 'university_extension',
  government: 'government',
  botanical_institution: 'botanical_institution',
  peer_reviewed_publication: 'peer_reviewed_publication',
  institutional_database: 'institutional_database',
  professional_horticultural_society: 'professional_horticultural_society',
  horticultural_society: 'professional_horticultural_society',
  professional_grower_or_nursery: 'professional_grower_or_nursery',
  breeder_or_cultivar_documentation: 'breeder_or_cultivar_documentation',
  commercial_page: 'commercial_page',
  commercial_retailer: 'commercial_page',
  blog_or_unsourced_database: 'blog_or_unsourced_database',
  generic_blog: 'blog_or_unsourced_database',
  forum_community_post: 'blog_or_unsourced_database',
  unsourced_aggregator: 'blog_or_unsourced_database',
  ai_generated_summary: 'ai_generated_summary',
  other: 'other',
  // Catalog-only labels seen in knowledge packets — map to other (not SS sole authority)
  veterinary_toxicology: 'other',
  invasive_species_authority: 'other'
});

export const CONTRADICTION_CLASS = Object.freeze({
  CONSISTENT: 'CONSISTENT',
  COMPATIBLE_RANGE: 'COMPATIBLE_RANGE',
  MATERIAL_CONFLICT: 'MATERIAL_CONFLICT',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

export const CATALOG_CLAIM_FAMILY = Object.freeze({
  IDENTITY: 'IDENTITY',
  CLIMATE: 'CLIMATE',
  OUTCOME: 'OUTCOME',
  OTHER: 'OTHER'
});

/** Field → claim family for policy routing. */
export const FIELD_TO_CLAIM_FAMILY = Object.freeze({
  scientific: CATALOG_CLAIM_FAMILY.IDENTITY,
  acceptedScientificName: CATALOG_CLAIM_FAMILY.IDENTITY,
  aliases: CATALOG_CLAIM_FAMILY.IDENTITY,
  frostSensitivity: CATALOG_CLAIM_FAMILY.CLIMATE,
  frost: CATALOG_CLAIM_FAMILY.CLIMATE,
  coldTolerance: CATALOG_CLAIM_FAMILY.CLIMATE,
  cold: CATALOG_CLAIM_FAMILY.CLIMATE,
  heatTolerance: CATALOG_CLAIM_FAMILY.CLIMATE,
  heat: CATALOG_CLAIM_FAMILY.CLIMATE,
  humidityTolerance: CATALOG_CLAIM_FAMILY.CLIMATE,
  humidity: CATALOG_CLAIM_FAMILY.CLIMATE,
  sunNeeds: CATALOG_CLAIM_FAMILY.CLIMATE,
  sun: CATALOG_CLAIM_FAMILY.CLIMATE,
  waterNeeds: CATALOG_CLAIM_FAMILY.CLIMATE,
  water: CATALOG_CLAIM_FAMILY.CLIMATE,
  drainageNeeds: CATALOG_CLAIM_FAMILY.CLIMATE,
  drainage: CATALOG_CLAIM_FAMILY.CLIMATE,
  floweringRequirements: CATALOG_CLAIM_FAMILY.OUTCOME,
  flowering: CATALOG_CLAIM_FAMILY.OUTCOME,
  fruitingRequirements: CATALOG_CLAIM_FAMILY.OUTCOME,
  fruiting: CATALOG_CLAIM_FAMILY.OUTCOME,
  needsWinterChill: CATALOG_CLAIM_FAMILY.OUTCOME,
  winterChill: CATALOG_CLAIM_FAMILY.OUTCOME,
  chill: CATALOG_CLAIM_FAMILY.OUTCOME,
  reproductiveBiology: CATALOG_CLAIM_FAMILY.OUTCOME
});

/**
 * Per-family authorization.
 * Tier A preferred types may independently authorize SOURCE_SUPPORTED.
 * Tier B acceptable types may authorize only with preferred corroboration (or identity alone with one Tier A).
 * Tier C commercial may corroborate only — never sole SOURCE_SUPPORTED.
 * Prohibited types never authorize SOURCE_SUPPORTED.
 */
export const CLAIM_FAMILY_POLICY = Object.freeze({
  [CATALOG_CLAIM_FAMILY.IDENTITY]: Object.freeze({
    allowedSourceTypes: [
      ...SOURCE_TYPE_PREFERRED,
      ...SOURCE_TYPE_ACCEPTABLE,
      'institutional_database'
    ],
    minimumIndependentTier: 'A',
    onePreferredSourceEnough: true,
    corroborationRequiredForTierB: true,
    contradictionTriggersHold: true
  }),
  [CATALOG_CLAIM_FAMILY.CLIMATE]: Object.freeze({
    allowedSourceTypes: [...SOURCE_TYPE_PREFERRED, ...SOURCE_TYPE_ACCEPTABLE],
    minimumIndependentTier: 'A',
    onePreferredSourceEnough: true,
    corroborationRequiredForTierB: true,
    contradictionTriggersHold: true
  }),
  [CATALOG_CLAIM_FAMILY.OUTCOME]: Object.freeze({
    allowedSourceTypes: [...SOURCE_TYPE_PREFERRED, ...SOURCE_TYPE_ACCEPTABLE],
    minimumIndependentTier: 'A',
    onePreferredSourceEnough: true,
    corroborationRequiredForTierB: true,
    contradictionTriggersHold: true
  }),
  [CATALOG_CLAIM_FAMILY.OTHER]: Object.freeze({
    allowedSourceTypes: [...SOURCE_TYPE_PREFERRED, ...SOURCE_TYPE_ACCEPTABLE],
    minimumIndependentTier: 'A',
    onePreferredSourceEnough: true,
    corroborationRequiredForTierB: true,
    contradictionTriggersHold: false
  })
});

const TEMPLATE_EXCERPT_RE =
  /^(Frost sensitivity|Cold tolerance|Heat tolerance|Humidity tolerance|Water \/ moisture needs|Sun exposure|Drainage needs) characterized as /i;

function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

export function claimFamilyForField(field) {
  const f = String(field || '');
  if (FIELD_TO_CLAIM_FAMILY[f]) return FIELD_TO_CLAIM_FAMILY[f];
  if (f.startsWith('care.')) return CATALOG_CLAIM_FAMILY.OTHER;
  return CATALOG_CLAIM_FAMILY.OTHER;
}

/**
 * Normalize catalog source label / SR sourceType → canonical SR sourceType.
 */
export function normalizeCatalogSourceType(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (CATALOG_SOURCE_LABEL_ALIASES[s]) return CATALOG_SOURCE_LABEL_ALIASES[s];
  if (CATALOG_SOURCE_TYPES.includes(s)) return s;
  return null;
}

/**
 * Derive SR authority tier A/B/C from canonical sourceType (scout-aligned).
 */
export function authorityTierForSourceType(sourceType) {
  const t = normalizeCatalogSourceType(sourceType);
  if (!t) return null;
  if (SOURCE_TYPE_PREFERRED.includes(t)) return 'A';
  if (SOURCE_TYPE_ACCEPTABLE.includes(t)) return 'B';
  if (SOURCE_TYPE_CORROBORATION_ONLY.includes(t)) return 'C';
  if (SOURCE_TYPE_PROHIBITED_AS_AUTHORITY.includes(t)) return null;
  if (t === 'other') return null;
  return null;
}

export function isProhibitedAsAuthority(sourceType) {
  const t = normalizeCatalogSourceType(sourceType);
  return t != null && SOURCE_TYPE_PROHIBITED_AS_AUTHORITY.includes(t);
}

export function isAiGeneratedSummary(sourceType) {
  return normalizeCatalogSourceType(sourceType) === 'ai_generated_summary';
}

/**
 * Resolve sourceType from a catalog or SR-shaped source object.
 * Catalog packets: authorityTier holds source-class string.
 * SR packets: sourceType + authorityTier A/B/C.
 */
export function resolveSourceTypeFromSource(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.sourceType) return normalizeCatalogSourceType(source.sourceType);
  // Catalog misnamed field
  if (source.authorityTier && !CATALOG_AUTHORITY_TIERS.includes(source.authorityTier)) {
    return normalizeCatalogSourceType(source.authorityTier);
  }
  return null;
}

function excerptSupportsValue(excerpt, value) {
  const ex = String(excerpt || '').trim();
  if (!ex) return false;
  if (TEMPLATE_EXCERPT_RE.test(ex)) return false;
  const valueStr = Array.isArray(value) ? value.join(',') : String(value ?? '');
  if (!valueStr) return /frost|cold|heat|humid|water|sun|drain|chill|flower|fruit|species|scientific/i.test(ex);
  if (ex.toLowerCase().includes(valueStr.toLowerCase())) return true;
  return /frost|cold|heat|humid|water|sun|drain|chill|flower|fruit|species|scientific/i.test(ex);
}

function normalizeIdentityToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plant identity match: source title/institution/excerpt should align with expected scientific or slug.
 */
export function identityMatchOk(evidence = {}, expectedIdentity = {}) {
  const expectedSci = normalizeIdentityToken(
    expectedIdentity.acceptedScientificName || expectedIdentity.scientific || ''
  );
  const expectedSlug = normalizeIdentityToken(expectedIdentity.canonicalSlug || expectedIdentity.slug || '');
  if (!expectedSci && !expectedSlug) return { ok: true, reason: 'no-expected-identity-provided' };

  const hay = normalizeIdentityToken(
    [
      evidence.sourceTitle,
      evidence.sourceInstitution,
      evidence.excerpt,
      evidence.declaredScientificName,
      evidence.pageScientificName
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (expectedSci) {
    const parts = expectedSci.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const genusSpecies = `${parts[0]} ${parts[1]}`;
      if (hay.includes(genusSpecies)) return { ok: true, reason: 'scientific-binomial-match' };
      // Wrong species: different species epithet present
      if (hay.includes(parts[0]) && / [a-z]+/.test(hay) && !hay.includes(genusSpecies)) {
        // Only conflict if another clear binomial for same genus appears
        const re = new RegExp(`${parts[0]}\\s+([a-z]+)`, 'g');
        let m;
        while ((m = re.exec(hay))) {
          if (m[1] && m[1] !== parts[1] && m[1] !== 'spp' && m[1] !== 'sp') {
            return { ok: false, reason: 'identity-scientific-mismatch', contradiction: CONTRADICTION_CLASS.IDENTITY_CONFLICT };
          }
        }
      }
    } else if (hay.includes(expectedSci)) {
      return { ok: true, reason: 'scientific-token-match' };
    }
  }
  if (expectedSlug && hay.includes(expectedSlug.replace(/-/g, ' '))) {
    return { ok: true, reason: 'slug-match' };
  }
  // Soft pass when institutional source lacks binomial in metadata but claim declares match
  if (evidence.declaredScientificName && expectedSci) {
    if (normalizeIdentityToken(evidence.declaredScientificName) === expectedSci) {
      return { ok: true, reason: 'declared-scientific-equals-expected' };
    }
    return { ok: false, reason: 'declared-scientific-mismatch', contradiction: CONTRADICTION_CLASS.IDENTITY_CONFLICT };
  }
  return { ok: true, reason: 'identity-not-disproven' };
}

/**
 * Compare two asserted values for contradiction class.
 */
export function classifyValueContradiction(a, b, field) {
  if (a == null || b == null) return CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE;
  const sa = Array.isArray(a) ? a.join('|') : String(a);
  const sb = Array.isArray(b) ? b.join('|') : String(b);
  if (sa === sb) return CONTRADICTION_CLASS.CONSISTENT;

  const family = claimFamilyForField(field);
  if (family === CATALOG_CLAIM_FAMILY.IDENTITY) {
    return CONTRADICTION_CLASS.IDENTITY_CONFLICT;
  }

  const order = ['very_low', 'low', 'medium', 'high', 'very_high'];
  const ia = order.indexOf(sa);
  const ib = order.indexOf(sb);
  if (ia >= 0 && ib >= 0) {
    if (Math.abs(ia - ib) <= 1) return CONTRADICTION_CLASS.COMPATIBLE_RANGE;
    return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
  }
  // Distinct non-ordered strings
  if (sa.toLowerCase() !== sb.toLowerCase()) return CONTRADICTION_CLASS.MATERIAL_CONFLICT;
  return CONTRADICTION_CLASS.CONSISTENT;
}

export function contradictionBehavior(contradictionClass) {
  switch (contradictionClass) {
    case CONTRADICTION_CLASS.CONSISTENT:
      return { autoAccept: true, hold: false, evidenceClass: null };
    case CONTRADICTION_CLASS.COMPATIBLE_RANGE:
      return { autoAccept: true, hold: false, normalizeConservative: true, evidenceClass: null };
    case CONTRADICTION_CLASS.MATERIAL_CONFLICT:
      return { autoAccept: false, hold: true, evidenceClass: EVIDENCE_CLASS.UNKNOWN };
    case CONTRADICTION_CLASS.IDENTITY_CONFLICT:
      return { autoAccept: false, hold: true, evidenceClass: EVIDENCE_CLASS.UNKNOWN };
    case CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE:
    default:
      return { autoAccept: false, hold: false, evidenceClass: EVIDENCE_CLASS.UNKNOWN };
  }
}

/**
 * Core SOURCE_SUPPORTED eligibility gate for a single evidence candidate.
 * A URL alone is never enough. AI summaries never authorize SOURCE_SUPPORTED.
 * HEURISTIC cannot self-promote without passing this gate.
 *
 * @param {object} candidate
 * @param {string} candidate.field
 * @param {*} candidate.value
 * @param {string} [candidate.sourceId]
 * @param {string} [candidate.sourceType] or catalog authorityTier label
 * @param {string} [candidate.excerpt]
 * @param {string} [candidate.url]
 * @param {string} [candidate.existingEvidenceClass]
 * @param {object} [candidate.expectedIdentity]
 * @param {object[]} [candidate.corroboratingSources] additional sources [{sourceType,sourceId,excerpt}]
 * @param {object} [candidate.priorValue] for contradiction checks
 */
export function evaluateSourceSupportedEligibility(candidate = {}) {
  const reasons = [];
  const field = candidate.field;
  const family = claimFamilyForField(field);
  const familyPolicy = CLAIM_FAMILY_POLICY[family];

  const sourceType = normalizeCatalogSourceType(
    candidate.sourceType || candidate.authorityTier || null
  );
  const tier = authorityTierForSourceType(sourceType);
  const sourceId = candidate.sourceId != null ? String(candidate.sourceId).trim() : '';
  const excerpt = String(candidate.excerpt || candidate.shortExcerpt || '').trim();
  const url = candidate.url != null ? String(candidate.url).trim() : '';

  // Never allow self-promotion from HEURISTIC without full validation below
  if (candidate.existingEvidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
    // Re-validate anyway when re-checking
  }

  if (isAiGeneratedSummary(sourceType)) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'ai_generated_summary_never_source_supported'
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (isProhibitedAsAuthority(sourceType)) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'prohibited_source_type_cannot_authorize',
      `sourceType=${sourceType}`
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (!sourceType) {
    return deny(EVIDENCE_CLASS.UNKNOWN, ['unknown_or_unsupported_source_type'], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (!familyPolicy.allowedSourceTypes.includes(sourceType) && tier !== 'A') {
    // commercial_page etc.
    if (SOURCE_TYPE_CORROBORATION_ONLY.includes(sourceType)) {
      return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
        'tier_c_corroboration_only_cannot_independently_authorize'
      ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
    }
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'source_type_not_allowed_for_claim_family',
      `family=${family}`
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }

  if (!sourceId) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'exact_sourceId_required',
      url ? 'url_alone_not_enough' : 'missing_sourceId'
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (!excerpt) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'supporting_excerpt_required',
      url ? 'url_alone_not_enough' : 'missing_excerpt'
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (TEMPLATE_EXCERPT_RE.test(excerpt)) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, ['template_excerpt_not_source_quote'], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }
  if (!excerptSupportsValue(excerpt, candidate.value)) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'excerpt_does_not_support_field_value'
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }

  const idCheck = identityMatchOk(
    {
      sourceTitle: candidate.sourceTitle,
      sourceInstitution: candidate.sourceInstitution,
      excerpt,
      declaredScientificName: candidate.declaredScientificName,
      pageScientificName: candidate.pageScientificName
    },
    candidate.expectedIdentity || {}
  );
  if (!idCheck.ok) {
    return deny(EVIDENCE_CLASS.UNKNOWN, [idCheck.reason || 'identity_mismatch'], idCheck.contradiction || CONTRADICTION_CLASS.IDENTITY_CONFLICT, true);
  }

  // Tier sufficiency
  if (tier === 'A') {
    reasons.push('tier_a_preferred_source_independent_ok');
  } else if (tier === 'B') {
    const cor = asArray(candidate.corroboratingSources).filter((s) => {
      const st = normalizeCatalogSourceType(s.sourceType || s.authorityTier);
      return SOURCE_TYPE_PREFERRED.includes(st);
    });
    if (familyPolicy.corroborationRequiredForTierB && cor.length === 0) {
      return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
        'tier_b_requires_preferred_corroboration'
      ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
    }
    reasons.push('tier_b_with_preferred_corroboration_ok');
  } else if (tier === 'C') {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, [
      'tier_c_cannot_independently_authorize'
    ], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  } else {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, ['no_authority_tier_for_source'], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }

  // Prior value contradiction
  let contradiction = CONTRADICTION_CLASS.CONSISTENT;
  if (candidate.priorValue != null && candidate.value != null) {
    contradiction = classifyValueContradiction(candidate.priorValue, candidate.value, field);
    const behavior = contradictionBehavior(contradiction);
    if (behavior.hold) {
      return deny(EVIDENCE_CLASS.UNKNOWN, [`contradiction_${contradiction}`], contradiction, true);
    }
    reasons.push(`contradiction_${contradiction}`);
  }

  // Provenance retained check
  if (candidate.provenanceRetained === false) {
    return deny(EVIDENCE_CLASS.HEURISTIC_ASSERTION, ['provenance_not_retained'], CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  }

  reasons.push('source_supported_gate_passed');
  reasons.push(`policy=${CATALOG_SOURCE_POLICY_REF}`);
  reasons.push(`fieldProvenanceHonesty=${FIELD_PROVENANCE_HONESTY_VERSION}`);

  return {
    ok: true,
    allowed: true,
    mayBeSourceSupported: true,
    evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
    sourceType,
    authorityTier: tier,
    claimFamily: family,
    contradictionClass: contradiction,
    hold: false,
    reasons,
    policyId: CATALOG_SOURCE_POLICY_ID,
    policyVersion: CATALOG_SOURCE_POLICY_VERSION,
    policyRef: CATALOG_SOURCE_POLICY_REF
  };
}

function deny(evidenceClass, reasons, contradictionClass, hold = false) {
  return {
    ok: false,
    allowed: false,
    mayBeSourceSupported: false,
    evidenceClass,
    contradictionClass: contradictionClass || CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE,
    hold: !!hold || contradictionClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT || contradictionClass === CONTRADICTION_CLASS.IDENTITY_CONFLICT,
    reasons,
    policyId: CATALOG_SOURCE_POLICY_ID,
    policyVersion: CATALOG_SOURCE_POLICY_VERSION,
    policyRef: CATALOG_SOURCE_POLICY_REF
  };
}

/**
 * HEURISTIC cannot self-promote to SOURCE_SUPPORTED without passing the gate.
 */
export function assertHeuristicCannotSelfPromote(existingClass, candidate) {
  if (existingClass !== EVIDENCE_CLASS.HEURISTIC_ASSERTION) {
    return { blocked: false };
  }
  const result = evaluateSourceSupportedEligibility({
    ...candidate,
    existingEvidenceClass: existingClass
  });
  if (!result.mayBeSourceSupported) {
    return {
      blocked: true,
      evidenceClass: EVIDENCE_CLASS.HEURISTIC_ASSERTION,
      reasons: ['heuristic_cannot_self_promote', ...result.reasons]
    };
  }
  return { blocked: false, result };
}

/**
 * Evaluate whether evidence may support a plant field (policy helper).
 */
export function evaluateMaySupportPlantField(candidate) {
  return evaluateSourceSupportedEligibility(candidate);
}

/**
 * Dry-evaluate a catalog expansion packet against this policy (read-only).
 * Does not mutate packet or catalog.
 */
export function evaluatePacketAgainstSourcePolicy(packet) {
  const sources = Array.isArray(packet?.sources) ? packet.sources : [];
  const byId = Object.fromEntries(sources.map((s) => [s.sourceId, s]));
  const claims = Array.isArray(packet?.claims) ? packet.claims : [];
  const identity = packet?.identity || {};
  const expectedIdentity = {
    acceptedScientificName: identity.acceptedScientificName,
    scientific: identity.acceptedScientificName,
    canonicalSlug: identity.canonicalSlug,
    slug: identity.canonicalSlug
  };

  const rows = [];
  const counts = {
    SOURCE_SUPPORTED_eligible: 0,
    HEURISTIC: 0,
    UNKNOWN: 0,
    HOLD: 0,
    policyViolations: 0,
    unsupportedSourceTypes: 0
  };
  const unsupportedTypes = new Set();
  const violations = [];

  for (const claim of claims) {
    const sourceIds = Array.isArray(claim.sourceIds) ? claim.sourceIds : [];
    const primary = sourceIds.length ? byId[sourceIds[0]] : null;
    const sourceType = primary ? resolveSourceTypeFromSource(primary) : null;
    if (primary && !sourceType) {
      counts.unsupportedSourceTypes += 1;
      unsupportedTypes.add(String(primary.authorityTier || primary.sourceType || 'unknown'));
    }

    const honesty = classifyClaimFieldProvenance(claim, byId);
    const candidate = {
      field: claim.field,
      value: claim.value,
      sourceId: primary?.sourceId || sourceIds[0] || null,
      sourceType: sourceType || primary?.authorityTier,
      authorityTier: primary?.authorityTier,
      excerpt: claim.shortExcerpt || claim.excerpt,
      url: primary?.url,
      sourceTitle: primary?.title,
      sourceInstitution: primary?.institution || primary?.publisher,
      declaredScientificName:
        claim.field === 'scientific' || claim.field === 'acceptedScientificName'
          ? claim.value
          : identity.acceptedScientificName,
      expectedIdentity,
      existingEvidenceClass: claim.evidenceClass || honesty.evidenceClass,
      provenanceRetained: true,
      corroboratingSources: sourceIds.slice(1).map((id) => {
        const s = byId[id];
        return s
          ? { sourceType: resolveSourceTypeFromSource(s), authorityTier: s.authorityTier, sourceId: s.sourceId }
          : null;
      }).filter(Boolean)
    };

    const verdict = evaluateSourceSupportedEligibility(candidate);
    if (verdict.mayBeSourceSupported) counts.SOURCE_SUPPORTED_eligible += 1;
    else if (verdict.evidenceClass === EVIDENCE_CLASS.UNKNOWN) counts.UNKNOWN += 1;
    else counts.HEURISTIC += 1;
    if (verdict.hold) counts.HOLD += 1;
    if (!verdict.mayBeSourceSupported && claim.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
      counts.policyViolations += 1;
      violations.push({
        claimId: claim.claimId,
        field: claim.field,
        packetDeclared: claim.evidenceClass,
        policyClass: verdict.evidenceClass,
        reasons: verdict.reasons
      });
    }

    rows.push({
      claimId: claim.claimId,
      field: claim.field,
      packetEvidenceClass: claim.evidenceClass || honesty.evidenceClass,
      policyEvidenceClass: verdict.mayBeSourceSupported
        ? EVIDENCE_CLASS.SOURCE_SUPPORTED
        : verdict.evidenceClass,
      mayBeSourceSupported: verdict.mayBeSourceSupported,
      hold: verdict.hold,
      contradictionClass: verdict.contradictionClass,
      sourceType,
      authorityTier: verdict.authorityTier || authorityTierForSourceType(sourceType),
      reasons: verdict.reasons
    });
  }

  return {
    policyRef: CATALOG_SOURCE_POLICY_REF,
    packetId: packet?.packetId || null,
    slug: identity.canonicalSlug || null,
    scientific: identity.acceptedScientificName || null,
    claimCount: claims.length,
    counts,
    unsupportedSourceTypeLabels: [...unsupportedTypes].sort(),
    violations,
    rows,
    mutated: false,
    ingested: false
  };
}

/**
 * Batch 3 dry policy scan — packets only, no ingest / no catalog write.
 */
export function evaluateBatch3PacketsSourcePolicyDry(packets) {
  const list = Array.isArray(packets) ? packets : [];
  const packetReports = list.map((p) => evaluatePacketAgainstSourcePolicy(p));
  const totals = {
    packets: list.length,
    claims: 0,
    SOURCE_SUPPORTED_eligible: 0,
    HEURISTIC: 0,
    UNKNOWN: 0,
    HOLD: 0,
    policyViolations: 0,
    unsupportedSourceTypes: 0
  };
  const unsupported = new Set();
  for (const r of packetReports) {
    totals.claims += r.claimCount;
    totals.SOURCE_SUPPORTED_eligible += r.counts.SOURCE_SUPPORTED_eligible;
    totals.HEURISTIC += r.counts.HEURISTIC;
    totals.UNKNOWN += r.counts.UNKNOWN;
    totals.HOLD += r.counts.HOLD;
    totals.policyViolations += r.counts.policyViolations;
    totals.unsupportedSourceTypes += r.counts.unsupportedSourceTypes;
    for (const t of r.unsupportedSourceTypeLabels) unsupported.add(t);
  }
  return {
    policyRef: CATALOG_SOURCE_POLICY_REF,
    dryRun: true,
    ingested: false,
    note: 'Batch 3 source-policy dry evaluation only. No catalog writes. No fetch.',
    totals,
    unsupportedSourceTypeLabels: [...unsupported].sort(),
    packetReports
  };
}

export const CATALOG_SOURCE_POLICY_META = Object.freeze({
  id: CATALOG_SOURCE_POLICY_ID,
  version: CATALOG_SOURCE_POLICY_VERSION,
  ref: CATALOG_SOURCE_POLICY_REF,
  reused: Object.freeze({
    sourceTypes: 'SR_EVIDENCE_SOURCE_TYPES',
    authorityTiers: 'SR_EVIDENCE_AUTHORITY_TIERS',
    evidenceClasses: 'FIELD_PROVENANCE_EVIDENCE_CLASSES',
    scoutPreferenceBuckets: 'aligned-with-developer-reviewed-data-source-scout'
  }),
  storageModel:
    'retrieval→validate→store fact+provenance with CRUVIT; runtime reuses stored facts; user queries must not re-fetch botanical sources',
  noFetch: true
});
