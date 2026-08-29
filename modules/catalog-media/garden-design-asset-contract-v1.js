/**
 * Garden Design asset storage / cost contract V1 (metadata only).
 * Do NOT generate images per user placement. Assets are prepared once, stored, reused.
 * Binaries → CRUVIT-controlled object storage (Supabase Storage when implemented).
 * Metadata → catalog_design_assets (public shared). User photos are NEVER design assets.
 */

export const GARDEN_DESIGN_ASSET_CONTRACT_VERSION = '1.0.0';

export const DESIGN_ASSET_TYPES = Object.freeze([
  'illustration',
  'silhouette',
  'seasonal',
  'placement'
]);

export const DESIGN_LIFE_STAGES = Object.freeze(['young', 'mature', 'unknown']);

export const DESIGN_VERIFICATION_STATUSES = Object.freeze([
  'verified',
  'unverified',
  'rejected'
]);

export const DESIGN_RIGHTS_STATUSES = Object.freeze([
  'cruvit-owned',
  'licensed-commercial',
  'unknown',
  'restricted'
]);

/** Planned public storage bucket for prepared design binaries (not user private). */
export const DESIGN_ASSET_STORAGE_BUCKET = 'catalog-design-assets';

/** Planned private bucket for user Garden / plant / Doctor uploads. */
export const USER_PRIVATE_MEDIA_STORAGE_BUCKET = 'user-garden-media';

export function buildDesignAssetMetadataRecord(input = {}) {
  const plantSlug = String(input.plantSlug || input.plant_slug || '').trim();
  const assetType = String(input.assetType || input.asset_type || '').trim();
  const lifeStage = String(input.lifeStage || input.life_stage || 'unknown').trim();
  if (!plantSlug) throw new Error('plantSlug required');
  if (!DESIGN_ASSET_TYPES.includes(assetType)) {
    throw new Error('assetType must be illustration|silhouette|seasonal|placement');
  }
  if (!DESIGN_LIFE_STAGES.includes(lifeStage)) {
    throw new Error('lifeStage must be young|mature|unknown');
  }
  const verification =
    String(input.verificationStatus || input.verification_status || 'unverified').trim();
  const rights = String(
    input.rightsLicenseStatus || input.rights_license_status || 'unknown'
  ).trim();
  if (!DESIGN_VERIFICATION_STATUSES.includes(verification)) {
    throw new Error('invalid verificationStatus');
  }
  if (!DESIGN_RIGHTS_STATUSES.includes(rights)) {
    throw new Error('invalid rightsLicenseStatus');
  }

  return {
    plant_slug: plantSlug,
    asset_type: assetType,
    life_stage: lifeStage,
    seasonal_state: input.seasonalState || input.seasonal_state || null,
    width_px: Number.isFinite(Number(input.widthPx ?? input.width_px))
      ? Number(input.widthPx ?? input.width_px)
      : null,
    height_px: Number.isFinite(Number(input.heightPx ?? input.height_px))
      ? Number(input.heightPx ?? input.height_px)
      : null,
    version: String(input.version || '1.0.0'),
    verification_status: verification,
    storage_path: input.storagePath || input.storage_path || null,
    source_provenance:
      input.sourceProvenance && typeof input.sourceProvenance === 'object'
        ? input.sourceProvenance
        : input.source_provenance && typeof input.source_provenance === 'object'
          ? input.source_provenance
          : {},
    rights_license_status: rights
  };
}

/**
 * Lookup prepared assets for a plant. Never generates.
 * @returns {{ assets: object[], generated: false, generationAllowed: false }}
 */
export function lookupGardenDesignAssets(plantSlug, assetIndex = []) {
  const key = String(plantSlug || '').trim().toLowerCase();
  const assets = (Array.isArray(assetIndex) ? assetIndex : []).filter(
    (a) => String(a.plant_slug || a.plantSlug || '').trim().toLowerCase() === key
  );
  return {
    assets,
    generated: false,
    generationAllowed: false,
    contract: 'PREPARE_ONCE_STORE_REUSE'
  };
}

/** Hard rule: user-owned media cannot become shared design assets automatically. */
export function mayPromoteUserMediaToDesignAsset() {
  return false;
}

export function assertDesignLookupCannotInvokeGeneration() {
  return {
    generationAllowed: false,
    perUserPlacementGeneration: false,
    requiresOwnerApprovalForGeneration: true
  };
}
