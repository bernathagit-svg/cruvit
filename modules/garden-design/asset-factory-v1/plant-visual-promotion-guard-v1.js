/**
 * Production registry activation guard for Plant Visual Pipeline V1.
 * Pure/local. Does not publish binaries and does not call external services.
 */
export const PLANT_VISUAL_PROMOTION_GUARD_VERSION = 'plant-visual-promotion-guard-v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function roleKey(v = {}) {
  return [
    String(v.growthStage || 'unspecified'),
    String(v.phenology || v.phenologyState || 'vegetative'),
    String(v.season || 'unknown'),
    String(v.formView || ''),
    String(v.architectureMode || v.visualForm || '')
  ].join('|');
}

export function validateProductionRegistryVariant(record = {}) {
  const reasons = [];
  if (record.productionApproved !== true) reasons.push('production-approved-required');
  if (record.approvalStatus !== 'approved') reasons.push('approval-status-approved-required');
  if (record.transparencyReady !== true) reasons.push('transparency-required');
  if (!record.assetId) reasons.push('asset-id-required');
  if (!record.canonicalSlug) reasons.push('canonical-slug-required');
  if (!record.file && !record.url) reasons.push('asset-location-required');
  if (!record.sha256 && !record.checksum) reasons.push('checksum-required');
  if (!finitePositive(record.width) || !finitePositive(record.height)) reasons.push('pixel-dimensions-required');
  if (!finitePositive(record.baseWidthPx)) reasons.push('presentation-size-required');
  if (!record.alphaBBox || record.alphaBBox.exists === false) reasons.push('alpha-bbox-required');
  if (!record.groundAnchor) reasons.push('ground-anchor-required');

  const requiredQa = [
    ['technicalQA', record.technicalQA],
    ['framingQA', record.framingQA],
    ['botanicalIdentityQA', record.botanicalIdentityQA],
    ['architectureQA', record.architectureQA],
    ['growthStageQA', record.growthStageQA],
    ['phenologyStateQA', record.phenologyStateQA],
    ['inGardenQA', record.inGardenQA]
  ];
  for (const [name, value] of requiredQa) {
    if (String(value || '').toUpperCase() !== 'PASS') reasons.push(`${name}-pass-required`);
  }

  return {
    version: PLANT_VISUAL_PROMOTION_GUARD_VERSION,
    ok: reasons.length === 0,
    reasons
  };
}

export function activateProductionRegistryVariant(registry = {}, record = {}) {
  const validation = validateProductionRegistryVariant(record);
  if (!validation.ok) {
    const err = new Error('PRODUCTION_REGISTRY_ACTIVATION_BLOCKED');
    err.code = 'PRODUCTION_REGISTRY_ACTIVATION_BLOCKED';
    err.reasons = validation.reasons;
    throw err;
  }

  const next = clone(registry || {});
  next.sets = Array.isArray(next.sets) ? next.sets : [];
  const slug = String(record.canonicalSlug).toLowerCase();
  let set = next.sets.find((row) => String(row.canonicalSlug || '').toLowerCase() === slug);
  if (!set) {
    set = {
      canonicalSlug: record.canonicalSlug,
      designAssetSetId: `${record.canonicalSlug}-design-v1`,
      identityScope: record.identityScope || 'species',
      scientific: record.scientific || null,
      variants: []
    };
    next.sets.push(set);
  }
  set.variants = Array.isArray(set.variants) ? set.variants : [];

  const checksum = record.sha256 || record.checksum;
  const sameId = set.variants.find((v) => v.assetId === record.assetId);
  if (sameId) {
    const oldChecksum = sameId.sha256 || sameId.checksum;
    if (oldChecksum && oldChecksum !== checksum) {
      const err = new Error('IMMUTABLE_ASSET_ID_CONFLICT');
      err.code = 'IMMUTABLE_ASSET_ID_CONFLICT';
      err.assetId = record.assetId;
      throw err;
    }
    return {
      version: PLANT_VISUAL_PROMOTION_GUARD_VERSION,
      changed: false,
      idempotent: true,
      registry: next,
      activeAssetId: sameId.assetId
    };
  }

  const key = roleKey(record);
  for (const variant of set.variants) {
    if (
      variant.productionApproved === true &&
      roleKey(variant) === key &&
      !variant.supersededBy
    ) {
      variant.supersededBy = record.assetId;
      variant.activeForRole = false;
    }
  }

  const activated = {
    ...clone(record),
    activeForRole: true,
    activatedBy: PLANT_VISUAL_PROMOTION_GUARD_VERSION
  };
  set.variants.push(activated);

  next.productionPolicy = {
    ...(next.productionPolicy || {}),
    productionApprovedRequiredForReadyAssets: true,
    generateOnLookup: false,
    generateOnRender: false,
    silentBinaryReplacementForbidden: true,
    sourceResolutionPreserved: true,
    immutableAssetIds: true
  };

  return {
    version: PLANT_VISUAL_PROMOTION_GUARD_VERSION,
    changed: true,
    idempotent: false,
    registry: next,
    activeAssetId: activated.assetId
  };
}
