/**
 * Plant Visual Recovered Provenance Reconciliation V1
 *
 * Converts a verified current candidate with mismatched historical evidence
 * into an explicit auditable provenance record for the exact current bytes.
 *
 * Pure/local. No generation, no R2 writes, no registry writes.
 */
export const PLANT_VISUAL_PROVENANCE_RECONCILIATION_VERSION =
  'plant-visual-provenance-reconciliation-v1';

function text(value) {
  return String(value == null ? '' : value).trim();
}

function isPass(value) {
  return text(value).toUpperCase() === 'PASS';
}

export function canReconcileRecoveredCandidate(row = {}) {
  const reasons = [];

  if (row.evidenceMismatch !== true) reasons.push('evidence-mismatch-required');
  if (!text(row.jobId)) reasons.push('job-id-required');
  if (!text(row.canonicalSlug)) reasons.push('canonical-slug-required');
  if (!text(row.objectKey) || !String(row.objectKey).startsWith('candidates/')) {
    reasons.push('candidate-object-key-required');
  }
  if (!/^[a-f0-9]{64}$/i.test(text(row.sha256))) reasons.push('current-sha256-required');
  if (!(Number(row.bytes) > 0)) reasons.push('current-bytes-required');
  if (!text(row.expectedEvidenceSha256)) reasons.push('historical-expected-sha-required');

  const requiredQa = [
    ['technicalQA', row.technicalQA],
    ['framingQA', row.framingQA],
    ['botanicalIdentityQA', row.botanicalIdentityQA],
    ['architectureQA', row.architectureQA],
    ['growthStageQA', row.growthStageQA],
    ['phenologyStateQA', row.phenologyStateQA],
    ['inGardenQA', row.inGardenQA],
    ['ownerVisualQA', row.ownerVisualQA]
  ];
  for (const [field, value] of requiredQa) {
    if (!isPass(value)) reasons.push(field + '-pass-required');
  }

  return Object.freeze({
    ok: reasons.length === 0,
    reasons
  });
}

export function reconcileRecoveredCandidate(row = {}, options = {}) {
  const readiness = canReconcileRecoveredCandidate(row);
  if (!readiness.ok) {
    const err = new Error('RECOVERED_PROVENANCE_RECONCILIATION_BLOCKED');
    err.code = 'RECOVERED_PROVENANCE_RECONCILIATION_BLOCKED';
    err.reasons = readiness.reasons;
    throw err;
  }

  const reconciledAt = text(options.reconciledAt) || null;
  const reviewer = text(options.reviewer) || 'owner-visual-review';

  return Object.freeze({
    version: PLANT_VISUAL_PROVENANCE_RECONCILIATION_VERSION,
    status: 'RECONCILED_CURRENT_BYTES',
    jobId: row.jobId,
    canonicalSlug: row.canonicalSlug,
    currentCandidate: Object.freeze({
      objectKey: row.objectKey,
      sha256: row.sha256,
      bytes: Number(row.bytes)
    }),
    historicalEvidence: Object.freeze({
      expectedSha256: row.expectedEvidenceSha256,
      lineageLabel: text(row.lineage) || null,
      exactCurrentBytesLinkedToHistoricalGeneration: false,
      historicalGenerationIdentityClaimed: false
    }),
    verification: Object.freeze({
      technicalQA: 'PASS',
      framingQA: 'PASS',
      botanicalIdentityQA: 'PASS',
      architectureQA: 'PASS',
      growthStageQA: 'PASS',
      phenologyStateQA: 'PASS',
      inGardenQA: 'PASS',
      ownerVisualQA: 'PASS',
      reviewedInProductionRenderer: true
    }),
    reconciliationReason:
      'The current candidate bytes are fully re-verified and owner-approved, but their exact binary cannot be linked to the earlier generation evidence. Production provenance starts from these verified current bytes without claiming an unproven historical generation identity.',
    reconciledAt,
    reviewer,
    generationProvider: null,
    generationModel: null,
    generationRunId: null,
    generationMetadataKnown: false,
    productionPromotionMayProceed: true
  });
}

export function buildRecoveredProvenanceReconciliation(manifest = {}, options = {}) {
  const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
  const records = [];
  const skipped = [];

  for (const row of rows) {
    if (row.evidenceMismatch !== true) continue;
    const readiness = canReconcileRecoveredCandidate(row);
    if (!readiness.ok) {
      skipped.push({
        jobId: row.jobId || null,
        reasons: readiness.reasons
      });
      continue;
    }
    records.push(reconcileRecoveredCandidate(row, options));
  }

  return Object.freeze({
    contract: PLANT_VISUAL_PROVENANCE_RECONCILIATION_VERSION,
    manifestId: manifest.manifestId || null,
    reconciledAt: text(options.reconciledAt) || null,
    recordCount: records.length,
    blockedCount: skipped.length,
    records,
    blocked: skipped,
    paidAiCalls: 0,
    productionWrites: 0,
    registryWrites: 0
  });
}

export function reconciliationMatchesRow(record = {}, row = {}) {
  return Boolean(
    record
    && record.status === 'RECONCILED_CURRENT_BYTES'
    && record.productionPromotionMayProceed === true
    && text(record.jobId) === text(row.jobId)
    && text(record.currentCandidate?.objectKey) === text(row.objectKey)
    && text(record.currentCandidate?.sha256).toLowerCase() === text(row.sha256).toLowerCase()
    && Number(record.currentCandidate?.bytes) === Number(row.bytes)
  );
}

export const RECOVERED_PROVENANCE_GOVERNANCE = Object.freeze({
  noHistoricalGenerationGuessing: true,
  exactCurrentBytesRequired: true,
  freshQaPassRequired: true,
  ownerVisualPassRequired: true,
  productionPromotionAllowedOnlyAfterReconciliation: true,
  perPlantCodeForbidden: true
});


export function applyProvenanceReconciliationToManifest(manifest = {}, reconciliation = {}) {
  const records = Array.isArray(reconciliation?.records) ? reconciliation.records : [];
  const byJob = new Map(records.map((record) => [text(record?.jobId), record]));
  const rows = (Array.isArray(manifest?.rows) ? manifest.rows : []).map((row) => {
    const record = byJob.get(text(row?.jobId)) || null;
    if (!record) return { ...row };
    if (!reconciliationMatchesRow(record, row)) {
      const err = new Error('PROVENANCE_RECONCILIATION_ROW_MISMATCH');
      err.code = 'PROVENANCE_RECONCILIATION_ROW_MISMATCH';
      err.jobId = row?.jobId || null;
      throw err;
    }
    return {
      ...row,
      provenanceReconciliation: record,
      provenanceStatus: 'RECONCILED_CURRENT_BYTES'
    };
  });

  return {
    ...manifest,
    provenanceReconciliationContract: PLANT_VISUAL_PROVENANCE_RECONCILIATION_VERSION,
    provenanceReconciledAt: reconciliation?.reconciledAt || null,
    rows
  };
}
