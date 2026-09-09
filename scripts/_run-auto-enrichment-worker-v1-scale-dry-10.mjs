/**
 * Auto enrichment worker — 10-plant DRY-ONLY scale pilot.
 *
 * REAL_EXECUTION_ALLOWED = NO
 * No plant writes. No queue writes. Isolated artifactRoot.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  AUTO_ENRICHMENT_WORKER_REF,
  WORKER_MAX_JOBS,
  WORKER_DRY_SCALE_MAX_JOBS,
  WORKER_DRY_SCALE_MAX_EXTERNAL_REQUESTS_TOTAL,
  WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
  WORKER_SCALE_DRY_PLANT_SPECS,
  WORKER_SCALE_DRY_EXCLUDE_SLUGS,
  selectEligibleJobs,
  lockBatch,
  processBatch,
  writeWorkerReports,
  loadCatalogPlants,
  loadCurrentQueue
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_SUBDIR = 'scale-dry-10-v1';
const REPORT_DIR = path.join(ROOT, 'data', 'catalog', 'enrichment-worker', ARTIFACT_SUBDIR);
const RETRIEVAL_ROOT = path.join(REPORT_DIR, 'retrieval');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog', 'enrichment-retrieval', 'cache');
const PARENT = 'f588aade50950f01eabc74c41a042aae8bca9d11';

const REAL_EXECUTION_ALLOWED = false;

function shaFile(p) {
  return hashFile(p);
}

function snapshotTruth() {
  const paths = bootstrapSafeMigrationPaths(ROOT);
  const queuePath = path.join(
    ROOT,
    'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json'
  );
  const summaryPath = path.join(
    ROOT,
    'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json'
  );
  return {
    triad: {
      json: shaFile(paths.json),
      js: shaFile(paths.js),
      browser: shaFile(paths.browser)
    },
    queue: shaFile(queuePath),
    queueSummary: shaFile(summaryPath)
  };
}

function classifyAudit(audit, safeWritable) {
  const fields = audit.fieldPackets || [];
  const ready = fields.filter((f) => f.applyStatus === 'READY_TO_APPLY').length;
  const needs = fields.filter((f) => f.applyStatus === 'NEEDS_MORE_EVIDENCE').length;
  const hold = fields.filter((f) => String(f.applyStatus || '').includes('HOLD')).length;
  const gateDecision = audit.applyGate?.setDecision || null;
  let category;
  if (audit.hardStop) category = 'HOLD_CONFLICT';
  else if (audit.status === 'DRY_RUN_APPLY_ALLOWED' && ready >= 1) {
    category = safeWritable ? 'APPLY_READY_NOW' : 'PARTIAL_READY';
  } else if (ready >= 1 || audit.status === 'PARTIAL_NO_APPLY') category = 'PARTIAL_READY';
  else category = 'NEEDS_MORE_EVIDENCE';
  return { ready, needs, hold, gateDecision, category };
}

function aggregateRetrievalQuality(audits) {
  const out = {
    SOURCE_SUPPORTED_eligible: 0,
    HEURISTIC: 0,
    UNKNOWN: 0,
    rejectedClaims: 0,
    weakExcerpts: 0,
    identityMismatches: 0,
    compatibleRanges: 0,
    materialConflicts: 0,
    dominantBlocker: null
  };
  const blockers = {};
  for (const a of audits) {
    for (const fr of a.applyGate?.fieldResults || []) {
      const reasons = fr.reasons || [];
      if (fr.decision === 'APPLY_ALLOWED') out.SOURCE_SUPPORTED_eligible += 1;
      if (reasons.some((r) => String(r).includes('HEURISTIC'))) out.HEURISTIC += 1;
      if (fr.contradictionClass === 'INSUFFICIENT_EVIDENCE') out.weakExcerpts += 1;
      if (fr.contradictionClass === 'COMPATIBLE_RANGE') out.compatibleRanges += 1;
      if (fr.contradictionClass === 'MATERIAL_CONFLICT') out.materialConflicts += 1;
      if (fr.contradictionClass === 'IDENTITY_CONFLICT') out.identityMismatches += 1;
      for (const r of reasons) blockers[r] = (blockers[r] || 0) + 1;
    }
    if (a.hardStop) blockers[a.hardStop] = (blockers[a.hardStop] || 0) + 1;
    if (a.note) blockers[a.note] = (blockers[a.note] || 0) + 1;
  }
  const sorted = Object.entries(blockers).sort((a, b) => b[1] - a[1]);
  out.dominantBlocker = sorted[0] ? { reason: sorted[0][0], count: sorted[0][1] } : null;
  return out;
}

async function main() {
  fs.mkdirSync(RETRIEVAL_ROOT, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const before = snapshotTruth();
  const plantsBySlug = loadCatalogPlants(ROOT);
  const queueDoc = loadCurrentQueue(ROOT);

  const selection = selectEligibleJobs(queueDoc, {
    maxJobs: WORKER_DRY_SCALE_MAX_JOBS,
    plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS,
    excludeSlugs: [...WORKER_SCALE_DRY_EXCLUDE_SLUGS],
    dryRun: true,
    allowDryScaleCeiling: true,
    realExecutionAllowed: REAL_EXECUTION_ALLOWED
  });

  const selectedReport = selection.selected.map((j) => {
    const spec = WORKER_SCALE_DRY_PLANT_SPECS.find((s) => s.slug === j.canonicalSlug);
    const plant = plantsBySlug[j.canonicalSlug];
    return {
      jobId: j.jobId,
      slug: j.canonicalSlug,
      scientificName: j.scientificName,
      currentReadiness: j.currentReadinessClass,
      productGate: j.productGate || j.currentGate,
      gapCodes: j.gapCodes,
      futureClaimTypes: j.futureClaimTypes,
      identityStatus: j.identityStatus,
      plantContentHash: plant ? plantContentHash(plant) : null,
      safeWritable: !!spec?.safeWritable,
      whyEligible:
        'P1 AUTO + CANONICAL_SPECIES + sourceRetrievalRequired + approved Tier A plantSpec + not processed lemon/olive/avocado + not apricot/pomegranate/HOLD'
    };
  });

  const lock = lockBatch(selection, { plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS });

  const caps = {
    maxRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
    maxTotalRequests: WORKER_DRY_SCALE_MAX_EXTERNAL_REQUESTS_TOTAL,
    cacheFirst: true,
    cacheDir: CACHE_DIR,
    allowedSourceTypes: ['university_extension', 'government'],
    noBroadCrawl: true,
    fieldsFromQueueGapsOnly: true
  };

  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    maxJobs: WORKER_DRY_SCALE_MAX_JOBS,
    plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS,
    excludeSlugs: [...WORKER_SCALE_DRY_EXCLUDE_SLUGS],
    lockedBatch: lock,
    allowDryScaleCeiling: true,
    realExecutionAllowed: REAL_EXECUTION_ALLOWED,
    maxExternalRequestsTotal: WORKER_DRY_SCALE_MAX_EXTERNAL_REQUESTS_TOTAL,
    maxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
    artifactRoot: RETRIEVAL_ROOT,
    cacheDir: CACHE_DIR,
    parentCommit: PARENT,
    fetchImpl: globalThis.fetch
  });

  // Prove real path is refused for this pilot flag set
  const realProbe = await processBatch({
    repoRoot: ROOT,
    dryRun: false,
    lockedBatch: lock,
    allowDryScaleCeiling: true,
    realExecutionAllowed: REAL_EXECUTION_ALLOWED,
    artifactRoot: RETRIEVAL_ROOT,
    cacheDir: CACHE_DIR,
    parentCommit: PARENT,
    fetchImpl: async () => {
      throw new Error('fetch_must_not_run_on_disabled_real');
    }
  });

  const after = snapshotTruth();
  const plantWriteCount =
    before.triad.json === after.triad.json &&
    before.triad.js === after.triad.js &&
    before.triad.browser === after.triad.browser
      ? 0
      : 1;
  const queueWriteCount =
    before.queue === after.queue && before.queueSummary === after.queueSummary ? 0 : 1;

  const safeBySlug = Object.fromEntries(
    WORKER_SCALE_DRY_PLANT_SPECS.map((s) => [s.slug, !!s.safeWritable])
  );

  const perPlant = batch.audits.map((a) => {
    const cls = classifyAudit(a, safeBySlug[a.slug]);
    return {
      slug: a.slug,
      status: a.status,
      hardStop: a.hardStop,
      sourcesAttempted: (a.sourcesFetched || []).map((s) => s.url || s.sourceId || s),
      externalRequests: a.externalRequests || 0,
      cacheHits: a.cacheHits || 0,
      fieldsTargeted: (a.fieldPackets || []).map((f) => f.field),
      candidateResults: a.fieldPackets || [],
      READY_TO_APPLY: cls.ready,
      NEEDS_MORE_EVIDENCE: cls.needs,
      HOLD: cls.hold,
      contradiction: (a.applyGate?.fieldResults || []).map((f) => ({
        field: f.field,
        class: f.contradictionClass,
        decision: f.decision
      })),
      applyGateDecision: cls.gateDecision,
      category: cls.category,
      simulatedReadiness: a.readinessSimulation || null,
      beforeReadiness: a.beforeReadiness || null,
      appliedFieldsWouldBe: a.appliedFields || [],
      remainingGapsNote: a.note || null,
      ownerDecisionRequired: !!a.ownerDecisionRequired,
      packetFingerprint: a.packetFingerprint || null,
      safeWritable: !!safeBySlug[a.slug]
    };
  });

  const processedSlugs = new Set(perPlant.map((p) => p.slug));
  const categories = {
    APPLY_READY_NOW: perPlant.filter((p) => p.category === 'APPLY_READY_NOW').map((p) => p.slug),
    PARTIAL_READY: perPlant.filter((p) => p.category === 'PARTIAL_READY').map((p) => p.slug),
    NEEDS_MORE_EVIDENCE: perPlant
      .filter((p) => p.category === 'NEEDS_MORE_EVIDENCE')
      .map((p) => p.slug),
    HOLD_CONFLICT: perPlant.filter((p) => p.category === 'HOLD_CONFLICT').map((p) => p.slug),
    BATCH_NOT_REACHED: lock.lockedSlugs.filter((s) => !processedSlugs.has(s))
  };

  const simulated = perPlant.map((p) => {
    const cur = p.beforeReadiness?.readinessShort || '?';
    const sim = p.simulatedReadiness?.after?.readinessShort || p.simulatedReadiness?.readinessShort;
    let kind = 'other';
    if (cur === 'B' && sim === 'A') kind = 'B→A';
    else if (cur === 'B' && (sim === 'B' || !sim) && p.READY_TO_APPLY > 0) kind = 'B→B_stronger_evidence';
    return { slug: p.slug, current: cur, simulated: sim || cur, kind };
  });

  const uniqueUrls = new Set();
  for (const p of perPlant) {
    for (const u of p.sourcesAttempted || []) {
      if (typeof u === 'string') uniqueUrls.add(u);
    }
  }

  const processedCount = perPlant.length || 1;
  const cost = {
    totalExternalRequests: batch.externalRequests || 0,
    totalCacheHits: batch.cacheHits || 0,
    uniqueUrls: uniqueUrls.size,
    requestsPerPlant: Object.fromEntries(perPlant.map((p) => [p.slug, p.externalRequests])),
    REQUESTS_PER_PROCESSED_PLANT: Number(
      ((batch.externalRequests || 0) / processedCount).toFixed(3)
    ),
    sourceTypeBreakdown: { university_extension: 0, government: 0 },
    failedSourceAttempts: perPlant.filter((p) => (p.externalRequests || 0) === 0 && !p.cacheHits)
      .length,
    rateLimitOrError: batch.audits.some((a) => a.error) ? 'see_audits' : 'none'
  };
  for (const spec of lock.plantSpecs) {
    for (const s of spec.approvedSources || []) {
      if (cost.sourceTypeBreakdown[s.sourceType] != null) cost.sourceTypeBreakdown[s.sourceType] += 1;
    }
  }

  const owner = {
    fullyAutomaticDryJobs: perPlant.filter((p) => p.status === 'DRY_RUN_APPLY_ALLOWED').length,
    needsMoreEvidenceAuto: perPlant.filter((p) => p.category === 'NEEDS_MORE_EVIDENCE').length,
    routedToHold: perPlant.filter((p) => p.category === 'HOLD_CONFLICT').length,
    OWNER_REVIEW_COUNT: perPlant.filter((p) => p.ownerDecisionRequired).length
  };

  const quality = aggregateRetrievalQuality(batch.audits || []);

  const safeApplyReady = categories.APPLY_READY_NOW.length;
  const scaleRecommendation = {
    SAFE_TO_RUN_REAL_BATCH_OF_10:
      batch.status === 'BATCH_COMPLETE' &&
      plantWriteCount === 0 &&
      queueWriteCount === 0 &&
      safeApplyReady >= 1 &&
      lock.lockedSlugs.filter((s) => safeBySlug[s]).length >= 10
        ? 'YES'
        : 'NO',
    writeReadyNowCount: safeApplyReady,
    safeWritableInBatch: lock.lockedSlugs.filter((s) => safeBySlug[s]).length,
    expectedExternalRequests: cost.totalExternalRequests,
    expectedOwnerReviewCount: owner.OWNER_REVIEW_COUNT,
    stopRisk: batch.batchStopReason || 'none_observed_this_dry',
    blocker:
      lock.lockedSlugs.filter((s) => safeBySlug[s]).length < 10
        ? `Only ${lock.lockedSlugs.filter((s) => safeBySlug[s]).length} SAFE-writable untouched P1 AUTO plants available (need 10 for real batch of 10).`
        : batch.batchStopReason
          ? `Dry batch hard-stop: ${batch.batchStopReason}`
          : safeApplyReady === 0
            ? 'Zero SAFE APPLY_READY_NOW candidates in dry results'
            : null
  };

  const reports = writeWorkerReports(ROOT, batch, 'scale-dry', ARTIFACT_SUBDIR);

  // Durable clean-replay packets must remain untouched
  const durableFingerprints = {};
  for (const slug of ['lemon', 'olive', 'avocado']) {
    const p = path.join(
      ROOT,
      'data/catalog/enrichment-retrieval/candidate-packets',
      `${slug}.candidate-packet-v1.json`
    );
    if (fs.existsSync(p)) {
      const pkt = JSON.parse(fs.readFileSync(p, 'utf8'));
      durableFingerprints[slug] = {
        fingerprint: pkt.fingerprint,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
      };
    }
  }

  const finalReport = {
    verdict:
      plantWriteCount === 0 &&
      queueWriteCount === 0 &&
      REAL_EXECUTION_ALLOWED === false &&
      realProbe.REAL_EXECUTION_ALLOWED === false &&
      batch.dryRun === true
        ? 'AUTO_ENRICHMENT_WORKER_10_PLANT_DRY_PILOT_VALIDATED'
        : 'AUTO_ENRICHMENT_WORKER_10_PLANT_DRY_PILOT_FAILED',
    workerRef: AUTO_ENRICHMENT_WORKER_REF,
    parentCommit: PARENT,
    REAL_EXECUTION_ALLOWED: false,
    productionDefaultMaxJobs: WORKER_MAX_JOBS,
    dryScaleMaxJobs: WORKER_DRY_SCALE_MAX_JOBS,
    selectedCount: selection.selected.length,
    selected: selectedReport,
    lockedBatch: {
      batchFingerprint: lock.batchFingerprint,
      lockedSlugs: lock.lockedSlugs,
      lockedJobIds: lock.lockedJobIds,
      lockedAt: lock.lockedAt
    },
    requestCaps: caps,
    batchStatus: batch.status,
    batchStopReason: batch.batchStopReason,
    perPlant,
    categories: {
      APPLY_READY_NOW: { count: categories.APPLY_READY_NOW.length, slugs: categories.APPLY_READY_NOW },
      PARTIAL_READY: { count: categories.PARTIAL_READY.length, slugs: categories.PARTIAL_READY },
      NEEDS_MORE_EVIDENCE: {
        count: categories.NEEDS_MORE_EVIDENCE.length,
        slugs: categories.NEEDS_MORE_EVIDENCE
      },
      HOLD_CONFLICT: { count: categories.HOLD_CONFLICT.length, slugs: categories.HOLD_CONFLICT },
      BATCH_NOT_REACHED: {
        count: categories.BATCH_NOT_REACHED.length,
        slugs: categories.BATCH_NOT_REACHED
      }
    },
    simulatedReadiness: simulated,
    hardStops: {
      stopped: !!batch.batchStopReason,
      reason: batch.batchStopReason,
      position: batch.batchStopReason
        ? (batch.audits || []).findIndex((a) => a.hardStop) + 1
        : null,
      remainingNotProcessed: categories.BATCH_NOT_REACHED
    },
    cost,
    ownerWorkload: owner,
    retrievalQuality: quality,
    noWriteProof: {
      PLANT_WRITE_COUNT: plantWriteCount,
      QUEUE_WRITE_COUNT: queueWriteCount,
      before,
      after,
      realProbeStatus: realProbe.status,
      realProbeStop: realProbe.batchStopReason,
      realProbeError: realProbe.error || null
    },
    durableCleanReplayUntouched: durableFingerprints,
    scaleRecommendation,
    artifactPaths: {
      reportDir: REPORT_DIR,
      retrievalRoot: RETRIEVAL_ROOT,
      batchSummary: reports.batchPath,
      jobAudits: reports.jobPaths
    },
    generatedAt: new Date().toISOString()
  };

  const finalPath = path.join(REPORT_DIR, 'scale-dry-10-final-report.json');
  fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));
  console.log(JSON.stringify({ finalPath, verdict: finalReport.verdict, ...finalReport.categories, cost: finalReport.cost, scaleRecommendation: finalReport.scaleRecommendation, noWrite: finalReport.noWriteProof }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
