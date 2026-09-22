/**
 * Plant Visual Registry Activation From Promotion V1
 *
 * Builds a next registry state from:
 * - the QA manifest that was owner-approved,
 * - verified Production R2 promotion results,
 * - the current design asset registry.
 *
 * Pure/local. No R2 writes and no network.
 */
import {
  activateProductionRegistryVariant
} from './plant-visual-promotion-guard-v1.js';
import {
  evaluateManifestRowPromotionReadiness
} from './plant-visual-promotion-readiness-v1.js';

export const PLANT_VISUAL_REGISTRY_ACTIVATION_VERSION =
  'plant-visual-registry-activation-from-promotion-v1';

function text(value) {
  return String(value == null ? '' : value).trim();
}

function productionUrl(key) {
  return '/.netlify/functions/plant-visual-production-asset?key='
    + encodeURIComponent(key);
}

export function activateVerifiedPromotionResults(
  currentRegistry = {},
  manifest = {},
  promotionResult = {}
) {
  const resultRows = Array.isArray(promotionResult?.results) ? promotionResult.results : [];
  const byJob = new Map(resultRows.map((row) => [text(row?.jobId), row]));
  let registry = currentRegistry;
  const activated = [];
  const skipped = [];

  for (const row of Array.isArray(manifest?.rows) ? manifest.rows : []) {
    const promoted = byJob.get(text(row?.jobId));
    if (!promoted || promoted.ok !== true || !text(promoted.productionKey)) {
      skipped.push({
        jobId: row?.jobId || null,
        code: promoted?.code || 'PROMOTION_NOT_VERIFIED'
      });
      continue;
    }

    const readiness = evaluateManifestRowPromotionReadiness(row);
    if (!readiness.ready || !readiness.registryVariant) {
      skipped.push({
        jobId: row.jobId,
        code: readiness.code || 'PROMOTION_READINESS_BLOCKED'
      });
      continue;
    }

    if (
      text(promoted.sha256).toLowerCase() !== text(row.sha256).toLowerCase()
      || Number(promoted.bytes) !== Number(row.bytes)
    ) {
      skipped.push({
        jobId: row.jobId,
        code: 'PROMOTION_RESULT_INTEGRITY_MISMATCH'
      });
      continue;
    }

    const variant = {
      ...readiness.registryVariant,
      file: null,
      url: productionUrl(promoted.productionKey),
      productionObjectKey: promoted.productionKey,
      productionReadbackVerified: true,
      productionPromotionCode: promoted.code,
      productionManifestId: manifest.manifestId || null,
      provenance: {
        ...(readiness.registryVariant.provenance || {}),
        promotionManifestId: manifest.manifestId || null,
        productionObjectKey: promoted.productionKey,
        productionReadbackVerified: true,
        provenanceReconciliation:
          row.provenanceReconciliation || null
      }
    };

    const activation = activateProductionRegistryVariant(registry, variant);
    registry = activation.registry;
    activated.push({
      jobId: row.jobId,
      canonicalSlug: row.canonicalSlug,
      assetId: activation.activeAssetId,
      productionKey: promoted.productionKey,
      url: variant.url,
      changed: activation.changed,
      idempotent: activation.idempotent
    });
  }

  return {
    version: PLANT_VISUAL_REGISTRY_ACTIVATION_VERSION,
    manifestId: manifest.manifestId || null,
    inputPromotionJobs: resultRows.length,
    activatedJobs: activated.length,
    skippedJobs: skipped.length,
    activated,
    skipped,
    registry,
    networkCalls: 0,
    r2Writes: 0
  };
}

export const REGISTRY_ACTIVATION_GOVERNANCE = Object.freeze({
  manifestDriven: true,
  perPlantCodeForbidden: true,
  verifiedPromotionResultRequired: true,
  productionReadbackRequired: true,
  registryActivationAfterR2VerificationOnly: true,
  productionUrlUsesImmutableObjectKey: true
});
