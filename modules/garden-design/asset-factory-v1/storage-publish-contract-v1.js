/**
 * Scalable Design Asset publish contract. Do not create buckets or migrate now.
 */
export const STORAGE_PUBLISH_CONTRACT_VERSION = '1.1.0';

export const STORAGE_PUBLISH_CONTRACT = Object.freeze({
  approvedBinaries: {
    destination: 'cloudflare-r2-cdn',
    recommendedBucket: 'cruvit-design-assets',
    doNotMixWithClimateDataBucket: true,
    pathConvention: 'design-assets/{canonicalSlug}/{assetId}.png',
    immutable: true
  },
  candidatesAndRejected: {
    destination: 'temporary-working-storage',
    publishToProductionBucketByDefault: false
  },
  supabase: {
    role: 'metadata-and-authority-only',
    proposedTable: 'catalog_design_assets',
    createMigrationNow: false,
    proposedApprovedColumns: Object.freeze([
      'asset_id',
      'canonical_slug',
      'variant_key',
      'visual_form',
      'growth_stage',
      'phenology',
      'season',
      'identity_scope',
      'scientific_identity',
      'provider',
      'model',
      'prompt_template_version',
      'generation_run_id',
      'provenance',
      'rights',
      'qa_result',
      'approval_status',
      'storage_path',
      'width',
      'height',
      'alpha_metrics',
      'framing_qa',
      'presentation_sizing',
      'production_approved',
      'created_at'
    ])
  },
  versioning: {
    approvedBinaryImmutable: true,
    regenerateCreatesNewAssetId: true,
    silentReplaceForbidden: true,
    registrySelectsCurrentApprovedVersion: true
  },
  createBucketNow: false
});

export function buildStoragePath(canonicalSlug, assetId) {
  return `design-assets/${canonicalSlug}/${assetId}.png`;
}
