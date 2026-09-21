/**
 * Plant Visual QA Manifest V1.
 *
 * Converts batch candidate/evidence rows into one deterministic review manifest.
 * Data only: no network, no generation, no persistence, no registry mutation.
 */
export const PLANT_VISUAL_QA_MANIFEST_VERSION = 'plant-visual-qa-manifest-v1';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function bool(value) {
  return value === true;
}

export function buildPlantVisualQaManifest(input = {}) {
  const manifestId = asText(input.manifestId);
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(manifestId)) {
    const err = new Error('QA_MANIFEST_ID_INVALID');
    err.code = 'QA_MANIFEST_ID_INVALID';
    throw err;
  }

  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const qaRows = Array.isArray(input.qaRows) ? input.qaRows : [];
  const qaByJob = new Map(qaRows.map((row) => [asText(row?.jobId), row]));

  const rows = candidates.map((candidate) => {
    const jobId = asText(candidate?.jobId);
    const qa = qaByJob.get(jobId) || {};
    const technicalQA = asText(qa.technicalQA || qa.technicalQa?.result || 'UNKNOWN').toUpperCase();
    const framingQA = asText(qa.framingQA || qa.framingQa?.result || 'UNKNOWN').toUpperCase();
    const botanicalIdentityQA = asText(qa.botanicalIdentityQA || 'OWNER_REVIEW_REQUIRED').toUpperCase();
    const architectureQA = asText(qa.architectureQA || 'OWNER_REVIEW_REQUIRED').toUpperCase();
    const growthStageQA = asText(qa.growthStageQA || 'OWNER_REVIEW_REQUIRED').toUpperCase();
    const phenologyStateQA = asText(qa.phenologyStateQA || 'OWNER_REVIEW_REQUIRED').toUpperCase();
    const inGardenQA = asText(qa.inGardenQA || 'OWNER_REVIEW_REQUIRED').toUpperCase();

    const ownerReviewRequired =
      technicalQA !== 'PASS'
      || framingQA !== 'PASS'
      || botanicalIdentityQA !== 'PASS'
      || architectureQA !== 'PASS'
      || growthStageQA !== 'PASS'
      || phenologyStateQA !== 'PASS'
      || inGardenQA !== 'PASS'
      || bool(candidate.evidenceMismatch);

    return Object.freeze({
      jobId,
      canonicalSlug: asText(qa.canonicalSlug || candidate.canonicalSlug),
      displayName: asText(qa.displayName || candidate.displayName) || null,
      scientific: asText(qa.scientific || candidate.scientific) || null,
      visualForm: asText(qa.visualForm || candidate.visualForm) || null,
      architectureMode: asText(qa.architectureMode || candidate.architectureMode) || null,
      growthStage: asText(qa.growthStage || candidate.growthStage) || 'unspecified',
      phenology: asText(qa.phenology || qa.phenologyState || candidate.phenology || candidate.phenologyState) || 'vegetative',
      objectKey: asText(candidate.objectKey) || null,
      bytes: Number(candidate.bytes || qa.bytes || 0) || null,
      sha256: asText(candidate.sha256 || qa.sha256) || null,
      lineage: asText(candidate.lineage) || null,
      sourceStatus: asText(qa.sourceStatus || candidate.status) || 'UNKNOWN',
      evidenceMismatch: bool(candidate.evidenceMismatch),
      expectedEvidenceSha256: asText(candidate.expectedEvidenceSha256) || null,
      technicalQA,
      framingQA,
      botanicalIdentityQA,
      architectureQA,
      growthStageQA,
      phenologyStateQA,
      inGardenQA,
      technicalMetrics: qa.technicalMetrics || qa.technicalQa?.metrics || null,
      sizeAuthorityPlan: qa.sizeAuthorityPlan || candidate.sizeAuthorityPlan || null,
      ownerReviewRequired,
      productionApproved: false
    });
  });

  const jobIds = new Set();
  for (const row of rows) {
    if (!row.jobId || jobIds.has(row.jobId)) {
      const err = new Error('QA_MANIFEST_DUPLICATE_OR_MISSING_JOB_ID');
      err.code = 'QA_MANIFEST_DUPLICATE_OR_MISSING_JOB_ID';
      throw err;
    }
    jobIds.add(row.jobId);
    if (!row.objectKey || !String(row.objectKey).startsWith('candidates/')) {
      const err = new Error('QA_MANIFEST_CANDIDATE_OBJECT_KEY_REQUIRED');
      err.code = 'QA_MANIFEST_CANDIDATE_OBJECT_KEY_REQUIRED';
      err.jobId = row.jobId;
      throw err;
    }
    if (!row.sha256) {
      const err = new Error('QA_MANIFEST_SHA_REQUIRED');
      err.code = 'QA_MANIFEST_SHA_REQUIRED';
      err.jobId = row.jobId;
      throw err;
    }
  }

  return Object.freeze({
    contract: PLANT_VISUAL_QA_MANIFEST_VERSION,
    manifestId,
    generatedAt: input.generatedAt || null,
    batchId: asText(input.batchId || manifestId),
    bucket: asText(input.bucket || 'cruvit-plant-visual-candidates'),
    bounded: true,
    totalJobs: rows.length,
    ownerReviewJobs: rows.filter((row) => row.ownerReviewRequired).length,
    automaticPassJobs: rows.filter((row) => !row.ownerReviewRequired).length,
    paidAiCalls: Number(input.paidAiCalls || 0),
    productionWrites: 0,
    registryWrites: 0,
    rows
  });
}

export const QA_MANIFEST_GOVERNANCE = Object.freeze({
  generatedFromBatchData: true,
  perPlantCodeChangesForbidden: true,
  candidateObjectOnly: true,
  productionWrites: 0,
  registryWrites: 0,
  ownerReviewDefault: 'exceptions-only'
});
