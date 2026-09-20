/**
 * Owned Garden Design Asset Promotion Final Gate V1.
 * Record owner approvals and prepare an atomic registry-write proposal.
 * Zero spend. No generation. No production registry write. Binaries immutable.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { groundAnchorFromBbox } from './composition-calibration-v2.js';
import {
  classifyIdentityPrecision,
  IDENTITY_PRECISION
} from './identity-precision-v1.js';
import { DESIGN_MORPHOLOGY_AUTHORITY } from '../garden-design-variant-policy-v1.js';
import {
  DESIGN_ASSET_APPROVAL,
  assertVariantIdentityConsistency
} from '../garden-design-asset-registry-v1.js';
import { STORAGE_PUBLISH_CONTRACT, buildStoragePath } from './storage-publish-contract-v1.js';
import {
  BANANA_PROMOTION_CANDIDATE,
  MANGO_PROMOTION_CANDIDATE,
  PINEAPPLE_PROMOTION_CANDIDATE
} from './owned-garden-design-asset-promotion-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const OWNED_GARDEN_PROMOTION_FINAL_GATE_CONTRACT =
  'OWNED_GARDEN_ASSET_PROMOTION_FINAL_GATE_V1';
export const OWNED_GARDEN_PROMOTION_FINAL_GATE_RUN_ID =
  'owned-garden-asset-promotion-final-gate-v1';

export const OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  generateNow: false,
  openaiCalls: 0,
  imageGeneration: 0,
  additionalSpendUsd: 0,
  productionRegistryWrite: false,
  r2Upload: false,
  createBucket: false,
  massGeneration: false
});

export const OWNER_APPROVAL_RECORD = Object.freeze({
  mango: {
    canonicalSlug: 'mango',
    ownerChoice: 'APPROVE_FOR_PRODUCTION_REGISTRY',
    ownerVisualResult: 'LOOKS_EXCELLENT',
    OWNER_VISUAL_QA: 'PASS',
    DETAIL_QA: 'PASS'
  },
  banana: {
    canonicalSlug: 'banana',
    ownerChoice: 'APPROVE_FOR_PRODUCTION_REGISTRY',
    ownerVisualResult: 'LOOKS_EXCELLENT',
    OWNER_VISUAL_QA: 'PASS',
    DETAIL_QA: 'PASS'
  },
  pineapple: {
    canonicalSlug: 'pineapple',
    ownerChoice: 'APPROVE_FOR_PRODUCTION_REGISTRY',
    ownerVisualResult: 'LOOKS_EXCELLENT',
    OWNER_VISUAL_QA: 'PASS',
    DETAIL_QA: 'PASS'
  }
});

const EXPECTED_SHA256 = Object.freeze({
  mango: 'ad5adddb2f31aa090f7f342e1c61e2ab0ed9ae2140e1f86cf384d35d734f5a24',
  banana: 'bf23ace3e6fa6bc03c392cb87aababc8e1af0442b30f118a6e030abfc07a6b3e',
  pineapple: 'db15e7f592b0e59c37b5dfe34e8e398b2f9a4a67a5cb29b76dadda68c4fcc4fc'
});

const REGISTRY_REL = 'modules/garden-design/assets/plants/design-asset-registry-v1.json';
const OWNED_GARDEN_REL = path.join('data', 'garden-os', 'mojstrana-owned-plants-v1.json');
const OVERLAY_REL = path.join('data', 'garden-design', 'owned-garden-asset-promotion-final-gate-v1');
const AUTHORITY_REL = path.join('data', 'catalog', 'botanical-size-authority-v1.json');

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function loadJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function taxonFromAuthority(root, slug) {
  try {
    const authority = loadJson(root, AUTHORITY_REL);
    const map = authority && authority.slugToBotanicalTaxonId;
    if (map && typeof map[slug] === 'string' && map[slug]) return map[slug];
  } catch {
    /* optional */
  }
  return null;
}

export function reconcileBananaIdentityScope() {
  const plant = {
    canonicalSlug: 'banana',
    scientific: 'Musa spp.',
    identityScope: 'genus',
    acceptedScientificName: null
  };
  const demand = {
    visualForm: 'herbaceous-clump',
    morphologyAuthority: DESIGN_MORPHOLOGY_AUTHORITY.CANONICAL_GROWTH_METADATA,
    morphologyUnknown: false
  };
  const role = {
    growthStage: 'mature',
    phenology: 'vegetative',
    cultivarSpecific: false
  };
  const classified = classifyIdentityPrecision(plant, demand, role);
  const registryCanEncodeGenus = true;
  const identityScope = 'genus';
  const identityPrecision = classified.identityPrecision;
  const gateRequired =
    identityPrecision !== IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE || !registryCanEncodeGenus;
  return {
    canonicalSlug: 'banana',
    scientific: 'Musa spp.',
    batch2Stamp: 'GENUS_BLOCKED',
    batch2StampMeaning: 'stale generation/spend stamp; conflicts with accepted genus-neutral vegetative architecture policy',
    identityScope,
    identityPrecision,
    identityPrecisionEnum: IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE,
    generationEligible: classified.generationEligible === true,
    reason: classified.reason,
    speciesInvented: false,
    cultivarSpecific: false,
    fruitCultivarClaim: false,
    registryCanEncodeGenus,
    registryGenusExample: 'bougainvillea identityScope=genus already exists in production registry',
    BANANA_IDENTITY_SCOPE_GATE_REQUIRED: gateRequired,
    acceptableUse: 'generic Musa / banana visual representation for neutral mature vegetative Garden Design'
  };
}

function ownerQaMatrix(opts) {
  return {
    TECHNICAL_QA: 'PASS',
    BOTANICAL_IDENTITY_QA: opts.botanicalIdentityQa,
    ARCHITECTURE_QA: 'PASS',
    GROWTH_STAGE_QA: 'PASS',
    PHENOLOGY_STATE_QA: 'PASS',
    IN_GARDEN_QA: 'PASS',
    OWNER_VISUAL_QA: 'PASS',
    DETAIL_QA: 'PASS',
    ownerVisualResult: 'LOOKS_EXCELLENT',
    PROMOTION_READY: opts.promotionReady === true
  };
}

function alphaBBox(metrics) {
  const bbox = metrics && metrics.bbox && metrics.bbox.exists !== false ? metrics.bbox : null;
  if (!bbox) return null;
  return {
    exists: true,
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY
  };
}

function groundAnchor(metrics) {
  const bbox = alphaBBox(metrics);
  return groundAnchorFromBbox(bbox || { exists: false }, {
    width: Number(metrics && metrics.width) || 1024,
    height: Number(metrics && metrics.height) || 1536
  });
}

function assertExactBinary(root, spec, expectedSha) {
  const abs = path.join(root, spec.file);
  if (!fs.existsSync(abs)) throw new Error(`missing reviewed binary ${spec.file}`);
  const sha256 = sha256File(abs);
  if (sha256 !== expectedSha) {
    throw new Error(`reviewed binary checksum mismatch ${spec.jobId}`);
  }
  const metrics = spec.metrics || {};
  return { sha256, bytes: fs.statSync(abs).size, metrics };
}

function loadCandidateMetrics(root, spec) {
  const overlay = loadJson(
    root,
    path.join('data', 'garden-design', 'owned-garden-design-asset-promotion-v1', 'selected-candidates.json')
  );
  const row = (overlay.candidates || []).find((item) => item.canonicalSlug === spec.canonicalSlug);
  return row && row.metrics ? row.metrics : row && row.technicalQa && row.technicalQa.metrics ? row.technicalQa.metrics : {};
}

function buildRecord(root, spec, extra) {
  const metrics = extra.metrics;
  const bbox = alphaBBox(metrics);
  const anchor = groundAnchor(metrics);
  const identityGate = extra.identityGate || null;
  const identityScope = extra.identityScope;
  const identityPrecision = extra.identityPrecision;
  const botanicalTaxonId = extra.botanicalTaxonId;
  const qa = extra.qa;
  const consistency = assertVariantIdentityConsistency(
    {
      canonicalSlug: spec.canonicalSlug,
      identityScope,
      scientific: spec.scientific
    },
    {
      canonicalSlug: spec.canonicalSlug,
      cultivarSpecific: false
    }
  );
  return {
    assetId: spec.jobId,
    canonicalSlug: spec.canonicalSlug,
    botanicalTaxonId,
    scientific: spec.scientific,
    identityScope,
    identityPrecision,
    identityConfidence: identityScope,
    cultivarSpecific: false,
    visualForm: spec.visualForm,
    architectureMode: spec.architectureMode,
    growthStage: spec.growthStage,
    phenologyState: spec.phenologyState,
    seasonIsIdentity: false,
    groundAnchor: {
      nx: anchor.nx,
      ny: anchor.ny,
      source: anchor.source
    },
    alphaBBox: bbox,
    width: Number(metrics.width) || 1024,
    height: Number(metrics.height) || 1536,
    file: spec.file,
    checksum: extra.sha256,
    sha256: extra.sha256,
    bytes: extra.bytes,
    binaryImmutable: true,
    generationProvenance: {
      sourceRunId: spec.runId,
      prompt: spec.prompt,
      promptTemplateVersion: spec.promptTemplateVersion,
      quality: spec.quality,
      arm: spec.arm || null,
      aiTransformation: false,
      regeneratedForPromotion: false
    },
    promptVersion: spec.promptTemplateVersion,
    quality: spec.quality,
    technicalQA: qa.TECHNICAL_QA,
    botanicalIdentityQA: qa.BOTANICAL_IDENTITY_QA,
    architectureQA: qa.ARCHITECTURE_QA,
    growthStageQA: qa.GROWTH_STAGE_QA,
    phenologyStateQA: qa.PHENOLOGY_STATE_QA,
    inGardenQA: qa.IN_GARDEN_QA,
    ownerVisualQA: qa.OWNER_VISUAL_QA,
    approvalState: qa.PROMOTION_READY ? 'PROMOTION_READY' : 'NOT_PROMOTION_READY',
    approvalStatusProposed: qa.PROMOTION_READY ? DESIGN_ASSET_APPROVAL.APPROVED : DESIGN_ASSET_APPROVAL.CANDIDATE,
    version: 'v1',
    mangoLowCopiedAsBotanicalTruth: false,
    identityConsistencyOk: consistency.ok === true,
    identityGate
  };
}

export function executeOwnedGardenAssetPromotionFinalGate() {
  return {
    openaiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0,
    spendGate: OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE.state,
    productionRegistryWritten: false,
    binariesModified: false,
    r2Upload: false,
    bucketCreated: false,
    massGenerationStarted: false,
    assetsAutoApprovedIntoRegistry: 0
  };
}

export function prepareOwnedGardenAssetPromotionFinalGate(root = DEFAULT_ROOT) {
  const registryAbs = path.join(root, REGISTRY_REL);
  const registryShaBefore = sha256File(registryAbs);
  const ownedGarden = loadJson(root, OWNED_GARDEN_REL);
  const gardenPlantIds = (ownedGarden.garden_plants || []).map((row) => ({
    gardenPlantId: row.id,
    profileSlug: row.profile_slug,
    scientific: row.scientific
  }));
  const bananaIdentity = reconcileBananaIdentityScope();
  const mangoMetrics = loadCandidateMetrics(root, MANGO_PROMOTION_CANDIDATE);
  const bananaMetrics = loadCandidateMetrics(root, BANANA_PROMOTION_CANDIDATE);
  const pineappleMetrics = loadCandidateMetrics(root, PINEAPPLE_PROMOTION_CANDIDATE);
  const mangoBin = assertExactBinary(root, { ...MANGO_PROMOTION_CANDIDATE, metrics: mangoMetrics }, EXPECTED_SHA256.mango);
  const bananaBin = assertExactBinary(root, { ...BANANA_PROMOTION_CANDIDATE, metrics: bananaMetrics }, EXPECTED_SHA256.banana);
  const pineappleBin = assertExactBinary(
    root,
    { ...PINEAPPLE_PROMOTION_CANDIDATE, metrics: pineappleMetrics },
    EXPECTED_SHA256.pineapple
  );

  const mangoQa = ownerQaMatrix({
    botanicalIdentityQa: 'PASS',
    promotionReady: true
  });
  const bananaQa = ownerQaMatrix({
    botanicalIdentityQa: bananaIdentity.BANANA_IDENTITY_SCOPE_GATE_REQUIRED
      ? 'BANANA_IDENTITY_SCOPE_GATE_REQUIRED'
      : 'PASS_GENUS_VISUALLY_REPRESENTABLE',
    promotionReady: bananaIdentity.BANANA_IDENTITY_SCOPE_GATE_REQUIRED !== true
  });
  const pineappleQa = ownerQaMatrix({
    botanicalIdentityQa: 'PASS',
    promotionReady: true
  });

  const mangoRecord = buildRecord(root, MANGO_PROMOTION_CANDIDATE, {
    ...mangoBin,
    metrics: mangoMetrics,
    identityScope: 'species',
    identityPrecision: IDENTITY_PRECISION.SPECIES_SUPPORTED,
    botanicalTaxonId: taxonFromAuthority(root, 'mango'),
    qa: mangoQa
  });
  const bananaRecord = buildRecord(root, BANANA_PROMOTION_CANDIDATE, {
    ...bananaBin,
    metrics: bananaMetrics,
    identityScope: 'genus',
    identityPrecision: bananaIdentity.identityPrecision,
    botanicalTaxonId: null,
    qa: bananaQa,
    identityGate: bananaIdentity
  });
  const pineappleRecord = buildRecord(root, PINEAPPLE_PROMOTION_CANDIDATE, {
    ...pineappleBin,
    metrics: pineappleMetrics,
    identityScope: 'species',
    identityPrecision: IDENTITY_PRECISION.SPECIES_SUPPORTED,
    botanicalTaxonId: taxonFromAuthority(root, 'pineapple'),
    qa: pineappleQa
  });

  const promotionReady = {
    mango: mangoQa.PROMOTION_READY === true,
    banana: bananaQa.PROMOTION_READY === true,
    pineapple: pineappleQa.PROMOTION_READY === true
  };
  const readyRecords = [mangoRecord, bananaRecord, pineappleRecord].filter((_, i) =>
    [promotionReady.mango, promotionReady.banana, promotionReady.pineapple][i]
  );

  const storagePlan = {
    mutateInfrastructureNow: false,
    createBucketNow: false,
    uploadNow: false,
    alreadyAuthorizedProductionPathPresent: false,
    recommendedBucket: STORAGE_PUBLISH_CONTRACT.approvedBinaries.recommendedBucket,
    pathConvention: STORAGE_PUBLISH_CONTRACT.approvedBinaries.pathConvention,
    operations: readyRecords.map((row) => ({
      action: 'COPY_IMMUTABLE_REVIEWED_PNG',
      from: row.file,
      to: buildStoragePath(row.canonicalSlug, row.assetId),
      sha256: row.sha256,
      reencode: false,
      resize: false,
      optimize: false,
      alterAlpha: false,
      overwriteReviewedPng: false,
      executeNow: false
    }))
  };

  const registryWritePlan = {
    executeNow: false,
    atomic: true,
    writeFile: REGISTRY_REL,
    writeSupabase: false,
    writeR2: false,
    oliveUnchanged: true,
    existingApproved: [{ canonicalSlug: 'olive', assetId: 'olive-mature-summer-vegetative-v1' }],
    newPromotions: readyRecords.map((row) => ({
      canonicalSlug: row.canonicalSlug,
      assetId: row.assetId,
      identityScope: row.identityScope,
      growthStage: row.growthStage,
      phenologyState: row.phenologyState
    })),
    totalApprovedBaselineAssetsAfterWrite: 1 + readyRecords.length,
    expectedIfAllThreePass: 4
  };

  const coverage = {
    ownedGarden: ownedGarden.garden.label,
    currentOwnedPlants: gardenPlantIds,
    gardenPlantIdsUnchanged: true,
    afterPromotionIfWriteCompletes: {
      ownedGardenBaselineCoverage: `${readyRecords.filter((row) =>
        ['mango', 'banana', 'pineapple'].includes(row.canonicalSlug)
      ).length} / 3 owned plants covered`,
      oliveRemainsApprovedCatalogBaselineSeparately: true
    }
  };

  const spend = executeOwnedGardenAssetPromotionFinalGate();
  const registryShaAfter = sha256File(registryAbs);
  if (registryShaAfter !== registryShaBefore) {
    throw new Error('final-gate: production registry mutated');
  }

  return {
    contract: OWNED_GARDEN_PROMOTION_FINAL_GATE_CONTRACT,
    verdict: 'OWNED_GARDEN_ASSET_PROMOTION_FINAL_GATE_READY',
    runId: OWNED_GARDEN_PROMOTION_FINAL_GATE_RUN_ID,
    ownerApprovals: OWNER_APPROVAL_RECORD,
    bananaIdentity,
    promotionReady,
    qa: {
      mango: mangoQa,
      banana: bananaQa,
      pineapple: pineappleQa
    },
    registryRecords: {
      mango: mangoRecord,
      banana: bananaRecord,
      pineapple: pineappleRecord
    },
    checksums: EXPECTED_SHA256,
    storagePlan,
    registryWritePlan,
    coverage,
    spend,
    productionRegistrySha256: registryShaAfter,
    productionRegistryWritten: false,
    binariesModified: false
  };
}

export function writeOwnedGardenAssetPromotionFinalGateReports(root = DEFAULT_ROOT) {
  const overlayDir = path.join(root, OVERLAY_REL);
  fs.mkdirSync(overlayDir, { recursive: true });
  const prepared = prepareOwnedGardenAssetPromotionFinalGate(root);
  const files = {
    summary: path.join(overlayDir, 'summary.json'),
    ownerApprovals: path.join(overlayDir, 'owner-approvals.json'),
    bananaIdentity: path.join(overlayDir, 'banana-identity-scope.json'),
    qaMatrix: path.join(overlayDir, 'qa-matrix.json'),
    registryRecords: path.join(overlayDir, 'registry-records.json'),
    checksums: path.join(overlayDir, 'checksums.json'),
    storagePlan: path.join(overlayDir, 'storage-plan.json'),
    registryWritePlan: path.join(overlayDir, 'registry-write-plan.json'),
    coverage: path.join(overlayDir, 'owned-garden-coverage.json'),
    spendGate: path.join(overlayDir, 'spend-gate.json')
  };
  fs.writeFileSync(files.summary, `${JSON.stringify(prepared, null, 2)}\n`);
  fs.writeFileSync(files.ownerApprovals, `${JSON.stringify(prepared.ownerApprovals, null, 2)}\n`);
  fs.writeFileSync(files.bananaIdentity, `${JSON.stringify(prepared.bananaIdentity, null, 2)}\n`);
  fs.writeFileSync(files.qaMatrix, `${JSON.stringify(prepared.qa, null, 2)}\n`);
  fs.writeFileSync(files.registryRecords, `${JSON.stringify(prepared.registryRecords, null, 2)}\n`);
  fs.writeFileSync(files.checksums, `${JSON.stringify(prepared.checksums, null, 2)}\n`);
  fs.writeFileSync(files.storagePlan, `${JSON.stringify(prepared.storagePlan, null, 2)}\n`);
  fs.writeFileSync(files.registryWritePlan, `${JSON.stringify(prepared.registryWritePlan, null, 2)}\n`);
  fs.writeFileSync(files.coverage, `${JSON.stringify(prepared.coverage, null, 2)}\n`);
  fs.writeFileSync(files.spendGate, `${JSON.stringify(OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE, null, 2)}\n`);
  return {
    overlayDir,
    promotionReady: prepared.promotionReady,
    bananaGateRequired: prepared.bananaIdentity.BANANA_IDENTITY_SCOPE_GATE_REQUIRED,
    openaiCalls: 0,
    productionRegistryWritten: false
  };
}
