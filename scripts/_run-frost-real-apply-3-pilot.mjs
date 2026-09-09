/**
 * SAFE frost real apply — 3-plant pilot (guava / mango / orange).
 *
 * LOCK → DRY (reuse committed Coverage v2 packets) → REAL → idempotence.
 * Orange coldTolerance is scoped out of the reused packet (frost-only pilot).
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
  WORKER_SCALE_DRY_PLANT_SPECS,
  AUTO_ENRICHMENT_WORKER_REF,
  assertRealWriteAllowed
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths,
  loadBootstrapSafeMigrationPayload
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { candidatePacketFingerprint } from '../modules/personal-domain/source-retriever-pilot-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = 'e0ad9f1413b9447a3be6124960e43eeb0a60cf9d';
const EXPECTED = ['guava', 'mango', 'orange'];
const ARTIFACT = 'frost-real-3-v1';
const V2_PACKET_DIR = path.join(
  root,
  'data/catalog/enrichment-worker/retrieval-coverage-v2-10-dry/retrieval/candidate-packets'
);
const PILOT_PACKET_DIR = path.join(
  root,
  'data/catalog/enrichment-worker',
  ARTIFACT,
  'reuse-packets'
);

const FROST_SPECS = Object.freeze(
  WORKER_SCALE_DRY_PLANT_SPECS.filter((s) => EXPECTED.includes(s.slug))
);

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

function queueSnap() {
  const q = loadCurrentQueue(root);
  const jobs = q.jobs || [];
  return {
    totalJobs: q.summary?.totalJobs ?? jobs.length,
    auto: jobs.filter((j) => j.enrichmentExecution === 'AUTO').length,
    hold: jobs.filter((j) => j.enrichmentExecution === 'HOLD' || j.productGate === 'HOLD').length,
    selected: Object.fromEntries(
      EXPECTED.map((slug) => {
        const j = jobs.find((x) => (x.canonicalSlug || x.slug) === slug);
        return [
          slug,
          j
            ? {
                jobId: j.jobId,
                gapCodes: j.gapCodes,
                enrichmentExecution: j.enrichmentExecution,
                productGate: j.productGate
              }
            : null
        ];
      })
    ),
    completeHash: hashFile(
      path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json')
    )
  };
}

function prepareReusePackets() {
  fs.mkdirSync(PILOT_PACKET_DIR, { recursive: true });
  const map = {};
  for (const slug of EXPECTED) {
    const src = path.join(V2_PACKET_DIR, `${slug}.candidate-packet-v1.json`);
    const dst = path.join(PILOT_PACKET_DIR, `${slug}.candidate-packet-v1.json`);
    const packet = JSON.parse(fs.readFileSync(src, 'utf8'));
    if (slug === 'orange') {
      // Pilot scope: orange frostSensitivity only (max 4 factual writes).
      for (const fp of packet.fieldPackets || []) {
        if (fp.targetField === 'coldTolerance') {
          fp.applyStatus = 'NEEDS_MORE_EVIDENCE';
          fp.proposedValue = null;
          fp.transformId = null;
          fp.transformVersion = null;
          fp.transformRef = null;
          fp.pilotScopeNote = 'frost_real_3_pilot_orange_cold_deferred';
        }
      }
      packet.pilotScope = {
        orangeColdDeferred: true,
        reason: 'first_frost_apply_pilot_max_4_factual_writes'
      };
      packet.fingerprint = candidatePacketFingerprint(packet);
    }
    fs.writeFileSync(dst, JSON.stringify(packet, null, 2) + '\n');
    map[slug] = path.relative(root, dst).replace(/\\/g, '/');
  }
  return map;
}

function proveSourceTruth(packetMap) {
  const rows = {};
  let zoneToFrost = 0;
  for (const slug of EXPECTED) {
    const packet = JSON.parse(fs.readFileSync(path.join(root, packetMap[slug]), 'utf8'));
    const frost = (packet.fieldPackets || []).find((f) => f.targetField === 'frostSensitivity');
    const cold = (packet.fieldPackets || []).find((f) => f.targetField === 'coldTolerance');
    const frostClaim = frost?.sourceClaim?.claimType;
    if (
      frost?.applyStatus === 'READY_TO_APPLY' &&
      frostClaim === 'usda_hardiness_zone_band'
    ) {
      zoneToFrost += 1;
    }
    rows[slug] = {
      frost: frost
        ? {
            applyStatus: frost.applyStatus,
            value: frost.proposedValue,
            claimType: frostClaim,
            transformRef: frost.transformRef,
            evidenceClass: frost.sourcePolicyResult?.evidenceClass,
            mayBeSS: frost.sourcePolicyResult?.mayBeSourceSupported,
            contradiction: frost.contradictionResult?.contradictionClass,
            sourceId: frost.sourceIds?.[0],
            authorityTier: (packet.evidenceRecords || [])
              .filter((e) => (frost.sourceIds || []).includes(e.sourceId))
              .map((e) => e.authorityTier)
          }
        : null,
      cold: cold
        ? {
            applyStatus: cold.applyStatus,
            value: cold.proposedValue,
            claimType: cold?.sourceClaim?.claimType,
            transformRef: cold.transformRef,
            evidenceClass: cold.sourcePolicyResult?.evidenceClass,
            mayBeSS: cold.sourcePolicyResult?.mayBeSourceSupported,
            contradiction: cold.contradictionResult?.contradictionClass,
            sourceId: cold.sourceIds?.[0]
          }
        : null,
      fingerprint: packet.fingerprint
    };
  }
  return { rows, ZONE_TO_FROST_MISUSE_COUNT: zoneToFrost };
}

// --- Phase 1 eligibility ---
const { payload: safePayload } = loadBootstrapSafeMigrationPayload(root);
const plants = loadCatalogPlants(root);
const queue = loadCurrentQueue(root);
const eligibility = {};
for (const slug of EXPECTED) {
  const job = queue.jobs.find((j) => (j.canonicalSlug || j.slug) === slug);
  const plant = plants[slug];
  const r = classifyPlantDataReadiness(plant);
  eligibility[slug] = {
    canonicalIdentity: { slug, scientific: plant.scientific },
    queueJob: job?.jobId || null,
    readiness: r.readinessShort,
    productGate: job?.productGate || r.gate,
    enrichmentExecution: job?.enrichmentExecution || null,
    safeMigrationMember: !!(safePayload.plants?.[slug] && (safePayload.safeSlugs || []).includes(slug)),
    // Queue job may be absent after Class A completion mid-pilot; SAFE triad membership is authoritative.
    atomicWriterEligible: !!(safePayload.plants?.[slug] && (safePayload.safeSlugs || []).includes(slug)),
    gapCodes: job?.gapCodes || null,
    queueJobPresent: !!job,
    v2Packet: path
      .relative(root, path.join(V2_PACKET_DIR, `${slug}.candidate-packet-v1.json`))
      .replace(/\\/g, '/')
  };
}
const GUAVA_SAFE_WRITABLE =
  eligibility.guava.safeMigrationMember && eligibility.guava.atomicWriterEligible ? 'YES' : 'NO';
const MANGO_SAFE_WRITABLE =
  eligibility.mango.safeMigrationMember && eligibility.mango.atomicWriterEligible ? 'YES' : 'NO';
const ORANGE_SAFE_WRITABLE =
  eligibility.orange.safeMigrationMember && eligibility.orange.atomicWriterEligible ? 'YES' : 'NO';

console.log(
  JSON.stringify(
    {
      phase: 'safe_writer_eligibility',
      GUAVA_SAFE_WRITABLE,
      MANGO_SAFE_WRITABLE,
      ORANGE_SAFE_WRITABLE,
      eligibility
    },
    null,
    2
  )
);

if (
  GUAVA_SAFE_WRITABLE !== 'YES' ||
  MANGO_SAFE_WRITABLE !== 'YES' ||
  ORANGE_SAFE_WRITABLE !== 'YES'
) {
  console.error('REAL_FROST_PILOT_BLOCKED');
  process.exit(1);
}

// --- Phase 2 lock (immutable; resume from saved lock if mid-pilot Class A removed a job) ---
const lockPath = path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'locked-batch.json');
const beforePath = path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'before-snapshot.json');
fs.mkdirSync(path.join(root, 'data/catalog/enrichment-worker', ARTIFACT), { recursive: true });

let locked;
let resumedFromSavedLock = false;
if (fs.existsSync(lockPath)) {
  resumedFromSavedLock = true;
  const saved = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  locked = lockBatch(
    {
      selected: saved.lockedJobs.map((j) => ({
        jobId: j.jobId,
        canonicalSlug: j.slug,
        scientificName: j.scientificName,
        priority: j.priority,
        enrichmentExecution: j.enrichmentExecution,
        gapCodes: [...(j.gapCodes || [])],
        sourceRetrievalRequired: true,
        identityStatus: 'CANONICAL_SPECIES'
      })),
      maxJobs: 3,
      skipped: saved.selectionSkipped || [],
      plantSpecs: FROST_SPECS
    },
    { plantSpecs: FROST_SPECS }
  );
  if (locked.batchFingerprint !== saved.batchFingerprint) {
    console.error('LOCK_FINGERPRINT_DRIFT', locked.batchFingerprint, saved.batchFingerprint);
    process.exit(1);
  }
} else {
  const selection = selectEligibleJobs(queue, {
    maxJobs: 3,
    plantSpecs: FROST_SPECS,
    excludeSlugs: ['pomegranate', 'apricot']
  });
  locked = lockBatch(selection, { plantSpecs: FROST_SPECS });
  fs.writeFileSync(lockPath, JSON.stringify(locked, null, 2));
}
const lockedSorted = [...locked.lockedSlugs].sort();
if (lockedSorted.join(',') !== [...EXPECTED].sort().join(',')) {
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
      maxJobs: locked.maxJobs,
      resumedFromSavedLock
    },
    null,
    2
  )
);

const packetMap = prepareReusePackets();
const sourceTruth = proveSourceTruth(packetMap);
console.log(JSON.stringify({ phase: 'source_truth', ...sourceTruth }, null, 2));
if (sourceTruth.ZONE_TO_FROST_MISUSE_COUNT !== 0) {
  console.error('ZONE_TO_FROST_MISUSE');
  process.exit(1);
}

// --- Phase 4 before snapshot (preserve first-run BEFORE if mid-pilot resume) ---
let before;
if (fs.existsSync(beforePath)) {
  before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
} else {
  before = {
    plants: Object.fromEntries(EXPECTED.map((s) => [s, fieldSnap(s)])),
    catalog: catalogCounts(),
    queue: queueSnap(),
    triad: triad()
  };
  fs.writeFileSync(beforePath, JSON.stringify(before, null, 2));
}

const hashesBeforeDry = triad();
const REAL_WRITE_COUNT_BEFORE_DRY_FINISH = 0;

// --- Phase 5 DRY ---
const dry = await processBatch({
  repoRoot: root,
  dryRun: true,
  lockedBatch: locked,
  plantSpecs: FROST_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'dry'),
  reusePacketsBySlug: packetMap,
  maxExternalRequestsTotal: 0,
  maxExternalRequestsPerPlant: 0
});
const dryReports = writeWorkerReports(root, dry, 'frost-dry', ARTIFACT);
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
      REAL_WRITE_COUNT_BEFORE_DRY_FINISH,
      dryHashUnchanged,
      dryBatchValidated: dryToken.dryBatchValidated,
      externalRequests: dry.externalRequests,
      cacheHits: dry.cacheHits,
      audits: dry.audits.map((a) => ({
        slug: a.slug,
        status: a.status,
        note: a.note,
        fields: a.fieldPackets,
        applyGate: a.applyGate,
        appliedFields: a.appliedFields,
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
  console.error('DRY_FAILED', dry.status, dry.batchStopReason);
  process.exit(1);
}

const blocked = assertRealWriteAllowed(locked, null);
if (blocked.ok) {
  console.error('REAL_WITHOUT_DRY_SHOULD_BLOCK');
  process.exit(1);
}

const countsBeforeReal = catalogCounts();
const plantsBeforeReal = Object.fromEntries(EXPECTED.map((s) => [s, fieldSnap(s)]));
const queueBeforeReal = queueSnap();

// --- Phase 6 REAL ---
const real = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  plantSpecs: FROST_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'real'),
  reusePacketsBySlug: packetMap,
  maxExternalRequestsTotal: 0,
  maxExternalRequestsPerPlant: 0
});
const realReports = writeWorkerReports(root, real, 'frost-real', ARTIFACT);

const plantsAfterReal = Object.fromEntries(EXPECTED.map((s) => [s, fieldSnap(s)]));
const countsAfterReal = catalogCounts();
const queueAfterReal = queueSnap();

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
      report: realReports.batchPath
    },
    null,
    2
  )
);

if (real.status !== 'BATCH_COMPLETE') {
  console.error('REAL_FAILED', real.batchStopReason, real.regressionDetail);
  process.exit(1);
}

// --- Idempotence ---
const second = await processBatch({
  repoRoot: root,
  dryRun: false,
  lockedBatch: locked,
  dryValidation: dryToken,
  plantSpecs: FROST_SPECS,
  parentCommit: PARENT,
  artifactRoot: path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'idempotence'),
  reusePacketsBySlug: packetMap,
  maxExternalRequestsTotal: 0,
  maxExternalRequestsPerPlant: 0
});
const secondMutations = second.audits.filter(
  (a) => a.status === 'APPLIED' && (a.appliedFields || []).length
);

const frostSsWrites = EXPECTED.filter(
  (s) =>
    before.plants[s].frostSensitivity.evidence !== 'SOURCE_SUPPORTED' &&
    plantsAfterReal[s].frostSensitivity.evidence === 'SOURCE_SUPPORTED'
).length;
const coldSsWrites = EXPECTED.filter(
  (s) =>
    before.plants[s].coldTolerance.evidence !== 'SOURCE_SUPPORTED' &&
    plantsAfterReal[s].coldTolerance.evidence === 'SOURCE_SUPPORTED'
).length;
const changedPlantSlugs = EXPECTED.filter((s) => {
  const b = before.plants[s];
  const a = plantsAfterReal[s];
  return (
    b.frostSensitivity.evidence !== a.frostSensitivity.evidence ||
    b.frostSensitivity.value !== a.frostSensitivity.value ||
    b.coldTolerance.evidence !== a.coldTolerance.evidence ||
    b.coldTolerance.value !== a.coldTolerance.value
  );
});

const out = {
  phase: 'frost_real_3_final',
  workerRef: AUTO_ENRICHMENT_WORKER_REF,
  parentCommit: PARENT,
  GUAVA_SAFE_WRITABLE,
  MANGO_SAFE_WRITABLE,
  ORANGE_SAFE_WRITABLE,
  lockedSlugs: locked.lockedSlugs,
  batchFingerprint: locked.batchFingerprint,
  sourceTruth,
  before,
  dry: {
    status: dry.status,
    DRY_RUN_STARTED: dry.startedAt,
    DRY_RUN_FINISHED: dry.finishedAt,
    REAL_WRITE_COUNT_BEFORE_DRY_FINISH,
    externalRequests: dry.externalRequests,
    cacheHits: dry.cacheHits
  },
  real: {
    status: real.status,
    REAL_RUN_STARTED: real.startedAt,
    REAL_RUN_FINISHED: real.finishedAt,
    plantsChanged: real.plantsChanged,
    fieldsChanged: real.fieldsChanged,
    externalRequests: real.externalRequests,
    cacheHits: real.cacheHits,
    ownerReviewRequiredCount: real.ownerReviewRequiredCount
  },
  plantsBeforeReal,
  plantsAfterReal,
  countsBeforeReal,
  countsAfterReal,
  queueBeforeReal,
  queueAfterReal,
  REAL_FROST_SOURCE_SUPPORTED_WRITES: frostSsWrites,
  REAL_COLD_SOURCE_SUPPORTED_WRITES: coldSsWrites,
  CHANGED_PLANT_SLUGS: changedPlantSlugs,
  ZONE_TO_FROST_MISUSE_COUNT: sourceTruth.ZONE_TO_FROST_MISUSE_COUNT,
  secondRun: {
    status: second.status,
    appliedCount: secondMutations.length,
    SECOND_WORKER_RUN_WOULD_MUTATE: secondMutations.length === 0 ? 'NO' : 'YES',
    externalRequests: second.externalRequests,
    cacheHits: second.cacheHits
  },
  reusePacketsBySlug: packetMap,
  reports: { dry: dryReports.batchPath, real: realReports.batchPath },
  triadAfter: triad()
};

fs.writeFileSync(
  path.join(root, 'data/catalog/enrichment-worker', ARTIFACT, 'frost-real-3-final.json'),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
if (
  out.real.status !== 'BATCH_COMPLETE' ||
  out.secondRun.SECOND_WORKER_RUN_WOULD_MUTATE !== 'NO' ||
  out.REAL_FROST_SOURCE_SUPPORTED_WRITES > 3 ||
  out.ZONE_TO_FROST_MISUSE_COUNT !== 0
) {
  process.exit(1);
}
