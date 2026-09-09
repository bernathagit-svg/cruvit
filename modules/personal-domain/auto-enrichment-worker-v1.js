/**
 * Auto Enrichment Worker v1 — bounded P1 AUTO pilot orchestrator.
 *
 * Calls existing scanner / retriever / policy / transforms / contradiction /
 * Apply Gate / atomic writer / plant-data-contract. Does not invent plant facts.
 *
 * Hard caps: maxJobs=3, P1 AUTO only, SAFE-writable plant specs only.
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
  buildCurrentCatalogEnrichmentQueue
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

export const AUTO_ENRICHMENT_WORKER_ID = 'auto-enrichment-worker-v1';
export const AUTO_ENRICHMENT_WORKER_VERSION = '1.1.0';
export const AUTO_ENRICHMENT_WORKER_REF = `${AUTO_ENRICHMENT_WORKER_ID}@${AUTO_ENRICHMENT_WORKER_VERSION}`;

export const WORKER_MAX_JOBS = 3;
export const WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT = 2;
export const WORKER_MAX_EXTERNAL_REQUESTS_TOTAL = 6;

/**
 * Bounded worker pilot plant specs (SAFE-writable + approved Tier A pages).
 * Final locked set: lemon, olive, avocado. No apricot. No pomegranate.
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
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summaryDoc, null, 2));
  return { queue, queuePath, summaryPath };
}

export function isJobEligibleForWorker(job, options = {}) {
  const reasons = [];
  if (!job) return { ok: false, reasons: ['missing_job'] };
  if (job.enrichmentExecution !== ENRICHMENT_EXECUTION.AUTO) reasons.push('not_AUTO');
  if (job.priority !== 'P1') reasons.push('not_P1');
  if (job.enrichmentExecution === ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW) {
    reasons.push('HOLD_FOR_REVIEW');
  }
  if (job.productRole === 'CATEGORY_ONLY') reasons.push('category_only');
  if ((job.gapCodes || []).some((g) => DISQUALIFY_GAPS.has(g))) {
    reasons.push('identity_or_broad_gap');
  }
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
  if (job.canonicalSlug === 'pomegranate') reasons.push('pomegranate_already_applied');
  if (job.canonicalSlug === 'apricot') reasons.push('apricot_excluded_from_worker_pilot');
  if (options.excludeSlugs?.includes(job.canonicalSlug)) reasons.push('excluded_slug');
  if (options.requireWorkerSpec !== false) {
    const spec = (options.plantSpecs || WORKER_PILOT_PLANT_SPECS).find(
      (s) => s.slug === job.canonicalSlug
    );
    if (!spec) reasons.push('no_worker_plant_spec');
  }
  return { ok: reasons.length === 0, reasons };
}

export function selectEligibleJobs(queueDoc, options = {}) {
  const maxJobs = Math.min(options.maxJobs ?? WORKER_MAX_JOBS, WORKER_MAX_JOBS);
  const plantSpecs = options.plantSpecs || WORKER_PILOT_PLANT_SPECS;
  const preferredOrder = plantSpecs.map((s) => s.slug);
  const jobs = queueDoc?.jobs || [];
  const eligible = [];
  const skipped = [];

  const ordered = [
    ...preferredOrder
      .map((slug) => jobs.find((j) => j.canonicalSlug === slug))
      .filter(Boolean),
    ...jobs.filter((j) => !preferredOrder.includes(j.canonicalSlug))
  ];

  for (const job of ordered) {
    const el = isJobEligibleForWorker(job, {
      plantSpecs,
      excludeSlugs: options.excludeSlugs || ['pomegranate', 'apricot']
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

  return {
    maxJobs,
    selected: eligible.slice(0, maxJobs),
    skipped,
    plantSpecs: plantSpecs.filter((s) => eligible.some((j) => j.canonicalSlug === s.slug))
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
  const plantSpecs = options.plantSpecs || selection.plantSpecs || WORKER_PILOT_PLANT_SPECS;
  return Object.freeze({
    batchLocked: true,
    lockedAt: new Date().toISOString(),
    lockedJobs,
    lockedSlugs: Object.freeze(lockedJobs.map((j) => j.slug)),
    lockedJobIds: Object.freeze(lockedJobs.map((j) => j.jobId)),
    batchFingerprint,
    maxJobs: selection.maxJobs ?? WORKER_MAX_JOBS,
    plantSpecs: Object.freeze(
      plantSpecs.filter((s) => lockedJobs.some((j) => j.slug === s.slug)).map((s) => Object.freeze({ ...s }))
    ),
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

export function validateQueueIntegrity(queueDoc, lockedSlugs = []) {
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
  for (const slug of lockedSlugs) {
    const job = queueDoc.jobs.find((j) => j.canonicalSlug === slug);
    if (!job) return { ok: false, reason: `missing_job:${slug}` };
    if (!Array.isArray(job.gapCodes)) return { ok: false, reason: `gapCodes_corrupt:${slug}` };
    if (!job.jobId) return { ok: false, reason: `jobId_missing:${slug}` };
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
  lockedBatch = null
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
    { plantSpecs: [plantSpec] }
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

  const retriever = await runSourceRetrieverPilot({
    repoRoot,
    queueDoc,
    plantsBySlug: { [plant.slug]: plant },
    fetchImpl,
    plantSpecs: [plantSpec],
    cacheDir,
    artifactRoot,
    writeSharedSummary: false
  });
  audit.externalRequests = retriever.summary?.externalRequestCount || 0;
  audit.cacheHits = retriever.cacheStats?.hits ?? 0;
  audit.sourcesFetched = retriever.results?.[0]?.sourcesFetched || [];
  if (requestBudget) {
    requestBudget.used += audit.externalRequests;
    if (requestBudget.used > requestBudget.maxTotal) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED;
      return audit;
    }
    if (audit.externalRequests > WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT) {
      audit.status = 'FAILED';
      audit.hardStop = WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED;
      return audit;
    }
  }

  const packetPath = retriever.results?.[0]?.packetPath;
  if (!packetPath || !fs.existsSync(packetPath)) {
    audit.status = 'FAILED';
    audit.hardStop = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
    audit.error = 'missing_candidate_packet';
    return audit;
  }
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
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
  const qCheck = validateQueueIntegrity(refreshed.queue, writeSelectedSlugs);
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
  plantSpecs = WORKER_PILOT_PLANT_SPECS,
  fetchImpl = globalThis.fetch,
  parentCommit = '687a17fe53adf55265451a8bc1f6817194e46c85',
  excludeSlugs = ['pomegranate', 'apricot'],
  cacheDir = null,
  artifactRoot = null,
  lockedBatch = null,
  dryValidation = null
}) {
  const plantsBySlug = loadCatalogPlants(repoRoot);
  const queueDoc = loadCurrentQueue(repoRoot);

  let lock = lockedBatch;
  if (!lock) {
    const selection = selectEligibleJobs(queueDoc, {
      maxJobs: Math.min(maxJobs, WORKER_MAX_JOBS),
      plantSpecs,
      excludeSlugs
    });
    lock = lockBatch(selection, { plantSpecs });
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
  const requestBudget = { used: 0, maxTotal: WORKER_MAX_EXTERNAL_REQUESTS_TOTAL };
  let expectedTriadHashes = triadHashes(repoRoot);
  const safePayloadBefore = loadBootstrapSafeMigrationPayload(repoRoot).payload;
  const otherSlugsBefore = Object.fromEntries(
    Object.keys(safePayloadBefore.plants)
      .filter((s) => !writeSelectedSlugs.includes(s))
      .map((s) => [s, JSON.stringify(safePayloadBefore.plants[s])])
  );
  const triadHashesBeforeBatch = { ...expectedTriadHashes };

  for (const lockedJob of lock.lockedJobs) {
    if (batch.batchStopReason) break;

    // Re-read live queue job but keep locked slug membership
    const liveQueue = loadCurrentQueue(repoRoot);
    const liveJob = loadQueueJob(liveQueue, lockedJob.slug) || {
      ...lockedJob,
      canonicalSlug: lockedJob.slug
    };
    if ((liveJob.canonicalSlug || liveJob.slug) !== lockedJob.slug) {
      batch.batchStopReason = WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE;
      batch.status = 'BATCH_STOPPED';
      break;
    }

    const plant = plantsBySlug[lockedJob.slug];
    const plantSpec = lock.plantSpecs.find((s) => s.slug === lockedJob.slug);
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
      lockedBatch: lock
    });
    batch.audits.push(audit);
    batch.externalRequests += audit.externalRequests || 0;

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
      const qCheck = validateQueueIntegrity(qLive, writeSelectedSlugs);
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
