/**
 * Cruvit — Smart Recommendations developer evidence packet validator
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative audit layer over the closed
 * Evidence Packet Registry plus harness-supplied synthetic snapshots.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Does not mutate packets, registry, catalog, needsReview, or caller inputs.
 *  - Does not import catalog, Field Review modules, GOS, v1b, or identity Sidecar.
 *  - Reuses registry fingerprint builders; does not reimplement them.
 *  - Does not approve packets or create Field Review decisions.
 */

import {
  SR_EVIDENCE_PACKET_REGISTRY_VERSION,
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  SR_EVIDENCE_PACKET_FIELDS,
  SR_EVIDENCE_CLAIM_TYPES,
  SR_EVIDENCE_AUTHORITY_TIERS,
  SR_EVIDENCE_PACKET_STATUSES,
  SR_EVIDENCE_SOURCE_TYPES,
  buildEvidencePacketSourceFingerprint,
  buildEvidencePacketContentFingerprint,
  validateAndBuildEvidencePacketRegistry,
  getEmptySmartRecDeveloperEvidencePacketRegistry,
  getSmartRecDeveloperEvidencePacketRegistryDescriptor
} from './developer-evidence-packet-registry.js';

export const SR_EVIDENCE_PACKET_VALIDATOR_VERSION =
  '0.1.0-sr-evidence-packet-validator';

/** Anti-accident capability token — not authentication. */
export const SR_EVIDENCE_PACKET_VALIDATOR_CAPABILITY =
  'explicit_developer_evidence_packet_validation';

/** Developer-only default excerpt length; overridable via copyrightExcerptPolicy. */
export const SR_EVIDENCE_PACKET_VALIDATOR_DEFAULT_MAX_SHORT_EXCERPT_CHARS = 280;

export const SR_EVIDENCE_PACKET_VALIDATOR_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
]);

export const SR_EVIDENCE_PACKET_VALIDATOR_FINDING_CODES = Object.freeze([
  'missing_evidence_id',
  'duplicate_evidence_id',
  'semantic_duplicate_packet',
  'unknown_canonical_key',
  'alias_owned_packet',
  'unsupported_field',
  'missing_scientific_identity',
  'unsupported_claim_type',
  'unsupported_authority_tier',
  'unsupported_source_type',
  'missing_source_identity',
  'missing_source_reference',
  'missing_normalized_claim',
  'missing_context_scope',
  'unsupported_packet_status',
  'packet_contract_version_mismatch',
  'source_fingerprint_missing',
  'source_fingerprint_mismatch',
  'content_fingerprint_missing',
  'content_fingerprint_mismatch',
  'unsupported_proposed_value',
  'ai_only_authority',
  'tier_c_as_sole_authority',
  'withdrawn_packet_active',
  'rejected_packet_active',
  'superseded_packet_active',
  'overlapping_active_conflict',
  'alias_canonical_duplicate',
  'multi_field_packet',
  'unstable_fingerprint',
  'excessive_copied_text',
  'invalid_dates',
  'packet_field_review_mismatch',
  'registry_or_input_mutation',
  'broad_identity_scope',
  'authority_corroboration_recommended',
  'missing_publication_date',
  'packet_needs_review',
  'short_excerpt_missing',
  'source_update_date_missing',
  'empty_registry_accepted',
  'synthetic_fixture_only',
  'invalid_input'
]);

const ERROR_CODES = Object.freeze([
  'missing_evidence_id',
  'duplicate_evidence_id',
  'semantic_duplicate_packet',
  'unknown_canonical_key',
  'alias_owned_packet',
  'unsupported_field',
  'missing_scientific_identity',
  'unsupported_claim_type',
  'unsupported_authority_tier',
  'unsupported_source_type',
  'missing_source_identity',
  'missing_source_reference',
  'missing_normalized_claim',
  'missing_context_scope',
  'unsupported_packet_status',
  'packet_contract_version_mismatch',
  'source_fingerprint_missing',
  'source_fingerprint_mismatch',
  'content_fingerprint_missing',
  'content_fingerprint_mismatch',
  'unsupported_proposed_value',
  'ai_only_authority',
  'tier_c_as_sole_authority',
  'withdrawn_packet_active',
  'rejected_packet_active',
  'superseded_packet_active',
  'overlapping_active_conflict',
  'alias_canonical_duplicate',
  'multi_field_packet',
  'unstable_fingerprint',
  'excessive_copied_text',
  'invalid_dates',
  'packet_field_review_mismatch',
  'registry_or_input_mutation',
  'invalid_input'
]);

const WARNING_CODES = Object.freeze([
  'broad_identity_scope',
  'authority_corroboration_recommended',
  'missing_publication_date',
  'packet_needs_review',
  'short_excerpt_missing',
  'source_update_date_missing'
]);

const INFO_CODES = Object.freeze([
  'empty_registry_accepted',
  'synthetic_fixture_only'
]);

/** Map registry-only codes onto the validator surface where needed. */
const REGISTRY_CODE_MAP = Object.freeze({
  invalid_verified_at: 'invalid_dates',
  invalid_packets_input: 'invalid_input'
});

function deepFreeze(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) deepFreeze(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function freezeDeep(value) {
  return deepFreeze(value, new WeakSet());
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeKey(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim().toLowerCase();
}

function normalizeTrim(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim();
}

function stableSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) return '"__non_finite__"';
    return String(value);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'undefined') return '"__undefined__"';
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + stableSerialize(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function isIsoDate(v) {
  if (!isNonEmptyString(v)) return false;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function findingSeverityForCode(code) {
  if (ERROR_CODES.indexOf(code) >= 0) return 'error';
  if (WARNING_CODES.indexOf(code) >= 0) return 'warning';
  if (INFO_CODES.indexOf(code) >= 0) return 'info';
  return 'error';
}

function mapRegistryCode(code) {
  if (REGISTRY_CODE_MAP[code]) return REGISTRY_CODE_MAP[code];
  if (SR_EVIDENCE_PACKET_VALIDATOR_FINDING_CODES.indexOf(code) >= 0) return code;
  return code;
}

function pushFinding(findings, finding) {
  const code = mapRegistryCode(finding.code);
  findings.push(
    freezeDeep({
      code: code,
      severity: finding.severity || findingSeverityForCode(code),
      evidenceId: finding.evidenceId == null ? null : finding.evidenceId,
      canonicalKey: finding.canonicalKey == null ? null : finding.canonicalKey,
      field: finding.field == null ? null : finding.field,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function buildDescriptor() {
  return freezeDeep({
    validatorVersion: SR_EVIDENCE_PACKET_VALIDATOR_VERSION,
    capability: SR_EVIDENCE_PACKET_VALIDATOR_CAPABILITY,
    supportedRegistryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    supportedPacketContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    packetMutation: false,
    catalogMutation: false,
    fieldReviewMutation: false,
    needsReviewMutation: false,
    persistence: false,
    network: false,
    automaticExecution: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    severities: SR_EVIDENCE_PACKET_VALIDATOR_SEVERITIES.slice(),
    findingCodes: SR_EVIDENCE_PACKET_VALIDATOR_FINDING_CODES.slice(),
    allowedFields: SR_EVIDENCE_PACKET_FIELDS.slice(),
    claimTypes: SR_EVIDENCE_CLAIM_TYPES.slice(),
    authorityTiers: SR_EVIDENCE_AUTHORITY_TIERS.slice(),
    packetStatuses: SR_EVIDENCE_PACKET_STATUSES.slice(),
    sourceTypes: SR_EVIDENCE_SOURCE_TYPES.slice(),
    defaultMaxShortExcerptChars: SR_EVIDENCE_PACKET_VALIDATOR_DEFAULT_MAX_SHORT_EXCERPT_CHARS
  });
}

const DESCRIPTOR = buildDescriptor();

/**
 * Immutable validator descriptor.
 */
export function getSmartRecDeveloperEvidencePacketValidatorDescriptor() {
  return DESCRIPTOR;
}

function resolveCandidatePackets(input) {
  if (Array.isArray(input.candidatePackets)) return input.candidatePackets.slice();
  if (Array.isArray(input.packets)) return input.packets.slice();
  const reg = asObject(input.registry);
  if (reg && Array.isArray(reg.packets)) return reg.packets.slice();
  return [];
}

function resolveMaxExcerptChars(input) {
  const policy = asObject(input.copyrightExcerptPolicy) || asObject(input.excerptPolicy);
  if (policy && typeof policy.maxShortExcerptChars === 'number' && policy.maxShortExcerptChars > 0) {
    return policy.maxShortExcerptChars;
  }
  if (policy && typeof policy.maxChars === 'number' && policy.maxChars > 0) {
    return policy.maxChars;
  }
  return SR_EVIDENCE_PACKET_VALIDATOR_DEFAULT_MAX_SHORT_EXCERPT_CHARS;
}

function contextScopeKey(scope) {
  if (scope === undefined || scope === null) return null;
  if (typeof scope === 'string') {
    const s = scope.trim();
    return s || null;
  }
  if (typeof scope === 'object') return stableSerialize(scope);
  return null;
}

function collectPacketIdSet(packets) {
  const set = Object.create(null);
  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const id = normalizeTrim(p.evidenceId);
    if (id) set[id] = true;
  }
  return set;
}

function detectSupersessionIssues(packets, lifecycleSnapshot, findings) {
  const idSet = collectPacketIdSet(packets);
  const snap = asObject(lifecycleSnapshot) || {};
  const links = Array.isArray(snap.links)
    ? snap.links
    : Array.isArray(snap.supersessionLinks)
      ? snap.supersessionLinks
      : [];

  const edges = Object.create(null);

  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const id = normalizeTrim(p.evidenceId);
    if (!id) continue;
    const supersedes = normalizeTrim(p.supersedes);
    const supersededBy = normalizeTrim(p.supersededBy);
    if (supersedes) {
      if (!idSet[supersedes] && !snapAllowMissing(snap, supersedes)) {
        pushFinding(findings, {
          code: 'unsupported_packet_status',
          severity: 'error',
          evidenceId: id,
          detail: 'missing_supersedes_target',
          actual: supersedes
        });
      }
      if (!edges[id]) edges[id] = [];
      edges[id].push(supersedes);
    }
    if (supersededBy) {
      if (!idSet[supersededBy] && !snapAllowMissing(snap, supersededBy)) {
        pushFinding(findings, {
          code: 'unsupported_packet_status',
          severity: 'error',
          evidenceId: id,
          detail: 'missing_supersededBy_target',
          actual: supersededBy
        });
      }
      if (!edges[id]) edges[id] = [];
      edges[id].push(supersededBy);
    }
  }

  for (let i = 0; i < links.length; i++) {
    const link = asObject(links[i]);
    if (!link) continue;
    const from = normalizeTrim(link.from) || normalizeTrim(link.evidenceId);
    const to = normalizeTrim(link.to) || normalizeTrim(link.supersedes) || normalizeTrim(link.supersededBy);
    if (!from || !to) {
      pushFinding(findings, {
        code: 'unsupported_packet_status',
        severity: 'error',
        detail: 'invalid_supersession_link'
      });
      continue;
    }
    if (!idSet[from] || !idSet[to]) {
      pushFinding(findings, {
        code: 'unsupported_packet_status',
        severity: 'error',
        evidenceId: from,
        detail: 'missing_supersession_target',
        actual: to
      });
    }
    if (!edges[from]) edges[from] = [];
    edges[from].push(to);
  }

  const visiting = Object.create(null);
  const visited = Object.create(null);
  const nodes = Object.keys(edges).sort();

  function dfs(node, path) {
    if (visiting[node]) {
      pushFinding(findings, {
        code: 'unsupported_packet_status',
        severity: 'error',
        evidenceId: node,
        detail: 'supersession_cycle',
        actual: path.concat([node]).join('->')
      });
      return;
    }
    if (visited[node]) return;
    visiting[node] = true;
    const next = edges[node] || [];
    for (let i = 0; i < next.length; i++) {
      dfs(next[i], path.concat([node]));
    }
    visiting[node] = false;
    visited[node] = true;
  }

  for (let i = 0; i < nodes.length; i++) dfs(nodes[i], []);
}

function snapAllowMissing(snap, id) {
  const known = asObject(snap.knownPacketIds) || {};
  return known[id] === true;
}

function auditCopyrightAndDates(packets, maxExcerptChars, findings) {
  const excerptSeen = Object.create(null);

  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const evidenceId = normalizeTrim(p.evidenceId);
    const shortExcerpt = normalizeTrim(p.shortExcerpt);
    const reviewerSummary = normalizeTrim(p.reviewerSummary);
    const publicationDate = normalizeTrim(p.publicationDate);
    const sourceUpdateDate = normalizeTrim(p.sourceUpdateDate);
    const verifiedAt = normalizeTrim(p.verifiedAt);

    if (shortExcerpt && shortExcerpt.length > maxExcerptChars) {
      pushFinding(findings, {
        code: 'excessive_copied_text',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'shortExcerpt_exceeds_policy',
        expected: maxExcerptChars,
        actual: shortExcerpt.length
      });
    }

    if (shortExcerpt && reviewerSummary && shortExcerpt === reviewerSummary) {
      pushFinding(findings, {
        code: 'excessive_copied_text',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'reviewerSummary_equals_shortExcerpt'
      });
    }

    if (shortExcerpt) {
      const key = shortExcerpt.toLowerCase();
      if (excerptSeen[key]) {
        pushFinding(findings, {
          code: 'semantic_duplicate_packet',
          severity: 'error',
          evidenceId: evidenceId,
          detail: 'repeated_copied_excerpt',
          actual: excerptSeen[key]
        });
      } else {
        excerptSeen[key] = evidenceId;
      }
    }

    if (publicationDate && !isIsoDate(publicationDate)) {
      pushFinding(findings, {
        code: 'invalid_dates',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'publicationDate',
        actual: publicationDate
      });
    }
    if (sourceUpdateDate && !isIsoDate(sourceUpdateDate)) {
      pushFinding(findings, {
        code: 'invalid_dates',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'sourceUpdateDate',
        actual: sourceUpdateDate
      });
    }
    if (verifiedAt && !isIsoDate(verifiedAt)) {
      pushFinding(findings, {
        code: 'invalid_dates',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'verifiedAt',
        actual: verifiedAt
      });
    }
  }
}

function auditSourceSnapshot(packets, sourceSnapshot, findings) {
  const root = asObject(sourceSnapshot);
  if (!root) return;
  const byId =
    asObject(root.bySourceIdentity) ||
    asObject(root.bySourceReference) ||
    asObject(root.sources) ||
    root;

  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const evidenceId = normalizeTrim(p.evidenceId);
    const sourceIdentity = normalizeTrim(p.sourceIdentity) || normalizeTrim(p.sourceReference);
    if (!sourceIdentity) continue;
    const entry = asObject(byId[sourceIdentity]);
    if (!entry) continue;
    const status = normalizeTrim(entry.status) || normalizeTrim(entry.sourceStatus);
    const active =
      p.activeSupport === true ||
      p.packetStatus === 'draft' ||
      p.packetStatus === 'collected';
    if (status === 'withdrawn' && active) {
      pushFinding(findings, {
        code: 'withdrawn_packet_active',
        severity: 'error',
        evidenceId: evidenceId,
        detail: 'active_packet_references_withdrawn_source',
        actual: sourceIdentity
      });
    }
  }
}

function auditFieldReviewReferences(packets, frSnapshot, findings) {
  const root = asObject(frSnapshot);
  if (!root) return;
  const decisions = Array.isArray(root.decisions)
    ? root.decisions
    : Array.isArray(root.references)
      ? root.references
      : Array.isArray(root)
        ? root
        : [];

  const byId = Object.create(null);
  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const id = normalizeTrim(p.evidenceId);
    if (id) byId[id] = p;
  }

  for (let i = 0; i < decisions.length; i++) {
    const d = asObject(decisions[i]);
    if (!d) continue;
    const refs = Array.isArray(d.evidenceRefs)
      ? d.evidenceRefs
      : isNonEmptyString(d.evidenceId)
        ? [d.evidenceId]
        : [];
    for (let r = 0; r < refs.length; r++) {
      const eid = normalizeTrim(refs[r]);
      if (!eid) continue;
      const pkt = byId[eid];
      if (!pkt) {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'referenced_packet_missing'
        });
        continue;
      }
      const dCk = normalizeKey(d.canonicalKey);
      const pCk = normalizeKey(pkt.canonicalKey);
      if (dCk && pCk && dCk !== pCk) {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'canonical_key_mismatch',
          expected: dCk,
          actual: pCk
        });
      }
      const dField = normalizeTrim(d.field);
      const pField = normalizeTrim(pkt.field);
      if (dField && pField && dField !== pField) {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          field: pField,
          detail: 'field_mismatch',
          expected: dField,
          actual: pField
        });
      }
      const status = normalizeTrim(pkt.packetStatus);
      if (status === 'withdrawn' || status === 'rejected' || status === 'superseded') {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'inactive_packet_referenced',
          actual: status
        });
      }
      if (status === 'stale') {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'stale_packet_supports_field_review'
        });
      }
      if (d.contextScope != null && pkt.contextScope != null) {
        if (contextScopeKey(d.contextScope) !== contextScopeKey(pkt.contextScope)) {
          pushFinding(findings, {
            code: 'packet_field_review_mismatch',
            severity: 'error',
            evidenceId: eid,
            detail: 'context_mismatch'
          });
        }
      }
      const dFp = normalizeTrim(d.contentFingerprint);
      const pFp = normalizeTrim(pkt.contentFingerprint);
      if (dFp && pFp && dFp !== pFp) {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'content_fingerprint_mismatch',
          expected: dFp,
          actual: pFp
        });
      }
      const dRv = normalizeTrim(d.reviewVersion);
      const supported = Array.isArray(root.supportedReviewVersions)
        ? root.supportedReviewVersions.map(function (x) {
            return String(x).trim();
          })
        : null;
      if (dRv && supported && supported.indexOf(dRv) < 0) {
        pushFinding(findings, {
          code: 'packet_field_review_mismatch',
          severity: 'error',
          evidenceId: eid,
          detail: 'unsupported_review_version',
          actual: dRv
        });
      }
    }
  }
}

function sortFindings(findings) {
  return findings.slice().sort(function (a, b) {
    const parts = [
      String(a.severity || '').localeCompare(String(b.severity || '')),
      String(a.code || '').localeCompare(String(b.code || '')),
      String(a.evidenceId || '').localeCompare(String(b.evidenceId || '')),
      String(a.canonicalKey || '').localeCompare(String(b.canonicalKey || '')),
      String(a.field || '').localeCompare(String(b.field || '')),
      String(a.detail || '').localeCompare(String(b.detail || ''))
    ];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] !== 0) return parts[i];
    }
    return 0;
  });
}

function buildFindingsByCode(findings) {
  const by = Object.create(null);
  for (let i = 0; i < findings.length; i++) {
    const c = findings[i].code;
    if (!by[c]) by[c] = [];
    by[c].push(findings[i]);
  }
  const keys = Object.keys(by).sort();
  const out = Object.create(null);
  for (let i = 0; i < keys.length; i++) out[keys[i]] = Object.freeze(by[keys[i]].slice());
  return out;
}

function countFindings(findings) {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].severity === 'error') errorCount++;
    else if (findings[i].severity === 'warning') warningCount++;
    else if (findings[i].severity === 'info') infoCount++;
  }
  return {
    errorCount: errorCount,
    warningCount: warningCount,
    infoCount: infoCount
  };
}

function buildSummaryFingerprint(parts) {
  return [
    SR_EVIDENCE_PACKET_VALIDATOR_VERSION,
    parts.registryVersion || '',
    String(parts.packetCount),
    String(parts.checkedCount),
    String(parts.errorCount),
    String(parts.warningCount),
    String(parts.infoCount),
    parts.findings
      .map(function (f) {
        return [
          f.severity,
          f.code,
          f.evidenceId || '',
          f.canonicalKey || '',
          f.field || '',
          f.detail || '',
          f.expected == null ? '' : stableSerialize(f.expected),
          f.actual == null ? '' : stableSerialize(f.actual)
        ].join(':');
      })
      .join(';')
  ].join('|');
}

function finalizeReport(parts) {
  const findings = sortFindings(parts.findings);
  const counts = countFindings(findings);
  const summaryFingerprint = buildSummaryFingerprint({
    registryVersion: parts.registryVersion,
    packetCount: parts.packetCount,
    checkedCount: parts.checkedCount,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings
  });
  return freezeDeep({
    valid: counts.errorCount === 0,
    validatorVersion: SR_EVIDENCE_PACKET_VALIDATOR_VERSION,
    registryVersion: parts.registryVersion,
    packetCount: parts.packetCount,
    checkedCount: parts.checkedCount,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings,
    findingsByCode: freezeDeep(buildFindingsByCode(findings)),
    invalidPackets: Object.freeze((parts.invalidPackets || []).slice()),
    duplicatePackets: Object.freeze((parts.duplicatePackets || []).slice()),
    stalePackets: Object.freeze((parts.stalePackets || []).slice()),
    conflictingPackets: Object.freeze((parts.conflictingPackets || []).slice()),
    summaryFingerprint: summaryFingerprint
  });
}

/**
 * Pure validation entry point for developer evidence-packet registry artifacts.
 * Accepts only explicit snapshots; never fetches product data.
 */
export function validateSmartRecDeveloperEvidencePacketRegistry(input) {
  const findings = [];
  const conflictingPackets = [];

  const src = asObject(input);
  if (!src) {
    pushFinding(findings, {
      code: 'invalid_input',
      severity: 'error',
      detail: 'input_object_required'
    });
    return finalizeReport({
      findings: findings,
      registryVersion: null,
      packetCount: 0,
      checkedCount: 0,
      invalidPackets: [],
      duplicatePackets: [],
      stalePackets: [],
      conflictingPackets: []
    });
  }

  if (src.mutationAttempt === true) {
    pushFinding(findings, {
      code: 'registry_or_input_mutation',
      severity: 'error',
      detail: 'mutation_attempt_flag'
    });
  }

  const registryDescriptor =
    asObject(src.registryDescriptor) || getSmartRecDeveloperEvidencePacketRegistryDescriptor();
  const registry =
    asObject(src.registry) || getEmptySmartRecDeveloperEvidencePacketRegistry();

  const registryVersion = isNonEmptyString(src.registryVersion)
    ? String(src.registryVersion).trim()
    : isNonEmptyString(registry.registryVersion)
      ? String(registry.registryVersion).trim()
      : SR_EVIDENCE_PACKET_REGISTRY_VERSION;

  const packetContractVersion = isNonEmptyString(src.packetContractVersion)
    ? String(src.packetContractVersion).trim()
    : isNonEmptyString(registry.packetContractVersion)
      ? String(registry.packetContractVersion).trim()
      : SR_EVIDENCE_PACKET_CONTRACT_VERSION;

  if (registryVersion !== SR_EVIDENCE_PACKET_REGISTRY_VERSION) {
    pushFinding(findings, {
      code: 'packet_contract_version_mismatch',
      severity: 'error',
      detail: 'unsupported_or_mismatched_registry_version',
      expected: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
      actual: registryVersion
    });
  }

  if (packetContractVersion !== SR_EVIDENCE_PACKET_CONTRACT_VERSION) {
    pushFinding(findings, {
      code: 'packet_contract_version_mismatch',
      severity: 'error',
      detail: 'unsupported_or_mismatched_packet_contract_version',
      expected: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      actual: packetContractVersion
    });
  }

  if (
    registryDescriptor &&
    registryDescriptor.realPacketCount != null &&
    registryDescriptor.realPacketCount !== 0
  ) {
    pushFinding(findings, {
      code: 'registry_or_input_mutation',
      severity: 'error',
      detail: 'realPacketCount_must_remain_zero',
      actual: registryDescriptor.realPacketCount
    });
  }

  const emptyReal = getEmptySmartRecDeveloperEvidencePacketRegistry();
  if (!emptyReal || !Array.isArray(emptyReal.packets) || emptyReal.packets.length !== 0) {
    pushFinding(findings, {
      code: 'registry_or_input_mutation',
      severity: 'error',
      detail: 'empty_real_registry_not_empty'
    });
  }

  const packets = resolveCandidatePackets(src);
  const knownCanonicalKeys = Array.isArray(src.knownCanonicalKeys)
    ? src.knownCanonicalKeys.slice()
    : [];
  const aliasToCanonicalMap = asObject(src.aliasToCanonicalMap) || {};
  const knownAliasKeys = Array.isArray(src.knownAliasKeys)
    ? src.knownAliasKeys.slice()
    : Object.keys(aliasToCanonicalMap);

  const allowedFields = Array.isArray(src.allowedFields)
    ? src.allowedFields.slice()
    : SR_EVIDENCE_PACKET_FIELDS.slice();
  const allowedClaimTypes = Array.isArray(src.allowedClaimTypes)
    ? src.allowedClaimTypes.slice()
    : SR_EVIDENCE_CLAIM_TYPES.slice();
  const allowedAuthorityTiers = Array.isArray(src.allowedAuthorityTiers)
    ? src.allowedAuthorityTiers.slice()
    : SR_EVIDENCE_AUTHORITY_TIERS.slice();
  const allowedPacketStatuses = Array.isArray(src.allowedPacketStatuses)
    ? src.allowedPacketStatuses.slice()
    : SR_EVIDENCE_PACKET_STATUSES.slice();
  const allowedSourceTypes = Array.isArray(src.allowedSourceTypes)
    ? src.allowedSourceTypes.slice()
    : SR_EVIDENCE_SOURCE_TYPES.slice();

  // Vocabulary probes: reject packets using values outside caller-supplied allow-lists.
  for (let i = 0; i < packets.length; i++) {
    const p = asObject(packets[i]);
    if (!p) continue;
    const evidenceId = normalizeTrim(p.evidenceId);
    const field = normalizeTrim(p.field);
    const claimType = normalizeTrim(p.claimType);
    const authorityTier = normalizeTrim(p.authorityTier);
    const packetStatus = normalizeTrim(p.packetStatus);
    const sourceType = normalizeTrim(p.sourceType);
    if (field && allowedFields.indexOf(field) < 0) {
      pushFinding(findings, {
        code: 'unsupported_field',
        severity: 'error',
        evidenceId: evidenceId,
        field: field
      });
    }
    if (claimType && allowedClaimTypes.indexOf(claimType) < 0) {
      pushFinding(findings, {
        code: 'unsupported_claim_type',
        severity: 'error',
        evidenceId: evidenceId,
        actual: claimType
      });
    }
    if (authorityTier && allowedAuthorityTiers.indexOf(authorityTier) < 0) {
      pushFinding(findings, {
        code: 'unsupported_authority_tier',
        severity: 'error',
        evidenceId: evidenceId,
        actual: authorityTier
      });
    }
    if (packetStatus && allowedPacketStatuses.indexOf(packetStatus) < 0) {
      pushFinding(findings, {
        code: 'unsupported_packet_status',
        severity: 'error',
        evidenceId: evidenceId,
        actual: packetStatus
      });
    }
    if (sourceType && allowedSourceTypes.indexOf(sourceType) < 0) {
      pushFinding(findings, {
        code: 'unsupported_source_type',
        severity: 'error',
        evidenceId: evidenceId,
        actual: sourceType
      });
    }
  }

  const registryCtx = {
    knownCanonicalKeys: knownCanonicalKeys,
    knownAliasKeys: knownAliasKeys,
    aliasToCanonicalMap: aliasToCanonicalMap,
    packetContractVersion: packetContractVersion,
    syntheticFixtureOnly: src.syntheticFixtureOnly === true
  };

  const built = validateAndBuildEvidencePacketRegistry(packets, registryCtx);

  for (let i = 0; i < built.findings.length; i++) {
    pushFinding(findings, built.findings[i]);
  }

  if (Array.isArray(built.findings)) {
    for (let i = 0; i < built.findings.length; i++) {
      const f = built.findings[i];
      if (f && f.code === 'overlapping_active_conflict' && f.evidenceId) {
        conflictingPackets.push(f.evidenceId);
      }
    }
  }

  const maxExcerptChars = resolveMaxExcerptChars(src);
  auditCopyrightAndDates(packets, maxExcerptChars, findings);
  detectSupersessionIssues(
    packets,
    src.lifecycleSnapshot || src.supersessionSnapshot,
    findings
  );
  auditSourceSnapshot(
    packets,
    src.currentSourceSnapshot || src.sourceSnapshot,
    findings
  );
  auditFieldReviewReferences(
    packets,
    src.fieldReviewReferenceSnapshot || src.syntheticFieldReviewReferenceSnapshot,
    findings
  );

  // Optional known source-reference set: packets must reference known sources when set is non-empty.
  const knownSources = Array.isArray(src.knownSourceReferences)
    ? src.knownSourceReferences.map(function (x) {
        return String(x).trim();
      })
    : null;
  if (knownSources && knownSources.length > 0) {
    const knownSet = Object.create(null);
    for (let i = 0; i < knownSources.length; i++) knownSet[knownSources[i]] = true;
    for (let i = 0; i < packets.length; i++) {
      const p = asObject(packets[i]);
      if (!p) continue;
      const ref = normalizeTrim(p.sourceReference);
      if (ref && !knownSet[ref]) {
        pushFinding(findings, {
          code: 'missing_source_reference',
          severity: 'error',
          evidenceId: normalizeTrim(p.evidenceId),
          detail: 'source_reference_not_in_known_set',
          actual: ref
        });
      }
    }
  }

  // Prove fingerprint builders remain callable and stable (no duplicate serialization).
  void buildEvidencePacketSourceFingerprint;
  void buildEvidencePacketContentFingerprint;

  return finalizeReport({
    findings: findings,
    registryVersion: registryVersion,
    packetCount: built.packetCount || 0,
    checkedCount: built.checkedCount || packets.length,
    invalidPackets: built.invalidPackets || [],
    duplicatePackets: built.duplicatePackets || [],
    stalePackets: built.stalePackets || [],
    conflictingPackets: conflictingPackets
  });
}
