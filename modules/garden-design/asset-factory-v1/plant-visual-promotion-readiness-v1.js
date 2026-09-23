/**
 * Plant Visual Promotion Readiness V1
 *
 * Pure/local readiness evaluation for a QA manifest.
 * No R2 writes. No registry writes. No network.
 */
import {
  evaluatePlantVisualCandidate,
  buildApprovedRegistryVariant
} from './plant-visual-production-pipeline-v1.js';
import {
  buildPlantVisualProductionObjectKey,
  validatePlantVisualPromotionStorageInput
} from './plant-visual-object-storage-v1.js';
import {
  validateProductionRegistryVariant
} from './plant-visual-promotion-guard-v1.js';
import {
  reconciliationMatchesRow
} from './plant-visual-provenance-reconciliation-v1.js';

export const PLANT_VISUAL_PROMOTION_READINESS_VERSION = 'plant-visual-promotion-readiness-v1';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function qaObject(result, metrics = null) {
  return metrics ? { result, metrics } : { result };
}

function sizeAuthorityPromotionReady(row = {}) {
  const plan = row.sizeAuthorityPlan;
  // Pre-size-authority pilot manifests are grandfathered; all newer batch
  // manifests carry an explicit plan and are enforced below.
  if (!plan) return { ok: true, code: 'SIZE_AUTHORITY_LEGACY_MANIFEST' };
  const state = String(plan.state || '').trim().toUpperCase();
  if (state === 'SIZE_AUTHORITY_READY') {
    return { ok: true, code: 'SIZE_AUTHORITY_READY' };
  }
  if (state === 'SIZE_AUTHORITY_PARTIAL') {
    return {
      ok: true,
      code: 'SIZE_AUTHORITY_PARTIAL_EXPLICIT',
      reason: 'Partial botanical size authority is explicit and may be overridden by stronger future evidence; it is not meter-complete truth.'
    };
  }
  return {
    ok: false,
    code: 'SIZE_AUTHORITY_PROMOTION_BLOCKED',
    state: state || 'SIZE_AUTHORITY_NOT_EVALUATED',
    reasonCodes: Array.isArray(plan.reasonCodes) ? plan.reasonCodes : [],
    reason: 'Promotion requires explicit READY or PARTIAL size authority for manifests that declare sizeAuthorityPlan.'
  };
}

function provenanceReady(row = {}) {
  if (row.evidenceMismatch === true) {
    if (reconciliationMatchesRow(row.provenanceReconciliation, row)) {
      return {
        ok: true,
        code: 'PROVENANCE_RECONCILED_CURRENT_BYTES',
        reconciliationVersion: row.provenanceReconciliation.version,
        reason:
          'Historical generation evidence is not asserted for the current binary. Promotion relies on the reconciled exact current objectKey, SHA, byte count and fresh QA evidence.'
      };
    }
    return {
      ok: false,
      code: 'PROVENANCE_RECONCILIATION_REQUIRED',
      reason:
        'Current candidate bytes differ from the earlier generation evidence. Fresh QA passes the current bytes, but immutable production promotion requires reconciled provenance for those exact bytes.'
    };
  }
  return { ok: true, code: 'PROVENANCE_READY' };
}

export function evaluateManifestRowPromotionReadiness(row = {}) {
  const provenance = provenanceReady(row);
  const sizeAuthority = sizeAuthorityPromotionReady(row);

  const candidate = {
    assetId:
      row.assetId
      || (row.jobId + '__' + String(row.sha256 || '').slice(0, 12)),
    job: {
      jobId: row.jobId,
      canonicalSlug: row.canonicalSlug,
      scientific: row.scientific,
      identityScope: row.identityScope || null,
      visualForm: row.visualForm,
      architectureMode: row.architectureMode,
      growthStage: row.growthStage,
      phenology: row.phenology,
      season: row.season || 'unknown'
    },
    technicalQa: qaObject(row.technicalQA, row.technicalMetrics || {}),
    framingQa: qaObject(row.framingQA),
    botanicalIdentityQa: qaObject(row.botanicalIdentityQA),
    architectureQa: qaObject(row.architectureQA),
    growthStageQa: qaObject(row.growthStageQA),
    phenologyStateQa: qaObject(row.phenologyStateQA),
    inGardenQa: qaObject(row.inGardenQA),
    ownerVisualQa: qaObject(row.ownerVisualQA || 'UNKNOWN'),
    presentationSizing:
      row.qaRendererInput?.ok === true && Number(row.qaRendererInput.baseWidthPx) > 0
        ? {
            status: 'CALIBRATED_BASELINE',
            baseWidthPx: Number(row.qaRendererInput.baseWidthPx),
            source: 'production-renderer-qa-input',
            rendererSource: row.qaRendererInput.source || null,
            reviewedInProductionRenderer: true,
            scale: Number(row.qaRendererInput.scale || 1),
            authorityUserResized: row.qaRendererInput.authorityUserResized === true,
            physicalScaleAuthorityMayOverride: true
          }
        : undefined,
    bytes: row.bytes,
    sha256: row.sha256,
    file: row.objectKey,
    runId: row.lineage || null,
    generationRunId: row.lineage || null
  };

  const decision = evaluatePlantVisualCandidate(candidate, {
    autoApprovalEnabled: false,
    calibratedAutoApproval: false
  });

  if (!sizeAuthority.ok) {
    return Object.freeze({
      version: PLANT_VISUAL_PROMOTION_READINESS_VERSION,
      jobId: row.jobId,
      canonicalSlug: row.canonicalSlug,
      ready: false,
      code: sizeAuthority.code,
      decision,
      provenance,
      sizeAuthority,
      productionKey: null,
      registryVariant: null,
      storageValidation: null,
      registryValidation: null
    });
  }

  if (!provenance.ok) {
    return Object.freeze({
      version: PLANT_VISUAL_PROMOTION_READINESS_VERSION,
      jobId: row.jobId,
      canonicalSlug: row.canonicalSlug,
      ready: false,
      code: provenance.code,
      decision,
      provenance,
      sizeAuthority,
      productionKey: null,
      registryVariant: null,
      storageValidation: null,
      registryValidation: null
    });
  }

  if (decision.productionApproved !== true) {
    return Object.freeze({
      version: PLANT_VISUAL_PROMOTION_READINESS_VERSION,
      jobId: row.jobId,
      canonicalSlug: row.canonicalSlug,
      ready: false,
      code: 'MANDATORY_GATES_NOT_APPROVED',
      decision,
      provenance,
      productionKey: null,
      registryVariant: null,
      storageValidation: null,
      registryValidation: null
    });
  }

  const productionKey = buildPlantVisualProductionObjectKey({
    canonicalSlug: row.canonicalSlug,
    growthStage: row.growthStage,
    architectureMode: row.architectureMode || row.visualForm || 'default',
    phenology: row.phenology,
    assetId:
      row.assetId
      || (row.jobId + '__' + String(row.sha256 || '').slice(0, 12)),
    sha256: row.sha256
  });

  const variant = buildApprovedRegistryVariant({
    ...candidate,
    file: productionKey,
    url: null
  }, decision);

  const storageValidation = validatePlantVisualPromotionStorageInput({
    ...variant,
    productionApproved: true
  });
  const registryValidation = validateProductionRegistryVariant(variant);

  return Object.freeze({
    version: PLANT_VISUAL_PROMOTION_READINESS_VERSION,
    jobId: row.jobId,
    canonicalSlug: row.canonicalSlug,
    ready: storageValidation.ok && registryValidation.ok,
    code:
      storageValidation.ok && registryValidation.ok
        ? 'PROMOTION_READY'
        : 'PROMOTION_GUARD_BLOCKED',
    decision,
    provenance,
    sizeAuthority,
    productionKey,
    registryVariant: variant,
    storageValidation,
    registryValidation
  });
}

export function evaluateQaManifestPromotionReadiness(manifest = {}) {
  const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
  const evaluations = rows.map(evaluateManifestRowPromotionReadiness);
  return Object.freeze({
    version: PLANT_VISUAL_PROMOTION_READINESS_VERSION,
    manifestId: manifest.manifestId || null,
    totalJobs: evaluations.length,
    readyJobs: evaluations.filter((row) => row.ready).length,
    blockedJobs: evaluations.filter((row) => !row.ready).length,
    productionWrites: 0,
    registryWrites: 0,
    evaluations
  });
}

export const PROMOTION_READINESS_GOVERNANCE = Object.freeze({
  manifestDriven: true,
  perPlantCodeForbidden: true,
  evidenceMismatchBlocksPromotionUntilReconciled: true,
  explicitSizeAuthorityRequiredForNewBatchManifests: true,
  allowedDeclaredSizeAuthorityStates: ['SIZE_AUTHORITY_READY','SIZE_AUTHORITY_PARTIAL'],
  productionWrites: 0,
  registryWrites: 0
});
