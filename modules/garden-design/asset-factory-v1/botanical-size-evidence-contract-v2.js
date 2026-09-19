/**
 * Botanical size evidence contract V2.
 * Scenario-aware source truth. Not a single universal mature size.
 * Overlay only. No catalog write. No paid acquisition. No generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE } from './physical-scale-evidence-v1.js';
import {
  IDENTITY_GAPS_CLOSED,
  MULTI_FORM_ARCHITECTURE_CONTRACTS,
  PAPAYA_FORM_DECISION,
  TREE_SIZE_EVIDENCE_ELIGIBLE
} from './multi-form-plant-architecture-v1.js';

export const BOTANICAL_SIZE_EVIDENCE_CONTRACT_VERSION = 'botanical-size-evidence-contract-v2';

export const SIZE_EVIDENCE_SCENARIOS = Object.freeze({
  NATURAL_MATURE: 'NATURAL_MATURE',
  LANDSCAPE_MATURE: 'LANDSCAPE_MATURE',
  CULTIVATED_STANDARD: 'CULTIVATED_STANDARD',
  MAINTAINED_GARDEN: 'MAINTAINED_GARDEN',
  ROOTSTOCK_SPECIFIC: 'ROOTSTOCK_SPECIFIC',
  CULTIVAR_SPECIFIC: 'CULTIVAR_SPECIFIC',
  ARCHITECTURE_SPECIFIC: 'ARCHITECTURE_SPECIFIC'
});

export const SIZE_EVIDENCE_IDENTITY_SCOPE = Object.freeze({
  CULTIVAR: 'CULTIVAR',
  SPECIES: 'SPECIES',
  GENUS: 'GENUS'
});

export const BOTANICAL_SIZE_EVIDENCE_PRECEDENCE = Object.freeze([
  'CULTIVAR_SPECIFIC_SOURCE',
  'ROOTSTOCK_SPECIFIC_SOURCE',
  'ARCHITECTURE_SPECIFIC_SOURCE',
  'SPECIES_SOURCE_SUPPORTED_RANGE',
  'USER_CONFIRMED_TARGET',
  'UNKNOWN'
]);

export const SOURCE_QUALITY_TIERS = Object.freeze({
  UNIVERSITY_EXTENSION: 'UNIVERSITY_EXTENSION',
  BOTANICAL_GARDEN_ARBORETUM: 'BOTANICAL_GARDEN_ARBORETUM',
  GOVERNMENT_AGRICULTURAL_AUTHORITY: 'GOVERNMENT_AGRICULTURAL_AUTHORITY',
  AUTHORITATIVE_HORTICULTURAL_INSTITUTION: 'AUTHORITATIVE_HORTICULTURAL_INSTITUTION',
  NOT_AUTHORITATIVE: 'NOT_AUTHORITATIVE'
});

export const SOURCE_QUALITY_REJECT = Object.freeze([
  'unsourced-nursery-marketing-copy',
  'seo-aggregator',
  'random-blog'
]);

/**
 * Data pattern only. Not an exhaustive species list.
 * Species-level size should not be treated as final personal-garden size
 * when the plant is commonly sold grafted / cultivar-selected.
 */
export const CULTIVAR_OR_ROOTSTOCK_SENSITIVITY_PATTERNS = Object.freeze([
  Object.freeze({
    patternId: 'grafted-pome',
    exampleSlugs: Object.freeze(['apple', 'pear']),
    exhaustive: false
  }),
  Object.freeze({
    patternId: 'citrus',
    exampleSlugs: Object.freeze(['lemon', 'orange', 'mandarin', 'grapefruit', 'sweet-orange']),
    exhaustive: false
  }),
  Object.freeze({
    patternId: 'stone-fruit',
    exampleSlugs: Object.freeze(['peach', 'apricot', 'almond', 'sweet-cherry']),
    exhaustive: false
  })
]);

export const BOTANICAL_SIZE_EVIDENCE_RECORD_FIELDS = Object.freeze([
  'canonicalSlug',
  'scientificName',
  'architectureMode',
  'growthStage',
  'sizeScenario',
  'heightMinM',
  'heightMaxM',
  'spreadMinM',
  'spreadMaxM',
  'sourceProvider',
  'sourceTitle',
  'sourceIdentifier',
  'sourceUrl',
  'originalUnit',
  'originalRange',
  'normalizedSi',
  'identityScope',
  'evidenceClass',
  'conditions',
  'originalSourceWording',
  'provenanceVersion',
  'provenanceTimestamp'
]);

export const ROLE_BASED_PILOT_SET = Object.freeze([
  Object.freeze({
    role: 'A',
    pattern: 'large-natural-tree',
    canonicalSlug: 'blue-gum',
    scientificName: 'Eucalyptus globulus',
    rationale: 'Tall natural canopy tree. Tests species-level NATURAL_MATURE ranges that must not be collapsed into a garden-maintained height.'
  }),
  Object.freeze({
    role: 'B',
    pattern: 'narrow-columnar-tree',
    canonicalSlug: 'cypress',
    scientificName: 'Cupressus sempervirens',
    rationale: 'Columnar architecture. Tests height/spread independently so spread is not inferred from a generic tree size.'
  }),
  Object.freeze({
    role: 'C',
    pattern: 'mediterranean-orchard-landscape-tree',
    canonicalSlug: 'olive',
    scientificName: 'Olea europaea',
    rationale: 'Landscape/orchard tree often maintained below natural mature size. Tests NATURAL_MATURE vs MAINTAINED_GARDEN as separate scenarios.'
  }),
  Object.freeze({
    role: 'D',
    pattern: 'citrus-cultivar-sensitive-tree',
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
    rationale: 'Citrus size is commonly cultivar/rootstock dependent. Species-level range must be flagged CULTIVAR_OR_ROOTSTOCK_SENSITIVE.'
  }),
  Object.freeze({
    role: 'E',
    pattern: 'deciduous-orchard-rootstock-sensitive-tree',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    rationale: 'Grafted pome fruit. Species-level height is not personal-garden truth without rootstock/cultivar evidence.'
  }),
  Object.freeze({
    role: 'F',
    pattern: 'small-ornamental-tree',
    canonicalSlug: 'japanese-maple',
    scientificName: 'Acer palmatum',
    rationale: 'Small ornamental tree with wide cultivar stature range. Tests that a species band is not a universal garden size.'
  }),
  Object.freeze({
    role: 'G',
    pattern: 'broad-subtropical-fruit-tree',
    canonicalSlug: 'mango',
    scientificName: 'Mangifera indica',
    rationale: 'Eligible KEEP_TREE with already-approved UF/IFAS species NATURAL_MATURE evidence. Proves the V2 record mapping without fetching new botanical values.'
  })
]);

export const FUTURE_WRITE_PATH = Object.freeze({
  applyWriteNow: false,
  productionCatalogMutated: false,
  applyMigrationNow: false,
  stages: Object.freeze([
    'validate-evidence-record-against-contract-v2',
    'store-overlay-json-not-plants-seed',
    'keep-original-source-wording',
    'write-production-catalog-only-after-owner-approval'
  ]),
  overlayDir: 'data/garden-design/botanical-size-evidence-v2',
  note: 'Future writes go to an overlay first, never flattened into a single matureHeightM/matureSpreadM pair.'
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export function emptyBotanicalSizeEvidenceRecord() {
  return {
    canonicalSlug: null,
    scientificName: null,
    architectureMode: null,
    growthStage: 'mature',
    sizeScenario: null,
    heightMinM: null,
    heightMaxM: null,
    spreadMinM: null,
    spreadMaxM: null,
    sourceProvider: null,
    sourceTitle: null,
    sourceIdentifier: null,
    sourceUrl: null,
    originalUnit: null,
    originalRange: null,
    normalizedSi: null,
    identityScope: null,
    evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
    conditions: null,
    originalSourceWording: null,
    provenanceVersion: BOTANICAL_SIZE_EVIDENCE_CONTRACT_VERSION,
    provenanceTimestamp: null,
    mayDrivePhysicalMeterPreview: false
  };
}

export function validateBotanicalSizeEvidenceRecord(record = {}) {
  const missing = BOTANICAL_SIZE_EVIDENCE_RECORD_FIELDS.filter((field) => !(field in (record || {})));
  const identityScope = SIZE_EVIDENCE_IDENTITY_SCOPE[record.identityScope];
  const scenario = SIZE_EVIDENCE_SCENARIOS[record.sizeScenario];
  const genusBlocked = IDENTITY_GAPS_CLOSED.includes(asText(record.canonicalSlug).toLowerCase());
  const papayaBlocked = asText(record.canonicalSlug).toLowerCase() === PAPAYA_FORM_DECISION.canonicalSlug;
  const multiForm = Boolean(MULTI_FORM_ARCHITECTURE_CONTRACTS[asText(record.canonicalSlug).toLowerCase()]);
  const errors = [...missing.map((field) => `missing:${field}`)];
  if (record.sizeScenario && !scenario) errors.push('unknown-size-scenario');
  if (record.identityScope && !identityScope) errors.push('unknown-identity-scope');
  if (genusBlocked) errors.push('genus-identity-gap-excluded');
  if (papayaBlocked) errors.push('papaya-excluded-from-tree-enrichment');
  if (multiForm && !record.architectureMode) {
    errors.push('multi-form-requires-architecture-mode');
  }
  const hasMeters =
    Number.isFinite(record.heightMinM) &&
    Number.isFinite(record.heightMaxM) &&
    Number.isFinite(record.spreadMinM) &&
    Number.isFinite(record.spreadMaxM);
  if (hasMeters && !record.originalSourceWording && !record.originalRange) {
    errors.push('original-source-wording-flattened');
  }
  return {
    ok: errors.length === 0,
    errors,
    catalogWriteAllowed: false
  };
}

export function classifyCultivarOrRootstockSensitivity(canonicalSlug) {
  const slug = asText(canonicalSlug).toLowerCase();
  const match = CULTIVAR_OR_ROOTSTOCK_SENSITIVITY_PATTERNS.find((pattern) => pattern.exampleSlugs.includes(slug));
  return {
    canonicalSlug: slug,
    sensitive: Boolean(match),
    flag: match ? 'CULTIVAR_OR_ROOTSTOCK_SENSITIVE' : null,
    patternId: match ? match.patternId : null,
    exhaustive: false,
    note: match
      ? 'Species-level range is a starting bound, not the final personal-garden size.'
      : 'Not flagged by the current data pattern. Absence of a flag is not proof that cultivar/rootstock does not matter.'
  };
}

export function classifyBotanicalSizePrecedence(evidence = {}) {
  if (evidence.identityScope === SIZE_EVIDENCE_IDENTITY_SCOPE.CULTIVAR && evidence.mayDrivePhysicalMeterPreview) {
    return 'CULTIVAR_SPECIFIC_SOURCE';
  }
  if (evidence.sizeScenario === SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC && evidence.mayDrivePhysicalMeterPreview) {
    return 'ROOTSTOCK_SPECIFIC_SOURCE';
  }
  if (evidence.sizeScenario === SIZE_EVIDENCE_SCENARIOS.ARCHITECTURE_SPECIFIC && evidence.mayDrivePhysicalMeterPreview) {
    return 'ARCHITECTURE_SPECIFIC_SOURCE';
  }
  if (
    evidence.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE &&
    evidence.mayDrivePhysicalMeterPreview
  ) {
    return 'SPECIES_SOURCE_SUPPORTED_RANGE';
  }
  if (evidence.evidenceClass === DIMENSION_EVIDENCE.USER_CONFIRMED && evidence.mayDrivePhysicalMeterPreview) {
    return 'USER_CONFIRMED_TARGET';
  }
  return 'UNKNOWN';
}

export function mapApprovedMangoEvidenceToV2Record() {
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  return {
    ...emptyBotanicalSizeEvidenceRecord(),
    canonicalSlug: mango.canonicalSlug,
    scientificName: mango.scientificName,
    architectureMode: 'tree',
    growthStage: mango.growthStage,
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE,
    heightMinM: mango.heightM.min,
    heightMaxM: mango.heightM.max,
    spreadMinM: mango.spreadM.min,
    spreadMaxM: mango.spreadM.max,
    sourceProvider: mango.source.provider,
    sourceTitle: mango.source.title,
    sourceIdentifier: mango.source.sourceId,
    sourceUrl: null,
    originalUnit: mango.original.unit,
    originalRange: mango.original,
    normalizedSi: mango.heightM,
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: mango.evidenceClass,
    conditions: 'Species-general landscape guidance. Not a cultivar or rootstock guarantee. Not maintained-garden height.',
    originalSourceWording: mango.note,
    provenanceVersion: mango.source.sourceId,
    provenanceTimestamp: null,
    mayDrivePhysicalMeterPreview: true,
    productionCatalogWritten: false,
    calibrationOnly: true
  };
}

export function classifySourceQuality(input = {}) {
  const blob = `${asText(input.provider)} ${asText(input.title)} ${asText(input.kind)}`.toLowerCase();
  if (/nursery|seo|blog|aggregator|marketplace/.test(blob) && !/extension|university|usda|kew|arboretum/.test(blob)) {
    return { tier: SOURCE_QUALITY_TIERS.NOT_AUTHORITATIVE, mayDrivePhysicalMeterPreview: false };
  }
  if (/university|extension|ifas|ncsu|edu/.test(blob)) {
    return { tier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION, mayDrivePhysicalMeterPreview: true };
  }
  if (/arboretum|botanic(al)? garden/.test(blob)) {
    return { tier: SOURCE_QUALITY_TIERS.BOTANICAL_GARDEN_ARBORETUM, mayDrivePhysicalMeterPreview: true };
  }
  if (/usda|government|ministry|agricultural authority/.test(blob)) {
    return { tier: SOURCE_QUALITY_TIERS.GOVERNMENT_AGRICULTURAL_AUTHORITY, mayDrivePhysicalMeterPreview: true };
  }
  if (/rhs|kew|horticultur/.test(blob)) {
    return { tier: SOURCE_QUALITY_TIERS.AUTHORITATIVE_HORTICULTURAL_INSTITUTION, mayDrivePhysicalMeterPreview: true };
  }
  return { tier: SOURCE_QUALITY_TIERS.NOT_AUTHORITATIVE, mayDrivePhysicalMeterPreview: false };
}

export function buildBotanicalSizeEvidenceContractReport() {
  const mangoRecord = mapApprovedMangoEvidenceToV2Record();
  return {
    contract: BOTANICAL_SIZE_EVIDENCE_CONTRACT_VERSION,
    productionCatalogMutated: false,
    massTreeEnrichmentExecuted: false,
    universalMatureSize: false,
    userResizeChangesBotanicalTruth: false,
    applyMigrationNow: false,
    sizeEvidenceScenarios: SIZE_EVIDENCE_SCENARIOS,
    evidenceRecordFields: BOTANICAL_SIZE_EVIDENCE_RECORD_FIELDS,
    precedence: BOTANICAL_SIZE_EVIDENCE_PRECEDENCE,
    cultivarOrRootstockSensitivity: {
      exhaustive: false,
      patterns: CULTIVAR_OR_ROOTSTOCK_SENSITIVITY_PATTERNS,
      pilotFlags: ROLE_BASED_PILOT_SET.map((row) => ({
        canonicalSlug: row.canonicalSlug,
        ...classifyCultivarOrRootstockSensitivity(row.canonicalSlug)
      }))
    },
    multiFormSizeRules: {
      slugs: Object.keys(MULTI_FORM_ARCHITECTURE_CONTRACTS).sort(),
      oneRangeForBothArchitecturesForbiddenUnlessSourceSaysSo: true,
      papayaExcludedFromTreeEnrichment: true,
      identityGapsExcluded: IDENTITY_GAPS_CLOSED
    },
    sourceQualityHierarchy: {
      prefer: Object.values(SOURCE_QUALITY_TIERS).filter((tier) => tier !== SOURCE_QUALITY_TIERS.NOT_AUTHORITATIVE),
      reject: SOURCE_QUALITY_REJECT,
      paidAcquisition: false
    },
    roleBasedPilotSet: ROLE_BASED_PILOT_SET,
    unknownFallback: {
      gardenDesignBlocked: false,
      label: 'Estimated size',
      formHeuristic: true,
      manualResize: true,
      inventedMeters: false
    },
    existingApprovedEvidenceMappedToV2: [mangoRecord],
    futureWritePath: FUTURE_WRITE_PATH,
    treeSizeEvidenceEligibleCount: TREE_SIZE_EVIDENCE_ELIGIBLE.length,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 }
  };
}

export function writeBotanicalSizeEvidenceContractReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'botanical-size-evidence-contract-v2');
  fs.mkdirSync(dir, { recursive: true });
  const report = buildBotanicalSizeEvidenceContractReport();
  const reportPath = path.join(dir, 'botanical-size-evidence-contract-v2.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { reportPath, spend: report.spend, productionCatalogMutated: false };
}
