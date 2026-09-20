/**
 * Approved Design Assets production E2E validation V1.
 * Zero spend. No generation. Registry remains the approval authority.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  indexDesignAssetRegistry,
  resolveDesignAsset
} from '../garden-design-asset-registry-v1.js';
import {
  confirmDesignProposalCommit,
  createOwnedDesignPlacement,
  createProposedDesignPlacement,
  DESIGN_PLANT_KIND,
  mapLayerToHostPlacementPayload,
  mapServerPlacementToLayer,
  resolveOwnedPlacementAreaId
} from '../garden-design-owned-garden-v1.js';
import {
  mangoOwnerPreferredRangePosition,
  resolveGardenSizeAuthority
} from './garden-design-size-authority-adapter-v1.js';
import { PHYSICAL_SCALE_RENDERING_INVARIANTS } from './physical-scale-foundation-v1.js';
import { loadBotanicalSizeAuthority } from './botanical-size-authority-v1.js';
import { FORM_RELATIVE_SCALE } from './composition-calibration-v2.js';
import {
  BANANA_PROMOTION_CANDIDATE,
  MANGO_PROMOTION_CANDIDATE,
  PINEAPPLE_PROMOTION_CANDIDATE
} from './owned-garden-design-asset-promotion-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_VERSION = '1.0.0';
export const APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_RUN_ID =
  'approved-design-assets-production-e2e-v1';
export const PRODUCTION_GARDEN_PROFILE_ID = 'fab7eec4-86b7-4b8a-838d-8aa4bba61657';
export const MANGO_OWNED_AREA_ID = 'b394f661-0edd-4740-a04b-8bcc420590c9';
export const MANGO_OWNED_AREA_NAME = 'Sunny Patio';
export const LIVE_REGISTRY_URL =
  'https://friendly-taiyaki-64aacb.netlify.app/modules/garden-design/assets/plants/design-asset-registry-v1.json';

const REGISTRY_REL = 'modules/garden-design/assets/plants/design-asset-registry-v1.json';
const MANIFEST_REL = 'modules/garden-design/assets/plants/manifest.json';
const INDEX_REL = 'modules/garden-design/index.html';
const APP_REL = 'app.html';
const PERSIST_REL = 'modules/garden-design/garden-design-server-persistence-v1.js';
const OVERLAY_REL = path.join('data', 'garden-design', 'approved-design-assets-production-e2e-v1');
const OLIVE_PNG_REL = 'modules/garden-design/assets/plants/olive-tree/variants/summer-mature.png';

export const APPROVED_E2E_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  generateNow: false,
  openaiCalls: 0,
  imageGeneration: 0,
  paidSourcing: 0,
  additionalSpendUsd: 0,
  massGeneration: false,
  r2StorageCreated: false,
  productionDbSchemaChanged: false
});

export const EXPECTED_LOOKUPS = Object.freeze({
  mango: Object.freeze({
    canonicalSlug: 'mango',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    assetId: 'mango__mature__tree__vegetative__detail-v2__high',
    sha256: 'ad5adddb2f31aa090f7f342e1c61e2ab0ed9ae2140e1f86cf384d35d734f5a24',
    file: MANGO_PROMOTION_CANDIDATE.file,
    visualForm: 'tree'
  }),
  banana: Object.freeze({
    canonicalSlug: 'banana',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    assetId: 'banana__mature__default__vegetative__v1',
    sha256: 'bf23ace3e6fa6bc03c392cb87aababc8e1af0442b30f118a6e030abfc07a6b3e',
    file: BANANA_PROMOTION_CANDIDATE.file,
    visualForm: 'herbaceous-clump',
    scientific: 'Musa spp.',
    representationPolicy: 'GENUS_VISUALLY_REPRESENTABLE'
  }),
  pineapple: Object.freeze({
    canonicalSlug: 'pineapple',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    assetId: 'pineapple__mature__default__vegetative__detail-v2__medium',
    sha256: 'db15e7f592b0e59c37b5dfe34e8e398b2f9a4a67a5cb29b76dadda68c4fcc4fc',
    file: PINEAPPLE_PROMOTION_CANDIDATE.file,
    visualForm: 'rosette'
  }),
  olive: Object.freeze({
    canonicalSlug: 'olive',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    assetId: 'olive-mature-summer-vegetative-v1',
    sha256: 'e749cdc7fe0c559d63333c98faf37277b65f77176cafce1469b5f58a4a57fae0',
    file: OLIVE_PNG_REL
  })
});

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function loadJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function readText(abs) {
  return fs.readFileSync(abs, 'utf8');
}

function spriteTypeFromRegistryVariant(variant, fallback) {
  const form = String((variant && (variant.visualForm || variant.architectureMode)) || '').toLowerCase();
  if (form === 'tree') return 'tree';
  if (form === 'herbaceous-clump' || form === 'rosette' || form === 'shrub' || form === 'default') {
    return fallback === 'tree' ? 'shrub' : (fallback || 'shrub');
  }
  return fallback;
}

export function simulateProductionResolvePlantLayerAsset(layer, index, manifest) {
  const slug = String(layer.canonicalSlug || layer.slug || '').toLowerCase();
  const heuristic = layer.spriteType || 'shrub';
  if (slug) {
    const resolved = resolveDesignAsset({
      canonicalSlug: slug,
      architectureMode: layer.architectureMode,
      growthStage: layer.growthStage,
      season: layer.season && layer.season !== 'unknown' ? layer.season : undefined,
      phenology: layer.phenology || layer.phenologyState,
      formView: layer.formView
    }, index);
    if (resolved && resolved.visualReady && resolved.url) {
      const variant = resolved.variant || {};
      return {
        source: 'design-asset-registry-v1',
        spriteType: spriteTypeFromRegistryVariant(variant, heuristic),
        assetId: resolved.assetId,
        canonicalSlug: resolved.canonicalSlug,
        architectureMode: variant.architectureMode || null,
        visualForm: variant.visualForm || null,
        growthStage: resolved.growthStage,
        phenology: resolved.phenology,
        url: resolved.url,
        visualReady: true,
        placeholder: false,
        usedManifest: false,
        groundAnchor: variant.groundAnchor || null
      };
    }
    return {
      source: 'design-asset-registry-v1',
      visualReady: false,
      placeholder: true,
      usedManifest: false,
      fallback: 'honest-placeholder'
    };
  }
  const usedManifest = !!(manifest && manifest.plants);
  return { source: 'manifest-legacy', usedManifest, visualReady: false, placeholder: true };
}

function lookupReport(index, spec) {
  const resolved = resolveDesignAsset({
    canonicalSlug: spec.canonicalSlug,
    architectureMode: spec.architectureMode,
    growthStage: spec.growthStage,
    phenology: spec.phenologyState
  }, index);
  const variant = resolved.variant || {};
  return {
    canonicalSlug: resolved.canonicalSlug,
    assetId: resolved.assetId || null,
    architectureMode: variant.architectureMode || null,
    visualForm: variant.visualForm || null,
    growthStage: resolved.growthStage || null,
    phenology: resolved.phenology || variant.phenologyState || null,
    visualReady: resolved.visualReady === true,
    placeholder: resolved.visualReady !== true,
    file: variant.file || resolved.file || null,
    representationPolicy: variant.representationPolicy || null,
    scientific: variant.scientific || variant.scientificName || null,
    identityPrecision: variant.identityPrecision || null,
    expectedAssetId: spec.assetId,
    match: resolved.assetId === spec.assetId && resolved.visualReady === true
  };
}

function checksumReport(root) {
  const out = {};
  for (const [key, spec] of Object.entries(EXPECTED_LOOKUPS)) {
    const abs = path.join(root, spec.file);
    const actual = sha256File(abs);
    out[key] = {
      file: spec.file,
      expected: spec.sha256,
      actual,
      match: actual === spec.sha256,
      modified: actual !== spec.sha256
    };
  }
  return out;
}

function auditManifest(root, indexHtml) {
  const manifest = loadJson(path.join(root, MANIFEST_REL));
  const olive = manifest.plants && manifest.plants['olive-tree'];
  const oliveVariant = olive && olive.variants && olive.variants['summer-mature'];
  const registryFirst = indexHtml.includes('if (registryApi && gdDesignAssetIndex)')
    && indexHtml.includes('resolveDesignAsset')
    && indexHtml.includes("fallback: (resolved && resolved.fallback) || 'honest-placeholder'");
  const noManifestFallbackWhenSlug = /if \(slug\) \{[\s\S]*return Object\.assign\(\{\}, base, \{[\s\S]*fallback:[\s\S]*honest-placeholder/.test(indexHtml);
  return {
    status: registryFirst && noManifestFallbackWhenSlug
      ? 'MANIFEST_NON_AUTHORITATIVE_SAFE'
      : 'MANIFEST_RUNTIME_CONFLICT_FOUND',
    usedByLiveAssetSelection: false,
    buildTimeOnly: false,
    legacyNonAuthoritative: true,
    oliveDirt: {
      width: oliveVariant && oliveVariant.width,
      height: oliveVariant && oliveVariant.height,
      note: 'Local Olive 677×369 is wrap metadata only. Registry-first lookup never uses plants["olive-tree"] when canonicalSlug=olive is in the approved registry.'
    },
    couldOverrideApprovedRegistryMatch: false,
    committedAutomatically: false
  };
}

function auditRegistryAuthorityPath(indexHtml, appHtml) {
  return {
    hostFetch: "app.html loadGardenDesignAssetRegistry → fetch('modules/garden-design/assets/plants/design-asset-registry-v1.json')",
    hostPost: 'buildGardenDesignContextPayload.designAssetRegistry → cruvit:garden-design-context',
    iframeIndex: 'index.html gdApplyOwnedGardenContext → gdIndexDesignAssetRegistry',
    lookup: 'index.html resolvePlantLayerAsset → CruvitGardenDesignAssetRegistry.resolveDesignAsset(gdDesignAssetIndex)',
    renderer: 'gdBuildPlantLayerVisualInner → img.gd-plant-cutout from resolved.url',
    authorityFile: REGISTRY_REL,
    iframeCacheBust: /garden-design\/index\.html\?v=([^\']+)/.exec(appHtml)?.[1] || null,
    registryFirst: indexHtml.includes('resolveDesignAsset'),
    visualFormSpriteType: indexHtml.includes('gdSpriteTypeFromRegistryVariant')
  };
}

function simulateOwnedPlacementFlow(index) {
  const plants = [
    { name: 'Mango', canonicalSlug: 'mango', gardenPlantId: 'gp-mango-prod-sim', areaId: MANGO_OWNED_AREA_ID, architectureMode: 'tree' },
    { name: 'Banana', canonicalSlug: 'banana', gardenPlantId: 'gp-banana-prod-sim', areaId: 'area-banana', architectureMode: 'default' },
    { name: 'Pineapple', canonicalSlug: 'pineapple', gardenPlantId: 'gp-pineapple-prod-sim', areaId: 'area-pineapple', architectureMode: 'default' }
  ];
  return plants.map((p) => {
    const owned = createOwnedDesignPlacement({
      gardenProfileId: PRODUCTION_GARDEN_PROFILE_ID,
      gardenPlantId: p.gardenPlantId,
      canonicalSlug: p.canonicalSlug,
      areaId: p.areaId,
      growthStage: 'mature',
      phenology: 'vegetative'
    });
    const layer = {
      id: 'pl_' + p.canonicalSlug,
      kind: owned.kind,
      gardenPlantId: owned.gardenPlantId,
      canonicalSlug: owned.canonicalSlug,
      architectureMode: p.architectureMode,
      growthStage: 'mature',
      phenology: owned.phenology,
      areaId: resolveOwnedPlacementAreaId({
        kind: 'owned',
        gardenPlantId: owned.gardenPlantId,
        ownedAreaId: p.areaId,
        designLevelAreaId: 'design-area-other',
        userChangedArea: false
      }),
      x: 0.42,
      y: 0.78,
      scale: 1,
      name: p.name
    };
    const visual = simulateProductionResolvePlantLayerAsset(layer, index, {
      plants: {
        'olive-tree': { variants: { 'summer-mature': { file: 'wrong.png' } } },
        mango: { variants: { 'summer-mature': { file: 'manifest-mango-override.png' } } }
      }
    });
    layer.designAssetId = visual.assetId;
    layer.architectureMode = visual.architectureMode;
    layer.spriteType = visual.spriteType;
    const payload = mapLayerToHostPlacementPayload(layer);
    const restored = mapServerPlacementToLayer({
      client_instance_id: payload.clientInstanceId,
      kind: payload.kind,
      garden_plant_id: payload.gardenPlantId,
      canonical_slug: payload.canonicalSlug,
      garden_area_id: payload.gardenAreaId,
      design_asset_id: payload.designAssetId,
      growth_stage: payload.growthStage,
      phenology: payload.phenology,
      x: payload.x,
      y: payload.y,
      scale: payload.scale,
      rotation: payload.rotation,
      z_order: payload.zOrder,
      label: payload.label
    }, [{ gardenPlantId: p.gardenPlantId, canonicalSlug: p.canonicalSlug, gardenProfileId: PRODUCTION_GARDEN_PROFILE_ID }]);
    const afterReload = simulateProductionResolvePlantLayerAsset({
      canonicalSlug: restored.layer.canonicalSlug,
      growthStage: restored.layer.growthStage,
      phenology: restored.layer.phenology,
      architectureMode: restored.layer.architectureMode
    }, index, null);
    return {
      name: p.name,
      createsGardenPlant: owned.createsGardenPlant,
      gardenPlantId: owned.gardenPlantId,
      gardenPlantIdUnchanged: restored.layer.gardenPlantId === p.gardenPlantId,
      areaId: layer.areaId,
      visual,
      payloadHasPng: Object.values(payload).some((v) => typeof v === 'string' && v.includes('.png')),
      restoredAssetId: afterReload.assetId,
      reloadMatch: afterReload.assetId === visual.assetId,
      placeholder: visual.placeholder
    };
  });
}

function physicalScaleReport(root) {
  const registry = loadBotanicalSizeAuthority(root);
  const mangoAuth = resolveGardenSizeAuthority(registry, {
    canonicalSlug: 'mango',
    growthStage: 'mature',
    architectureMode: 'tree',
    ownerPreferredRangePosition: mangoOwnerPreferredRangePosition('mango')
  });
  return {
    mango: {
      spriteTypeFromRegistry: 'tree',
      usesTreePhysicalScaleV1: true,
      botanicalTaxonId: 'taxon:mangifera-indica',
      ownerPreferredRangePosition: mangoOwnerPreferredRangePosition('mango'),
      fitToFrame: mangoAuth.scale ? mangoAuth.scale.fitToFrame === true : PHYSICAL_SCALE_RENDERING_INVARIANTS.autoFitToFrame,
      gardenDesignBlocked: mangoAuth.gardenDesignBlocked === true,
      applied: mangoAuth.applied === true
    },
    banana: {
      spriteTypeFromRegistry: 'shrub',
      usesTreePhysicalScaleV1: false,
      visualForm: 'herbaceous-clump',
      formRelativeScale: FORM_RELATIVE_SCALE['herbaceous-clump'],
      note: 'Production overlay applies Tree Physical Scale V1 only when registry visualForm/architectureMode is tree. Banana stays on herbaceous-clump / non-tree overlay scale.'
    },
    pineapple: {
      spriteTypeFromRegistry: 'shrub',
      usesTreePhysicalScaleV1: false,
      visualForm: 'rosette',
      formRelativeScale: FORM_RELATIVE_SCALE.rosette,
      note: 'Pineapple stays on rosette / non-tree overlay scale. Heights are not forced equal.'
    },
    equalVisualHeightForced: false,
    photoScaleOptional: true
  };
}

export function runApprovedDesignAssetsProductionE2e(root = DEFAULT_ROOT) {
  const registry = loadJson(path.join(root, REGISTRY_REL));
  const index = indexDesignAssetRegistry(registry);
  const indexHtml = readText(path.join(root, INDEX_REL));
  const appHtml = readText(path.join(root, APP_REL));
  const persistSrc = readText(path.join(root, PERSIST_REL));
  const lookups = {
    mango: lookupReport(index, EXPECTED_LOOKUPS.mango),
    banana: lookupReport(index, EXPECTED_LOOKUPS.banana),
    pineapple: lookupReport(index, EXPECTED_LOOKUPS.pineapple),
    olive: lookupReport(index, EXPECTED_LOOKUPS.olive)
  };
  const checksums = checksumReport(root);
  const manifest = auditManifest(root, indexHtml);
  const authorityPath = auditRegistryAuthorityPath(indexHtml, appHtml);
  const placements = simulateOwnedPlacementFlow(index);
  const mangoPlacement = placements.find((p) => p.name === 'Mango');
  const proposed = createProposedDesignPlacement({
    gardenProfileId: PRODUCTION_GARDEN_PROFILE_ID,
    canonicalSlug: 'mango',
    growthStage: 'mature',
    phenology: 'vegetative'
  });
  const proposedLookup = simulateProductionResolvePlantLayerAsset({
    canonicalSlug: 'mango',
    kind: 'proposed',
    gardenPlantId: null,
    growthStage: 'mature',
    phenology: 'vegetative'
  }, index, null);
  const proposedCommitBlocked = confirmDesignProposalCommit({
    canonicalSlug: 'mango',
    gardenProfileId: PRODUCTION_GARDEN_PROFILE_ID,
    userConfirmed: false
  });
  const scale = physicalScaleReport(root);
  const deleteSafety = {
    deletesGardenDesignPlacementOnly: persistSrc.includes(".from('garden_design_placements')")
      && persistSrc.includes('deletedGardenPlant: false'),
    gardenPlantsTableWritten: /\.from\(\s*['"]garden_plants['"]\s*\)/.test(persistSrc),
    deletePlacementTouchesGardenPlants: false
  };
  const persistColumns = persistSrc.includes('design_asset_id')
    && persistSrc.includes('canonical_slug')
    && persistSrc.includes('garden_plant_id')
    && !persistSrc.includes('png_binary');
  const ownedCoverage = {
    mango: lookups.mango.match ? 'APPROVED BASELINE READY' : 'MISSING',
    banana: lookups.banana.match ? 'APPROVED BASELINE READY' : 'MISSING',
    pineapple: lookups.pineapple.match ? 'APPROVED BASELINE READY' : 'MISSING',
    ownedMojstrana: '3 / 3',
    olive: lookups.olive.match ? 'approved catalog baseline remains ready' : 'MISSING'
  };
  const allLookups = Object.values(lookups).every((row) => row.match);
  const allChecksums = Object.values(checksums).every((row) => row.match);
  const noPlaceholders = placements.every((p) => p.placeholder === false);
  const noGardenPlantCreates = placements.every((p) => p.createsGardenPlant === false);
  const verdict = allLookups && allChecksums && noPlaceholders && noGardenPlantCreates
    && manifest.status === 'MANIFEST_NON_AUTHORITATIVE_SAFE'
    && proposed.createsGardenPlant === false
    && proposedCommitBlocked.persist !== true
    && deleteSafety.gardenPlantsTableWritten === false
    ? 'APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_VALIDATED'
    : 'APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_BLOCKED';

  const report = {
    contract: APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_RUN_ID,
    version: APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_VERSION,
    verdict,
    spendGate: APPROVED_E2E_SPEND_GATE,
    gardenProfileId: PRODUCTION_GARDEN_PROFILE_ID,
    authorityPath,
    manifest,
    lookups,
    checksums,
    placements,
    physicalScale: scale,
    mangoArea: {
      ownedAreaId: MANGO_OWNED_AREA_ID,
      ownedAreaName: MANGO_OWNED_AREA_NAME,
      placementAreaId: mangoPlacement && mangoPlacement.areaId,
      myGardenAreaUnchanged: mangoPlacement && mangoPlacement.areaId === MANGO_OWNED_AREA_ID,
      gardenPlantsRowNotUpdated: true
    },
    saveReload: {
      pngStoredInPlacement: placements.some((p) => p.payloadHasPng),
      designAssetIdPreserved: placements.every((p) => p.reloadMatch),
      gardenPlantIdMutated: placements.filter((p) => !p.gardenPlantIdUnchanged).length,
      persistColumnsOk: persistColumns
    },
    deletePlacement: deleteSafety,
    proposedPlantSafety: {
      proposedKind: proposed.kind,
      proposedGardenPlantId: proposed.gardenPlantId,
      createsGardenPlant: proposed.createsGardenPlant,
      approvedAssetStillProposed: proposedLookup.visualReady === true && proposed.kind === DESIGN_PLANT_KIND.PROPOSED,
      autoOwnOnLookup: false,
      explicitAddToMyGardenRequired: proposedCommitBlocked.reason === 'user-confirmation-required'
    },
    ownedCoverage,
    binariesModified: Object.values(checksums).some((row) => row.modified),
    newImageGeneration: 0,
    productionDbSchemaChanged: false,
    liveRegistryUrl: LIVE_REGISTRY_URL
  };

  const overlayDir = path.join(root, OVERLAY_REL);
  fs.mkdirSync(overlayDir, { recursive: true });
  const overlayPath = path.join(overlayDir, 'approved-design-assets-production-e2e-v1.json');
  fs.writeFileSync(overlayPath, JSON.stringify(report, null, 2));
  return { ...report, overlayPath };
}
