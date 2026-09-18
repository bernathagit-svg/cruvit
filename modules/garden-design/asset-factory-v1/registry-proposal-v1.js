/**
 * Proposed approved-asset metadata. Does not write the live Design Asset Registry.
 */
export const REGISTRY_RECORD_VERSION = 'design-asset-factory-record-v1';
export const STORAGE_PLAN = Object.freeze({
  binaries: 'object-storage-cdn',
  bucket: 'catalog-design-assets',
  metadata: 'catalog_design_assets plus factory job store',
  repoAssets: 'calibration-and-launch-critical-only',
  userMediaPromotion: false,
  frontendDeployBloat: 'avoid-embedding-thousands-of-pngs-in-netlify-bundle'
});

export function buildProposedRegistryRecord(job = {}, extras = {}) {
  return {
    assetId: extras.assetId || job.jobId,
    canonicalSlug: job.canonicalSlug,
    variantKey: job.variantKey,
    promptTemplateVersion: extras.promptTemplateVersion || null,
    provider: extras.provider || null,
    model: extras.model || null,
    generationRunId: extras.generationRunId || extras.runId || null,
    provenance: extras.provenance || {
      pipeline: 'design-asset-factory-v1',
      rights: 'cruvit-owned-when-generated-under-owner-envelope'
    },
    rights: extras.rights || 'cruvit-owned',
    dimensions: extras.dimensions || null,
    alphaMetrics: extras.alphaMetrics || null,
    qaResult: extras.qaResult || null,
    approvalStatus: extras.approvalStatus || 'candidate',
    filePath: extras.filePath || null,
    storagePath: extras.storagePath || null,
    createdAt: extras.createdAt || new Date().toISOString(),
    urlIsNotIdentity: true
  };
}

export const PROPOSED_DB_CHANGES = Object.freeze({
  applyNow: false,
  notes: [
    'Do not migrate in this architecture task.',
    'catalog_design_assets already exists as public read-only prepared-asset metadata (plant_slug, asset_type, life_stage).',
    'Scale needs a factory job table (durable states) separate from public catalog_design_assets.',
    'Approved binaries belong in catalog-design-assets object storage; URLs are not identity.',
    'Optional later: extend catalog_design_assets with variant_key, prompt_template_version, generation_run_id, qa_result — or keep those in the job store and publish a thin public row on APPROVED only.'
  ],
  proposedTables: Object.freeze([
    {
      name: 'catalog_design_asset_jobs',
      purpose: 'idempotent factory jobs and spend-run audit',
      notCreated: true
    }
  ])
});
