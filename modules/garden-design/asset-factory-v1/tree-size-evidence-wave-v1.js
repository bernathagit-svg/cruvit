/**
 * Tree size evidence wave V1.
 * 41 unique taxa: 7 pilot reused + 34 new (33 ready + 1 shared citrus-sinensis).
 * Overlay only. No production write. No spend. No runtime default change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import {
  SIZE_EVIDENCE_SCENARIOS,
  validateBotanicalSizeEvidenceRecord
} from './botanical-size-evidence-contract-v2.js';
import {
  PILOT_CONFLICTS,
  PILOT_EVIDENCE_RECORDS,
  RUNTIME_MAPPING_PROPOSAL as PILOT_RUNTIME_MAPPING
} from './botanical-size-evidence-pilot-v1.js';
import { classifyPilotConflicts, classifySizeReadiness } from './tree-taxonomy-duplicate-gate-v1.js';
import {
  HELD_GENUS,
  HELD_MULTI_FORM,
  TREE_SIZE_EVIDENCE_WAVE_VERSION,
  WAVE_NEW_EVIDENCE_RECORDS,
  WAVE_NEW_TAXA
} from './tree-size-evidence-wave-v1-records.js';

export { TREE_SIZE_EVIDENCE_WAVE_VERSION, WAVE_NEW_TAXA } from './tree-size-evidence-wave-v1-records.js';

export const WAVE_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  SOURCE_FOUND: 'SOURCE_FOUND',
  EXTRACTED: 'EXTRACTED',
  VALIDATED: 'VALIDATED',
  EVIDENCE_GAP: 'EVIDENCE_GAP',
  CONFLICT_REVIEW: 'CONFLICT_REVIEW',
  COMPLETE: 'COMPLETE'
});

const PILOT_TAXA = Object.freeze([
  { botanicalTaxonId: 'taxon:eucalyptus-globulus', canonicalSlug: 'blue-gum', aliases: ['blue-gum'] },
  { botanicalTaxonId: 'taxon:cupressus-sempervirens', canonicalSlug: 'cypress', aliases: ['cypress'] },
  { botanicalTaxonId: 'taxon:olea-europaea', canonicalSlug: 'olive', aliases: ['olive'] },
  { botanicalTaxonId: 'taxon:citrus-limon', canonicalSlug: 'lemon', aliases: ['lemon'] },
  { botanicalTaxonId: 'taxon:malus-domestica', canonicalSlug: 'apple', aliases: ['apple'] },
  { botanicalTaxonId: 'taxon:acer-palmatum', canonicalSlug: 'japanese-maple', aliases: ['japanese-maple'] },
  { botanicalTaxonId: 'taxon:mangifera-indica', canonicalSlug: 'mango', aliases: ['mango'] }
]);

function taxonIdForSlug(slug) {
  if (slug === 'orange' || slug === 'sweet-orange' || slug === 'citrus-sinensis') return 'taxon:citrus-sinensis';
  const pilot = PILOT_TAXA.find((row) => row.canonicalSlug === slug);
  if (pilot) return pilot.botanicalTaxonId;
  const rec = WAVE_NEW_EVIDENCE_RECORDS.find((row) => row.canonicalSlug === slug || (row.canonicalAliases || []).includes(slug));
  return rec?.botanicalTaxonId || `taxon:${slug}`;
}

function withNormalizedSi(row) {
  if (row.normalizedSi) return row;
  if (row.heightMinM != null || row.heightMaxM != null || row.spreadMinM != null || row.spreadMaxM != null) {
    return {
      ...row,
      normalizedSi: {
        heightM: { min: row.heightMinM ?? null, max: row.heightMaxM ?? null },
        spreadM: { min: row.spreadMinM ?? null, max: row.spreadMaxM ?? null }
      }
    };
  }
  return { ...row, normalizedSi: null };
}

export function mapPilotRecordsToWave() {
  return PILOT_EVIDENCE_RECORDS.map((row) => {
    const taxon = PILOT_TAXA.find((item) => item.canonicalSlug === row.canonicalSlug);
    return Object.freeze(withNormalizedSi({
      ...row,
      botanicalTaxonId: taxon.botanicalTaxonId,
      canonicalAliases: taxon.aliases,
      reusedFromPilot: true,
      waveStatus: WAVE_STATUSES.COMPLETE
    }));
  });
}

export const WAVE_CONFLICTS = Object.freeze([
  ...classifyPilotConflicts().map((row) => ({
    ...row,
    botanicalTaxonId: taxonIdForSlug(row.canonicalSlug),
    reusedFromPilot: true
  })),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    botanicalTaxonId: 'taxon:prunus-dulcis',
    canonicalSlug: 'almond',
    classification: 'TRUE_SOURCE_CONFLICT',
    sourceA: 'almond__mobot__landscape-typical',
    sourceB: 'almond__uaex__about-30',
    differingRanges: 'MOBOT typical 10–15 ft vs UAEX about 30 ft tall and wide',
    differingContext: 'Typical landscape band versus “about 30 feet”. Do not average.',
    possibleExplanations: ['source definition', 'cultivar', 'maximum vs typical']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    botanicalTaxonId: 'taxon:persea-americana',
    canonicalSlug: 'avocado',
    classification: 'CONTEXT_EXPLAINED',
    sourceA: 'avocado__uf-ifas-st435__landscape',
    sourceB: 'avocado__uf-ifas-mg213__home-landscape-range',
    differingRanges: 'ST435 commonly 30–40 ft vs MG213 medium 30 ft to large 65 ft',
    differingContext: 'Landscape “commonly seen” versus home-landscape medium-to-large range. Do not average.',
    possibleExplanations: ['landscape context', 'cultivar', 'maximum vs typical']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    botanicalTaxonId: 'taxon:plinia-cauliflora',
    canonicalSlug: 'jaboticaba',
    classification: 'TRUE_SOURCE_CONFLICT',
    sourceA: 'jaboticaba__uf-ifas-mg373__florida',
    sourceB: 'jaboticaba__uf-ifas-mg373__florida',
    differingRanges: 'Prose seldom exceeds 20 ft in Florida vs Table 1 ultimate ~30 ft unpruned',
    differingContext: 'Same UF/IFAS page; typical Florida vs unpruned ultimate. Do not average.',
    possibleExplanations: ['source definition', 'maximum vs typical', 'landscape context']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    botanicalTaxonId: 'taxon:magnolia-grandiflora',
    canonicalSlug: 'southern-magnolia',
    classification: 'REVIEW_REQUIRED',
    sourceA: 'southern-magnolia__ncsu__landscape-dimensions',
    sourceB: 'southern-magnolia__ncsu__landscape-prose-spread',
    differingRanges: 'Dimensions width 30–50 ft vs prose spread 20–40 ft on the same page',
    differingContext: 'Same NCSU page, two wordings. Do not average.',
    possibleExplanations: ['source definition']
  })
]);

function previewScenario(records) {
  const preferred = [
    SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE,
    SIZE_EVIDENCE_SCENARIOS.CULTIVATED_STANDARD,
    SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN
  ];
  for (const scenario of preferred) {
    if (records.some((row) => row.sizeScenario === scenario && row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE)) {
      return scenario;
    }
  }
  return null;
}

function taxonStatus(records) {
  const gapOnly = records.length > 0 && records.every((row) => row.evidenceClass === DIMENSION_EVIDENCE.UNKNOWN);
  if (gapOnly) return WAVE_STATUSES.EVIDENCE_GAP;
  const conflicted = WAVE_CONFLICTS.some((row) => records.some((rec) => rec.botanicalTaxonId === row.botanicalTaxonId));
  const valid = records
    .filter((row) => row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE)
    .every((row) => validateBotanicalSizeEvidenceRecord(row).ok);
  if (!valid) return WAVE_STATUSES.EXTRACTED;
  if (conflicted) return WAVE_STATUSES.CONFLICT_REVIEW;
  return WAVE_STATUSES.COMPLETE;
}

export function buildWaveTaxaManifest() {
  const allRecords = [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS.map((row) => withNormalizedSi(row))];
  const taxa = [];
  for (const item of PILOT_TAXA) {
    const records = allRecords.filter((row) => row.botanicalTaxonId === item.botanicalTaxonId);
    taxa.push({
      botanicalTaxonId: item.botanicalTaxonId,
      canonicalSlug: item.canonicalSlug,
      canonicalAliases: item.aliases,
      origin: 'PILOT_REUSED',
      status: taxonStatus(records)
    });
  }
  const seen = new Set(taxa.map((row) => row.botanicalTaxonId));
  for (const slug of WAVE_NEW_TAXA) {
    const id = taxonIdForSlug(slug);
    if (seen.has(id)) continue;
    seen.add(id);
    const records = allRecords.filter((row) => row.botanicalTaxonId === id);
    const aliases = slug === 'citrus-sinensis' ? ['orange', 'sweet-orange'] : [slug];
    taxa.push({
      botanicalTaxonId: id,
      canonicalSlug: aliases[0],
      canonicalAliases: aliases,
      origin: 'NEW_WAVE',
      status: taxonStatus(records)
    });
  }
  return Object.freeze(taxa);
}

export function buildWaveReadiness() {
  const allRecords = [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS.map((row) => withNormalizedSi(row))];
  return buildWaveTaxaManifest().map((taxon) => {
    const records = allRecords.filter((row) => row.botanicalTaxonId === taxon.botanicalTaxonId);
    const scenario = taxon.origin === 'PILOT_REUSED'
      ? (PILOT_RUNTIME_MAPPING.find((row) => row.canonicalSlug === taxon.canonicalSlug)?.bestAvailableScenarioForGenericPreview || previewScenario(records))
      : previewScenario(records);
    const identityHold = taxon.botanicalTaxonId === 'taxon:citrus-sinensis';
    const readiness = classifySizeReadiness(records, { sizeScenario: scenario, identityHold });
    const notFinal = records.some((row) => row.notFinalPersonalGardenSize);
    const cultivarInput = records.some((row) => row.cultivarOrRootstockSensitive || (row.flags || []).includes('CULTIVAR_VARIABLE'));
    const unknown = [];
    if (!readiness.HEIGHT_SCALE_READY) unknown.push('height');
    if (!readiness.SPREAD_SCALE_READY) unknown.push('spread');
    const conflict = WAVE_CONFLICTS.filter((row) => row.botanicalTaxonId === taxon.botanicalTaxonId);
    return Object.freeze({
      ...taxon,
      HEIGHT_SCALE_READY: readiness.HEIGHT_SCALE_READY,
      SPREAD_SCALE_READY: readiness.SPREAD_SCALE_READY,
      FULL_SIZE_READY: readiness.FULL_SIZE_READY,
      PERSONAL_GARDEN_SCALE_SAFE: Boolean(readiness.FULL_SIZE_READY && !notFinal && !cultivarInput && !identityHold),
      CULTIVAR_OR_ROOTSTOCK_INPUT_NEEDED: Boolean(notFinal || cultivarInput),
      recommendedGenericPreviewScenario: scenario,
      sourceConflictState: conflict.length ? conflict.map((row) => row.classification) : [],
      unknownFields: Object.freeze(unknown),
      applyRuntimeDefaultNow: false
    });
  });
}

export function buildWaveSummary() {
  const manifest = buildWaveTaxaManifest();
  const readiness = buildWaveReadiness();
  const records = [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS];
  const invented = records.some((row) => row.inferredDimension);
  const holdsEnriched = records.some((row) => HELD_MULTI_FORM.includes(row.canonicalSlug) || HELD_GENUS.includes(row.canonicalSlug) || row.canonicalSlug === 'papaya');
  const citrusRecords = records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis');
  const orangeTwice = citrusRecords.filter((row) => row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE).length > 1 &&
    new Set(citrusRecords.map((row) => row.sourceIdentifier)).size > 1 &&
    citrusRecords.some((row) => row.canonicalSlug === 'sweet-orange' && !row.canonicalAliases?.includes('orange'));
  const uniqueTaxa = manifest.length;
  const full = readiness.filter((row) => row.FULL_SIZE_READY);
  const partial = readiness.filter((row) => (row.HEIGHT_SCALE_READY || row.SPREAD_SCALE_READY) && !row.FULL_SIZE_READY);
  const gardenInput = readiness.filter((row) => row.CULTIVAR_OR_ROOTSTOCK_INPUT_NEEDED);
  const gaps = manifest.filter((row) => row.status === WAVE_STATUSES.EVIDENCE_GAP);
  const conflicts = WAVE_CONFLICTS;
  const pass =
    uniqueTaxa === 41 &&
    !invented &&
    !holdsEnriched &&
    !orangeTwice &&
    citrusRecords.filter((row) => row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE).length >= 1 &&
    manifest.filter((row) => row.origin === 'PILOT_REUSED').length === 7 &&
    manifest.filter((row) => row.origin === 'NEW_WAVE').length === 34;
  return {
    contract: TREE_SIZE_EVIDENCE_WAVE_VERSION,
    verdict: pass ? 'TREE_SIZE_EVIDENCE_WAVE_V1_PASS' : 'TREE_SIZE_EVIDENCE_WAVE_V1_FAIL',
    accounting: {
      TOTAL_UNIQUE_TREE_TAXA_DOMAIN: 41,
      PILOT_TAXA_REUSED: 7,
      NEW_TAXA_RESEARCHED: 34,
      ordinaryReadyTaxa: 33,
      sharedCitrusSinensisTaxon: 1
    },
    FULL_SIZE_READY: { count: full.length, slugs: full.map((row) => row.canonicalSlug) },
    PARTIAL_SIZE_READY: { count: partial.length, slugs: partial.map((row) => row.canonicalSlug) },
    PERSONAL_GARDEN_INPUT_REQUIRED: { count: gardenInput.length, slugs: gardenInput.map((row) => row.canonicalSlug) },
    EVIDENCE_GAP: { count: gaps.length, slugs: gaps.map((row) => row.canonicalSlug) },
    SOURCE_CONFLICT_REVIEW_REQUIRED: {
      count: conflicts.length,
      slugs: [...new Set(conflicts.map((row) => row.canonicalSlug))]
    },
    uniqueTaxaAccounted: uniqueTaxa,
    duplicateOrangeResearchedOnce: !orangeTwice,
    productionCatalogWritten: false,
    massRuntimeDefaultsChanged: false,
    multiFormOrGenusHoldsEnriched: holdsEnriched,
    inventedBotanicalValues: invented,
    spend: { openaiCalls: 0, imageGeneration: 0, paidBotanicalAcquisitionUsd: 0, additionalSpendUsd: 0 }
  };
}

export function writeTreeSizeEvidenceWaveReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'tree-size-evidence-wave-v1');
  fs.mkdirSync(dir, { recursive: true });
  const records = [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS.map((row) => withNormalizedSi(row))];
  const sources = [...new Map(records.filter((row) => row.sourceUrl).map((row) => [row.sourceUrl, {
    sourceProvider: row.sourceProvider,
    sourceTitle: row.sourceTitle,
    sourceIdentifier: row.sourceIdentifier,
    sourceUrl: row.sourceUrl,
    sourceQualityTier: row.sourceQualityTier
  }])).values()];
  const summary = buildWaveSummary();
  const files = {
    taxaManifestPath: path.join(dir, 'taxa-manifest.json'),
    evidencePath: path.join(dir, 'evidence-records.json'),
    sourceRegistryPath: path.join(dir, 'source-registry.json'),
    sourceAuditPath: path.join(dir, 'source-audit.json'),
    conflictsPath: path.join(dir, 'conflicts.json'),
    readinessPath: path.join(dir, 'readiness.json'),
    mappingPath: path.join(dir, 'runtime-mapping-proposal.json'),
    orangeLinkPath: path.join(dir, 'orange-evidence-link-proposal.json'),
    summaryPath: path.join(dir, 'wave-summary.json')
  };
  fs.writeFileSync(files.taxaManifestPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, productionCatalogWritten: false, taxa: buildWaveTaxaManifest() }, null, 2)}\n`);
  fs.writeFileSync(files.evidencePath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, productionCatalogWritten: false, records }, null, 2)}\n`);
  fs.writeFileSync(files.sourceRegistryPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, reuseRequired: true, sources }, null, 2)}\n`);
  fs.writeFileSync(files.sourceAuditPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, accepted: sources, rejectedAsFinalEvidence: ['nursery-sales-copy', 'seo-aggregators', 'random-blogs', 'unsourced-databases', 'ai-generated-summaries'] }, null, 2)}\n`);
  fs.writeFileSync(files.conflictsPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, averaged: false, conflicts: WAVE_CONFLICTS }, null, 2)}\n`);
  fs.writeFileSync(files.readinessPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, applyRuntimeDefaultNow: false, readiness: buildWaveReadiness() }, null, 2)}\n`);
  fs.writeFileSync(files.mappingPath, `${JSON.stringify({ contract: TREE_SIZE_EVIDENCE_WAVE_VERSION, applyRuntimeDefaultNow: false, mappings: buildWaveReadiness() }, null, 2)}\n`);
  fs.writeFileSync(files.orangeLinkPath, `${JSON.stringify({
    contract: TREE_SIZE_EVIDENCE_WAVE_VERSION,
    proposalOnly: true,
    mergeCanonicalSlugsNow: false,
    deleteEitherRecordNow: false,
    alterGardenOwnershipNow: false,
    rewriteCatalogScientificNamesNow: false,
    assignEvidenceToProductionNow: false,
    botanicalTaxonId: 'taxon:citrus-sinensis',
    canonicalAliases: ['orange', 'sweet-orange'],
    evidenceRecordId: 'citrus-sinensis__ncsu__landscape',
    note: 'Acquire size evidence once. Do not merge orange and sweet-orange in this wave.'
  }, null, 2)}\n`);
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { ...files, verdict: summary.verdict, spend: summary.spend };
}
