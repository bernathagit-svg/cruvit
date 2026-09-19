/**
 * Tree taxonomy + duplicate identity gate V1.
 * Normalize scientific names for matching only. Overlay only. No catalog merge.
 * No spend. No mass size enrichment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import { loadCanonicalCatalog } from './catalog-source-v1.js';
import {
  IDENTITY_GAPS_CLOSED,
  MULTI_FORM_ARCHITECTURE_CONTRACTS,
  TREE_SIZE_EVIDENCE_ELIGIBLE
} from './multi-form-plant-architecture-v1.js';
import { classifyCultivarOrRootstockSensitivity } from './botanical-size-evidence-contract-v2.js';
import { PILOT_CONFLICTS, PILOT_EVIDENCE_RECORDS, RUNTIME_MAPPING_PROPOSAL } from './botanical-size-evidence-pilot-v1.js';

export const TREE_TAXONOMY_DUPLICATE_GATE_VERSION = 'tree-taxonomy-duplicate-gate-v1';

export const SIZE_READINESS = Object.freeze({
  HEIGHT_SCALE_READY: 'HEIGHT_SCALE_READY',
  SPREAD_SCALE_READY: 'SPREAD_SCALE_READY',
  FULL_SIZE_READY: 'FULL_SIZE_READY'
});

export const TAXONOMY_ACTIONS = Object.freeze({
  KEEP_DISTINCT: 'KEEP_DISTINCT',
  ALIAS_CANDIDATE: 'ALIAS_CANDIDATE',
  MERGE_CANDIDATE: 'MERGE_CANDIDATE',
  IDENTITY_REVIEW_REQUIRED: 'IDENTITY_REVIEW_REQUIRED'
});

export const MASS_ENRICHMENT_HOLDS = Object.freeze({
  UNIQUE_TREE_TAXA_READY_FOR_SIZE_ENRICHMENT: 'UNIQUE_TREE_TAXA_READY_FOR_SIZE_ENRICHMENT',
  ALIAS_OR_DUPLICATE_HOLD: 'ALIAS_OR_DUPLICATE_HOLD',
  IDENTITY_REVIEW_REQUIRED: 'IDENTITY_REVIEW_REQUIRED',
  MULTI_FORM_HOLD: 'MULTI_FORM_HOLD',
  GENUS_LEVEL_HOLD: 'GENUS_LEVEL_HOLD'
});

const HYBRID_MARKERS = new Set(['x', '×', '✕', '⨯']);
const RANK_TOKENS = new Set(['subsp', 'ssp', 'subspecies', 'var', 'variety', 'f', 'forma']);

function asText(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * Matching-only normalization. Does not rewrite production scientific names.
 */
export function normalizeScientificIdentity(scientificName) {
  const original = asText(scientificName);
  const spaced = original
    .normalize('NFKC')
    .replace(/[×✕⨯]/g, ' x ')
    .replace(/[.]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) {
    return Object.freeze({
      original,
      matchingKey: '',
      genus: null,
      epithet: null,
      infraspecificRank: null,
      infraspecificEpithet: null,
      hybridMarkerPresent: false,
      rank: 'UNKNOWN',
      authorFreeBinomial: null,
      productionNameRewritten: false
    });
  }
  const rawTokens = spaced.split(' ');
  const hybridMarkerPresent = rawTokens.some((token) => HYBRID_MARKERS.has(token.toLowerCase()));
  const tokens = rawTokens.filter((token) => !HYBRID_MARKERS.has(token.toLowerCase()));
  const genusRaw = tokens[0] || '';
  const genus = genusRaw ? genusRaw.charAt(0).toUpperCase() + genusRaw.slice(1).toLowerCase() : null;
  const second = tokens[1] || '';
  const genusOnly = !second || /^spp$/i.test(second) || /^sp$/i.test(second);
  if (!genus || genusOnly) {
    return Object.freeze({
      original,
      matchingKey: genus ? `${genus.toLowerCase()}|spp` : '',
      genus,
      epithet: null,
      infraspecificRank: null,
      infraspecificEpithet: null,
      hybridMarkerPresent,
      rank: 'GENUS',
      authorFreeBinomial: genus,
      productionNameRewritten: false
    });
  }
  const epithet = second.toLowerCase();
  let infraspecificRank = null;
  let infraspecificEpithet = null;
  let rank = 'SPECIES';
  for (let i = 2; i < tokens.length - 1; i += 1) {
    const token = tokens[i].toLowerCase();
    if (RANK_TOKENS.has(token)) {
      infraspecificRank = token === 'var' || token === 'variety' ? 'var' : token === 'f' || token === 'forma' ? 'f' : 'subsp';
      infraspecificEpithet = tokens[i + 1].toLowerCase();
      rank = infraspecificRank === 'var' ? 'VARIETY' : infraspecificRank === 'f' ? 'FORMA' : 'SUBSPECIES';
      break;
    }
  }
  const matchingKey = infraspecificEpithet
    ? `${genus.toLowerCase()}|${epithet}|${infraspecificRank}|${infraspecificEpithet}`
    : `${genus.toLowerCase()}|${epithet}`;
  return Object.freeze({
    original,
    matchingKey,
    genus,
    epithet,
    infraspecificRank,
    infraspecificEpithet,
    hybridMarkerPresent,
    rank,
    authorFreeBinomial: `${genus} ${epithet}`,
    productionNameRewritten: false
  });
}

export function classifySizeReadiness(records = [], options = {}) {
  const rows = Array.isArray(records) ? records : [];
  const scenario = options.sizeScenario || null;
  const scoped = scenario ? rows.filter((row) => row.sizeScenario === scenario) : rows;
  const use = scoped.length ? scoped : rows;
  const sourceRows = use.filter((row) => row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE);
  const heightReady = sourceRows.some((row) => Number.isFinite(row.heightMinM) || Number.isFinite(row.heightMaxM));
  const spreadReady = sourceRows.some((row) => Number.isFinite(row.spreadMinM) || Number.isFinite(row.spreadMaxM));
  const sameRecordBoth = sourceRows.some(
    (row) =>
      (Number.isFinite(row.heightMinM) || Number.isFinite(row.heightMaxM)) &&
      (Number.isFinite(row.spreadMinM) || Number.isFinite(row.spreadMaxM))
  );
  const identityHold = Boolean(options.identityHold);
  const notFinalPersonalGardenSize = use.some((row) => row.notFinalPersonalGardenSize);
  return Object.freeze({
    HEIGHT_SCALE_READY: heightReady,
    SPREAD_SCALE_READY: spreadReady,
    FULL_SIZE_READY: sameRecordBoth && heightReady && spreadReady && !identityHold && !notFinalPersonalGardenSize,
    evaluatedScenario: scenario || null,
    unknownDimensions: Object.freeze({
      height: heightReady ? false : 'UNKNOWN',
      spread: spreadReady ? false : 'UNKNOWN'
    }),
    physicalScaleReadyBooleanForbidden: true
  });
}

export const ORANGE_DUPLICATE_DECISION = Object.freeze({
  code: 'ORANGE_DUPLICATE_DECISION',
  mergedNow: false,
  productionCatalogMutated: false,
  enrichIndependently: false,
  classes: Object.freeze(['A', 'C']),
  determination:
    'Same canonical botanical taxon (sweet orange). Catalog notation is inconsistent: orange uses Citrus sinensis; sweet-orange uses Citrus × sinensis. Hybrid marker × is matching-only, not a distinct taxon.',
  classA: 'same canonical botanical taxon',
  classB: 'not proven as a distinct product taxon; common-name split (Orange Tree vs Sweet orange) is not botanical distinctness',
  classC: 'taxonomic notation inconsistency (hybrid marker × / x omitted)',
  classD: 'notation is explained; remaining product-alias question is held, not merged',
  slugs: Object.freeze(['orange', 'sweet-orange']),
  proposedBotanicalTaxonId: 'taxon:citrus-sinensis',
  proposedAcceptedScientificName: 'Citrus × sinensis',
  proposedAliases: Object.freeze(['orange', 'sweet-orange']),
  sizeEvidenceOwnership: 'BOTANICAL_TAXON_IDENTITY',
  action: TAXONOMY_ACTIONS.MERGE_CANDIDATE,
  hold: MASS_ENRICHMENT_HOLDS.ALIAS_OR_DUPLICATE_HOLD
});

export const BOTANICAL_TAXON_ID_PROPOSAL = Object.freeze({
  applyMigrationNow: false,
  productionCatalogMutated: false,
  concept: 'botanicalTaxonId',
  note: 'canonicalSlug is a product/common-name identity. It is not necessarily a unique botanical taxon. Size evidence should attach to botanicalTaxonId.',
  fields: Object.freeze({
    botanicalTaxonId: 'stable taxon key, matching-normalized',
    acceptedScientificName: 'display/authority string; may keep ×',
    rank: 'SPECIES | SUBSPECIES | VARIETY | GENUS',
    synonyms: 'scientific synonyms for matching only',
    canonicalPlantAliases: 'canonicalSlug list that resolve to this taxon'
  }),
  sizeEvidenceAttachesTo: 'BOTANICAL_TAXON_IDENTITY',
  exceptionsRemainSeparate: Object.freeze(['cultivar', 'rootstock', 'architecture', 'maintained-scenario'])
});

export function classifyPilotConflicts() {
  return PILOT_CONFLICTS.map((row) => {
    if (row.canonicalSlug === 'blue-gum') {
      return Object.freeze({
        ...row,
        classification: 'CONTEXT_EXPLAINED',
        reason: 'FEIS NATURAL_MATURE typical range vs SelecTree landscape maxima. Already captured as different scenarios.'
      });
    }
    if (row.canonicalSlug === 'cypress') {
      return Object.freeze({
        ...row,
        classification: 'TRUE_SOURCE_CONFLICT',
        reason: 'Same LANDSCAPE_MATURE columnar scenario; height maxima 60 vs 70 ft disagree. Spread agrees. Do not average.'
      });
    }
    if (row.canonicalSlug === 'apple') {
      return Object.freeze({
        ...row,
        classification: 'CONTEXT_EXPLAINED',
        reason: 'Both seedling/standard class. One record is approximate “about 30 ft”; the other is a 30–40 ft range. Source definition, not a second taxon.'
      });
    }
    if (row.canonicalSlug === 'japanese-maple') {
      return Object.freeze({
        ...row,
        classification: 'CONTEXT_EXPLAINED',
        reason: 'Both sources state cultivar-dependent stature. Range mismatch is cultivar variability, not a second species.'
      });
    }
    return Object.freeze({ ...row, classification: 'REVIEW_REQUIRED', reason: 'Unclassified.' });
  });
}

function catalogBySlug(root) {
  const catalog = loadCanonicalCatalog(root);
  const map = new Map();
  for (const plant of catalog.plants) map.set(plant.canonicalSlug, plant);
  return map;
}

function identityHoldSlugs() {
  return new Set(['orange', 'sweet-orange']);
}

function actionForSlug(slug, cluster) {
  if (slug === 'orange' || slug === 'sweet-orange') return TAXONOMY_ACTIONS.MERGE_CANDIDATE;
  if (cluster && cluster.length > 1) return TAXONOMY_ACTIONS.ALIAS_CANDIDATE;
  return TAXONOMY_ACTIONS.KEEP_DISTINCT;
}

export function auditTreeTaxonomyDuplicates(root) {
  const plants = catalogBySlug(root);
  const hold = identityHoldSlugs();
  const rows = TREE_SIZE_EVIDENCE_ELIGIBLE.map((slug) => {
    const plant = plants.get(slug) || {};
    const scientificName = plant.acceptedScientificName || plant.scientific || null;
    const normalized = normalizeScientificIdentity(scientificName);
    const evidence = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === slug);
    const mapping = RUNTIME_MAPPING_PROPOSAL.find((row) => row.canonicalSlug === slug);
    const readiness = classifySizeReadiness(evidence, {
      identityHold: hold.has(slug),
      sizeScenario: mapping?.bestAvailableScenarioForGenericPreview || null
    });
    const sensitivity = classifyCultivarOrRootstockSensitivity(slug);
    return {
      canonicalSlug: slug,
      commonName: plant.name || slug,
      scientificName,
      normalizedScientificIdentity: normalized,
      taxonomicRankScope: normalized.rank,
      identityConfidence: hold.has(slug) ? 'LOW' : normalized.rank === 'SPECIES' ? 'HIGH' : 'MEDIUM',
      cultivarOrRootstockSensitive: Boolean(sensitivity.sensitive),
      sizeReadiness: readiness,
      descriptiveSource: plant.descriptiveSource || null,
      aliases: plant.aliases || [],
      productionCatalogMutated: false
    };
  });

  const clusters = new Map();
  for (const row of rows) {
    const key = row.normalizedScientificIdentity.matchingKey;
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(row.canonicalSlug);
  }

  const audited = rows.map((row) => {
    const cluster = clusters.get(row.normalizedScientificIdentity.matchingKey) || [row.canonicalSlug];
    const duplicates = cluster.filter((slug) => slug !== row.canonicalSlug);
    const action = actionForSlug(row.canonicalSlug, cluster);
    return Object.freeze({
      ...row,
      duplicateCanonicalSlugCandidates: Object.freeze(duplicates),
      aliasOrSynonymCandidates: Object.freeze(
        row.canonicalSlug === 'sweet-orange' || row.canonicalSlug === 'orange'
          ? ['orange', 'sweet-orange', 'Citrus sinensis', 'Citrus × sinensis']
          : row.aliases
      ),
      action
    });
  });

  const uniqueReady = audited
    .filter((row) => row.action === TAXONOMY_ACTIONS.KEEP_DISTINCT)
    .map((row) => row.canonicalSlug);
  const aliasHold = audited
    .filter((row) => row.action === TAXONOMY_ACTIONS.MERGE_CANDIDATE || row.action === TAXONOMY_ACTIONS.ALIAS_CANDIDATE)
    .map((row) => row.canonicalSlug);
  const identityReview = audited
    .filter((row) => row.action === TAXONOMY_ACTIONS.IDENTITY_REVIEW_REQUIRED)
    .map((row) => row.canonicalSlug);

  return {
    contract: TREE_TAXONOMY_DUPLICATE_GATE_VERSION,
    productionCatalogMutated: false,
    massSizeEnrichmentStarted: false,
    physicalScaleReadyBooleanForbidden: true,
    sizeReadinessSemantics: SIZE_READINESS,
    orangeDuplicateDecision: ORANGE_DUPLICATE_DECISION,
    botanicalTaxonIdProposal: BOTANICAL_TAXON_ID_PROPOSAL,
    records: Object.freeze(audited),
    massEnrichmentEligibility: Object.freeze({
      UNIQUE_TREE_TAXA_READY_FOR_SIZE_ENRICHMENT: Object.freeze({
        count: uniqueReady.length,
        slugs: Object.freeze(uniqueReady)
      }),
      ALIAS_OR_DUPLICATE_HOLD: Object.freeze({
        count: aliasHold.length,
        slugs: Object.freeze(aliasHold)
      }),
      IDENTITY_REVIEW_REQUIRED: Object.freeze({
        count: identityReview.length,
        slugs: Object.freeze(identityReview)
      }),
      MULTI_FORM_HOLD: Object.freeze({
        count: Object.keys(MULTI_FORM_ARCHITECTURE_CONTRACTS).length,
        slugs: Object.freeze(Object.keys(MULTI_FORM_ARCHITECTURE_CONTRACTS).sort())
      }),
      GENUS_LEVEL_HOLD: Object.freeze({
        count: IDENTITY_GAPS_CLOSED.length,
        slugs: IDENTITY_GAPS_CLOSED
      })
    }),
    pilotConflictClassification: Object.freeze(classifyPilotConflicts()),
    spend: Object.freeze({ openaiCalls: 0, imageGeneration: 0, paidBotanicalAcquisitionUsd: 0, additionalSpendUsd: 0 })
  };
}

export function writeTreeTaxonomyDuplicateGateReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'tree-taxonomy-duplicate-gate-v1');
  fs.mkdirSync(dir, { recursive: true });
  const report = auditTreeTaxonomyDuplicates(root);
  const reportPath = path.join(dir, 'taxonomy-audit.json');
  const eligibilityPath = path.join(dir, 'mass-enrichment-eligibility.json');
  const orangePath = path.join(dir, 'orange-duplicate-decision.json');
  const conflictsPath = path.join(dir, 'pilot-conflict-classification.json');
  const taxonPath = path.join(dir, 'botanical-taxon-id-proposal.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(eligibilityPath, `${JSON.stringify({ contract: TREE_TAXONOMY_DUPLICATE_GATE_VERSION, massSizeEnrichmentStarted: false, ...report.massEnrichmentEligibility }, null, 2)}\n`);
  fs.writeFileSync(orangePath, `${JSON.stringify(ORANGE_DUPLICATE_DECISION, null, 2)}\n`);
  fs.writeFileSync(conflictsPath, `${JSON.stringify({ contract: TREE_TAXONOMY_DUPLICATE_GATE_VERSION, conflicts: report.pilotConflictClassification }, null, 2)}\n`);
  fs.writeFileSync(taxonPath, `${JSON.stringify(BOTANICAL_TAXON_ID_PROPOSAL, null, 2)}\n`);
  return { reportPath, eligibilityPath, orangePath, conflictsPath, taxonPath, spend: report.spend };
}
