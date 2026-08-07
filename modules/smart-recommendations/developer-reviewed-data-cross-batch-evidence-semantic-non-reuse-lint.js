/**
 * Cruvit — Smart Recommendations developer cross-batch Evidence semantic
 * non-reuse warning lint
 * ---------------------------------------------------------------------------
 * Pure, developer-only, read-only warning inventory over already-parsed
 * evidence-packet wrappers from known reviewed-data batches.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-parsed objects only; never fetches JSON itself.
 *  - Does not mutate batches, Registries, catalog, needsReview, or eligibility.
 *  - Does not import product runtime, GOS, or v1b.
 *  - Does not judge horticultural truth, preference vs tolerance, or source quality.
 *  - Warning-only in v1: semantic warnings never hard-fail the report.
 */

export const SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_VERSION =
  '0.1.0-sr-cross-batch-evidence-semantic-non-reuse-lint';

export const SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_CAPABILITY =
  'explicit_developer_cross_batch_evidence_semantic_non_reuse_warning_lint';

export const SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_MODE = 'warning_only';

export const SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_KNOWN_BATCH_IDS =
  Object.freeze([
    'lavender-sun-preference-v1',
    'lavender-water-preference-v1',
    'rosemary-sun-preference-v1',
    'rosemary-water-preference-v1'
  ]);

export const SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_WARNING_CODES =
  Object.freeze([
    'same_source_reference_across_batches',
    'same_source_identity_across_batches',
    'same_source_reference_across_canonical_key',
    'same_source_reference_across_field',
    'same_url_different_normalized_claim',
    'exact_duplicate_normalized_claim',
    'same_publisher_title_different_url',
    'exact_duplicate_content_fingerprint'
  ]);

function freezeDeep(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  seen = seen || new WeakSet();
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) freezeDeep(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) freezeDeep(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function asObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map(function (k) {
        return JSON.stringify(k) + ':' + stableSerialize(value[k]);
      })
      .join(',') +
    '}'
  );
}

function uniqueSorted(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (out.indexOf(v) < 0) out.push(v);
  }
  return out.sort();
}

function buildDescriptor() {
  return freezeDeep({
    lintVersion: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_VERSION,
    capability: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_CAPABILITY,
    mode: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_MODE,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    catalogMutation: false,
    evidenceMutation: false,
    fieldReviewMutation: false,
    profileMutation: false,
    needsReviewMutation: false,
    persistence: false,
    network: false,
    automaticExecution: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    knownBatchIds:
      SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_KNOWN_BATCH_IDS.slice(),
    warningCodes: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_WARNING_CODES.slice(),
    writesArtifacts: false,
    hardFail: false,
    horticulturalAuthority: false,
    preferenceToleranceAuthority: false,
    overlayAuthority: false,
    productAuthority: false
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperCrossBatchEvidenceSemanticNonReuseLintDescriptor() {
  return DESCRIPTOR;
}

function emptyWarningCounts() {
  const counts = {};
  for (
    let i = 0;
    i < SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_WARNING_CODES.length;
    i++
  ) {
    counts[SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_WARNING_CODES[i]] = 0;
  }
  return counts;
}

function buildSummaryFingerprint(parts) {
  const counts = parts.warningCountsByCode || {};
  const codeParts = SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_WARNING_CODES.map(
    function (code) {
      return code + '=' + String(counts[code] || 0);
    }
  ).join(',');
  return [
    SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_VERSION,
    SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_MODE,
    parts.valid ? '1' : '0',
    parts.hardFail ? '1' : '0',
    String(parts.batchesScanned || 0),
    String(parts.evidencePacketsScanned || 0),
    String(parts.warningCount || 0),
    String(parts.allowedSamePlantMultiFieldSourceReuseCount || 0),
    String(parts.exactDuplicateNormalizedClaimCount || 0),
    String(parts.crossPlantSourceReferenceReuseCount || 0),
    codeParts,
    (parts.batchIdsScanned || []).slice().sort().join(',')
  ].join('|');
}

function pushWarning(warnings, entry) {
  warnings.push({
    code: entry.code,
    severity: 'warning',
    evidenceIds: uniqueSorted(entry.evidenceIds || []),
    batchIds: uniqueSorted(entry.batchIds || []),
    canonicalKeys: uniqueSorted(entry.canonicalKeys || []),
    fields: uniqueSorted(entry.fields || []),
    sourceReference: entry.sourceReference || null,
    sourceIdentity: entry.sourceIdentity || null,
    publisher: entry.publisher || null,
    sourceTitle: entry.sourceTitle || null,
    normalizedClaim: entry.normalizedClaim || null,
    contentFingerprint: entry.contentFingerprint || null,
    detail: entry.detail || ''
  });
}

function groupBy(packets, keyFn) {
  const map = Object.create(null);
  for (let i = 0; i < packets.length; i++) {
    const key = keyFn(packets[i]);
    if (!isNonEmptyString(key)) continue;
    if (!map[key]) map[key] = [];
    map[key].push(packets[i]);
  }
  return map;
}

/**
 * @param {object} input
 * @param {Array<{batchId:string, evidencePacketWrapper:object}>} input.batches
 * @returns {object} frozen lint report
 */
export function lintSmartRecDeveloperCrossBatchEvidenceSemanticNonReuse(input) {
  const src = asObject(input) || {};
  const batchesIn = Array.isArray(src.batches) ? src.batches : null;
  const findings = [];
  const warnings = [];
  const batchIdsScanned = [];
  const packets = [];

  if (!batchesIn || batchesIn.length === 0) {
    const empty = {
      valid: false,
      hardFail: false,
      lintVersion: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_VERSION,
      capability: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_CAPABILITY,
      mode: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_MODE,
      developerOnly: true,
      batchesScanned: 0,
      batchIdsScanned: [],
      evidencePacketsScanned: 0,
      warnings: [],
      warningCount: 0,
      warningCountsByCode: emptyWarningCounts(),
      allowedSamePlantMultiFieldSourceReuseCount: 0,
      exactDuplicateNormalizedClaimCount: 0,
      crossPlantSourceReferenceReuseCount: 0,
      findings: [
        {
          code: 'invalid_input',
          severity: 'error',
          detail: 'batches_required'
        }
      ],
      summaryFingerprint: ''
    };
    empty.summaryFingerprint = buildSummaryFingerprint(empty);
    return freezeDeep(empty);
  }

  for (let i = 0; i < batchesIn.length; i++) {
    const entry = asObject(batchesIn[i]) || {};
    const batchId = isNonEmptyString(entry.batchId)
      ? String(entry.batchId).trim()
      : '';
    const wrapper = asObject(entry.evidencePacketWrapper);
    if (!batchId) {
      findings.push({
        code: 'invalid_batch_entry',
        severity: 'error',
        detail: 'missing_batchId',
        index: i
      });
      continue;
    }
    if (!wrapper) {
      findings.push({
        code: 'invalid_batch_entry',
        severity: 'error',
        detail: 'missing_evidencePacketWrapper',
        batchId: batchId
      });
      continue;
    }
    if (
      isNonEmptyString(wrapper.batchId) &&
      String(wrapper.batchId).trim() !== batchId
    ) {
      findings.push({
        code: 'batch_id_mismatch',
        severity: 'error',
        detail: 'wrapper_batchId',
        batchId: batchId,
        actual: String(wrapper.batchId).trim()
      });
    }
    batchIdsScanned.push(batchId);
    const records = Array.isArray(wrapper.records) ? wrapper.records : [];
    for (let r = 0; r < records.length; r++) {
      const rec = asObject(records[r]) || {};
      const evidenceId = isNonEmptyString(rec.evidenceId)
        ? String(rec.evidenceId).trim()
        : '';
      if (!evidenceId) {
        findings.push({
          code: 'missing_evidence_id',
          severity: 'error',
          detail: 'records[' + r + ']',
          batchId: batchId
        });
        continue;
      }
      packets.push({
        batchId: batchId,
        evidenceId: evidenceId,
        canonicalKey: isNonEmptyString(rec.canonicalKey)
          ? String(rec.canonicalKey).trim()
          : '',
        field: isNonEmptyString(rec.field) ? String(rec.field).trim() : '',
        sourceReference: isNonEmptyString(rec.sourceReference)
          ? String(rec.sourceReference).trim()
          : '',
        sourceIdentity: isNonEmptyString(rec.sourceIdentity)
          ? String(rec.sourceIdentity).trim()
          : '',
        publisher: isNonEmptyString(rec.publisher)
          ? String(rec.publisher).trim()
          : '',
        sourceTitle: isNonEmptyString(rec.sourceTitle)
          ? String(rec.sourceTitle).trim()
          : '',
        normalizedClaim: isNonEmptyString(rec.normalizedClaim)
          ? String(rec.normalizedClaim).trim()
          : '',
        contentFingerprint: isNonEmptyString(rec.contentFingerprint)
          ? String(rec.contentFingerprint).trim()
          : ''
      });
    }
  }

  const bySourceRef = groupBy(packets, function (p) {
    return p.sourceReference;
  });
  const bySourceIdentity = groupBy(packets, function (p) {
    return p.sourceIdentity;
  });
  const byClaim = groupBy(packets, function (p) {
    return p.normalizedClaim;
  });
  const byFingerprint = groupBy(packets, function (p) {
    return p.contentFingerprint;
  });
  const byPublisherTitle = groupBy(packets, function (p) {
    if (!p.publisher || !p.sourceTitle) return '';
    return p.publisher + '||' + p.sourceTitle;
  });

  let allowedSamePlantMultiFieldSourceReuseCount = 0;
  let crossPlantSourceReferenceReuseCount = 0;
  let exactDuplicateNormalizedClaimCount = 0;

  const sourceRefKeys = Object.keys(bySourceRef).sort();
  for (let s = 0; s < sourceRefKeys.length; s++) {
    const url = sourceRefKeys[s];
    const group = bySourceRef[url];
    if (group.length < 2) continue;
    const batchIds = uniqueSorted(
      group.map(function (p) {
        return p.batchId;
      })
    );
    const canonicalKeys = uniqueSorted(
      group
        .map(function (p) {
          return p.canonicalKey;
        })
        .filter(Boolean)
    );
    const fields = uniqueSorted(
      group
        .map(function (p) {
          return p.field;
        })
        .filter(Boolean)
    );
    const claims = uniqueSorted(
      group
        .map(function (p) {
          return p.normalizedClaim;
        })
        .filter(Boolean)
    );
    const evidenceIds = group.map(function (p) {
      return p.evidenceId;
    });

    if (batchIds.length > 1) {
      pushWarning(warnings, {
        code: 'same_source_reference_across_batches',
        evidenceIds: evidenceIds,
        batchIds: batchIds,
        canonicalKeys: canonicalKeys,
        fields: fields,
        sourceReference: url,
        detail: url
      });
    }
    if (canonicalKeys.length > 1) {
      crossPlantSourceReferenceReuseCount += 1;
      pushWarning(warnings, {
        code: 'same_source_reference_across_canonical_key',
        evidenceIds: evidenceIds,
        batchIds: batchIds,
        canonicalKeys: canonicalKeys,
        fields: fields,
        sourceReference: url,
        detail: url
      });
    }
    if (fields.length > 1) {
      pushWarning(warnings, {
        code: 'same_source_reference_across_field',
        evidenceIds: evidenceIds,
        batchIds: batchIds,
        canonicalKeys: canonicalKeys,
        fields: fields,
        sourceReference: url,
        detail: url
      });
    }
    if (claims.length > 1) {
      pushWarning(warnings, {
        code: 'same_url_different_normalized_claim',
        evidenceIds: evidenceIds,
        batchIds: batchIds,
        canonicalKeys: canonicalKeys,
        fields: fields,
        sourceReference: url,
        detail: url
      });
    }
    if (
      canonicalKeys.length === 1 &&
      fields.length > 1 &&
      claims.length === group.length
    ) {
      allowedSamePlantMultiFieldSourceReuseCount += 1;
    } else if (canonicalKeys.length === 1 && fields.length > 1) {
      // Still count as allowed same-plant multi-field reuse when one plant spans fields.
      allowedSamePlantMultiFieldSourceReuseCount += 1;
    }
  }

  const identityKeys = Object.keys(bySourceIdentity).sort();
  for (let i = 0; i < identityKeys.length; i++) {
    const identity = identityKeys[i];
    const group = bySourceIdentity[identity];
    if (group.length < 2) continue;
    const batchIds = uniqueSorted(
      group.map(function (p) {
        return p.batchId;
      })
    );
    if (batchIds.length > 1) {
      pushWarning(warnings, {
        code: 'same_source_identity_across_batches',
        evidenceIds: group.map(function (p) {
          return p.evidenceId;
        }),
        batchIds: batchIds,
        canonicalKeys: group.map(function (p) {
          return p.canonicalKey;
        }),
        fields: group.map(function (p) {
          return p.field;
        }),
        sourceIdentity: identity,
        sourceReference: group[0].sourceReference || null,
        detail: identity
      });
    }
  }

  const claimKeys = Object.keys(byClaim).sort();
  for (let c = 0; c < claimKeys.length; c++) {
    const claim = claimKeys[c];
    const group = byClaim[claim];
    if (group.length < 2) continue;
    exactDuplicateNormalizedClaimCount += 1;
    pushWarning(warnings, {
      code: 'exact_duplicate_normalized_claim',
      evidenceIds: group.map(function (p) {
        return p.evidenceId;
      }),
      batchIds: group.map(function (p) {
        return p.batchId;
      }),
      canonicalKeys: group.map(function (p) {
        return p.canonicalKey;
      }),
      fields: group.map(function (p) {
        return p.field;
      }),
      normalizedClaim: claim,
      detail: claim
    });
  }

  const pubKeys = Object.keys(byPublisherTitle).sort();
  for (let p = 0; p < pubKeys.length; p++) {
    const key = pubKeys[p];
    const group = byPublisherTitle[key];
    const urls = uniqueSorted(
      group
        .map(function (item) {
          return item.sourceReference;
        })
        .filter(Boolean)
    );
    if (urls.length < 2) continue;
    const parts = key.split('||');
    pushWarning(warnings, {
      code: 'same_publisher_title_different_url',
      evidenceIds: group.map(function (item) {
        return item.evidenceId;
      }),
      batchIds: group.map(function (item) {
        return item.batchId;
      }),
      canonicalKeys: group.map(function (item) {
        return item.canonicalKey;
      }),
      fields: group.map(function (item) {
        return item.field;
      }),
      publisher: parts[0] || null,
      sourceTitle: parts.slice(1).join('||') || null,
      detail: key
    });
  }

  const fpKeys = Object.keys(byFingerprint).sort();
  for (let f = 0; f < fpKeys.length; f++) {
    const fp = fpKeys[f];
    const group = byFingerprint[fp];
    if (group.length < 2) continue;
    pushWarning(warnings, {
      code: 'exact_duplicate_content_fingerprint',
      evidenceIds: group.map(function (p) {
        return p.evidenceId;
      }),
      batchIds: group.map(function (p) {
        return p.batchId;
      }),
      canonicalKeys: group.map(function (p) {
        return p.canonicalKey;
      }),
      fields: group.map(function (p) {
        return p.field;
      }),
      contentFingerprint: fp,
      detail: fp
    });
  }

  warnings.sort(function (a, b) {
    if (a.code < b.code) return -1;
    if (a.code > b.code) return 1;
    const ad = String(a.detail || '');
    const bd = String(b.detail || '');
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    return 0;
  });

  const warningCountsByCode = emptyWarningCounts();
  for (let w = 0; w < warnings.length; w++) {
    const code = warnings[w].code;
    if (warningCountsByCode[code] == null) warningCountsByCode[code] = 0;
    warningCountsByCode[code] += 1;
  }

  // Structural input findings do not flip hardFail; they only mark valid false.
  // Semantic warnings never flip valid or hardFail in v1.
  let valid = findings.length === 0;
  for (let f = 0; f < findings.length; f++) {
    if (findings[f].severity === 'error') {
      valid = false;
      break;
    }
  }

  const report = {
    valid: valid,
    hardFail: false,
    lintVersion: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_VERSION,
    capability: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_CAPABILITY,
    mode: SR_CROSS_BATCH_EVIDENCE_SEMANTIC_NON_REUSE_LINT_MODE,
    developerOnly: true,
    batchesScanned: batchIdsScanned.length,
    batchIdsScanned: uniqueSorted(batchIdsScanned),
    evidencePacketsScanned: packets.length,
    warnings: warnings,
    warningCount: warnings.length,
    warningCountsByCode: warningCountsByCode,
    allowedSamePlantMultiFieldSourceReuseCount:
      allowedSamePlantMultiFieldSourceReuseCount,
    exactDuplicateNormalizedClaimCount: exactDuplicateNormalizedClaimCount,
    crossPlantSourceReferenceReuseCount: crossPlantSourceReferenceReuseCount,
    findings: findings,
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  report.deterministicWarningKey = stableSerialize(
    warnings.map(function (w) {
      return {
        code: w.code,
        detail: w.detail,
        evidenceIds: w.evidenceIds
      };
    })
  );
  return freezeDeep(report);
}
