/**
 * Tree size evidence → production authority gate V1.
 * Classifies runtime authority from the accepted wave overlay.
 * No new sourcing. No runtime apply. No production catalog write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import {
  buildWaveReadiness,
  mapPilotRecordsToWave
} from './tree-size-evidence-wave-v1.js';
import { WAVE_NEW_EVIDENCE_RECORDS } from './tree-size-evidence-wave-v1-records.js';

export const TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION = 'tree-size-production-authority-gate-v1';

export const RUNTIME_AUTHORITY = Object.freeze({
  READY: 'RUNTIME_AUTHORITY_READY',
  PARTIAL: 'RUNTIME_AUTHORITY_PARTIAL',
  USER_CONTEXT_REQUIRED: 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',
  CONFLICT_HOLD: 'RUNTIME_AUTHORITY_CONFLICT_HOLD',
  EVIDENCE_GAP: 'RUNTIME_AUTHORITY_EVIDENCE_GAP'
});

export const PARTIAL_ANCHOR = Object.freeze({
  HEIGHT_ANCHORED_ESTIMATE: 'HEIGHT_ANCHORED_ESTIMATE',
  SPREAD_ANCHORED_ESTIMATE: 'SPREAD_ANCHORED_ESTIMATE'
});

export const CONFLICT_REVIEW_OUTCOME = Object.freeze({
  CONTEXT_SEPARABLE: 'CONTEXT_SEPARABLE',
  MATERIAL_CONFLICT_HOLD: 'MATERIAL_CONFLICT_HOLD',
  SOURCE_RECORD_ERROR: 'SOURCE_RECORD_ERROR',
  NEEDS_FUTURE_EVIDENCE: 'NEEDS_FUTURE_EVIDENCE'
});

const HOLD_OUTCOMES = new Set([
  CONFLICT_REVIEW_OUTCOME.MATERIAL_CONFLICT_HOLD,
  CONFLICT_REVIEW_OUTCOME.SOURCE_RECORD_ERROR,
  CONFLICT_REVIEW_OUTCOME.NEEDS_FUTURE_EVIDENCE
]);

/**
 * Existing-evidence-only review. No new URLs. No averaging. No invented ranges.
 */
export const CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE = Object.freeze([
  Object.freeze({
    botanicalTaxonId: 'taxon:cupressus-sempervirens',
    canonicalSlug: 'cypress',
    waveClassification: 'TRUE_SOURCE_CONFLICT',
    outcome: CONFLICT_REVIEW_OUTCOME.MATERIAL_CONFLICT_HOLD,
    newSourcing: 0,
    averaged: false,
    reason:
      'UF/IFAS 40–60 ft and NCSU 40–70 ft describe the same LANDSCAPE_MATURE columnar form. Spread agrees (3–6 ft). Height maxima disagree. Do not pick one source. Do not average 60 and 70.',
    recordsMayCoexistAsNonContradictory: false,
    selectedRuntimeRange: null
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:prunus-dulcis',
    canonicalSlug: 'almond',
    waveClassification: 'TRUE_SOURCE_CONFLICT',
    outcome: CONFLICT_REVIEW_OUTCOME.MATERIAL_CONFLICT_HOLD,
    newSourcing: 0,
    averaged: false,
    reason:
      'MOBOT typical 10–15 ft and UAEX about 30 ft are both LANDSCAPE_MATURE typical stature claims. MOBOT’s “less frequently to 30” does not convert UAEX into a different scenario. Do not average 12.5 and 30.',
    recordsMayCoexistAsNonContradictory: false,
    selectedRuntimeRange: null,
    secondaryFlags: Object.freeze(['CULTIVAR_OR_ROOTSTOCK_SENSITIVE', 'NOT_FINAL_PERSONAL_GARDEN_SIZE'])
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:plinia-cauliflora',
    canonicalSlug: 'jaboticaba',
    waveClassification: 'TRUE_SOURCE_CONFLICT',
    outcome: CONFLICT_REVIEW_OUTCOME.CONTEXT_SEPARABLE,
    newSourcing: 0,
    averaged: false,
    reason:
      'Same UF/IFAS MG373 page already distinguishes typical Florida landscape (“seldom exceeds 20 feet”) from unpruned ultimate table size (~30 ft). Keep both wordings. Do not average 20 and 30. Spread remains UNKNOWN.',
    recordsMayCoexistAsNonContradictory: true,
    selectedRuntimeRange: null,
    separableContexts: Object.freeze(['typical Florida landscape ~20 ft', 'unpruned ultimate ~30 ft'])
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:magnolia-grandiflora',
    canonicalSlug: 'southern-magnolia',
    waveClassification: 'REVIEW_REQUIRED',
    outcome: CONFLICT_REVIEW_OUTCOME.MATERIAL_CONFLICT_HOLD,
    newSourcing: 0,
    averaged: false,
    reason:
      'Same NCSU LANDSCAPE_MATURE page: Dimensions width 30–50 ft vs prose spread 20–40 ft. Height 60–80 ft agrees. Cannot choose a spread without new evidence or treating one wording as error. Not classified SOURCE_RECORD_ERROR because that would invent which wording is wrong.',
    recordsMayCoexistAsNonContradictory: false,
    selectedRuntimeRange: null
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:eucalyptus-globulus',
    canonicalSlug: 'blue-gum',
    waveClassification: 'CONTEXT_EXPLAINED',
    outcome: CONFLICT_REVIEW_OUTCOME.CONTEXT_SEPARABLE,
    newSourcing: 0,
    averaged: false,
    reason: 'FEIS NATURAL_MATURE 30–55 m vs SelecTree landscape maxima are already separate scenarios. Do not substitute landscape max for natural range. NATURAL_MATURE height may anchor; spread remains UNKNOWN.',
    recordsMayCoexistAsNonContradictory: true,
    defaultPreviewScenario: 'NATURAL_MATURE'
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:malus-domestica',
    canonicalSlug: 'apple',
    waveClassification: 'CONTEXT_EXPLAINED',
    outcome: CONFLICT_REVIEW_OUTCOME.CONTEXT_SEPARABLE,
    newSourcing: 0,
    averaged: false,
    reason: 'Approximate standard “about 30 ft” vs seedling 30–40 ft are source-definition variants of CULTIVATED_STANDARD. Rootstock class records remain separate. Do not average. Species range is not an exact personal-garden default.',
    recordsMayCoexistAsNonContradictory: true,
    defaultPreviewScenario: 'CULTIVATED_STANDARD'
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:acer-palmatum',
    canonicalSlug: 'japanese-maple',
    waveClassification: 'CONTEXT_EXPLAINED',
    outcome: CONFLICT_REVIEW_OUTCOME.CONTEXT_SEPARABLE,
    newSourcing: 0,
    averaged: false,
    reason: 'Morton vs Virginia ranges both state cultivar-dependent stature. Coexist as cultivar variability, not a second taxon. Do not average. CULTIVAR_VARIABLE remains.',
    recordsMayCoexistAsNonContradictory: true,
    defaultPreviewScenario: 'LANDSCAPE_MATURE'
  }),
  Object.freeze({
    botanicalTaxonId: 'taxon:persea-americana',
    canonicalSlug: 'avocado',
    waveClassification: 'CONTEXT_EXPLAINED',
    outcome: CONFLICT_REVIEW_OUTCOME.CONTEXT_SEPARABLE,
    newSourcing: 0,
    averaged: false,
    reason: 'ST435 “commonly seen” 30–40 ft vs MG213 medium-to-large 30–65 ft vs MAINTAINED 10–15 ft are contextual/cultivar classes already captured. Do not average. Not an exact personal-garden default.',
    recordsMayCoexistAsNonContradictory: true,
    defaultPreviewScenario: 'LANDSCAPE_MATURE'
  })
]);

function allEvidenceRecords() {
  return [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS];
}

export function slugToBotanicalTaxonId() {
  const map = {};
  for (const row of buildWaveReadiness()) {
    for (const slug of row.canonicalAliases || [row.canonicalSlug]) {
      map[slug] = row.botanicalTaxonId;
    }
  }
  return Object.freeze(map);
}

function reviewForTaxon(taxonId) {
  return CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE.find((row) => row.botanicalTaxonId === taxonId) || null;
}

function sourceIdsForScenario(records, scenario) {
  return records
    .filter((row) => row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE && (!scenario || row.sizeScenario === scenario))
    .map((row) => row.recordId)
    .filter(Boolean);
}

function classifyOne(row, records) {
  const review = reviewForTaxon(row.botanicalTaxonId);
  const hold = Boolean(review && HOLD_OUTCOMES.has(review.outcome));
  const userContext = Boolean(row.CULTIVAR_OR_ROOTSTOCK_INPUT_NEEDED);
  const gap = row.status === 'EVIDENCE_GAP' || (!row.HEIGHT_SCALE_READY && !row.SPREAD_SCALE_READY);
  const defaultScenario = hold || gap ? null : row.recommendedGenericPreviewScenario || null;
  const scenarioAmbiguous = !gap && !hold && !defaultScenario;
  let runtimeAuthority;
  let partialAnchor = null;
  if (gap) runtimeAuthority = RUNTIME_AUTHORITY.EVIDENCE_GAP;
  else if (hold) runtimeAuthority = RUNTIME_AUTHORITY.CONFLICT_HOLD;
  else if (userContext) runtimeAuthority = RUNTIME_AUTHORITY.USER_CONTEXT_REQUIRED;
  else if (!row.HEIGHT_SCALE_READY || !row.SPREAD_SCALE_READY || scenarioAmbiguous) {
    runtimeAuthority = RUNTIME_AUTHORITY.PARTIAL;
    if (row.HEIGHT_SCALE_READY && !row.SPREAD_SCALE_READY) partialAnchor = PARTIAL_ANCHOR.HEIGHT_ANCHORED_ESTIMATE;
    else if (row.SPREAD_SCALE_READY && !row.HEIGHT_SCALE_READY) partialAnchor = PARTIAL_ANCHOR.SPREAD_ANCHORED_ESTIMATE;
  } else runtimeAuthority = RUNTIME_AUTHORITY.READY;

  return Object.freeze({
    botanicalTaxonId: row.botanicalTaxonId,
    canonicalSlug: row.canonicalSlug,
    canonicalAliases: row.canonicalAliases,
    HEIGHT_SCALE_READY: row.HEIGHT_SCALE_READY,
    SPREAD_SCALE_READY: row.SPREAD_SCALE_READY,
    FULL_SIZE_READY: row.FULL_SIZE_READY,
    evidenceCompletenessOnly: true,
    runtimeAuthority,
    partialAnchor,
    defaultPreviewScenario: defaultScenario,
    mayDriveExactPersonalGardenDefault: runtimeAuthority === RUNTIME_AUTHORITY.READY,
    cultivarOrRootstockSensitive: userContext,
    conflictReviewOutcome: review?.outcome || null,
    unknownFields: row.unknownFields,
    selectedEvidenceIds: sourceIdsForScenario(records, defaultScenario),
    applyRuntimeDefaultNow: false,
    gardenDesignBlocked: false
  });
}

export function buildRuntimeAuthorityRecords() {
  const records = allEvidenceRecords();
  return buildWaveReadiness().map((row) =>
    classifyOne(row, records.filter((item) => item.botanicalTaxonId === row.botanicalTaxonId))
  );
}

export const DEFAULT_SCENARIO_POLICY = Object.freeze({
  universalAlwaysNaturalMature: false,
  universalAlwaysLandscapeMature: false,
  rule: 'Per-taxon default only when existing evidence supports a single usable preview scenario after conflict review. No universal NATURAL_MATURE or LANDSCAPE_MATURE rule.',
  ifAmbiguous: 'runtime authority remains PARTIAL or CONFLICT_HOLD',
  applyRuntimeDefaultNow: false
});

export const GARDEN_DESIGN_INTEGRATION_PROPOSAL = Object.freeze({
  applyNow: false,
  gardenDesignBlockedWithoutAuthority: false,
  lookup: Object.freeze([
    'placement.canonicalSlug',
    'botanicalTaxonId',
    'architectureMode',
    'growthStage',
    'user cultivar/rootstock context if available',
    'best valid evidence scenario for that taxon',
    'physical scale engine'
  ]),
  fallback: Object.freeze({
    noRuntimeAuthority: 'Estimated size + tree form heuristic + manual resize',
    meterTruthDisplayed: false
  }),
  partial: Object.freeze({
    HEIGHT_ANCHORED_ESTIMATE: 'vertical scale may use supported height; canopy/spread estimated from visual architecture; UI must not imply spread is source-supported',
    SPREAD_ANCHORED_ESTIMATE: 'spread may use supported width; height estimated from visual architecture; UI must not imply height is source-supported'
  }),
  userContextRequired: 'Keep Garden Design usable. Do not use species range as exact personal-garden physical default.',
  conflictHold: 'Do not silently select one source. Estimated heuristic + manual resize until resolved.',
  evidenceGap: 'Estimated size + tree heuristic + manual resize. No meters as truth. No new sourcing in this gate.'
});

function bucket(records, authority) {
  const slugs = records.filter((row) => row.runtimeAuthority === authority).map((row) => row.canonicalSlug);
  return { count: slugs.length, slugs };
}

export function buildAuthorityProposalEntries(authorityRecords) {
  return authorityRecords.map((row) => ({
    botanicalTaxonId: row.botanicalTaxonId,
    canonicalSlugAliases: row.canonicalAliases,
    selectedEvidenceScenario: row.defaultPreviewScenario,
    sourceEvidenceIds: row.selectedEvidenceIds,
    HEIGHT_SCALE_READY: row.HEIGHT_SCALE_READY,
    SPREAD_SCALE_READY: row.SPREAD_SCALE_READY,
    runtimeAuthority: row.runtimeAuthority,
    partialAnchor: row.partialAnchor,
    cultivarOrRootstockSensitive: row.cultivarOrRootstockSensitive,
    conflictHold: row.runtimeAuthority === RUNTIME_AUTHORITY.CONFLICT_HOLD,
    provenanceVersion: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    promotedToRuntimeNow: false
  }));
}

export function buildAuthorityGateSummary() {
  const authority = buildRuntimeAuthorityRecords();
  const ids = authority.map((row) => row.botanicalTaxonId);
  const bucketSum = Object.values(RUNTIME_AUTHORITY)
    .map((code) => authority.filter((row) => row.runtimeAuthority === code).length)
    .reduce((sum, n) => sum + n, 0);
  const exclusive = bucketSum === 41 && authority.length === 41 && new Set(ids).size === 41;
  const cypress = authority.find((row) => row.canonicalSlug === 'cypress');
  const magnolia = authority.find((row) => row.canonicalSlug === 'southern-magnolia');
  const citrus = authority.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis');
  const slugMap = slugToBotanicalTaxonId();
  const fullDoesNotOverride =
    cypress?.FULL_SIZE_READY === true
    && cypress?.runtimeAuthority === RUNTIME_AUTHORITY.CONFLICT_HOLD
    && magnolia?.FULL_SIZE_READY === true
    && magnolia?.runtimeAuthority === RUNTIME_AUTHORITY.CONFLICT_HOLD;
  const onePrimary = authority.every((row) => Object.values(RUNTIME_AUTHORITY).includes(row.runtimeAuthority));
  const pass =
    exclusive
    && onePrimary
    && fullDoesNotOverride
    && citrus.length === 1
    && slugMap.orange === 'taxon:citrus-sinensis'
    && slugMap['sweet-orange'] === 'taxon:citrus-sinensis'
    && CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE.every((row) => row.newSourcing === 0 && row.averaged === false);
  return {
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    verdict: pass ? 'TREE_SIZE_PRODUCTION_AUTHORITY_GATE_V1_PASS' : 'TREE_SIZE_PRODUCTION_AUTHORITY_GATE_V1_FAIL',
    waveCommitDeployed: '409b545',
    newBotanicalSourcing: 0,
    productionRuntimeChanged: false,
    productionCatalogChanged: false,
    writeAuthorityRegistryNow: false,
    authorityRegistryTarget: 'data/catalog/botanical-size-authority-v1.json',
    uniqueTaxaAccounted: authority.length,
    exclusivePrimaryBuckets: exclusive && onePrimary,
    RUNTIME_AUTHORITY_READY: bucket(authority, RUNTIME_AUTHORITY.READY),
    RUNTIME_AUTHORITY_PARTIAL: bucket(authority, RUNTIME_AUTHORITY.PARTIAL),
    RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED: bucket(authority, RUNTIME_AUTHORITY.USER_CONTEXT_REQUIRED),
    RUNTIME_AUTHORITY_CONFLICT_HOLD: bucket(authority, RUNTIME_AUTHORITY.CONFLICT_HOLD),
    RUNTIME_AUTHORITY_EVIDENCE_GAP: bucket(authority, RUNTIME_AUTHORITY.EVIDENCE_GAP),
    fullSizeReadyDoesNotOverrideConflict: fullDoesNotOverride,
    orangeSweetOrangeSameTaxon: slugMap.orange === slugMap['sweet-orange'],
    spend: { openaiCalls: 0, imageGeneration: 0, paidBotanicalAcquisitionUsd: 0, additionalSpendUsd: 0, newSourcing: 0 }
  };
}

export function writeTreeSizeProductionAuthorityGateReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'tree-size-production-authority-gate-v1');
  fs.mkdirSync(dir, { recursive: true });
  const authority = buildRuntimeAuthorityRecords();
  const summary = buildAuthorityGateSummary();
  const files = {
    authorityPath: path.join(dir, 'runtime-authority.json'),
    conflictReviewPath: path.join(dir, 'conflict-review.json'),
    taxonPath: path.join(dir, 'botanical-taxon-authority.json'),
    scenarioPath: path.join(dir, 'default-scenario-policy.json'),
    registryProposalPath: path.join(dir, 'botanical-size-authority-v1.proposal.json'),
    integrationPath: path.join(dir, 'garden-design-integration-proposal.json'),
    summaryPath: path.join(dir, 'gate-summary.json')
  };
  fs.writeFileSync(files.authorityPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    evidenceCompletenessFlagsAreNotRuntimeSafety: true,
    applyRuntimeDefaultNow: false,
    records: authority
  }, null, 2)}\n`);
  fs.writeFileSync(files.conflictReviewPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    newSourcing: 0,
    averaged: false,
    reviews: CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE
  }, null, 2)}\n`);
  fs.writeFileSync(files.taxonPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    ownership: 'botanicalTaxonId',
    mergeCanonicalSlugsNow: false,
    slugToBotanicalTaxonId: slugToBotanicalTaxonId(),
    orangeSweetOrange: {
      botanicalTaxonId: 'taxon:citrus-sinensis',
      aliases: ['orange', 'sweet-orange'],
      evidenceStoredOnce: true,
      mergeOrDeleteSlugsNow: false
    }
  }, null, 2)}\n`);
  fs.writeFileSync(files.scenarioPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    policy: DEFAULT_SCENARIO_POLICY,
    perTaxon: authority.map((row) => ({
      botanicalTaxonId: row.botanicalTaxonId,
      canonicalSlug: row.canonicalSlug,
      defaultPreviewScenario: row.defaultPreviewScenario,
      runtimeAuthority: row.runtimeAuthority
    }))
  }, null, 2)}\n`);
  fs.writeFileSync(files.registryProposalPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    proposalOnly: true,
    writeNow: false,
    applyRuntimeNow: false,
    targetPath: 'data/catalog/botanical-size-authority-v1.json',
    waveOverlayRemainsProvenance: 'data/garden-design/tree-size-evidence-wave-v1/',
    note: 'Validated/promoted authority only. Raw source records do not directly control runtime. Not written to production catalog in this gate.',
    entries: buildAuthorityProposalEntries(authority)
  }, null, 2)}\n`);
  fs.writeFileSync(files.integrationPath, `${JSON.stringify({
    contract: TREE_SIZE_PRODUCTION_AUTHORITY_GATE_VERSION,
    ...GARDEN_DESIGN_INTEGRATION_PROPOSAL
  }, null, 2)}\n`);
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { ...files, verdict: summary.verdict, spend: summary.spend };
}
