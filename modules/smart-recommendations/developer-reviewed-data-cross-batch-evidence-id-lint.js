/**
 * Cruvit — Smart Recommendations developer cross-batch Evidence Packet ID collision lint
 * ---------------------------------------------------------------------------
 * Pure, developer-only, read-only identity inventory over already-parsed
 * evidence-packet wrappers from known reviewed-data batches.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-parsed objects only; never fetches JSON itself.
 *  - Does not mutate batches, Registries, catalog, needsReview, or eligibility.
 *  - Does not import product runtime, GOS, or v1b.
 *  - Does not judge horticultural truth, preference vs tolerance, or source quality.
 */

export const SR_CROSS_BATCH_EVIDENCE_ID_LINT_VERSION =
  '0.1.0-sr-cross-batch-evidence-id-lint';

export const SR_CROSS_BATCH_EVIDENCE_ID_LINT_CAPABILITY =
  'explicit_developer_cross_batch_evidence_id_collision_lint';

export const SR_CROSS_BATCH_EVIDENCE_ID_LINT_KNOWN_BATCH_IDS = Object.freeze([
  'lavender-sun-preference-v1',
  'lavender-water-preference-v1',
  'rosemary-sun-preference-v1',
  'rosemary-water-preference-v1'
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

function buildDescriptor() {
  return freezeDeep({
    lintVersion: SR_CROSS_BATCH_EVIDENCE_ID_LINT_VERSION,
    capability: SR_CROSS_BATCH_EVIDENCE_ID_LINT_CAPABILITY,
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
    knownBatchIds: SR_CROSS_BATCH_EVIDENCE_ID_LINT_KNOWN_BATCH_IDS.slice(),
    writesArtifacts: false,
    horticulturalAuthority: false,
    preferenceToleranceAuthority: false,
    overlayAuthority: false,
    productAuthority: false
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperCrossBatchEvidenceIdLintDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(parts) {
  return [
    SR_CROSS_BATCH_EVIDENCE_ID_LINT_VERSION,
    parts.valid ? '1' : '0',
    String(parts.batchesScanned || 0),
    String(parts.evidenceIdsScanned || 0),
    String(parts.uniqueEvidenceIdCount || 0),
    String(parts.collisionCount || 0),
    (parts.collisionEvidenceIds || []).slice().sort().join(','),
    (parts.batchIdsScanned || []).slice().sort().join(',')
  ].join('|');
}

/**
 * @param {object} input
 * @param {Array<{batchId:string, evidencePacketWrapper:object}>} input.batches
 * @returns {object} frozen lint report
 */
export function lintSmartRecDeveloperCrossBatchEvidencePacketIds(input) {
  const src = asObject(input) || {};
  const batchesIn = Array.isArray(src.batches) ? src.batches : null;

  const ownership = Object.create(null);
  const batchIdsScanned = [];
  const findings = [];
  let evidenceIdsScanned = 0;

  if (!batchesIn || batchesIn.length === 0) {
    const empty = {
      valid: false,
      lintVersion: SR_CROSS_BATCH_EVIDENCE_ID_LINT_VERSION,
      capability: SR_CROSS_BATCH_EVIDENCE_ID_LINT_CAPABILITY,
      batchesScanned: 0,
      batchIdsScanned: [],
      evidenceIdsScanned: 0,
      uniqueEvidenceIdCount: 0,
      collisionCount: 1,
      collisions: [
        {
          evidenceId: '__invalid_input__',
          batchIds: [],
          occurrenceCount: 0
        }
      ],
      collisionEvidenceIds: ['__invalid_input__'],
      ownershipByEvidenceId: {},
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
    const batchId = isNonEmptyString(entry.batchId) ? String(entry.batchId).trim() : '';
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
    if (isNonEmptyString(wrapper.batchId) && String(wrapper.batchId).trim() !== batchId) {
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
      evidenceIdsScanned += 1;
      if (!ownership[evidenceId]) ownership[evidenceId] = [];
      ownership[evidenceId].push(batchId);
    }
  }

  const uniqueIds = Object.keys(ownership).sort();
  const collisions = [];
  for (let u = 0; u < uniqueIds.length; u++) {
    const eid = uniqueIds[u];
    const owners = ownership[eid].slice().sort();
    const distinctBatches = [];
    for (let o = 0; o < owners.length; o++) {
      if (distinctBatches.indexOf(owners[o]) < 0) distinctBatches.push(owners[o]);
    }
    // Collision: appears in more than one batch, or repeated within inventory.
    if (owners.length > 1) {
      collisions.push({
        evidenceId: eid,
        batchIds: distinctBatches.slice().sort(),
        occurrenceCount: owners.length
      });
      findings.push({
        code: 'evidence_id_collision',
        severity: 'error',
        detail: eid,
        batchIds: distinctBatches.slice().sort(),
        occurrenceCount: owners.length
      });
    }
  }

  collisions.sort(function (a, b) {
    return a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0;
  });

  const ownershipFrozen = {};
  for (let u = 0; u < uniqueIds.length; u++) {
    const eid = uniqueIds[u];
    ownershipFrozen[eid] = ownership[eid].slice().sort();
  }

  const batchIdsSorted = batchIdsScanned.slice().sort();
  const hardCodes = {
    invalid_input: true,
    invalid_batch_entry: true,
    batch_id_mismatch: true,
    missing_evidence_id: true,
    evidence_id_collision: true
  };
  let valid = collisions.length === 0;
  for (let f = 0; f < findings.length; f++) {
    if (hardCodes[findings[f].code]) {
      valid = false;
      break;
    }
  }

  const report = {
    valid: valid,
    lintVersion: SR_CROSS_BATCH_EVIDENCE_ID_LINT_VERSION,
    capability: SR_CROSS_BATCH_EVIDENCE_ID_LINT_CAPABILITY,
    batchesScanned: batchIdsScanned.length,
    batchIdsScanned: batchIdsSorted,
    evidenceIdsScanned: evidenceIdsScanned,
    uniqueEvidenceIdCount: uniqueIds.length,
    collisionCount: collisions.length,
    collisions: collisions,
    collisionEvidenceIds: collisions.map(function (c) {
      return c.evidenceId;
    }),
    ownershipByEvidenceId: ownershipFrozen,
    findings: findings,
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  report.deterministicOwnershipKey = stableSerialize(ownershipFrozen);
  return freezeDeep(report);
}
