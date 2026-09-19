/**
 * Writes Garden Design size-authority integration overlay. No production garden wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBotanicalSizeAuthority } from './botanical-size-authority-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';
import {
  GARDEN_DESIGN_SIZE_AUTHORITY_INTEGRATION_VERSION,
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  GLOBAL_ACTIVATION_PROPOSAL,
  SIZE_AUTHORITY_CANARY_SLUGS,
  resolveGardenSizeAuthority,
  scaleFromGardenSizeAuthority
} from './garden-design-size-authority-adapter-v1.js';

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

function caseInput(slug, extra = {}) {
  return {
    canonicalSlug: slug,
    growthStage: 'mature',
    architectureMode: 'tree',
    canaryContext: true,
    ...extra
  };
}

export function evaluateSizeAuthorityCanary(registry) {
  const mango = resolveGardenSizeAuthority(registry, caseInput('mango', {
    ownerPreferredRangePosition: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition
  }));
  const olive = resolveGardenSizeAuthority(registry, caseInput('olive'));
  const blueGum = resolveGardenSizeAuthority(registry, caseInput('blue-gum'));
  const lemon = resolveGardenSizeAuthority(registry, caseInput('lemon'));
  const cypress = resolveGardenSizeAuthority(registry, caseInput('cypress'));
  const breadfruit = resolveGardenSizeAuthority(registry, caseInput('breadfruit'));
  const mangoScale = scaleFromGardenSizeAuthority(mango, { ...SCENE, rangeBand: 'LOW' });
  const oliveScale = scaleFromGardenSizeAuthority(olive, { ...SCENE, rangeBand: 'MID' });
  const blueScale = scaleFromGardenSizeAuthority(blueGum, SCENE);
  const checks = {
    mangoReady: mango.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY' && mango.previewScenario === 'LANDSCAPE_MATURE' && mango.usedAuthoritativeMeters,
    mangoLowIsDesignState: mango.designState.ownerPreferredRangePosition === 'LOW' && mango.mangoLowWrittenToAuthority === false,
    oliveReadyOwnEvidence: olive.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY' && olive.botanicalTaxonId === 'taxon:olea-europaea',
    oliveNotMangoSize: olive.heightRangeM?.min !== mango.heightRangeM?.min || olive.heightRangeM?.max !== mango.heightRangeM?.max,
    oliveNotMangoLow: olive.designState.ownerPreferredRangePosition !== 'LOW',
    blueGumPartial: blueGum.selectedRuntimeBehavior === 'HEIGHT_ANCHORED_ESTIMATE' && blueGum.heightAuthority === 'SOURCE_SUPPORTED' && blueGum.spreadAuthority === 'ESTIMATED',
    lemonContext: lemon.personalContextNeeded === true && lemon.usedAuthoritativeMeters === false,
    cypressHold: cypress.conflictHold === true && cypress.usedAuthoritativeMeters === false,
    breadfruitGap: breadfruit.evidenceGap === true && breadfruit.usedAuthoritativeMeters === false,
    noGardenBlock: [mango, olive, blueGum, lemon, cypress, breadfruit].every((row) => row.gardenDesignBlocked === false),
    globalOff: GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled === false,
    productionGardenOff: GARDEN_SIZE_AUTHORITY_ACTIVATION.applyInProductionGardenDesign === false,
    inactiveWithoutCanary: resolveGardenSizeAuthority(registry, { canonicalSlug: 'mango' }).applied === false,
    mangoScaleOk: mangoScale.ok === true,
    oliveScaleOk: oliveScale.ok === true && oliveScale.mangoLowCopied === false,
    blueSpreadNotBotanical: blueScale.spreadSourceSupported === false
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    contract: GARDEN_DESIGN_SIZE_AUTHORITY_INTEGRATION_VERSION,
    verdict: pass ? 'GARDEN_DESIGN_SIZE_AUTHORITY_CANARY_PASS' : 'GARDEN_DESIGN_SIZE_AUTHORITY_CANARY_FAIL',
    checks,
    cases: { mango, olive, blueGum, lemon, cypress, breadfruit },
    canarySlugs: SIZE_AUTHORITY_CANARY_SLUGS,
    activation: GARDEN_SIZE_AUTHORITY_ACTIVATION,
    globalActivationProposal: GLOBAL_ACTIVATION_PROPOSAL,
    spend: { openaiCalls: 0, imageGeneration: 0, paidBotanicalAcquisitionUsd: 0, additionalSpendUsd: 0, newSourcing: 0 }
  };
}

export function writeGardenDesignSizeAuthorityIntegrationReports(root) {
  const registry = loadBotanicalSizeAuthority(root);
  const evaluation = evaluateSizeAuthorityCanary(registry);
  const dir = path.join(root, 'data', 'garden-design', 'garden-design-size-authority-integration-v1');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    summaryPath: path.join(dir, 'integration-summary.json'),
    canaryPath: path.join(dir, 'canary-results.json'),
    activationPath: path.join(dir, 'global-activation-proposal.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify({
    contract: GARDEN_DESIGN_SIZE_AUTHORITY_INTEGRATION_VERSION,
    verdict: evaluation.verdict,
    runtimeWired: false,
    globalAuthorityRuntimeEnabled: false,
    canaryAuthorityRuntimeEnabled: true,
    applyInProductionGardenDesign: false,
    gardenDesignBlocked: false,
    photoCalibrationMandatory: false,
    spend: evaluation.spend
  }, null, 2)}\n`);
  fs.writeFileSync(files.canaryPath, `${JSON.stringify(evaluation, null, 2)}\n`);
  fs.writeFileSync(files.activationPath, `${JSON.stringify(GLOBAL_ACTIVATION_PROPOSAL, null, 2)}\n`);
  return { ...files, verdict: evaluation.verdict };
}
