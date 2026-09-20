/**
 * Owner-selected BRANCH_STRUCTURE Cleanup C lock. Zero spend. No generation.
 * Does not overwrite provider originals. Does not write production registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';
import { QUALITY_POLICY_SPEND_GATE } from './design-asset-quality-policy-v1.js';
import {
  QUALITY_PLANNING_STATE,
  PLANNING_COST_ESTIMATE_USD,
  auditRequiredVariantQualityIntegrity,
  writeQualityPlanningIntegrityReports
} from './design-asset-quality-planning-integrity-v1.js';
import {
  BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1,
  BRANCH_STRUCTURE_ALPHA_CLEANUP_PARAMETERS,
  BRANCH_STRUCTURE_ALPHA_CLEANUP_RULES,
  BRANCH_STRUCTURE_ALPHA_CLEANUP_SCOPE,
  SELECTED_CLEANUP
} from './branch-structure-alpha-cleanup-contract-v1.js';
import {
  NEW_APPLE_DORMANT_CANDIDATE,
  assertSalvageOriginalsUnmodified
} from './branch-alpha-salvage-feasibility-v1.js';
import { APPLE_DORMANT_CANDIDATE, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const BRANCH_STRUCTURE_ALPHA_CLEANUP_V1 = 'branch-structure-alpha-cleanup-v1';

export const OWNER_CLEANUP_DECISION = Object.freeze({
  runId: 'design-asset-branch-alpha-salvage-1',
  ownerPreferredCleanup: 'C',
  BRANCH_STRUCTURE_ALPHA_SALVAGE: 'PASS',
  selectedCleanup: SELECTED_CLEANUP,
  BRANCH_STRUCTURE_OK: true,
  DETAIL_OK: true,
  familyPolicy: 'MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP',
  highRequired: false,
  rawProviderPassed: false,
  ASSET_PRODUCTION_APPROVAL: 'NO',
  BOTANICAL_IDENTITY_QA: 'UNKNOWN',
  STATE_QA: 'UNKNOWN',
  IN_GARDEN_QA: 'UNKNOWN',
  OWNER_ASSET_APPROVAL: 'NO',
  notSelected: Object.freeze(['ORIGINAL', 'A', 'B'])
});

const PROVIDER_ORIGINAL_REL = NEW_APPLE_DORMANT_CANDIDATE.file;
const CLEANUP_C_SOURCE_REL =
  'modules/garden-design/assets/plants/branch-alpha-salvage-feasibility-1/new-cleanup-c.png';
const DERIVED_REL =
  'modules/garden-design/assets/plants/branch-structure-calibration-1/apple__mature__tree__dormant__branch-structure-v2__medium__cleanup-c.png';
const OVERLAY_REL = path.join('data', 'garden-design', 'branch-structure-alpha-cleanup-v1');
const REGISTRY_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);
const OLIVE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'olive-tree',
  'variants',
  'summer-mature.png'
);

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

export function executeBranchStructureAlphaCleanupV1() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    highExecuted: false,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    massGenerationStarted: false,
    productionRegistryChanged: false,
    originalsOverwritten: false,
    factoryGenerateOnRender: DESIGN_ASSET_FACTORY.generateOnRender,
    qualityPolicySpendGate: QUALITY_POLICY_SPEND_GATE.state
  };
}

function youngWoodyAudit(variants) {
  const rows = (variants || []).filter(
    (row) =>
      row.growthStage === 'young' &&
      row.variantDetailDemand === 'FOLIAGE_OPEN' &&
      row.qualityPlanningState === QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED
  );
  return {
    remaining: rows.map((row) => ({
      canonicalSlug: row.canonicalSlug,
      architectureMode: row.architectureMode,
      growthStage: row.growthStage,
      phenologyState: row.phenologyState,
      baseDetailClass: row.baseDetailClass,
      variantDetailDemand: row.variantDetailDemand,
      qualityPlanningState: row.qualityPlanningState
    })),
    avocadoOpenLargeLeafMedium: {
      applicable: false,
      reason: 'Avocado is WOODY_OPEN_OR_LARGE_LEAF mature vegetative. Not the same morphology as young dense-small-leaf mango/apple/pomegranate.'
    },
    batch2YoungMango: {
      applicable: false,
      reason: 'Batch-2 mango young was ASSET_DETAIL_SOFT. Softness evidence is not sufficient to validate young woody FOLIAGE_OPEN quality policy.'
    },
    promoted: false,
    keepQualityCalibrationRequired: true,
    doNotForceClosure: true
  };
}

function factoryPath() {
  return {
    generateOnRender: false,
    automaticRegeneration: false,
    automaticHighEscalation: false,
    steps: [
      'generation (owner-approved envelope only)',
      'technical QA',
      'detect branch-alpha failure pattern',
      'deterministic Cleanup C contract',
      'derived candidate with provenance',
      'QA',
      'owner/review policy'
    ],
    ifCleanupCannotPreserveStructure: 'BRANCH_ALPHA_CLEANUP_FAILED',
    doNotSilentlyAcceptProviderOriginal: true
  };
}

export function writeBranchStructureAlphaCleanupReports(root = DEFAULT_ROOT) {
  assertAppleDormantUnmodified(root);
  assertSalvageOriginalsUnmodified(root);
  const registryBefore = sha256File(path.join(root, REGISTRY_REL));
  const originalBefore = sha256File(path.join(root, PROVIDER_ORIGINAL_REL));
  const controlBefore = sha256File(path.join(root, APPLE_DORMANT_CANDIDATE.file));
  const oliveBefore = fs.existsSync(path.join(root, OLIVE_REL))
    ? sha256File(path.join(root, OLIVE_REL))
    : null;
  const cleanupSourceAbs = path.join(root, CLEANUP_C_SOURCE_REL);
  if (!fs.existsSync(cleanupSourceAbs)) {
    const err = new Error('CLEANUP_C_SOURCE_MISSING');
    err.code = 'CLEANUP_C_SOURCE_MISSING';
    throw err;
  }
  const derivedAbs = path.join(root, DERIVED_REL);
  fs.mkdirSync(path.dirname(derivedAbs), { recursive: true });
  fs.copyFileSync(cleanupSourceAbs, derivedAbs);
  const derivedSha = sha256File(derivedAbs);
  const sourceSha = sha256File(cleanupSourceAbs);
  if (derivedSha !== sourceSha) {
    const err = new Error('DERIVED_COPY_MISMATCH');
    err.code = 'DERIVED_COPY_MISMATCH';
    throw err;
  }
  if (derivedSha === originalBefore) {
    const err = new Error('DERIVED_EQUALS_ORIGINAL');
    err.code = 'DERIVED_EQUALS_ORIGINAL';
    throw err;
  }

  const integrityWritten = writeQualityPlanningIntegrityReports(root);
  const audit = auditRequiredVariantQualityIntegrity(root);
  const states = audit.planningStates;
  const mediumCount = audit.plannedQuality.medium;
  const highCount = audit.plannedQuality.high;
  const cleanupCount = audit.BRANCH_CLEANUP_REQUIRED_VARIANTS;
  const unresolved = states.QUALITY_CALIBRATION_REQUIRED;
  const blocked = states.UNKNOWN_BLOCKED;
  const mediumUsd = PLANNING_COST_ESTIMATE_USD.medium;
  const highUsd = PLANNING_COST_ESTIMATE_USD.high;
  const projectedGenerationCost = +((mediumCount - unresolved) * mediumUsd).toFixed(6);
  const projectedHighCost = +(highCount * highUsd).toFixed(6);
  const totalProjectedAiCost = +(projectedGenerationCost + projectedHighCost).toFixed(6);

  const provenance = {
    providerOriginalAsset: {
      assetId: NEW_APPLE_DORMANT_CANDIDATE.jobId,
      file: PROVIDER_ORIGINAL_REL,
      sha256: originalBefore,
      immutable: true
    },
    derivedCleanupAsset: {
      assetId: `${NEW_APPLE_DORMANT_CANDIDATE.jobId}__cleanup-c`,
      file: DERIVED_REL.replace(/\\/g, '/'),
      sha256: derivedSha,
      sourceCandidateAssetId: NEW_APPLE_DORMANT_CANDIDATE.jobId,
      cleanupContractVersion: BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1,
      selectedCleanup: SELECTED_CLEANUP,
      deterministicParameters: BRANCH_STRUCTURE_ALPHA_CLEANUP_PARAMETERS,
      checksum: derivedSha,
      derivedTimestamp: new Date().toISOString(),
      aiTransformation: false,
      copiedFrom: CLEANUP_C_SOURCE_REL
    },
    historicalControlUnchanged: {
      file: APPLE_DORMANT_CANDIDATE.file,
      sha256: controlBefore,
      notApproved: true
    }
  };

  const spend = executeBranchStructureAlphaCleanupV1();
  const young = youngWoodyAudit(audit.variants);
  const integritySummary = JSON.parse(fs.readFileSync(integrityWritten.summaryPath, 'utf8'));
  const summary = {
    contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_V1,
    verdict: 'BRANCH_STRUCTURE_ALPHA_CLEANUP_V1_READY',
    ownerDecision: OWNER_CLEANUP_DECISION,
    cleanupContract: {
      name: BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1,
      productionizeNow: false,
      applyToArbitraryPlantAssets: false,
      rules: BRANCH_STRUCTURE_ALPHA_CLEANUP_RULES,
      scope: BRANCH_STRUCTURE_ALPHA_CLEANUP_SCOPE,
      parameters: BRANCH_STRUCTURE_ALPHA_CLEANUP_PARAMETERS
    },
    originalVsDerived: provenance,
    branchStructureQualityResult: {
      IMAGE_DETAIL_QUALITY: 'BRANCH_STRUCTURE_OK + DETAIL_OK',
      familyPolicy: 'MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP',
      pipeline: 'MEDIUM generation → branch-specific deterministic cleanup C → owner/QA review',
      highRequired: false,
      rawProviderPasses: false,
      ASSET_PRODUCTION_APPROVAL: 'NO'
    },
    audit273: {
      requiredVariantsTotal: audit.requiredVariantsTotal,
      MEDIUM_EVIDENCE_SUPPORTED: states.MEDIUM_EVIDENCE_SUPPORTED,
      HIGH_EVIDENCE_SUPPORTED: states.HIGH_EVIDENCE_SUPPORTED,
      MEDIUM_DEFAULT_UNPROVEN: states.MEDIUM_DEFAULT_UNPROVEN,
      QUALITY_CALIBRATION_REQUIRED: states.QUALITY_CALIBRATION_REQUIRED,
      UNKNOWN_BLOCKED: states.UNKNOWN_BLOCKED,
      BRANCH_CLEANUP_REQUIRED_VARIANTS: cleanupCount
    },
    youngWoody: young,
    factoryPath: factoryPath(),
    massGeneration: {
      QUALITY_POLICY_MASS_GENERATION_READY: integritySummary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY,
      startMassGeneration: false,
      generateNow: false,
      reasons: integritySummary.massGeneration.reasons
    },
    costProjection: {
      mediumGenerationCount: mediumCount - unresolved,
      highGenerationCount: highCount,
      deterministicCleanupCount: cleanupCount,
      unresolvedGenerationCount: unresolved,
      blockedVariants: blocked,
      unitEstimateUsd: PLANNING_COST_ESTIMATE_USD,
      PROJECTED_GENERATION_COST: projectedGenerationCost,
      PROJECTED_HIGH_COST: projectedHighCost,
      BRANCH_CLEANUP_AI_COST: 0,
      TOTAL_PROJECTED_AI_COST: totalProjectedAiCost,
      notSpendAuthorization: true
    },
    productionImpact: {
      originalPngsModified: false,
      productionRegistryChanged: false,
      oliveAssetChanged: false,
      botanicalSizeAuthorityChanged: false,
      treePhysicalScaleChanged: false,
      massGenerationStarted: false
    },
    spend
  };

  const overlayDir = path.join(root, OVERLAY_REL);
  fs.mkdirSync(overlayDir, { recursive: true });
  fs.writeFileSync(path.join(overlayDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    path.join(overlayDir, 'owner-decision.json'),
    `${JSON.stringify({ contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_V1, ...OWNER_CLEANUP_DECISION }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(overlayDir, 'cleanup-contract.json'),
    `${JSON.stringify(summary.cleanupContract, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(overlayDir, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(overlayDir, 'required-variant-quality-recalc.json'),
    `${JSON.stringify({ contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_V1, ...summary.audit273, youngWoody: young }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(overlayDir, 'spend-gate.json'),
    `${JSON.stringify({ contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_V1, gate: spend }, null, 2)}\n`
  );

  assertSalvageOriginalsUnmodified(root);
  assertAppleDormantUnmodified(root);
  if (sha256File(path.join(root, PROVIDER_ORIGINAL_REL)) !== originalBefore) {
    const err = new Error('ORIGINAL_PNG_MODIFIED');
    err.code = 'ORIGINAL_PNG_MODIFIED';
    throw err;
  }
  if (sha256File(path.join(root, REGISTRY_REL)) !== registryBefore) {
    const err = new Error('REGISTRY_CHANGED');
    err.code = 'REGISTRY_CHANGED';
    throw err;
  }
  if (oliveBefore && sha256File(path.join(root, OLIVE_REL)) !== oliveBefore) {
    const err = new Error('OLIVE_CHANGED');
    err.code = 'OLIVE_CHANGED';
    throw err;
  }

  return {
    verdict: 'BRANCH_STRUCTURE_ALPHA_CLEANUP_V1_READY',
    overlayDir: OVERLAY_REL.replace(/\\/g, '/'),
    derivedFile: DERIVED_REL.replace(/\\/g, '/'),
    massReady: summary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY,
    audit273: summary.audit273
  };
}
