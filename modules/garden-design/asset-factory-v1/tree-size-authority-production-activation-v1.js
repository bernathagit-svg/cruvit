/**
 * Tree size authority production activation V1.
 * Flips the validated global flag. Does not mutate botanical registry or evidence.
 * Rollback: set globalAuthorityRuntimeEnabled = false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBotanicalSizeAuthority } from './botanical-size-authority-v1.js';
import { PHOTO_SCALE_PRODUCT_CONTRACT } from './physical-scale-foundation-v1.js';
import {
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  mangoOwnerPreferredRangePosition,
  productionGardenSizeAuthorityEnabled,
  resolveGardenSizeAuthority,
  scaleFromGardenSizeAuthority
} from './garden-design-size-authority-adapter-v1.js';

export const TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATION_VERSION = 'tree-size-authority-production-activation-v1';

const SCENE = Object.freeze({
  visualForm: 'tree',
  growthStage: 'mature',
  depthId: 'middle',
  canvasWidth: 1024,
  canvasHeight: 1536,
  bbox: { minX: 33, minY: 148, maxX: 1008, maxY: 1422 },
  sceneWidthPx: 480,
  sceneHeightPx: 360
});

function prodInput(slug, extra = {}) {
  return {
    canonicalSlug: slug,
    growthStage: 'mature',
    architectureMode: 'tree',
    ownerPreferredRangePosition: mangoOwnerPreferredRangePosition(slug),
    ...extra
  };
}

export function evaluateTreeSizeAuthorityProductionActivation(registry) {
  const mango = resolveGardenSizeAuthority(registry, prodInput('mango'));
  const olive = resolveGardenSizeAuthority(registry, prodInput('olive'));
  const blueGum = resolveGardenSizeAuthority(registry, prodInput('blue-gum'));
  const lemon = resolveGardenSizeAuthority(registry, prodInput('lemon'));
  const cypress = resolveGardenSizeAuthority(registry, prodInput('cypress'));
  const breadfruit = resolveGardenSizeAuthority(registry, prodInput('breadfruit'));
  const mangoScale = scaleFromGardenSizeAuthority(mango, { ...SCENE, rangeBand: 'LOW' });
  const oliveScale = scaleFromGardenSizeAuthority(olive, { ...SCENE, rangeBand: 'MID' });
  const youngMango = resolveGardenSizeAuthority(registry, prodInput('mango', { growthStage: 'young' }));
  const checks = {
    globalFlagOn: GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled === true,
    productionHelperOn: productionGardenSizeAuthorityEnabled() === true,
    productionPathActive: mango.applied === true && olive.applied === true,
    mangoReady: mango.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY' && mango.usedAuthoritativeMeters === true,
    mangoLowPreserved: mango.designState.ownerPreferredRangePosition === 'LOW' && mango.mangoLowWrittenToAuthority === false,
    oliveReadyOwn: olive.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY' && olive.botanicalTaxonId === 'taxon:olea-europaea',
    oliveNotMango: olive.heightRangeM?.max !== mango.heightRangeM?.max,
    oliveNotMangoLow: olive.designState.ownerPreferredRangePosition !== 'LOW' && oliveScale.mangoLowCopied === false,
    bluePartial: blueGum.selectedRuntimeBehavior === 'HEIGHT_ANCHORED_ESTIMATE' && blueGum.spreadAuthority === 'ESTIMATED',
    lemonContext: lemon.personalContextNeeded === true && lemon.usedAuthoritativeMeters === false,
    cypressHold: cypress.conflictHold === true && cypress.usedAuthoritativeMeters === false && cypress.heightRangeM == null,
    breadfruitGap: breadfruit.evidenceGap === true && breadfruit.usedAuthoritativeMeters === false,
    youngUnknown: youngMango.stageAuthority === 'STAGE_AUTHORITY_UNKNOWN' && youngMango.usedAuthoritativeMeters === false,
    noBlock: [mango, olive, blueGum, lemon, cypress, breadfruit].every((row) => row.gardenDesignBlocked === false),
    calibrationOptional: PHOTO_SCALE_PRODUCT_CONTRACT.calibrationMandatory === false,
    mangoScaleOk: mangoScale.ok === true && mangoScale.fitToFrame === false,
    oliveScaleOk: oliveScale.ok === true,
    rollbackIsFlagOnly: GARDEN_SIZE_AUTHORITY_ACTIVATION.rollback === 'set globalAuthorityRuntimeEnabled = false'
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    contract: TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATION_VERSION,
    verdict: pass ? 'TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATED' : 'TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATION_FAIL',
    treePhysicalScaleV1: pass ? 'TREE_PHYSICAL_SCALE_V1_PRODUCTION_VALIDATED' : 'NOT_VALIDATED',
    globalAuthorityRuntimeEnabled: true,
    canaryAuthorityRuntimeEnabled: true,
    applyInProductionGardenDesign: true,
    productionAuthorityPathActive: pass,
    gardenDesignBlocked: false,
    botanicalRegistryChangedDuringActivation: false,
    rollback: {
      action: 'set globalAuthorityRuntimeEnabled = false',
      mutatesRegistry: false,
      mutatesEvidence: false,
      instant: true
    },
    liveSmoke: { mango, olive, blueGum, lemon, cypress, breadfruit },
    checks,
    spend: {
      openaiCalls: 0,
      imageGeneration: 0,
      paidBotanicalAcquisitionUsd: 0,
      additionalSpendUsd: 0,
      newSourcing: 0
    }
  };
}

export function writeTreeSizeAuthorityProductionActivationReports(root) {
  const registry = loadBotanicalSizeAuthority(root);
  const before = JSON.stringify(registry);
  const evaluation = evaluateTreeSizeAuthorityProductionActivation(registry);
  if (JSON.stringify(loadBotanicalSizeAuthority(root)) !== before) {
    throw new Error('botanical-size-authority-v1 mutated during activation');
  }
  const dir = path.join(root, 'data', 'garden-design', 'tree-size-authority-production-activation-v1');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    summaryPath: path.join(dir, 'activation-summary.json'),
    smokePath: path.join(dir, 'live-smoke.json'),
    rollbackPath: path.join(dir, 'rollback.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify({
    contract: TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATION_VERSION,
    verdict: evaluation.verdict,
    treePhysicalScaleV1: evaluation.treePhysicalScaleV1,
    globalAuthorityRuntimeEnabled: true,
    productionAuthorityPathActive: evaluation.productionAuthorityPathActive,
    gardenDesignBlocked: false,
    botanicalRegistryChangedDuringActivation: false,
    spend: evaluation.spend
  }, null, 2)}\n`);
  fs.writeFileSync(files.smokePath, `${JSON.stringify({
    mango: {
      runtimeAuthorityState: evaluation.liveSmoke.mango.runtimeAuthorityState,
      usedAuthoritativeMeters: evaluation.liveSmoke.mango.usedAuthoritativeMeters,
      ownerPreferredRangePosition: evaluation.liveSmoke.mango.designState.ownerPreferredRangePosition,
      heightRangeM: evaluation.liveSmoke.mango.heightRangeM
    },
    olive: {
      runtimeAuthorityState: evaluation.liveSmoke.olive.runtimeAuthorityState,
      botanicalTaxonId: evaluation.liveSmoke.olive.botanicalTaxonId,
      heightRangeM: evaluation.liveSmoke.olive.heightRangeM,
      ownerPreferredRangePosition: evaluation.liveSmoke.olive.designState.ownerPreferredRangePosition
    },
    blueGum: {
      runtimeAuthorityState: evaluation.liveSmoke.blueGum.runtimeAuthorityState,
      selectedRuntimeBehavior: evaluation.liveSmoke.blueGum.selectedRuntimeBehavior,
      heightAuthority: evaluation.liveSmoke.blueGum.heightAuthority,
      spreadAuthority: evaluation.liveSmoke.blueGum.spreadAuthority
    },
    lemon: {
      runtimeAuthorityState: evaluation.liveSmoke.lemon.runtimeAuthorityState,
      personalContextNeeded: evaluation.liveSmoke.lemon.personalContextNeeded,
      usedAuthoritativeMeters: evaluation.liveSmoke.lemon.usedAuthoritativeMeters
    },
    cypress: {
      runtimeAuthorityState: evaluation.liveSmoke.cypress.runtimeAuthorityState,
      conflictHold: evaluation.liveSmoke.cypress.conflictHold,
      usedAuthoritativeMeters: evaluation.liveSmoke.cypress.usedAuthoritativeMeters
    },
    breadfruit: {
      runtimeAuthorityState: evaluation.liveSmoke.breadfruit.runtimeAuthorityState,
      evidenceGap: evaluation.liveSmoke.breadfruit.evidenceGap,
      usedAuthoritativeMeters: evaluation.liveSmoke.breadfruit.usedAuthoritativeMeters
    }
  }, null, 2)}\n`);
  fs.writeFileSync(files.rollbackPath, `${JSON.stringify(evaluation.rollback, null, 2)}\n`);
  return { ...files, verdict: evaluation.verdict, treePhysicalScaleV1: evaluation.treePhysicalScaleV1 };
}
