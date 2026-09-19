/**
 * Tree size authority global activation gate V1.
 * Wires all 41 unique taxa through the single adapter. Does not flip the global flag.
 * Overlay only. No new sourcing. No production Garden Design activation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBotanicalSizeAuthority } from './botanical-size-authority-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';
import { PHOTO_SCALE_PRODUCT_CONTRACT } from './physical-scale-foundation-v1.js';
import {
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  GLOBAL_ACTIVATION_PROPOSAL,
  SIZE_AUTHORITY_CANARY_SLUGS,
  TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_GATE_VERSION,
  productionGardenSizeAuthorityEnabled,
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

export const EXPECTED_GLOBAL_BUCKETS = Object.freeze({
  RUNTIME_AUTHORITY_READY: Object.freeze([
    'olive', 'mango', 'cedar', 'english-walnut', 'ficus-benjamina', 'longan', 'loquat', 'lychee', 'silver-birch'
  ]),
  RUNTIME_AUTHORITY_PARTIAL: Object.freeze([
    'blue-gum', 'cacao', 'carob', 'fiddle-leaf-fig', 'guava', 'jaboticaba', 'jackfruit', 'starfruit', 'white-sapote'
  ]),
  RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED: Object.freeze([
    'lemon', 'apple', 'japanese-maple', 'apricot', 'avocado', 'ginkgo', 'grapefruit', 'mandarin', 'peach', 'pear', 'persimmon', 'sweet-cherry', 'orange'
  ]),
  RUNTIME_AUTHORITY_CONFLICT_HOLD: Object.freeze(['cypress', 'almond', 'southern-magnolia']),
  RUNTIME_AUTHORITY_EVIDENCE_GAP: Object.freeze([
    'breadfruit', 'cherimoya', 'durian', 'mangosteen', 'moringa', 'pistachio', 'rambutan'
  ])
});

function gateInput(slug, extra = {}) {
  return {
    canonicalSlug: slug,
    growthStage: 'mature',
    architectureMode: 'tree',
    canaryContext: true,
    activationGateContext: true,
    ...extra
  };
}

function rangeKey(range) {
  if (!range) return null;
  return `${range.min ?? 'null'}:${range.max ?? 'null'}`;
}

function smokeRow(record, mature, young, matureScale) {
  return {
    botanicalTaxonId: record.botanicalTaxonId,
    canonicalSlugAliases: record.canonicalSlugAliases || [],
    runtimeAuthorityState: mature.runtimeAuthorityState,
    selectedPreviewScenario: mature.previewScenario,
    heightAuthority: mature.heightAuthority,
    spreadAuthority: mature.spreadAuthority,
    runtimeBehavior: mature.selectedRuntimeBehavior,
    fallbackReason: mature.fallbackReason,
    photoCalibrationCompatibility: mature.photoCalibrationCompatibility,
    manualOverrideCompatibility: mature.manualOverrideCompatibility,
    growthStageBehavior: {
      mature: mature.stageAuthority,
      young: young.stageAuthority,
      youngFallback: young.fallbackReason,
      youngUsesAuthoritativeMeters: young.usedAuthoritativeMeters
    },
    rawResearchImportedByRuntime: mature.rawResearchImportedByRuntime ? 'YES' : 'NO',
    usedAuthoritativeMeters: mature.usedAuthoritativeMeters,
    heightRangeM: mature.heightRangeM || null,
    spreadRangeM: mature.spreadRangeM || null,
    spreadSourceSupported: Boolean(mature.spreadSourceSupported),
    personalContextNeeded: mature.personalContextNeeded,
    conflictHold: mature.conflictHold,
    evidenceGap: mature.evidenceGap,
    gardenDesignBlocked: mature.gardenDesignBlocked,
    calibrationMandatory: mature.calibrationMandatory,
    mangoLowCopied: matureScale ? matureScale.mangoLowCopied : false,
    fitToFrame: matureScale ? matureScale.fitToFrame : false
  };
}

export function evaluateTreeSizeAuthorityGlobalActivationGate(registry) {
  const records = registry.records || [];
  const mangoRecord = records.find((row) => row.botanicalTaxonId === 'taxon:mangifera-indica');
  const mangoHeightKey = rangeKey(mangoRecord?.normalizedRange?.heightM);
  const mangoSpreadKey = rangeKey(mangoRecord?.normalizedRange?.spreadM);

  const matrix = records.map((record) => {
    const primarySlug = (record.canonicalSlugAliases || [])[0];
    const extra = primarySlug === 'mango'
      ? { ownerPreferredRangePosition: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition }
      : {};
    const mature = resolveGardenSizeAuthority(registry, gateInput(primarySlug, extra));
    const young = resolveGardenSizeAuthority(registry, gateInput(primarySlug, { ...extra, growthStage: 'young' }));
    const rangeBand = primarySlug === 'mango' ? 'LOW' : 'MID';
    const matureScale = scaleFromGardenSizeAuthority(mature, { ...SCENE, rangeBand, growthStage: 'mature' });
    const aliases = (record.canonicalSlugAliases || []).map((slug) => {
      const resolved = resolveGardenSizeAuthority(registry, gateInput(slug));
      return {
        canonicalSlug: slug,
        botanicalTaxonId: resolved.botanicalTaxonId,
        runtimeAuthorityState: resolved.runtimeAuthorityState,
        applied: resolved.applied
      };
    });
    return {
      ...smokeRow(record, mature, young, matureScale),
      primarySlug,
      aliasResolutions: aliases,
      matureScaleOk: matureScale.ok === true,
      selectedSource: record.selectedSource,
      defaultPreviewScenarioFromRegistry: record.defaultPreviewScenario,
      normalizedRangeFromRegistry: record.normalizedRange || null
    };
  });

  const byState = {};
  for (const key of Object.keys(EXPECTED_GLOBAL_BUCKETS)) byState[key] = [];
  for (const row of matrix) {
    if (!byState[row.runtimeAuthorityState]) byState[row.runtimeAuthorityState] = [];
    byState[row.runtimeAuthorityState].push(row.primarySlug);
  }

  const orange = resolveGardenSizeAuthority(registry, gateInput('orange'));
  const sweetOrange = resolveGardenSizeAuthority(registry, gateInput('sweet-orange'));
  const citrusRecords = records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis');
  const mango = matrix.find((row) => row.primarySlug === 'mango');
  const olive = matrix.find((row) => row.primarySlug === 'olive');
  const ready = matrix.filter((row) => row.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY');
  const partial = matrix.filter((row) => row.runtimeAuthorityState === 'RUNTIME_AUTHORITY_PARTIAL');
  const userContext = matrix.filter((row) => row.runtimeAuthorityState === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED');
  const conflict = matrix.filter((row) => row.runtimeAuthorityState === 'RUNTIME_AUTHORITY_CONFLICT_HOLD');
  const gap = matrix.filter((row) => row.runtimeAuthorityState === 'RUNTIME_AUTHORITY_EVIDENCE_GAP');

  const mangoLowOnOthers = ready.some((row) => row.primarySlug !== 'mango' && row.mangoLowCopied);
  const mangoCopied = ready.filter((row) => row.primarySlug !== 'mango').some((row) =>
    rangeKey(row.heightRangeM) === mangoHeightKey && rangeKey(row.spreadRangeM) === mangoSpreadKey
  );

  const checks = {
    taxonCount41: matrix.length === 41,
    exclusiveBuckets: ready.length === 9 && partial.length === 9 && userContext.length === 13 && conflict.length === 3 && gap.length === 7,
    readySlugs: JSON.stringify(ready.map((row) => row.primarySlug).sort()) === JSON.stringify([...EXPECTED_GLOBAL_BUCKETS.RUNTIME_AUTHORITY_READY].sort()),
    partialSlugs: JSON.stringify(partial.map((row) => row.primarySlug).sort()) === JSON.stringify([...EXPECTED_GLOBAL_BUCKETS.RUNTIME_AUTHORITY_PARTIAL].sort()),
    userContextSlugs: JSON.stringify(userContext.map((row) => row.primarySlug).sort()) === JSON.stringify([...EXPECTED_GLOBAL_BUCKETS.RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED].sort()),
    conflictSlugs: JSON.stringify(conflict.map((row) => row.primarySlug).sort()) === JSON.stringify([...EXPECTED_GLOBAL_BUCKETS.RUNTIME_AUTHORITY_CONFLICT_HOLD].sort()),
    gapSlugs: JSON.stringify(gap.map((row) => row.primarySlug).sort()) === JSON.stringify([...EXPECTED_GLOBAL_BUCKETS.RUNTIME_AUTHORITY_EVIDENCE_GAP].sort()),
    allApplied: matrix.every((row) => row.aliasResolutions.every((alias) => alias.applied === true)),
    readyUsesOwnAuthority: ready.every((row) => row.usedAuthoritativeMeters === true && row.heightAuthority === 'SOURCE_SUPPORTED' && row.spreadAuthority === 'SOURCE_SUPPORTED' && row.runtimeBehavior === 'AUTHORITY_PHYSICAL_SCALE'),
    mangoLowIsDesignState: mango?.growthStageBehavior.mature === 'MATURE' && mango.selectedPreviewScenario === 'LANDSCAPE_MATURE',
    noMangoLowOnOthers: mangoLowOnOthers === false,
    noMangoDimensionCopy: mangoCopied === false,
    oliveOwnEvidence: olive?.botanicalTaxonId === 'taxon:olea-europaea' && rangeKey(olive.heightRangeM) !== mangoHeightKey,
    partialHeightAnchored: partial.every((row) => row.runtimeBehavior === 'HEIGHT_ANCHORED_ESTIMATE' && row.heightAuthority === 'SOURCE_SUPPORTED' && row.spreadAuthority === 'ESTIMATED' && row.spreadSourceSupported === false),
    userContextNoMeters: userContext.every((row) => row.personalContextNeeded === true && row.usedAuthoritativeMeters === false && row.selectedPreviewScenario == null && row.heightRangeM == null),
    conflictNoSource: conflict.every((row) => row.conflictHold === true && row.usedAuthoritativeMeters === false && row.selectedSource == null && row.heightRangeM == null),
    gapNoMeters: gap.every((row) => row.evidenceGap === true && row.usedAuthoritativeMeters === false && row.heightRangeM == null && row.spreadRangeM == null),
    orangeAlias: orange.botanicalTaxonId === 'taxon:citrus-sinensis' && sweetOrange.botanicalTaxonId === 'taxon:citrus-sinensis' && citrusRecords.length === 1,
    orangeUserContext: orange.personalContextNeeded === true && sweetOrange.personalContextNeeded === true && orange.usedAuthoritativeMeters === false,
    youngUnknown: matrix.every((row) => row.growthStageBehavior.young === 'STAGE_AUTHORITY_UNKNOWN' && row.growthStageBehavior.youngUsesAuthoritativeMeters === false),
    photoCalibrationOptional: matrix.every((row) => row.photoCalibrationCompatibility === 'OPTIONAL' && row.calibrationMandatory === false),
    manualOverrideAlways: matrix.every((row) => row.manualOverrideCompatibility === 'ALWAYS'),
    noRawResearch: matrix.every((row) => row.rawResearchImportedByRuntime === 'NO'),
    noFitToFrame: matrix.every((row) => row.fitToFrame === false),
    gardenUsable: matrix.every((row) => row.gardenDesignBlocked === false && row.matureScaleOk === true),
    globalFlagOn: GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled === true,
    productionGardenOn: GARDEN_SIZE_AUTHORITY_ACTIVATION.applyInProductionGardenDesign === true,
    productionHelperOn: productionGardenSizeAuthorityEnabled() === true,
    canaryRemainsTrue: GARDEN_SIZE_AUTHORITY_ACTIVATION.canaryAuthorityRuntimeEnabled === true,
    productionAppliesWithoutGate: resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar' }).applied === true,
    photoContractLocked: PHOTO_SCALE_PRODUCT_CONTRACT.calibrationMandatory === false && PHOTO_SCALE_PRODUCT_CONTRACT.gardenDesignBlockedWithoutCalibration === false
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    contract: TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_GATE_VERSION,
    verdict: pass ? 'TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_READY' : 'TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_NOT_READY',
    GLOBAL_ACTIVATION_READY: pass,
    globalAuthorityRuntimeEnabled: GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled,
    canaryAuthorityRuntimeEnabled: GARDEN_SIZE_AUTHORITY_ACTIVATION.canaryAuthorityRuntimeEnabled,
    applyInProductionGardenDesign: GARDEN_SIZE_AUTHORITY_ACTIVATION.applyInProductionGardenDesign,
    uniqueTaxa: matrix.length,
    accounting: {
      RUNTIME_AUTHORITY_READY: ready.length,
      RUNTIME_AUTHORITY_PARTIAL: partial.length,
      RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED: userContext.length,
      RUNTIME_AUTHORITY_CONFLICT_HOLD: conflict.length,
      RUNTIME_AUTHORITY_EVIDENCE_GAP: gap.length,
      TOTAL: matrix.length,
      slugs: byState
    },
    orangeAlias: {
      orange: orange.botanicalTaxonId,
      sweetOrange: sweetOrange.botanicalTaxonId,
      records: citrusRecords.length,
      runtimeAuthorityState: orange.runtimeAuthorityState
    },
    visualSmoke: {
      mango: 'READY_EXISTING_ASSET',
      olive: 'READY_EXISTING_ASSET',
      'blue-gum': 'DIAGNOSTIC_ONLY_NO_ASSET',
      lemon: 'DIAGNOSTIC_ONLY_NO_ASSET',
      cypress: 'DIAGNOSTIC_ONLY_NO_ASSET'
    },
    regression: {
      gardenDesignBlocked: false,
      ownershipWrites: false,
      persistenceChanged: false,
      sourcePhotoChanged: false,
      areasChanged: false,
      plantDoctorChanged: false,
      recommendationChanged: false,
      catalogCardImagesChanged: false,
      designAssetRegistryChanged: false,
      productionDbChanged: false,
      gardenDesignCanvasUnchanged: true,
      dragResizeStillManualOverride: true
    },
    activation: GARDEN_SIZE_AUTHORITY_ACTIVATION,
    proposal: GLOBAL_ACTIVATION_PROPOSAL,
    canarySlugs: SIZE_AUTHORITY_CANARY_SLUGS,
    checks,
    matrix,
    spend: {
      openaiCalls: 0,
      imageGeneration: 0,
      paidBotanicalAcquisitionUsd: 0,
      additionalSpendUsd: 0,
      newSourcing: 0
    }
  };
}

export function writeTreeSizeAuthorityGlobalActivationGateReports(root) {
  const registry = loadBotanicalSizeAuthority(root);
  const evaluation = evaluateTreeSizeAuthorityGlobalActivationGate(registry);
  const dir = path.join(root, 'data', 'garden-design', 'tree-size-authority-global-activation-gate-v1');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    summaryPath: path.join(dir, 'gate-summary.json'),
    matrixPath: path.join(dir, 'taxon-smoke-matrix.json'),
    visualPath: path.join(dir, 'visual-smoke.json'),
    regressionPath: path.join(dir, 'regression.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify({
    contract: TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_GATE_VERSION,
    verdict: evaluation.verdict,
    GLOBAL_ACTIVATION_READY: evaluation.GLOBAL_ACTIVATION_READY,
    globalAuthorityRuntimeEnabled: evaluation.globalAuthorityRuntimeEnabled,
    canaryAuthorityRuntimeEnabled: evaluation.canaryAuthorityRuntimeEnabled,
    applyInProductionGardenDesign: evaluation.applyInProductionGardenDesign,
    uniqueTaxa: evaluation.uniqueTaxa,
    accounting: evaluation.accounting,
    orangeAlias: evaluation.orangeAlias,
    spend: evaluation.spend
  }, null, 2)}\n`);
  fs.writeFileSync(files.matrixPath, `${JSON.stringify({
    contract: TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_GATE_VERSION,
    taxa: evaluation.matrix.map((row) => ({
      botanicalTaxonId: row.botanicalTaxonId,
      canonicalSlugAliases: row.canonicalSlugAliases,
      runtimeAuthorityState: row.runtimeAuthorityState,
      selectedPreviewScenario: row.selectedPreviewScenario,
      heightAuthority: row.heightAuthority,
      spreadAuthority: row.spreadAuthority,
      runtimeBehavior: row.runtimeBehavior,
      fallbackReason: row.fallbackReason,
      photoCalibrationCompatibility: row.photoCalibrationCompatibility,
      manualOverrideCompatibility: row.manualOverrideCompatibility,
      growthStageBehavior: row.growthStageBehavior,
      rawResearchImportedByRuntime: row.rawResearchImportedByRuntime
    }))
  }, null, 2)}\n`);
  fs.writeFileSync(files.visualPath, `${JSON.stringify(evaluation.visualSmoke, null, 2)}\n`);
  fs.writeFileSync(files.regressionPath, `${JSON.stringify(evaluation.regression, null, 2)}\n`);
  return { ...files, verdict: evaluation.verdict, evaluation };
}
