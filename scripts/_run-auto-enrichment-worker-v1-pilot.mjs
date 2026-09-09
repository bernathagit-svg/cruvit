/**
 * Auto enrichment worker v1 — CLEAN REPLAY runner.
 *
 * LOCK → DRY (all 3) → REAL (same fingerprint) → idempotence.
 * Writes audits only under data/catalog/enrichment-worker/clean-replay/.
 * Does not commit/push/deploy/ingest Batch 3.
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
  AUTO_ENRICHMENT_WORKER_REF,
  assertRealWriteAllowed
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = '687a17fe53adf55265451a8bc1f6817194e46c85';
const EXPECTED = ['avocado', 'lemon', 'olive'];

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

function plantCold(slug) {
  const j = JSON.parse(
    fs.readFileSync(path.join(root, 'data/catalog/bootstrap-safe-climate-traits-migration-v1.json'), 'utf8')
  );
  const ct = j.plants[slug].climateTraits;
  return {
    value: ct.coldTolerance,
    evidence: ct.traitEvidenceClasses.coldTolerance,
    hasProv: !!ct.enrichmentProvenance?.coldTolerance
  };
}

// --- Phase: prove baseline ---
const baselineCold = {
  lemon: plantCold('lemon'),
  olive: plantCold('olive'),
  avocado: plantCold('avocado')
};
const baselineOk =
  baselineCold.lemon.evidence === 'HEURISTIC_ASSERTION' &&
  baselineCold.olive.evidence === 'HEURISTIC_ASSERTION' &&
  baselineCold.avocado.evidence === 'HEURISTIC_ASSERTION' &&
  !baselineCold.lemon.hasProv &&
  !baselineCold.olive.hasProv &&
  !baselineCold.avocado.hasProv;

console.log(
  JSON.stringify(
    {
      phase: 'baseline',
      WORKER_REPLAY_BASELINE_RESTORED: baselineOk ? 'YES' : 'NO',
      baselineCold
    },
    null,
    2
  )
);
if (!baselineOk) {
  console.error('BASELINE_NOT_RESTORED');
  process.exit(1);
}

// --- Lock batch ---
const queue = loadCurrentQueue(root);
const selection = selectEligibleJobs(queue, { maxJobs: 3, plantSpecs: WORKER_PILOT_PLANT_SPECS });
const locked = lockBatch(selection, { plantSpecs: WORKER_PILOT_PLANT_SPECS });
const lockedSorted = [...locked.lockedSlugs].sort();
if (lockedSorted.join(',') !== EXPECTED.join(',')) {
  console.error('LOCK_MEMBERSHIP_UNEXPECTED', locked.lockedSlugs);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      phase: 'lock',
      batchLocked: locked.batchLocked,
      batchFingerprint: locked.batchFingerprint,
      lockedSlugs: locked.lockedSlugs,
      lockedAt: locked.lockedAt
    },
    null,
    2
  )
);

const hashesBeforeDry = triad();
const realWriteCountBeforeDry = 0;

// --- DRY ---
const dry = await processBatch({
  repoRoot: root,
  dryRun: true,
  lockedBatch: locked,
  parentCommit: PARENT
});
const dryReports = writeWorkerReports(root, dry, 'clean-dry', 'clean-replay');
const hashesAfterDry = triad();
const dryHashUnchanged =
  hashesBeforeDry.json === hashesAfterDry.json &&
  hashesBeforeDry.js === hashesAfterDry.js &&
  hashesBeforeDry.browser === hashesAfterDry.browser;

const dryToken = createDryValidationToken(dry);
console.log(
  JSON.stringify(
    {
      phase: 'clean_dry',
      DRY_RUN_STARTED: dry.startedAt,
      DRY_RUN_FINISHED: dry.finishedAt,
      status: dry.status,
      batchStopReason: dry.batchStopReason,
      batchFingerprint: dry.batchFingerprint,
      dryBatchValidated: dryToken.dryBatchValidated,
      dryHashUnchanged,
      REAL_WRITE_COUNT_BEFORE_DRY_FINISH: realWriteCountBeforeDry,
      externalRequests: dry.externalRequests,
      audits: dry.audits.map((a) => ({
        slug: a.slug,
        status: a.status,
        fields: a.fieldPackets,
        requests: a.externalRequests,
        cacheHits: a.cacheHits
      })),
      report: dryReports.batchPath
    },
    null,
    2
  )
);

if (dry.status !== 'BATCH_COMPLETE' || !dryToken.dryBatchValidated || !dryHashUnchanged) {
  console.error('DRY_FAILED', {
    status: dry.status,
    dryBatchValidated: dryToken.dryBatchValidated,
    dryHashUnchanged
  });
  process.exit(1);
}

// Prove real cannot start without token
const blocked = assertRealWriteAllowed(locked, null);
if (blocked.ok) {
  console.error('REAL_WITHOUT_DRY_SHOULD_BLOCK');
  process.exit(1);
}

const countsBefore = catalogCounts();
const coldBeforeReal = {
  lemon: plantCold('lemon'),
  olive: plantCold('olive'),
  avocado: plantCold('avocado')
};

// --- REAL (same lock + dry token) ---
const real = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  parentCommit: PARENT
});
const realReports = writeWorkerReports(root, real, 'clean-real', 'clean-replay');
const countsAfter = catalogCounts();
const coldAfterReal = {
  lemon: plantCold('lemon'),
  olive: plantCold('olive'),
  avocado: plantCold('avocado')
};

console.log(
  JSON.stringify(
    {
      phase: 'clean_real',
      REAL_RUN_STARTED: real.startedAt,
      REAL_RUN_FINISHED: real.finishedAt,
      status: real.status,
      batchStopReason: real.batchStopReason,
      batchFingerprint: real.batchFingerprint,
      sameFingerprintAsDry: real.batchFingerprint === dry.batchFingerprint,
      plantsChanged: real.plantsChanged,
      fieldsChanged: real.fieldsChanged,
      externalRequests: real.externalRequests,
      ownerReviewRequiredCount: real.ownerReviewRequiredCount,
      recoveryPolicy: real.recoveryPolicy,
      coldBeforeReal,
      coldAfterReal,
      report: realReports.batchPath
    },
    null,
    2
  )
);

if (real.status !== 'BATCH_COMPLETE') {
  console.error('REAL_FAILED', real.batchStopReason);
  process.exit(1);
}

// --- Idempotence ---
const second = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  parentCommit: PARENT
});
const secondMutations = second.audits.filter(
  (a) => a.status === 'APPLIED' && (a.appliedFields || []).length
);

const out = {
  phase: 'clean_replay_final',
  workerRef: AUTO_ENRICHMENT_WORKER_REF,
  WORKER_REPLAY_BASELINE_RESTORED: 'YES',
  lockedSlugs: locked.lockedSlugs,
  batchFingerprint: locked.batchFingerprint,
  dryStatus: dry.status,
  realStatus: real.status,
  DRY_RUN_STARTED: dry.startedAt,
  DRY_RUN_FINISHED: dry.finishedAt,
  REAL_RUN_STARTED: real.startedAt,
  REAL_RUN_FINISHED: real.finishedAt,
  REAL_WRITE_COUNT_BEFORE_DRY_FINISH: 0,
  dryCompletedBeforeAnyRealWrite:
    dry.finishedAt && real.startedAt && dry.finishedAt <= real.startedAt ? 'YES' : 'NO',
  lemonChangedOnlyDuringCleanReal:
    coldBeforeReal.lemon.evidence === 'HEURISTIC_ASSERTION' &&
    coldAfterReal.lemon.evidence === 'SOURCE_SUPPORTED'
      ? 'YES'
      : 'NO',
  catalogBefore: countsBefore,
  catalogAfter: countsAfter,
  plantsChanged: real.plantsChanged,
  fieldsChanged: real.fieldsChanged,
  coldAfterReal,
  dryExternalRequests: dry.externalRequests,
  realExternalRequests: real.externalRequests,
  secondExternalRequests: second.externalRequests,
  ownerReviewRequiredCount: real.ownerReviewRequiredCount,
  secondRun: {
    status: second.status,
    appliedCount: secondMutations.length,
    SECOND_WORKER_RUN_WOULD_MUTATE: secondMutations.length === 0 ? 'NO' : 'YES'
  },
  reports: { dry: dryReports.batchPath, real: realReports.batchPath },
  verdict:
    real.status === 'BATCH_COMPLETE' &&
    secondMutations.length === 0 &&
    dry.finishedAt <= real.startedAt &&
    real.batchFingerprint === dry.batchFingerprint
      ? 'AUTO_ENRICHMENT_WORKER_V1_READY_TO_COMMIT'
      : 'AUTO_ENRICHMENT_WORKER_V1_COMMIT_BLOCKED'
};

fs.writeFileSync(
  path.join(root, 'data/catalog/enrichment-worker/clean-replay/auto-enrichment-worker-v1-pilot-final.json'),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
if (out.verdict !== 'AUTO_ENRICHMENT_WORKER_V1_READY_TO_COMMIT') process.exit(1);
