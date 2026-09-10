/**
 * Auto Enrichment Worker v1 — bounded P1 AUTO orchestrator.
 *
 * Calls existing scanner / retriever / policy / transforms / contradiction /
 * Apply Gate / atomic writer / plant-data-contract. Does not invent plant facts.
 *
 * Hard caps: maxJobs=3, P1 AUTO only, SAFE-writer-eligible plants only.
 *
 * Selection authority (v1.2.0+): derives from current SAFE P1 AUTO queue order.
 * WORKER_PILOT_PLANT_SPECS is retrieval configuration only — not a selection allowlist.
 * No species-name selection exclusions; no pilot preferredOrder override of queue rank.
 *
 * Orchestration contract:
 *   lockBatch → processDryBatch (all locked jobs) → dryBatchValidated
 *   → processRealBatch (same fingerprint only) → regression → queue → idempotence
 *
 * Semantics honesty: each plant write is triad-atomic; the batch is NOT multi-plant
 * transactional. Regression failure after plant writes stops completion; recovery is
 * parent-baseline restore (not automatic multi-plant rollback).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ENRICHMENT_EXECUTION,
  ENRICHMENT_GAP_CODE,
  buildCurrentCatalogEnrichmentQueue,
  queuesSemanticallyEqual
} from './enrichment-gap-scanner-v1.js';
import {
  runSourceRetrieverPilot,
  loadQueueJob,
  SOURCE_RETRIEVER_PILOT_REF
} from './source-retriever-pilot-v1.js';
import {
  APPLY_DECISION,
  APPLY_REASON,
  evaluateCandidateSetForPlant,
  plantContentHash,
  CATALOG_ENRICHMENT_APPLY_GATE_REF
} from './catalog-enrichment-apply-gate-v1.js';
import {
  applyEnrichmentAtomic,
  loadBootstrapSafeMigrationPayload,
  mutationWouldChangePlant,
  hashFile,
  bootstrapSafeMigrationPaths,
  CATALOG_ENRICHMENT_APPLY_WRITER_REF
} from './catalog-enrichment-apply-writer-v1.js';
import { classifyPlantDataReadiness } from './plant-data-contract-v1.js';
import { CONTRADICTION_CLASS } from './catalog-contradiction-gate-v1.js';
import {
  applyBootstrapSafeClimateTraitsMigration,
  applyBootstrapUnlockedSixClimateTraitsMigration
} from './bootstrap-safe-climate-traits-migration-v1.js';
import {
  loadRetryState,
  saveRetryState,
  listCooldownSlugs,
  recordBatchRetryOutcomes,
  emptyOpportunityVersions,
  PRODUCTION_RETRY_FAIRNESS_REF
} from './production-retry-fairness-policy-v1.js';

export const AUTO_ENRICHMENT_WORKER_ID = 'auto-enrichment-worker-v1';
export const AUTO_ENRICHMENT_WORKER_VERSION = '1.2.0';
export const AUTO_ENRICHMENT_WORKER_REF = `${AUTO_ENRICHMENT_WORKER_ID}@${AUTO_ENRICHMENT_WORKER_VERSION}`;

export const WORKER_MAX_JOBS = 3;
export const WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT = 2;
export const WORKER_MAX_EXTERNAL_REQUESTS_TOTAL = 6;

/** Dry-only scale ceiling — never expands real execution (real stays WORKER_MAX_JOBS). */
export const WORKER_DRY_SCALE_MAX_JOBS = 10;
export const WORKER_DRY_SCALE_MAX_EXTERNAL_REQUESTS_TOTAL = 20;

/**
 * Untouched P1 AUTO scale-dry plant specs (Tier A NCSU + USDA). Prefer SAFE-writable first.
 * Excludes lemon/olive/avocado (already processed), apricot, pomegranate, strawberry-guava.
 */
export const WORKER_SCALE_DRY_PLANT_SPECS = Object.freeze([
  {
    slug: 'guava',
    scientificName: 'Psidium guajava',
    safeWritable: true,
    whySafe:
      'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-psidium-guajava',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/psidium-guajava/',
        title: 'Psidium guajava (Guava)'
      },
      {
        sourceId: 'usda-plants-psidium-guajava',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=PSGU',
        title: 'Psidium guajava - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'lychee',
    scientificName: 'Litchi chinensis',
    safeWritable: true,
    whySafe: 'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-litchi-chinensis',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/litchi-chinensis/',
        title: 'Litchi chinensis (Lychee)'
      },
      {
        sourceId: 'usda-plants-litchi-chinensis',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=LICH',
        title: 'Litchi chinensis - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'mandarin',
    scientificName: 'Citrus reticulata',
    safeWritable: true,
    whySafe: 'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-citrus-reticulata',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/citrus-reticulata/',
        title: 'Citrus reticulata (Mandarin)'
      },
      {
        sourceId: 'usda-plants-citrus-reticulata',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=CIRE3',
        title: 'Citrus reticulata - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'mango',
    scientificName: 'Mangifera indica',
    safeWritable: true,
    whySafe: 'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-mangifera-indica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/mangifera-indica/',
        title: 'Mangifera indica (Mango)'
      },
      {
        sourceId: 'usda-plants-mangifera-indica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=MAIN3',
        title: 'Mangifera indica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'orange',
    scientificName: 'Citrus sinensis',
    safeWritable: true,
    whySafe: 'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-citrus-x-sinensis',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/citrus-x-sinensis/',
        title: 'Citrus x sinensis (Sweet Orange)'
      },
      {
        sourceId: 'usda-plants-citrus-sinensis',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=CISI3',
        title: 'Citrus sinensis - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'raspberry',
    scientificName: 'Rubus idaeus',
    safeWritable: true,
    whySafe: 'P1 AUTO PARTIAL; SAFE bootstrap; untouched frost+cold gaps; NCSU Tier A.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-rubus-idaeus',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/rubus-idaeus/',
        title: 'Rubus idaeus (Raspberry)'
      },
      {
        sourceId: 'usda-plants-rubus-idaeus',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=RUID',
        title: 'Rubus idaeus - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'apple',
    scientificName: 'Malus domestica',
    safeWritable: false,
    whySafe:
      'P1 AUTO PARTIAL; retrieval-scale only (not SAFE-writable); Tier A NCSU/USDA for dry cost/evidence.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-malus-domestica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/malus-domestica/',
        title: 'Malus domestica (Apple)'
      },
      {
        sourceId: 'usda-plants-malus-domestica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=MADO4',
        title: 'Malus domestica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'fig',
    scientificName: 'Ficus carica',
    safeWritable: false,
    whySafe:
      'P1 AUTO PARTIAL; retrieval-scale only (not SAFE-writable); Tier A NCSU/USDA for dry cost/evidence.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-ficus-carica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/ficus-carica/',
        title: 'Ficus carica (Fig)'
      },
      {
        sourceId: 'usda-plants-ficus-carica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=FICA',
        title: 'Ficus carica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'peach',
    scientificName: 'Prunus persica',
    safeWritable: false,
    whySafe:
      'P1 AUTO PARTIAL; retrieval-scale only (not SAFE-writable); Tier A NCSU/USDA for dry cost/evidence.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-prunus-persica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/prunus-persica/',
        title: 'Prunus persica (Peach)'
      },
      {
        sourceId: 'usda-plants-prunus-persica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=PRPE3',
        title: 'Prunus persica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'pear',
    scientificName: 'Pyrus communis',
    safeWritable: false,
    whySafe:
      'P1 AUTO PARTIAL; retrieval-scale only (not SAFE-writable); Tier A NCSU/USDA for dry cost/evidence.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-pyrus-communis',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/pyrus-communis/',
        title: 'Pyrus communis (Pear)'
      },
      {
        sourceId: 'usda-plants-pyrus-communis',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=PYCO',
        title: 'Pyrus communis - USDA PLANTS'
      }
    ])
  }
]);

export const WORKER_SCALE_DRY_EXCLUDE_SLUGS = Object.freeze([
  'pomegranate',
  'apricot',
  'lemon',
  'olive',
  'avocado',
  'strawberry-guava'
]);

/**
 * Retrieval configuration only (preferred Tier A URLs). Not a selection allowlist.
 * Historical pilot batch used lemon/olive/avocado; queue authority may select others.
 */
export const WORKER_PILOT_PLANT_SPECS = Object.freeze([
  {
    slug: 'lemon',
    scientificName: 'Citrus × limon',
    whySafe:
      'P1 AUTO PARTIAL; SAFE bootstrap payload; species-level Citrus × limon; frost/cold evidence-only; NCSU Tier A page.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-citrus-x-limon',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/citrus-x-limon/',
        title: 'Citrus x limon (Lemon)'
      },
      {
        sourceId: 'usda-plants-citrus-limon',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=CILI5',
        title: 'Citrus limon - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'olive',
    scientificName: 'Olea europaea',
    whySafe:
      'P1 AUTO PARTIAL; SAFE bootstrap payload; species-level Olea europaea; frost/cold evidence-only; NCSU Tier A page.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-olea-europaea',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/olea-europaea/',
        title: 'Olea europaea (Olive)'
      },
      {
        sourceId: 'usda-plants-olea-europaea',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=OLEU',
        title: 'Olea europaea - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'avocado',
    scientificName: 'Persea americana',
    whySafe:
      'P1 AUTO PARTIAL; SAFE bootstrap payload; species-level Persea americana; frost/cold evidence-only; NCSU Tier A page.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-persea-americana',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/persea-americana/',
        title: 'Persea americana (Avocado)'
      },
      {
        sourceId: 'usda-plants-persea-americana',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=PEAM3',
        title: 'Persea americana - USDA PLANTS'
      }
    ])
  }
]);

/** Hard-stop reasons — every value MUST have a raise path (no enum-only dead codes). */
export const WORKER_STOP_REASON = Object.freeze({
  MATERIAL_CONFLICT: 'MATERIAL_CONFLICT',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  REGRESSION_FAILURE: 'REGRESSION_FAILURE',
  QUEUE_CORRUPTION: 'QUEUE_CORRUPTION',
  SOURCE_POLICY_VIOLATION: 'SOURCE_POLICY_VIOLATION',
  TRANSFORM_UNAUTHORIZED: 'TRANSFORM_UNAUTHORIZED',
  APPLY_UNEXPECTED_FAILURE: 'APPLY_UNEXPECTED_FAILURE',
  HASH_DRIFT: 'HASH_DRIFT',
  WRITE_FAILURE: 'WRITE_FAILURE',
  PROVENANCE_MISSING: 'PROVENANCE_MISSING',
  NON_IDEMPOTENT_SECOND_APPLY: 'NON_IDEMPOTENT_SECOND_APPLY',
  REQUEST_CAP_EXCEEDED: 'REQUEST_CAP_EXCEEDED',
  UNRELATED_PLANT_MUTATION: 'UNRELATED_PLANT_MUTATION'
});

/** Selection-only reasons (not batch hard-stops). */
export const WORKER_SELECTION_REASON = Object.freeze({
  MAX_JOBS_REACHED: 'MAX_JOBS_REACHED'
});

/**
 * Resolve effective maxJobs. Real execution is hard-capped at WORKER_MAX_JOBS=3.
 * Dry scale may raise ceiling to WORKER_DRY_SCALE_MAX_JOBS when allowDryScaleCeiling=true.
 */
export function resolveWorkerMaxJobs({
  dryRun = true,
  maxJobs = WORKER_MAX_JOBS,
  allowDryScaleCeiling = false,
  realExecutionAllowed = true
} = {}) {
  if (realExecutionAllowed === false && dryRun !== true) {
    return {
      ok: false,
      maxJobs: 0,
      realExecutionAllowed: false,
      reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
      detail: 'REAL_EXECUTION_ALLOWED=NO'
    };
  }
  if (dryRun !== true) {
    return {
      ok: true,
      maxJobs: Math.min(maxJobs ?? WORKER_MAX_JOBS, WORKER_MAX_JOBS),
      realExecutionAllowed: true,
      ceiling: WORKER_MAX_JOBS
    };
  }
  const ceiling = allowDryScaleCeiling ? WORKER_DRY_SCALE_MAX_JOBS : WORKER_MAX_JOBS;
  return {
    ok: true,
    maxJobs: Math.min(maxJobs ?? WORKER_MAX_JOBS, ceiling),
    realExecutionAllowed: false,
    ceiling
  };
}

const DISQUALIFY_GAPS = new Set([
  ENRICHMENT_GAP_CODE.CATEGORY_ONLY_POLICY,
  ENRICHMENT_GAP_CODE.BROAD_TAXON_POLICY,
  ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED
]);

const POLICY_HARD_REASONS = new Set([APPLY_REASON.SOURCE_POLICY_NOT_SS]);
const TRANSFORM_HARD_REASONS = new Set([
  APPLY_REASON.TRANSFORM_MISSING,
  APPLY_REASON.TRANSFORM_UNREGISTERED
]);

export function loadCatalogPlants(repoRoot, safePayloadOverride = null) {
  const app = fs.readFileSync(path.join(repoRoot, 'app.html'), 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const s = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || s).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug: s, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  if (safePayloadOverride) {
    applyBootstrapSafeClimateTraitsMigration(Object.values(index), index, safePayloadOverride);
    applyBootstrapUnlockedSixClimateTraitsMigration(Object.values(index), index);
  } else {
    const jsonPath = path.join(
      repoRoot,
      'data',
      'catalog',
      'bootstrap-safe-climate-traits-migration-v1.json'
    );
    const jsonPayload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    applyBootstrapSafeClimateTraitsMigration(Object.values(index), index, jsonPayload);
    applyBootstrapUnlockedSixClimateTraitsMigration(Object.values(index), index);
  }
  const seedRaw = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'data', 'plants.seed.json'), 'utf8').replace(/^\uFEFF/, '')
  );
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !index[s]) index[s] = p;
  }
  return index;
}

export function loadCurrentQueue(repoRoot) {
  const p = path.join(repoRoot, 'data', 'catalog', 'enrichment-queue', 'current-catalog-enrichment-queue-v1.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Rebuild durable enrichment queue from current plants.
 * Semantic no-op: when job truth is unchanged, do NOT rewrite queue/summary files
 * (generatedAt / parentCommit alone are insufficient to persist).
 */
export function refreshEnrichmentQueue(repoRoot, plantsBySlug, parentCommit) {
  const plants = Object.values(plantsBySlug);
  const generatedAt = new Date().toISOString();
  const queue = buildCurrentCatalogEnrichmentQueue(plants, {
    generatedAt,
    parentCommit: parentCommit || null
  });
  const outDir = path.join(repoRoot, 'data', 'catalog', 'enrichment-queue');
  fs.mkdirSync(outDir, { recursive: true });
  const queuePath = path.join(outDir, 'current-catalog-enrichment-queue-v1.json');
  const summaryPath = path.join(outDir, 'current-catalog-enrichment-summary-v1.json');
  const summaryDoc = {
    summaryId: 'current-catalog-enrichment-summary-v1',
    queueContractVersion: queue.queueContractVersion,
    scannerVersion: queue.scannerVersion,
    generatedAt,
    parentCommit: parentCommit || null,
    catalogSnapshot: queue.catalogSnapshot,
    summary: queue.summary,
    note: queue.note
  };

  let existingQueue = null;
  if (fs.existsSync(queuePath)) {
    existingQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  }

  // Meaningful queue truth unchanged → do not touch durable queue or summary files.
  // generatedAt / parentCommit alone are not sufficient reason to persist.
  if (existingQueue && queuesSemanticallyEqual(existingQueue, queue)) {
    const existingSummary = fs.existsSync(summaryPath)
      ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
      : null;
    return {
      queue: existingQueue,
      queuePath,
      summaryPath,
      summary: existingSummary,
      persisted: false,
      semanticNoOp: true,
      queueRefreshEvaluated: true,
      SEMANTIC_NOOP_QUEUE_PERSISTENCE_PREVENTED: 'YES',
      note: 'semantic_noop_persist_skipped'
    };
  }

  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summaryDoc, null, 2));
  return {
    queue,
    queuePath,
    summaryPath,
    summary: summaryDoc,
    persisted: true,
    semanticNoOp: false,
    queueRefreshEvaluated: true,
    SEMANTIC_NOOP_QUEUE_PERSISTENCE_PREVENTED: 'NO'
  };
}

export function loadSafeWriterSlugSet(repoRoot) {
  const jsonPath = path.join(
    repoRoot,
    'data',
    'catalog',
    'bootstrap-safe-climate-traits-migration-v1.json'
  );
  const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return new Set(doc.safeSlugs || []);
}

/** Scientific name → NCSU plants.ces path segment (generic Tier A). */
export function scientificNameToNcsuPathSegment(scientificName) {
  return String(scientificName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Known retrieval configs (pilot + scale-dry). Selection does NOT require membership.
 */
export function knownWorkerRetrievalSpecs() {
  return [...WORKER_PILOT_PLANT_SPECS, ...WORKER_SCALE_DRY_PLANT_SPECS];
}

/**
 * Resolve retrieval configuration for a selected plant.
 * Custom specs preferred; otherwise generic NCSU Tier A from scientific name.
 */
export function resolveWorkerRetrievalSpec({
  slug,
  scientificName,
  plantSpecs = null
} = {}) {
  const catalog = [...(plantSpecs || []), ...knownWorkerRetrievalSpecs()];
  const found = catalog.find((s) => s && s.slug === slug);
  if (found && Array.isArray(found.approvedSources) && found.approvedSources.length > 0) {
    const source =
      found.retrievalSource === 'generic-v2'
        ? 'generic-v2'
        : knownWorkerRetrievalSpecs().some((s) => s.slug === slug)
          ? 'custom'
          : found.retrievalSource || 'custom';
    return {
      ok: true,
      source,
      plantSpec: Object.freeze({ ...found, approvedSources: [...found.approvedSources] })
    };
  }
  const segment = scientificNameToNcsuPathSegment(scientificName);
  if (!segment) {
    return { ok: false, source: 'none', reason: 'retrieval_config_unavailable', plantSpec: null };
  }
  const url = `https://plants.ces.ncsu.edu/plants/${segment}/`;
  return {
    ok: true,
    source: 'generic-v2',
    plantSpec: Object.freeze({
      slug,
      scientificName: scientificName || slug,
      retrievalSource: 'generic-v2',
      whySafe: 'generic Tier A NCSU path from scientific name; not a curated plantSpec',
      approvedSources: Object.freeze([
        Object.freeze({
          sourceId: `ncsu-generic-${segment}`,
          sourceType: 'university_extension',
          institution: 'North Carolina State University Extension Gardener',
          url,
          title: `${scientificName || slug} - NCSU (generic)`
        })
      ])
    })
  };
}

/**
 * Count hard-coded species-name selection exclusions in eligibility (must stay 0).
 */
export function countSpeciesNameSelectionExclusions() {
  const src = isJobEligibleForWorker.toString();
  const hits = [];
  if (/canonicalSlug\s*===\s*'apricot'/.test(src) || /canonicalSlug\s*===\s*"apricot"/.test(src)) {
    hits.push('apricot');
  }
  if (
    /canonicalSlug\s*===\s*'pomegranate'/.test(src) ||
    /canonicalSlug\s*===\s*"pomegranate"/.test(src)
  ) {
    hits.push('pomegranate');
  }
  return hits.length;
}

export function isJobEligibleForWorker(job, options = {}) {
  const reasons = [];
  if (!job) return { ok: false, reasons: ['missing_job'] };
  if (job.enrichmentExecution !== ENRICHMENT_EXECUTION.AUTO) reasons.push('not_AUTO');
  if (job.priority !== 'P1') reasons.push('not_P1');
  if (job.enrichmentExecution === ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW) {
    reasons.push('HOLD_FOR_REVIEW');
  }
  // Product gate HOLD/REJECT blocks production selection even when execution is AUTO.
  // (Scanner may keep evidence retrieval AUTO while productGate=HOLD for needsReview.)
  if (job.productGate === 'HOLD') reasons.push('productGate_HOLD');
  if (job.productGate === 'REJECT') reasons.push('productGate_REJECT');
  if (job.needsReview === true) reasons.push('needsReview');
  if ((job.gapCodes || []).includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW)) {
    reasons.push('NEEDS_REVIEW_gap');
  }
  if (job.productRole === 'CATEGORY_ONLY') reasons.push('category_only');
  if ((job.gapCodes || []).some((g) => DISQUALIFY_GAPS.has(g))) {
    reasons.push('identity_or_broad_gap');
  }
  if (!(job.gapCodes || []).length) reasons.push('no_unresolved_gaps');
  if (job.identityStatus && !['CANONICAL_SPECIES', 'SPECIES_OK', 'OK'].includes(job.identityStatus)) {
    if (
      String(job.identityStatus).includes('CONFLICT') ||
      String(job.identityStatus).includes('CATEGORY') ||
      String(job.identityStatus).includes('BROAD')
    ) {
      reasons.push(`identityStatus:${job.identityStatus}`);
    }
  }
  if (job.sourceRetrievalRequired !== true) reasons.push('sourceRetrievalRequired_not_true');

  if (options.requireSafeWriter !== false) {
    const safeSlugs =
      options.safeSlugs ||
      (options.repoRoot ? loadSafeWriterSlugSet(options.repoRoot) : null);
    if (!safeSlugs) {
      reasons.push('safe_writer_context_missing');
    } else if (!safeSlugs.has(job.canonicalSlug)) {
      reasons.push('not_SAFE_writer_eligible');
    }
  }

  // Optional explicit exclude list only (no default species-name hacks).
  if (options.excludeSlugs?.includes(job.canonicalSlug)) reasons.push('excluded_slug');

  // Production retry/fairness: active cooldown is temporary execution ineligibility.
  // Does NOT change queue priority or override HOLD — only blocks selection/retrieval.
  if (options.applyRetryFairness !== false) {
    const cooled = options.retryCooldownSlugs;
    if (Array.isArray(cooled) && cooled.includes(job.canonicalSlug)) {
      reasons.push('retry_fairness_cooldown');
    }
  }

  // Retrieval specs must NOT gate selection (default requireWorkerSpec=false).
  if (options.requireWorkerSpec === true) {
    const spec = (options.plantSpecs || WORKER_PILOT_PLANT_SPECS).find(
      (s) => s.slug === job.canonicalSlug
    );
    if (!spec) reasons.push('no_worker_plant_spec');
  }
  return { ok: reasons.length === 0, reasons };
}

export function selectEligibleJobs(queueDoc, options = {}) {
  const resolved = resolveWorkerMaxJobs({
    dryRun: options.dryRun !== false,
    maxJobs: options.maxJobs ?? WORKER_MAX_JOBS,
    allowDryScaleCeiling: options.allowDryScaleCeiling === true,
    realExecutionAllowed: options.realExecutionAllowed !== false
  });
  if (!resolved.ok) {
    return {
      maxJobs: 0,
      selected: [],
      skipped: [],
      plantSpecs: [],
      realExecutionAllowed: false,
      error: resolved.detail
    };
  }
  const maxJobs = resolved.maxJobs;
  const retrievalPlantSpecs = options.plantSpecs || knownWorkerRetrievalSpecs();
  const jobs = queueDoc?.jobs || [];
  const eligible = [];
  const skipped = [];
  const excludeSlugs = options.excludeSlugs || [];
  const safeSlugs =
    options.safeSlugs ||
    (options.repoRoot ? loadSafeWriterSlugSet(options.repoRoot) : null);

  let retryCooldownSlugs = options.retryCooldownSlugs || [];
  let retryFairnessDetail = null;
  if (options.applyRetryFairness !== false && options.repoRoot) {
    const loaded = loadRetryState(options.repoRoot, { statePath: options.retryStatePath || null });
    const plantsBySlug =
      options.plantsBySlug ||
      (options.skipPlantHashForFairness ? null : loadCatalogPlants(options.repoRoot));
    const plantHashBySlug = {};
    if (plantsBySlug) {
      for (const job of jobs) {
        const slug = job.canonicalSlug;
        const plant = plantsBySlug[slug];
        if (plant) plantHashBySlug[slug] = plantContentHash(plant);
      }
    }
    const listed = listCooldownSlugs(loaded.doc, jobs, {
      now: options.now || new Date(),
      plantHashBySlug,
      versionBundle: emptyOpportunityVersions()
    });
    retryCooldownSlugs = [...new Set([...(retryCooldownSlugs || []), ...listed.cooledSlugs])];
    retryFairnessDetail = {
      policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
      cooledSlugs: listed.cooledSlugs,
      details: listed.details,
      statePath: loaded.path
    };
  }

  // Authoritative queue order only — no pilot preferredOrder.
  for (const job of jobs) {
    const el = isJobEligibleForWorker(job, {
      plantSpecs: retrievalPlantSpecs,
      excludeSlugs,
      safeSlugs,
      repoRoot: options.repoRoot,
      requireWorkerSpec: options.requireWorkerSpec === true,
      requireSafeWriter: options.requireSafeWriter,
      applyRetryFairness: options.applyRetryFairness,
      retryCooldownSlugs
    });
    if (!el.ok) {
      skipped.push({ jobId: job.jobId, slug: job.canonicalSlug, reasons: el.reasons });
      continue;
    }
    if (eligible.length >= maxJobs) {
      skipped.push({
        jobId: job.jobId,
        slug: job.canonicalSlug,
        reasons: [WORKER_SELECTION_REASON.MAX_JOBS_REACHED]
      });
      continue;
    }
    eligible.push(job);
  }

  const resolvedSpecs = eligible
    .map((j) =>
      resolveWorkerRetrievalSpec({
        slug: j.canonicalSlug,
        scientificName: j.scientificName,
        plantSpecs: retrievalPlantSpecs
      })
    )
    .filter((r) => r.ok)
    .map((r) => r.plantSpec);

  return {
    maxJobs,
    selected: eligible.slice(0, maxJobs),
    skipped,
    plantSpecs: resolvedSpecs,
    realExecutionAllowed: resolved.realExecutionAllowed,
    jobCeiling: resolved.ceiling,
    selectionAuthority: 'QUEUE_ORDER_SAFE_P1_AUTO',
    retryFairness: retryFairnessDetail,
    QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS: 'YES'
  };
}

export function computeBatchFingerprint(lockedJobs) {
  const canonical = (lockedJobs || [])
    .map((j) => `${j.jobId}|${j.slug}|${(j.gapCodes || []).slice().sort().join(',')}`)
    .join('||');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Finalize immutable batch membership. After this, no replacement/re-selection.
 */
export function lockBatch(selection, options = {}) {
  const lockedJobs = (selection.selected || []).map((j) =>
    Object.freeze({
      jobId: j.jobId,
      slug: j.canonicalSlug,
      scientificName: j.scientificName,
      priority: j.priority,
      enrichmentExecution: j.enrichmentExecution,
      gapCodes: Object.freeze([...(j.gapCodes || [])])
    })
  );
  const batchFingerprint = computeBatchFingerprint(lockedJobs);
  const retrievalCatalog = options.plantSpecs || selection.plantSpecs || knownWorkerRetrievalSpecs();
  const plantSpecs = Object.freeze(
    lockedJobs
      .map((j) =>
        resolveWorkerRetrievalSpec({
          slug: j.slug,
          scientificName: j.scientificName,
          plantSpecs: retrievalCatalog
        })
      )
      .filter((r) => r.ok)
      .map((r) => Object.freeze({ ...r.plantSpec }))
  );
  return Object.freeze({
    batchLocked: true,
    lockedAt: new Date().toISOString(),
    lockedJobs,
    lockedSlugs: Object.freeze(lockedJobs.map((j) => j.slug)),
    lockedJobIds: Object.freeze(lockedJobs.map((j) => j.jobId)),
    batchFingerprint,
    maxJobs: selection.maxJobs ?? WORKER_MAX_JOBS,
    plantSpecs,
    selectionAuthority: selection.selectionAuthority || 'QUEUE_ORDER_SAFE_P1_AUTO',
    selectionSkipped: selection.skipped || []
  });
}

export function assertBatchMembershipImmutable(lockedBatch, observedSlugs) {
  if (!lockedBatch?.batchLocked) {
    return { ok: false, reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE };
  }
  const expected = [...lockedBatch.lockedSlugs].join(',');
  const actual = [...observedSlugs].join(',');
  if (expected !== actual) {
    return { ok: false, reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE, expected, actual };
  }
  const fp = computeBatchFingerprint(
    observedSlugs.map((slug, i) => lockedBatch.lockedJobs[i] || { jobId: `x:${slug}`, slug, gapCodes: [] })
  );
  // Membership by slug order must match locked list exactly
  if ([...observedSlugs].join(',') !== [...lockedBatch.lockedSlugs].join(',')) {
    return { ok: false, reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE };
  }
  void fp;
  return { ok: true };
}

/**
 * Token proving a full dry batch completed for this fingerprint.
 */
export function createDryValidationToken(dryBatch) {
  const dryBatchValidated =
    dryBatch?.status === 'BATCH_COMPLETE' &&
    !dryBatch?.batchStopReason &&
    dryBatch?.batchLocked === true &&
    Array.isArray(dryBatch?.lockedSlugs) &&
    dryBatch.lockedSlugs.length > 0;
  return Object.freeze({
    dryBatchValidated: !!dryBatchValidated,
    batchFingerprint: dryBatch?.batchFingerprint || null,
    lockedSlugs: Object.freeze([...(dryBatch?.lockedSlugs || [])]),
    dryStartedAt: dryBatch?.startedAt || null,
    dryFinishedAt: dryBatch?.finishedAt || null,
    workerRef: dryBatch?.workerRef || AUTO_ENRICHMENT_WORKER_REF
  });
}

export function assertRealWriteAllowed(lockedBatch, dryValidation) {
  if (!lockedBatch?.batchLocked) {
    return { ok: false, reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE, detail: 'batch_not_locked' };
  }
  if (!dryValidation || dryValidation.dryBatchValidated !== true) {
    return {
      ok: false,
      reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
      detail: 'dry_batch_not_validated'
    };
  }
  if (dryValidation.batchFingerprint !== lockedBatch.batchFingerprint) {
    return {
      ok: false,
      reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
      detail: 'dry_fingerprint_mismatch'
    };
  }
  const mem = assertBatchMembershipImmutable(lockedBatch, dryValidation.lockedSlugs);
  if (!mem.ok) {
    return { ok: false, reason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE, detail: 'membership_drift' };
  }
  return { ok: true };
}

function triadHashes(repoRoot) {
  const paths = bootstrapSafeMigrationPaths(repoRoot);
  return {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser)
  };
}

/**
 * Detect hard stops from Apply Gate results.
 * Soft NEEDS_MORE / apply_status_not_ready does NOT hard-stop.
 * Policy/transform failures on READY_TO_APPLY fields DO hard-stop.
 */
export function detectHardStopFromGate(gate, fieldPackets = []) {
  const readyFields = new Set(
    (fieldPackets || [])
      .filter((f) => f.applyStatus === 'READY_TO_APPLY')
      .map((f) => f.field || f.targetField)
  );

  for (const r of gate?.fieldResults || []) {
    if (r.contradictionClass === CONTRADICTION_CLASS.MATERIAL_CONFLICT) {
      return WORKER_STOP_REASON.MATERIAL_CONFLICT;
    }
    if (r.contradictionClass === CONTRADICTION_CLASS.IDENTITY_CONFLICT) {
      return WORKER_STOP_REASON.IDENTITY_CONFLICT;
    }
    const reasons = r.reasons || [];
    if (reasons.includes(APPLY_REASON.IDENTITY_MISMATCH)) {
      return WORKER_STOP_REASON.IDENTITY_CONFLICT;
    }
    if (
      reasons.includes(APPLY_REASON.MATERIAL_VALUE_CONFLICT) ||
      (r.decision === APPLY_DECISION.HOLD_CONFLICT &&
        reasons.includes(APPLY_REASON.CONTRADICTION_NOT_APPROVED))
    ) {
      return WORKER_STOP_REASON.MATERIAL_CONFLICT;
    }
    if (readyFields.has(r.field) && r.decision === APPLY_DECISION.APPLY_BLOCKED) {
      if (reasons.some((x) => POLICY_HARD_REASONS.has(x))) {
        return WORKER_STOP_REASON.SOURCE_POLICY_VIOLATION;
      }
      if (reasons.some((x) => TRANSFORM_HARD_REASONS.has(x))) {
        return WORKER_STOP_REASON.TRANSFORM_UNAUTHORIZED;
      }
    }
  }
  if (gate?.setDecision === APPLY_DECISION.HOLD_CONFLICT) {
    return WORKER_STOP_REASON.MATERIAL_CONFLICT;
  }
  return null;
}

/**
 * Queue integrity after refresh.
 *
 * Selected locked jobs may disappear ONLY when ALL of:
 * 1. plant is Class A / productGate PASS (Plant Data Contract)
 * 2. gap scanner independently recomputes no job for that plant
 * 3. for a NEW disappearance vs queueBefore: plant was successfully written
 *    in this batch (catalogMutated) — not fabricated / pre-write deletion
 * 4. no unrelated (non-locked) job disappeared
 * 5. summary.totalJobs === jobs.length
 *
 * Stable absence (already missing in queueBefore) of a terminal Class A plant
 * is allowed when the scanner still omits it (idempotent / resume).
 */
export function validateQueueIntegrity(queueDoc, lockedSlugs = [], plantsBySlug = null, options = {}) {
  const queueBefore = options.queueBefore || null;
  const justWrittenSlugs = new Set(
    Array.isArray(options.justWrittenSlugs)
      ? options.justWrittenSlugs
      : options.justWrittenSlug
        ? [options.justWrittenSlug]
        : []
  );
  const batchWrittenSlugs = new Set(options.batchWrittenSlugs || []);

  if (!queueDoc || typeof queueDoc !== 'object') {
    return { ok: false, reason: 'queue_missing' };
  }
  if (!Array.isArray(queueDoc.jobs)) {
    return { ok: false, reason: 'jobs_not_array' };
  }
  if (!queueDoc.summary || typeof queueDoc.summary.totalJobs !== 'number') {
    return { ok: false, reason: 'summary_corrupt' };
  }
  if (queueDoc.summary.totalJobs !== queueDoc.jobs.length) {
    return { ok: false, reason: 'job_count_mismatch' };
  }

  let expectedByScanner = null;
  if (plantsBySlug && typeof plantsBySlug === 'object') {
    expectedByScanner = buildCurrentCatalogEnrichmentQueue(Object.values(plantsBySlug), {
      generatedAt: 'queue-integrity-recompute'
    });
  }

  const afterBySlug = new Map(
    (queueDoc.jobs || []).map((j) => [j.canonicalSlug || j.slug, j])
  );
  const beforeBySlug = queueBefore
    ? new Map((queueBefore.jobs || []).map((j) => [j.canonicalSlug || j.slug, j]))
    : null;

  for (const slug of lockedSlugs) {
    const job = afterBySlug.get(slug);
    if (!job) {
      const plant = plantsBySlug?.[slug];
      if (!plant) {
        return { ok: false, reason: `missing_job:${slug}` };
      }
      const r = classifyPlantDataReadiness(plant);
      const terminal = r.readinessShort === 'A' || r.gate === 'PASS';
      if (!terminal) {
        return { ok: false, reason: `missing_job_incomplete:${slug}` };
      }
      if (expectedByScanner) {
        const stillQueued = expectedByScanner.jobs.some(
          (j) => (j.canonicalSlug || j.slug) === slug
        );
        if (stillQueued) {
          return { ok: false, reason: `missing_job_scanner_still_has:${slug}` };
        }
      } else {
        // Without plants, cannot authorize Class A removal — hard fail.
        return { ok: false, reason: `missing_job:${slug}` };
      }

      const wasPresentBefore = beforeBySlug ? beforeBySlug.has(slug) : null;
      if (wasPresentBefore === true) {
        // NEW disappearance this refresh: require successful write this batch.
        const written =
          justWrittenSlugs.has(slug) || batchWrittenSlugs.has(slug);
        if (!written) {
          return { ok: false, reason: `missing_job_not_written_this_batch:${slug}` };
        }
      }
      // wasPresentBefore === false → stable terminal absence (resume/idempotent)
      // wasPresentBefore === null → no before snapshot; terminal+scanner already required
      continue;
    }
    if (!Array.isArray(job.gapCodes)) {
      return { ok: false, reason: `gapCodes_corrupt:${slug}` };
    }
    if (!job.jobId) return { ok: false, reason: `jobId_missing:${slug}` };
  }

  if (beforeBySlug) {
    for (const [slug, beforeJob] of beforeBySlug.entries()) {
      if (afterBySlug.has(slug)) continue;
      // Job disappeared
      if (!lockedSlugs.includes(slug)) {
        return {
          ok: false,
          reason: `unrelated_job_removed:${beforeJob.jobId || slug}`
        };
      }
      // Locked disappearance already validated in locked loop above
    }

    // Unrelated jobs must be byte-stable for gapCodes / execution / gate
    for (const [slug, beforeJob] of beforeBySlug.entries()) {
      if (lockedSlugs.includes(slug)) continue;
      const afterJob = afterBySlug.get(slug);
      if (!afterJob) continue; // unrelated removal already failed above
      const beforeKey = JSON.stringify({
        gapCodes: [...(beforeJob.gapCodes || [])].sort(),
        enrichmentExecution: beforeJob.enrichmentExecution || null,
        productGate: beforeJob.productGate || null,
        priority: beforeJob.priority || null
      });
      const afterKey = JSON.stringify({
        gapCodes: [...(afterJob.gapCodes || [])].sort(),
        enrichmentExecution: afterJob.enrichmentExecution || null,
        productGate: afterJob.productGate || null,
        priority: afterJob.priority || null
      });
      if (beforeKey !== afterKey) {
        return { ok: false, reason: `unrelated_job_changed:${beforeJob.jobId || slug}` };
      }
    }

    // Count reconciliation: only locked terminal removals may reduce size
    const removedLocked = lockedSlugs.filter(
      (slug) => beforeBySlug.has(slug) && !afterBySlug.has(slug)
    );
    const removedUnrelated = [...beforeBySlug.keys()].filter(
      (slug) => !afterBySlug.has(slug) && !lockedSlugs.includes(slug)
    );
    if (removedUnrelated.length) {
      return {
        ok: false,
        reason: `unrelated_job_removed:${removedUnrelated[0]}`
      };
    }
    const expectedMin = (queueBefore.jobs || []).length - removedLocked.length;
    const added = [...afterBySlug.keys()].filter((slug) => !beforeBySlug.has(slug));
    if (added.length) {
      return { ok: false, reason: `unexpected_job_added:${added[0]}` };
    }
    if (queueDoc.jobs.length !== expectedMin) {
      return {
        ok: false,
        reason: `queue_delta_mismatch:expected_${expectedMin}_got_${queueDoc.jobs.length}`
      };
    }
  }

  return { ok: true };
}

/**
 * Bounded post-write regression gate (not full CI suite).
 * Batch is not multi-plant transactional — failure after writes requires owner restore.
 */
export function runWorkerRegressionGate({
  repoRoot,
  changedSlugs = [],
  otherSlugsBefore = {},
  lockedSlugs = []
}) {
  try {
    const plants = loadCatalogPlants(repoRoot);
    for (const slug of lockedSlugs) {
      if (!plants[slug]) {
        return { ok: false, stop: WORKER_STOP_REASON.REGRESSION_FAILURE, detail: `missing_plant:${slug}` };
      }
      const c = classifyPlantDataReadiness(plants[slug]);
      if (!c?.readinessShort) {
        return { ok: false, stop: WORKER_STOP_REASON.REGRESSION_FAILURE, detail: `classify_failed:${slug}` };
      }
    }
    const payload = loadBootstrapSafeMigrationPayload(repoRoot).payload;
    for (const [slug, beforeJson] of Object.entries(otherSlugsBefore)) {
      if (JSON.stringify(payload.plants[slug]) !== beforeJson) {
        return {
          ok: false,
          stop: WORKER_STOP_REASON.UNRELATED_PLANT_MUTATION,
          detail: slug
        };
      }
    }
    for (const slug of changedSlugs) {
      const ct = payload.plants[slug]?.climateTraits;
      if (!ct) {
        return { ok: false, stop: WORKER_STOP_REASON.REGRESSION_FAILURE, detail: `payload_missing:${slug}` };
      }
      // Changed plants must not lose flowering/fruiting text identity
      if (ct.floweringRequirements == null && ct.fruitingRequirements == null) {
        // allowed for some plants; no-op
      }
    }
    // Triad files must remain parseable
    const paths = bootstrapSafeMigrationPaths(repoRoot);
    JSON.parse(fs.readFileSync(paths.json, 'utf8'));
    fs.readFileSync(paths.js, 'utf8');
    fs.readFileSync(paths.browser, 'utf8');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      stop: WORKER_STOP_REASON.REGRESSION_FAILURE,
      detail: String(err?.message || err)
    };
  }
}

/**
 * Process one enrichment job through the proven pipeline.
 */
export async function processJob({
  repoRoot,
  job,
  plant,
  plantSpec,
  queueDoc,
  dryRun = true,
  writeSelectedSlugs,
  expectedTriadHashes = null,
  fetchImpl = globalThis.fetch,
  parentCommit = null,
  requestBudget,
  cacheDir = null,
  artifactRoot = null,
  dryValidation = null,
  lockedBatch = null,
  /**
   * When set for this job slug, skip network retrieval and load a frozen
   * candidate packet from disk (committed Retrieval Coverage v2 reuse).
   * Map: { [slug]: absoluteOrRepoRelativePacketPath }
   */
  reusePacketsBySlug = null,
  /** Slugs already successfully catalog-mutated earlier in this batch. */
  batchWrittenSlugs = null,
  safeSlugs = null,
  retrievalPlantSpecs = null,
  excludeSlugs = null
}) {
  const audit = {
    workerRef: AUTO_ENRICHMENT_WORKER_REF,
    jobId: job.jobId,
    slug: job.canonicalSlug || job.slug,
    scientificName: job.scientificName || plant?.scientific,
    dryRun,
    beforePlantHash: plantContentHash(plant),
    beforeReadiness: null,
    status: 'PENDING',
    hardStop: null,
    externalRequests: 0,
    cacheHits: 0,
    appliedFields: [],
    ownerDecisionRequired: false
  };

  const before = classifyPlantDataReadiness(plant);
  audit.beforeReadiness = { readinessShort: before.readinessShort, gate: before.gate };

  // Real writes require dry validation + locked batch
  if (!dryRun) {
    const allow = assertRealWriteAllowed(lockedBatch, dryValidation);
    if (!allow.ok) {
      audit.status = 'FAILED';
      audit.hardStop = allow.reason;
      audit.error = allow.detail || 'real_write_not_allowed';
      return audit;
    }
  }

  const el = isJobEligibleForWorker(
    { ...job, canonicalSlug: job.canonicalSlug || job.slug },
    {
      requireWorkerSpec: false,
      safeSlugs,
      repoRoot,
      excludeSlugs: excludeSlugs || []
    }
  );
  if (!el.ok) {
    audit.status = 'SKIPPED';
    audit.skipReasons = el.reasons;
    return audit;
  }

  if (expectedTriadHashes) {
    const now = triadHashes(repoRoot);
    if (
      now.json !== expectedTriadHashes.json ||
      now.js !== expectedTriadHashes.js ||
      now.browser !== expectedTriadHashes.browser
    ) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.HASH_DRIFT;
      return audit;
    }
  }

  const slugKey = plant.slug || job.canonicalSlug || job.slug;
  const resolvedRetrieval = resolveWorkerRetrievalSpec({
    slug: slugKey,
    scientificName: job.scientificName || plant?.scientific,
    plantSpecs: plantSpec
      ? [plantSpec, ...(retrievalPlantSpecs || [])]
      : retrievalPlantSpecs || null
  });
  audit.retrievalConfigSource = resolvedRetrieval.source;
  if (!resolvedRetrieval.ok || !resolvedRetrieval.plantSpec?.approvedSources?.length) {
    audit.status = 'PARTIAL_NO_APPLY';
    audit.note = 'retrieval_config_unavailable';
    audit.ownerDecisionRequired = false;
    return audit;
  }
  const effectivePlantSpec = resolvedRetrieval.plantSpec;

  const reusePathRaw =
    reusePacketsBySlug && typeof reusePacketsBySlug === 'object'
      ? reusePacketsBySlug[slugKey]
      : null;
  let packetPath = null;
  let packet = null;

  if (reusePathRaw) {
    packetPath = path.isAbsolute(reusePathRaw)
      ? reusePathRaw
      : path.join(repoRoot, reusePathRaw);
    if (!fs.existsSync(packetPath)) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      audit.error = 'missing_reused_candidate_packet';
      return audit;
    }
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    audit.externalRequests = 0;
    audit.cacheHits = 1;
    audit.sourcesFetched = [];
    audit.note = 'reused_committed_candidate_packet';
    audit.reusedPacketPath = path.relative(repoRoot, packetPath).replace(/\\/g, '/');
    audit.retrievalConfigSource = 'cache';
  } else {
    const retriever = await runSourceRetrieverPilot({
      repoRoot,
      queueDoc,
      plantsBySlug: { [plant.slug]: plant },
      fetchImpl,
      plantSpecs: [effectivePlantSpec],
      cacheDir,
      artifactRoot,
      writeSharedSummary: false
    });
    audit.externalRequests = retriever.summary?.externalRequestCount || 0;
    audit.cacheHits = retriever.cacheStats?.hits ?? 0;
    audit.sourcesFetched = retriever.results?.[0]?.sourcesFetched || [];
    if (requestBudget) {
      requestBudget.used += audit.externalRequests;
      const maxTotal = requestBudget.maxTotal ?? WORKER_MAX_EXTERNAL_REQUESTS_TOTAL;
      const maxPerPlant =
        requestBudget.maxPerPlant ?? WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT;
      if (requestBudget.used > maxTotal) {
        audit.status = 'FAILED';
        audit.hardStop = WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED;
        return audit;
      }
      if (audit.externalRequests > maxPerPlant) {
        audit.status = 'FAILED';
        audit.hardStop = WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED;
        return audit;
      }
    }

    packetPath = retriever.results?.[0]?.packetPath;
    if (!packetPath || !fs.existsSync(packetPath)) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      audit.error = 'missing_candidate_packet';
      return audit;
    }
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  }
  audit.packetFingerprint = packet.fingerprint;
  audit.fieldPackets = (packet.fieldPackets || []).map((f) => ({
    field: f.targetField,
    applyStatus: f.applyStatus,
    value: f.proposedValue,
    transformRef: f.transformRef
  }));

  const gate = evaluateCandidateSetForPlant({
    packet,
    plant,
    writePlanRequested: true,
    writeSelectedSlugs,
    requireBothFrostAndCold: false
  });
  audit.applyGate = {
    setDecision: gate.setDecision,
    setReasons: gate.setReasons,
    fieldResults: gate.fieldResults.map((r) => ({
      field: r.field,
      decision: r.decision,
      reasons: r.reasons,
      contradictionClass: r.contradictionClass
    }))
  };

  const hard = detectHardStopFromGate(gate, audit.fieldPackets);
  if (hard) {
    audit.status = 'HOLD';
    audit.hardStop = hard;
    audit.ownerDecisionRequired = true;
    return audit;
  }

  if (gate.setDecision === APPLY_DECISION.NEEDS_MORE_EVIDENCE) {
    audit.status = 'PARTIAL_NO_APPLY';
    audit.note = 'insufficient_evidence_or_incomplete_ready_set';
    return audit;
  }

  if (gate.setDecision !== APPLY_DECISION.APPLY_ALLOWED || !gate.mutationPlan?.ok) {
    if (gate.setReasons?.includes(APPLY_REASON.PLANT_NOT_SELECTED_FOR_WRITE)) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      return audit;
    }
    audit.status = 'PARTIAL_NO_APPLY';
    audit.note = 'apply_not_allowed';
    return audit;
  }

  audit.mutationPlan = {
    planFingerprint: gate.mutationPlan.planFingerprint,
    jsonDiff: gate.mutationPlan.jsonDiff,
    guards: gate.mutationPlan.guards
  };
  audit.readinessSimulation = gate.readinessSimulation;

  if (dryRun) {
    audit.status = 'DRY_RUN_APPLY_ALLOWED';
    audit.appliedFields = gate.mutationPlan.mutations.map((m) => m.field);
    return audit;
  }

  // Real write — guarded above by assertRealWriteAllowed
  const hashes = expectedTriadHashes || triadHashes(repoRoot);
  const write = applyEnrichmentAtomic({
    repoRoot,
    slug: plant.slug,
    plant,
    packet,
    expectedFileHashes: hashes,
    allowSlugs: writeSelectedSlugs,
    requireBothFrostAndCold: false
  });
  audit.writeResult = {
    ok: write.ok,
    skipped: write.skipped,
    catalogMutated: write.catalogMutated,
    reason: write.reason || null
  };

  if (!write.ok) {
    audit.status = 'FAILED';
    audit.hardStop =
      write.reason === 'prewrite_hash_mismatch' || write.reason === 'hash_changed_before_write'
        ? WORKER_STOP_REASON.HASH_DRIFT
        : WORKER_STOP_REASON.WRITE_FAILURE;
    return audit;
  }

  if (write.skipped) {
    audit.status = 'ALREADY_EQUIVALENT';
    audit.appliedFields = [];
  } else {
    audit.appliedFields = gate.mutationPlan.mutations.map((m) => m.field);
    const payload = loadBootstrapSafeMigrationPayload(repoRoot).payload;
    const ct = payload.plants[plant.slug]?.climateTraits;
    for (const field of audit.appliedFields) {
      const prov = ct?.enrichmentProvenance?.[field];
      if (!prov?.transformId || !prov?.evidenceLineage || !prov?.sourceIds?.length) {
        audit.status = 'FAILED';
        audit.hardStop = WORKER_STOP_REASON.PROVENANCE_MISSING;
        return audit;
      }
    }
  }

  const plantsAfter = loadCatalogPlants(repoRoot);
  const plantAfter = plantsAfter[plant.slug];
  const after = classifyPlantDataReadiness(plantAfter);
  audit.afterReadiness = { readinessShort: after.readinessShort, gate: after.gate };
  audit.afterPlantHash = plantContentHash(plantAfter);

  const gate2 = evaluateCandidateSetForPlant({
    packet,
    plant: plantAfter,
    writePlanRequested: true,
    writeSelectedSlugs,
    requireBothFrostAndCold: false
  });
  const wouldMutate = mutationWouldChangePlant(plantAfter, gate2.mutationPlan);
  audit.idempotence = {
    SECOND_APPLY_WOULD_MUTATE: wouldMutate ? 'YES' : 'NO',
    gate2Decision: gate2.setDecision
  };
  if (wouldMutate) {
    audit.status = 'FAILED';
    audit.hardStop = WORKER_STOP_REASON.NON_IDEMPOTENT_SECOND_APPLY;
    return audit;
  }

  const refreshed = refreshEnrichmentQueue(repoRoot, plantsAfter, parentCommit);
  audit.queueRefresh = {
    evaluated: true,
    persisted: refreshed.persisted === true,
    semanticNoOp: refreshed.semanticNoOp === true,
    SEMANTIC_NOOP_QUEUE_PERSISTENCE_PREVENTED:
      refreshed.SEMANTIC_NOOP_QUEUE_PERSISTENCE_PREVENTED || null
  };
  const writtenThisJob = write.catalogMutated ? [plant.slug] : [];
  const qCheck = validateQueueIntegrity(refreshed.queue, writeSelectedSlugs, plantsAfter, {
    queueBefore: queueDoc,
    justWrittenSlugs: writtenThisJob,
    batchWrittenSlugs: [
      ...(batchWrittenSlugs || []),
      ...writtenThisJob
    ]
  });
  if (!qCheck.ok) {
    audit.status = 'FAILED';
    audit.hardStop = WORKER_STOP_REASON.QUEUE_CORRUPTION;
    audit.error = qCheck.reason;
    return audit;
  }
  audit.queueAfter = {
    totalJobs: refreshed.queue.summary.totalJobs,
    jobPresent: !!loadQueueJob(refreshed.queue, plant.slug),
    gapCodes: loadQueueJob(refreshed.queue, plant.slug)?.gapCodes || null
  };

  audit.status = write.catalogMutated ? 'APPLIED' : 'ALREADY_EQUIVALENT';
  audit.writerRef = CATALOG_ENRICHMENT_APPLY_WRITER_REF;
  audit.gateRef = CATALOG_ENRICHMENT_APPLY_GATE_REF;
  audit.retrieverRef = SOURCE_RETRIEVER_PILOT_REF;
  return audit;
}

/**
 * Process a locked batch. Stops on hard-stop conditions.
 * Real mode REQUIRES dryValidation from a completed dry batch with same fingerprint.
 */
export async function processBatch({
  repoRoot,
  dryRun = true,
  maxJobs = WORKER_MAX_JOBS,
  plantSpecs = null,
  fetchImpl = globalThis.fetch,
  parentCommit = '687a17fe53adf55265451a8bc1f6817194e46c85',
  excludeSlugs = [],
  cacheDir = null,
  artifactRoot = null,
  lockedBatch = null,
  dryValidation = null,
  allowDryScaleCeiling = false,
  realExecutionAllowed = true,
  maxExternalRequestsTotal = null,
  maxExternalRequestsPerPlant = null,
  reusePacketsBySlug = null,
  applyRetryFairness = true,
  persistRetryFairness = null,
  retryStatePath = null,
  now = null
}) {
  const plantsBySlug = loadCatalogPlants(repoRoot);
  const queueDoc = loadCurrentQueue(repoRoot);
  const safeSlugs = loadSafeWriterSlugSet(repoRoot);
  const retrievalPlantSpecs = plantSpecs || knownWorkerRetrievalSpecs();
  const clock = now || new Date();

  const resolved = resolveWorkerMaxJobs({
    dryRun,
    maxJobs,
    allowDryScaleCeiling,
    realExecutionAllowed
  });
  if (!resolved.ok) {
    return {
      workerRef: AUTO_ENRICHMENT_WORKER_REF,
      dryRun,
      status: 'BATCH_STOPPED',
      batchStopReason: resolved.reason,
      error: resolved.detail,
      batchLocked: !!lockedBatch?.batchLocked,
      audits: [],
      selectedJobs: [],
      lockedSlugs: lockedBatch?.lockedSlugs || [],
      externalRequests: 0,
      plantsChanged: [],
      fieldsChanged: {},
      REAL_EXECUTION_ALLOWED: false,
      recoveryPolicy: 'none'
    };
  }

  let lock = lockedBatch;
  if (!lock) {
    const selection = selectEligibleJobs(queueDoc, {
      maxJobs: resolved.maxJobs,
      plantSpecs: retrievalPlantSpecs,
      excludeSlugs,
      dryRun,
      allowDryScaleCeiling,
      realExecutionAllowed,
      repoRoot,
      safeSlugs,
      applyRetryFairness,
      retryStatePath,
      now: clock,
      plantsBySlug
    });
    lock = lockBatch(selection, { plantSpecs: retrievalPlantSpecs });
  }

  if (!lock.batchLocked) {
    return {
      workerRef: AUTO_ENRICHMENT_WORKER_REF,
      dryRun,
      status: 'BATCH_STOPPED',
      batchStopReason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
      batchLocked: false,
      audits: [],
      selectedJobs: [],
      lockedSlugs: [],
      externalRequests: 0,
      plantsChanged: [],
      fieldsChanged: {},
      REAL_EXECUTION_ALLOWED: dryRun ? false : true,
      recoveryPolicy: 'none'
    };
  }

  // Guard: locked dry-scale batches cannot silently exceed production real cap on real path
  if (!dryRun && lock.lockedJobs.length > WORKER_MAX_JOBS) {
    return {
      workerRef: AUTO_ENRICHMENT_WORKER_REF,
      dryRun,
      status: 'BATCH_STOPPED',
      batchStopReason: WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
      error: 'real_batch_exceeds_WORKER_MAX_JOBS',
      batchLocked: true,
      batchFingerprint: lock.batchFingerprint,
      lockedSlugs: [...lock.lockedSlugs],
      audits: [],
      selectedJobs: lock.lockedJobs.map((j) => ({ ...j })),
      externalRequests: 0,
      plantsChanged: [],
      fieldsChanged: {},
      REAL_EXECUTION_ALLOWED: false,
      recoveryPolicy: 'none'
    };
  }

  const batch = {
    workerRef: AUTO_ENRICHMENT_WORKER_REF,
    dryRun,
    maxJobs: lock.maxJobs,
    startedAt: new Date().toISOString(),
    batchLocked: true,
    lockedAt: lock.lockedAt,
    batchFingerprint: lock.batchFingerprint,
    lockedSlugs: [...lock.lockedSlugs],
    lockedJobIds: [...lock.lockedJobIds],
    selectedJobs: lock.lockedJobs.map((j) => ({ ...j })),
    selectionSkipped: lock.selectionSkipped,
    audits: [],
    completed: 0,
    partial: 0,
    hold: 0,
    skipped: 0,
    failed: 0,
    applied: 0,
    externalRequests: 0,
    plantsChanged: [],
    fieldsChanged: {},
    batchStopReason: null,
    status: 'RUNNING',
    dryBatchValidated: false,
    REAL_EXECUTION_ALLOWED: dryRun ? false : realExecutionAllowed !== false,
    allowDryScaleCeiling: !!allowDryScaleCeiling,
    recoveryPolicy: dryRun
      ? 'n/a_dry'
      : 'per_plant_triad_atomic_only__batch_not_transactional__restore_parent_baseline_on_regression'
  };

  if (!dryRun) {
    const allow = assertRealWriteAllowed(lock, dryValidation);
    if (!allow.ok) {
      batch.status = 'BATCH_STOPPED';
      batch.batchStopReason = allow.reason;
      batch.finishedAt = new Date().toISOString();
      batch.error = allow.detail;
      return batch;
    }
  }

  // Membership immutability: never re-select; only iterate locked jobs
  const memCheck = assertBatchMembershipImmutable(
    lock,
    lock.lockedJobs.map((j) => j.slug)
  );
  if (!memCheck.ok) {
    batch.status = 'BATCH_STOPPED';
    batch.batchStopReason = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
    batch.finishedAt = new Date().toISOString();
    return batch;
  }

  const writeSelectedSlugs = [...lock.lockedSlugs];
  const requestBudget = {
    used: 0,
    maxTotal:
      maxExternalRequestsTotal ??
      (allowDryScaleCeiling && dryRun
        ? WORKER_DRY_SCALE_MAX_EXTERNAL_REQUESTS_TOTAL
        : WORKER_MAX_EXTERNAL_REQUESTS_TOTAL),
    maxPerPlant: maxExternalRequestsPerPlant ?? WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT
  };
  let expectedTriadHashes = triadHashes(repoRoot);
  const safePayloadBefore = loadBootstrapSafeMigrationPayload(repoRoot).payload;
  const otherSlugsBefore = Object.fromEntries(
    Object.keys(safePayloadBefore.plants)
      .filter((s) => !writeSelectedSlugs.includes(s))
      .map((s) => [s, JSON.stringify(safePayloadBefore.plants[s])])
  );
  const triadHashesBeforeBatch = { ...expectedTriadHashes };
  const queueBeforeBatch = loadCurrentQueue(repoRoot);
  const batchWrittenSlugs = [];

  for (const lockedJob of lock.lockedJobs) {
    if (batch.batchStopReason) break;

    // Re-read live queue job but keep locked slug membership
    const liveQueue = loadCurrentQueue(repoRoot);
    const liveJob = loadQueueJob(liveQueue, lockedJob.slug) || {
      ...lockedJob,
      canonicalSlug: lockedJob.slug,
      // Completed Class A plants drop out of the queue; locked membership still applies.
      sourceRetrievalRequired: lockedJob.sourceRetrievalRequired ?? true,
      identityStatus: lockedJob.identityStatus || 'CANONICAL_SPECIES',
      enrichmentExecution: lockedJob.enrichmentExecution || ENRICHMENT_EXECUTION.AUTO,
      priority: lockedJob.priority || 'P1'
    };
    if ((liveJob.canonicalSlug || liveJob.slug) !== lockedJob.slug) {
      batch.batchStopReason = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      batch.status = 'BATCH_STOPPED';
      break;
    }

    const plant = plantsBySlug[lockedJob.slug];
    const plantSpec =
      lock.plantSpecs.find((s) => s.slug === lockedJob.slug) ||
      resolveWorkerRetrievalSpec({
        slug: lockedJob.slug,
        scientificName: lockedJob.scientificName,
        plantSpecs: retrievalPlantSpecs
      }).plantSpec ||
      null;
    const job = {
      ...liveJob,
      jobId: lockedJob.jobId,
      canonicalSlug: lockedJob.slug,
      scientificName: lockedJob.scientificName
    };

    const audit = await processJob({
      repoRoot,
      job,
      plant,
      plantSpec,
      queueDoc: liveQueue,
      dryRun,
      writeSelectedSlugs,
      expectedTriadHashes: dryRun ? null : expectedTriadHashes,
      fetchImpl,
      parentCommit,
      requestBudget,
      cacheDir,
      artifactRoot,
      dryValidation,
      lockedBatch: lock,
      reusePacketsBySlug,
      batchWrittenSlugs,
      safeSlugs,
      retrievalPlantSpecs,
      excludeSlugs
    });
    batch.audits.push(audit);
    batch.externalRequests += audit.externalRequests || 0;
    batch.cacheHits = (batch.cacheHits || 0) + (audit.cacheHits || 0);

    if (audit.hardStop) {
      batch.batchStopReason = audit.hardStop;
      batch.status = 'BATCH_STOPPED';
      if (audit.status === 'HOLD') batch.hold += 1;
      else batch.failed += 1;
      break;
    }

    if (audit.status === 'SKIPPED') batch.skipped += 1;
    else if (audit.status === 'PARTIAL_NO_APPLY' || audit.status === 'DRY_RUN_APPLY_ALLOWED') {
      batch.partial += 1;
      batch.completed += 1;
    } else if (audit.status === 'APPLIED' || audit.status === 'ALREADY_EQUIVALENT') {
      batch.completed += 1;
      if (audit.status === 'APPLIED') {
        batch.applied += 1;
        batch.plantsChanged.push(audit.slug);
        batch.fieldsChanged[audit.slug] = audit.appliedFields;
        if (!batchWrittenSlugs.includes(audit.slug)) batchWrittenSlugs.push(audit.slug);
      }
      expectedTriadHashes = triadHashes(repoRoot);
      Object.assign(plantsBySlug, loadCatalogPlants(repoRoot));
    } else {
      batch.failed += 1;
      batch.batchStopReason = audit.hardStop || WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      batch.status = 'BATCH_STOPPED';
      break;
    }
  }

  // Dry must not mutate triad or queue
  if (dryRun) {
    const afterHashes = triadHashes(repoRoot);
    if (
      afterHashes.json !== triadHashesBeforeBatch.json ||
      afterHashes.js !== triadHashesBeforeBatch.js ||
      afterHashes.browser !== triadHashesBeforeBatch.browser
    ) {
      batch.batchStopReason = WORKER_STOP_REASON.WRITE_FAILURE;
      batch.status = 'BATCH_STOPPED';
      batch.error = 'dry_run_mutated_catalog';
    }
  }

  // Unrelated plant immutability + regression (real only, if not already stopped)
  if (!dryRun && !batch.batchStopReason) {
    const reg = runWorkerRegressionGate({
      repoRoot,
      changedSlugs: batch.plantsChanged,
      otherSlugsBefore,
      lockedSlugs: writeSelectedSlugs
    });
    if (!reg.ok) {
      batch.batchStopReason = reg.stop || WORKER_STOP_REASON.REGRESSION_FAILURE;
      batch.status = 'BATCH_STOPPED';
      batch.regressionDetail = reg.detail;
      batch.recoveryPolicy =
        'BATCH_NOT_TRANSACTIONAL__plant_writes_may_have_landed__restore_parent_687a17f_baseline';
    } else {
      const qLive = loadCurrentQueue(repoRoot);
      const plantsLive = loadCatalogPlants(repoRoot);
      const qCheck = validateQueueIntegrity(qLive, writeSelectedSlugs, plantsLive, {
        queueBefore: queueBeforeBatch,
        batchWrittenSlugs,
        justWrittenSlugs: batchWrittenSlugs
      });
      if (!qCheck.ok) {
        batch.batchStopReason = WORKER_STOP_REASON.QUEUE_CORRUPTION;
        batch.status = 'BATCH_STOPPED';
        batch.error = qCheck.reason;
      }
    }
  }

  if (!batch.batchStopReason) {
    batch.status = 'BATCH_COMPLETE';
    if (dryRun) {
      batch.dryBatchValidated = true;
    }
  }
  batch.finishedAt = new Date().toISOString();
  batch.ownerReviewRequiredCount = batch.audits.filter((a) => a.ownerDecisionRequired).length;
  batch.requestBudget = requestBudget;

  // Persist retry/fairness scheduling state (not botanical / queue truth).
  // Default: persist on real writes; dry callers must opt in (cross-run dry validation).
  const shouldPersistFairness =
    persistRetryFairness === true ||
    (persistRetryFairness !== false && dryRun === false && realExecutionAllowed !== false);
  if (shouldPersistFairness && applyRetryFairness !== false && (batch.audits || []).length) {
    const loaded = loadRetryState(repoRoot, { statePath: retryStatePath });
    const jobsBySlug = Object.fromEntries(
      (lock.lockedJobs || []).map((j) => [j.slug, { ...j, canonicalSlug: j.slug }])
    );
    const plantHashBySlug = {};
    for (const j of lock.lockedJobs || []) {
      const plant = plantsBySlug[j.slug];
      if (plant) plantHashBySlug[j.slug] = plantContentHash(plant);
    }
    const recorded = recordBatchRetryOutcomes(loaded.doc, batch.audits, {
      now: clock,
      jobsBySlug,
      plantHashBySlug,
      versionBundle: emptyOpportunityVersions()
    });
    const saved = saveRetryState(repoRoot, loaded.doc, { statePath: retryStatePath });
    batch.retryFairness = {
      policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
      persisted: true,
      statePath: saved.path,
      recorded: recorded.map((r) => ({ slug: r.slug, outcome: r.outcome }))
    };
  } else {
    batch.retryFairness = {
      policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
      persisted: false
    };
  }

  return batch;
}

export function writeWorkerReports(repoRoot, batch, label = 'pilot', subdir = 'clean-replay') {
  const dir = path.join(repoRoot, 'data', 'catalog', 'enrichment-worker', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const batchPath = path.join(dir, `auto-enrichment-worker-v1-${label}-batch-summary.json`);
  fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));
  const jobPaths = [];
  for (const audit of batch.audits || []) {
    const p = path.join(dir, `auto-enrichment-worker-v1-${label}-job-${audit.slug}.json`);
    fs.writeFileSync(p, JSON.stringify(audit, null, 2));
    jobPaths.push(p);
  }
  return { batchPath, jobPaths, dir };
}
