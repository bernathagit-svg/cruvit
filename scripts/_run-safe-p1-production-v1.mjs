/**
 * SAFE P1 Bounded Production V1 — allowlist-bounded automated batch.
 *
 * Uses existing worker defaults: WORKER_PILOT_PLANT_SPECS + maxJobs=3.
 * Selection is PILOT_ALLOWLIST_CONSTRAINED (not full SAFE P1 queue authority).
 * WORKER_PILOT_PLANT_SPECS is a hard-coded selection allowlist (lemon/olive/avocado).
 * Automated dry→real execution is validated; queue-wide autonomy is NOT proven.
 * Next blocker: generalize SAFE P1 selection from the queue.
 * LOCK → DRY (all locked) → REAL (same fingerprint) → idempotence.
 *
 * Does not stage/commit/push/deploy/ingest Batch 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  processBatch,
  writeWorkerReports,
  selectEligibleJobs,
  lockBatch,
  createDryValidationToken,
  loadCurrentQueue,
  loadCatalogPlants,
  WORKER_PILOT_PLANT_SPECS,
  WORKER_MAX_JOBS,
  WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
  WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
  AUTO_ENRICHMENT_WORKER_REF,
  assertRealWriteAllowed
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths,
  loadBootstrapSafeMigrationPayload
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = '9ac4919ef237441f981870da24615238f321b06d';
const ARTIFACT = 'production-p1-v1';
const outDir = path.join(root, 'data/catalog/enrichment-worker', ARTIFACT);

function triad() {
  const p = bootstrapSafeMigrationPaths(root);
  return { json: hashFile(p.json), js: hashFile(p.js), browser: hashFile(p.browser) };
}

function catalogCounts() {
  const index = loadCatalogPlants(root);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of Object.values(index)) {
    counts[classifyPlantDataReadiness(p).readinessShort]++;
  }
  return { total: Object.keys(index).length, counts };
}

function fieldSnap(slug) {
  const { payload } = loadBootstrapSafeMigrationPayload(root);
  const ct = payload.plants[slug].climateTraits;
  const plant = loadCatalogPlants(root)[slug];
  const r = classifyPlantDataReadiness(plant);
  return {
    coldTolerance: {
      value: ct.coldTolerance,
      evidence: ct.traitEvidenceClasses?.coldTolerance,
      origin: ct.fieldOrigins?.coldTolerance,
      provenance: ct.enrichmentProvenance?.coldTolerance || null
    },
    frostSensitivity: {
      value: ct.frostSensitivity,
      evidence: ct.traitEvidenceClasses?.frostSensitivity,
      origin: ct.fieldOrigins?.frostSensitivity,
      provenance: ct.enrichmentProvenance?.frostSensitivity || null
    },
    readiness: r.readinessShort,
    productGate: r.gate,
    plantHash: plantContentHash(plant),
    flowering: ct.floweringRequirements ?? null,
    fruiting: ct.fruitingRequirements ?? null,
    needsReview: plant.needsReview ?? ct.needsReview ?? null
  };
}

function queueSnap(slugs) {
  const q = loadCurrentQueue(root);
  const jobs = q.jobs || [];
  return {
    totalJobs: q.summary?.totalJobs ?? jobs.length,
    auto: q.summary?.AUTO_JOB_COUNT ?? jobs.filter((j) => j.enrichmentExecution === 'AUTO').length,
    hold:
      q.summary?.OWNER_REVIEW_JOB_COUNT ??
      jobs.filter((j) => j.enrichmentExecution === 'HOLD_FOR_REVIEW').length,
    selected: Object.fromEntries(
      slugs.map((slug) => {
        const j = jobs.find((x) => (x.canonicalSlug || x.slug) === slug);
        return [
          slug,
          j
            ? {
                jobId: j.jobId,
                gapCodes: j.gapCodes,
                enrichmentExecution: j.enrichmentExecution,
                productGate: j.productGate,
                priority: j.priority
              }
            : null
        ];
      })
    )
  };
}

fs.mkdirSync(outDir, { recursive: true });

// --- Phase 1: allowlist-constrained selection (WORKER_PILOT_PLANT_SPECS) ---
const queue = loadCurrentQueue(root);
const selection = selectEligibleJobs(queue, {
  maxJobs: WORKER_MAX_JOBS,
  plantSpecs: WORKER_PILOT_PLANT_SPECS
});
const selectedJobs = (selection.selected || []).map((j, idx) => {
  const plant = loadCatalogPlants(root)[j.canonicalSlug];
  const r = classifyPlantDataReadiness(plant);
  return {
    jobId: j.jobId,
    slug: j.canonicalSlug,
    scientificName: j.scientificName,
    readiness: r.readinessShort,
    productGate: j.productGate || r.gate,
    gapCodes: j.gapCodes,
    queuePriority: j.priority,
    queueRank: idx + 1,
    enrichmentExecution: j.enrichmentExecution,
    identityStatus: j.identityStatus,
    reasonEligible:
      'P1 AUTO + SAFE triad member + WORKER_PILOT_PLANT_SPECS allowlist membership + canonical species + unresolved gaps'
  };
});

console.log(
  JSON.stringify(
    {
      phase: 'selection',
      plantSpecsSource: 'WORKER_PILOT_PLANT_SPECS',
      PRODUCTION_SELECTION_AUTHORITY: 'PILOT_ALLOWLIST_CONSTRAINED',
      WORKER_PILOT_PLANT_SPECS_IS_SELECTION_ALLOWLIST: 'YES',
      FULL_QUEUE_AUTHORITY_PROVEN: 'NO',
      SAFE_P1_PRODUCTION_CAN_CONTINUE_AUTONOMOUSLY: 'NO',
      maxJobs: WORKER_MAX_JOBS,
      SELECTED_PRODUCTION_JOBS: selectedJobs,
      requestBudget: {
        maxTotal: WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
        maxPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT
      }
    },
    null,
    2
  )
);

if (!selectedJobs.length) {
  console.error('NO_ELIGIBLE_JOBS');
  process.exit(1);
}

// --- Phase 2: lock ---
const locked = lockBatch(selection, { plantSpecs: WORKER_PILOT_PLANT_SPECS });
fs.writeFileSync(path.join(outDir, 'locked-batch.json'), JSON.stringify(locked, null, 2));
console.log(
  JSON.stringify(
    {
      phase: 'lock',
      batchLocked: locked.batchLocked,
      batchFingerprint: locked.batchFingerprint,
      lockedSlugs: locked.lockedSlugs,
      maxJobs: locked.maxJobs
    },
    null,
    2
  )
);

const lockedSlugs = [...locked.lockedSlugs];
const before = {
  plants: Object.fromEntries(lockedSlugs.map((s) => [s, fieldSnap(s)])),
  catalog: catalogCounts(),
  queue: queueSnap(lockedSlugs),
  triad: triad()
};
fs.writeFileSync(path.join(outDir, 'before-snapshot.json'), JSON.stringify(before, null, 2));

const hashesBeforeDry = triad();
const REAL_WRITE_COUNT_BEFORE_DRY_FINISH = 0;
const artifactRoot = path.join(outDir, 'artifacts');

// --- Phase 4: DRY ---
const dry = await processBatch({
  repoRoot: root,
  dryRun: true,
  lockedBatch: locked,
  plantSpecs: WORKER_PILOT_PLANT_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(artifactRoot, 'dry'),
  cacheDir: path.join(outDir, 'cache')
});
const dryReports = writeWorkerReports(root, dry, 'prod-dry', ARTIFACT);
const hashesAfterDry = triad();
const dryHashUnchanged =
  hashesBeforeDry.json === hashesAfterDry.json &&
  hashesBeforeDry.js === hashesAfterDry.js &&
  hashesBeforeDry.browser === hashesAfterDry.browser;
const dryToken = createDryValidationToken(dry);

console.log(
  JSON.stringify(
    {
      phase: 'dry',
      DRY_RUN_STARTED: dry.startedAt,
      DRY_RUN_FINISHED: dry.finishedAt,
      status: dry.status,
      batchStopReason: dry.batchStopReason,
      REAL_WRITE_COUNT_BEFORE_DRY_FINISH,
      dryHashUnchanged,
      dryBatchValidated: dryToken.dryBatchValidated,
      externalRequests: dry.externalRequests,
      cacheHits: dry.cacheHits,
      audits: dry.audits.map((a) => ({
        slug: a.slug,
        status: a.status,
        hardStop: a.hardStop,
        fields: a.fieldPackets,
        applyGate: a.applyGate,
        appliedFields: a.appliedFields,
        requests: a.externalRequests,
        cacheHits: a.cacheHits,
        note: a.note
      })),
      report: dryReports.batchPath
    },
    null,
    2
  )
);

if (dry.status !== 'BATCH_COMPLETE' || !dryToken.dryBatchValidated || !dryHashUnchanged) {
  console.error('DRY_FAILED', dry.status, dry.batchStopReason);
  process.exit(1);
}

const blocked = assertRealWriteAllowed(locked, null);
if (blocked.ok) {
  console.error('REAL_WITHOUT_DRY_SHOULD_BLOCK');
  process.exit(1);
}

// --- Phase 6: REAL ---
const real = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  plantSpecs: WORKER_PILOT_PLANT_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(artifactRoot, 'real'),
  cacheDir: path.join(outDir, 'cache')
});
const realReports = writeWorkerReports(root, real, 'prod-real', ARTIFACT);

console.log(
  JSON.stringify(
    {
      phase: 'real',
      REAL_RUN_STARTED: real.startedAt,
      REAL_RUN_FINISHED: real.finishedAt,
      status: real.status,
      batchStopReason: real.batchStopReason,
      sameFingerprintAsDry: real.batchFingerprint === dry.batchFingerprint,
      plantsChanged: real.plantsChanged,
      fieldsChanged: real.fieldsChanged,
      externalRequests: real.externalRequests,
      cacheHits: real.cacheHits,
      ownerReviewRequiredCount: real.ownerReviewRequiredCount,
      audits: real.audits.map((a) => ({
        slug: a.slug,
        status: a.status,
        hardStop: a.hardStop,
        appliedFields: a.appliedFields,
        afterReadiness: a.afterReadiness,
        requests: a.externalRequests,
        cacheHits: a.cacheHits
      })),
      report: realReports.batchPath
    },
    null,
    2
  )
);

if (real.status !== 'BATCH_COMPLETE') {
  console.error('REAL_FAILED', real.batchStopReason, real.regressionDetail || real.error);
  process.exit(1);
}

const after = {
  plants: Object.fromEntries(lockedSlugs.map((s) => [s, fieldSnap(s)])),
  catalog: catalogCounts(),
  queue: queueSnap(lockedSlugs),
  triad: triad()
};

// --- Phase 10: idempotence ---
const second = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  plantSpecs: WORKER_PILOT_PLANT_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(artifactRoot, 'idempotence'),
  cacheDir: path.join(outDir, 'cache')
});
const secondMutations = second.audits.filter(
  (a) => a.status === 'APPLIED' && (a.appliedFields || []).length
);

const frostWrites = Object.values(real.fieldsChanged || {})
  .flat()
  .filter((f) => f === 'frostSensitivity').length;
const coldWrites = Object.values(real.fieldsChanged || {})
  .flat()
  .filter((f) => f === 'coldTolerance').length;

const out = {
  phase: 'safe_p1_production_v1_final',
  workerRef: AUTO_ENRICHMENT_WORKER_REF,
  parentCommit: PARENT,
  PRODUCTION_SELECTION_AUTHORITY: 'PILOT_ALLOWLIST_CONSTRAINED',
  WORKER_PILOT_PLANT_SPECS_IS_SELECTION_ALLOWLIST: 'YES',
  ACTUAL_BATCH_EQUALS_QUEUE_ONLY_TOP_3: 'NO',
  SPEC_ALLOWLIST_CHANGED_SELECTION_OUTCOME: 'YES',
  FULL_QUEUE_AUTHORITY_PROVEN: 'NO',
  SAFE_P1_PRODUCTION_CAN_CONTINUE_AUTONOMOUSLY: 'NO',
  nextBlocker: 'generalize SAFE P1 selection from queue beyond WORKER_PILOT_PLANT_SPECS',
  SELECTED_PRODUCTION_JOBS: selectedJobs,
  lockedSlugs,
  batchFingerprint: locked.batchFingerprint,
  before,
  dry: {
    status: dry.status,
    DRY_RUN_STARTED: dry.startedAt,
    DRY_RUN_FINISHED: dry.finishedAt,
    REAL_WRITE_COUNT_BEFORE_DRY_FINISH,
    externalRequests: dry.externalRequests,
    cacheHits: dry.cacheHits,
    audits: dry.audits
  },
  real: {
    status: real.status,
    REAL_RUN_STARTED: real.startedAt,
    REAL_RUN_FINISHED: real.finishedAt,
    plantsChanged: real.plantsChanged,
    fieldsChanged: real.fieldsChanged,
    externalRequests: real.externalRequests,
    cacheHits: real.cacheHits,
    ownerReviewRequiredCount: real.ownerReviewRequiredCount,
    audits: real.audits
  },
  after,
  REAL_FROST_SOURCE_SUPPORTED_WRITES: frostWrites,
  REAL_COLD_SOURCE_SUPPORTED_WRITES: coldWrites,
  secondRun: {
    status: second.status,
    appliedCount: secondMutations.length,
    SECOND_WORKER_RUN_WOULD_MUTATE: secondMutations.length === 0 ? 'NO' : 'YES',
    externalRequests: second.externalRequests,
    cacheHits: second.cacheHits
  },
  reports: { dry: dryReports.batchPath, real: realReports.batchPath }
};

fs.writeFileSync(path.join(outDir, 'safe-p1-production-v1-final.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (
  out.real.status !== 'BATCH_COMPLETE' ||
  out.secondRun.SECOND_WORKER_RUN_WOULD_MUTATE !== 'NO'
) {
  process.exit(1);
}
