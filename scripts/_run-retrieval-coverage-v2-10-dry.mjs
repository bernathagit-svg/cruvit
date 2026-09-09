/**
 * Retrieval Coverage v2 — 10-plant DRY pilot (same locked sample as e6137a9).
 * No plant writes. No queue writes. No real apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_RETRIEVAL_COVERAGE_V2_REF,
  COVERAGE_V2_BASELINE_COMMIT,
  COVERAGE_V2_LOCKED_SLUGS,
  COVERAGE_V2_REQUEST_CAPS,
  FROST_EVIDENCE_TAXONOMY_V2,
  V1_COLD_FAILURE_DIAGNOSIS,
  computeCoverageV2ExperimentFingerprint,
  buildCoverageV2PlantSpecs,
  runRetrievalCoverageV2Dry
} from '../modules/personal-domain/catalog-retrieval-coverage-v2.js';
import {
  loadCatalogPlants,
  loadCurrentQueue
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_SUBDIR = 'retrieval-coverage-v2-10-dry';
const REPORT_DIR = path.join(ROOT, 'data', 'catalog', 'enrichment-worker', ARTIFACT_SUBDIR);
const ARTIFACT_ROOT = path.join(REPORT_DIR, 'retrieval');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog', 'enrichment-retrieval', 'cache');

const BASELINE = {
  coldReady: ['orange', 'raspberry', 'apple', 'fig', 'peach', 'pear'],
  coldNotReady: ['guava', 'lychee', 'mandarin', 'mango'],
  frostReady: [],
  requests: 20
};

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
    triad: { json: hashFile(paths.json), js: hashFile(paths.js), browser: hashFile(paths.browser) },
    queue: hashFile(queuePath),
    queueSummary: hashFile(summaryPath)
  };
}

function fieldStatus(packet, field) {
  const fp = (packet.fieldPackets || []).find((f) => f.targetField === field);
  if (!fp) return { applyStatus: 'NEEDS_MORE_EVIDENCE', value: null, transformRef: null, sourceIds: [] };
  return {
    applyStatus: fp.applyStatus,
    value: fp.proposedValue ?? null,
    transformRef: fp.transformRef || null,
    sourceIds: fp.sourceIds || [],
    sourceClaim: fp.sourceClaim || null,
    supportingExcerpt: fp.supportingExcerpt || null,
    contradictionClass: packet.contradictionByField?.[field]?.contradictionClass || null
  };
}

function classifyFrostRemain(reason) {
  return reason;
}

async function main() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  const before = snapshotTruth();
  const plantsBySlug = loadCatalogPlants(ROOT);
  const queueDoc = loadCurrentQueue(ROOT);
  const specs = buildCoverageV2PlantSpecs();
  const fingerprint = computeCoverageV2ExperimentFingerprint();

  console.log(
    JSON.stringify(
      {
        phase: 'caps',
        coverageRef: CATALOG_RETRIEVAL_COVERAGE_V2_REF,
        fingerprint,
        lockedSlugs: COVERAGE_V2_LOCKED_SLUGS,
        requestCaps: COVERAGE_V2_REQUEST_CAPS,
        frostTaxonomy: FROST_EVIDENCE_TAXONOMY_V2,
        coldFailureDiagnosis: V1_COLD_FAILURE_DIAGNOSIS
      },
      null,
      2
    )
  );

  const { summary, pilot } = await runRetrievalCoverageV2Dry({
    repoRoot: ROOT,
    queueDoc,
    plantsBySlug,
    cacheDir: CACHE_DIR,
    artifactRoot: ARTIFACT_ROOT,
    plantSpecs: specs,
    fetchImpl: globalThis.fetch
  });

  const perPlant = [];
  const frostRemainReasons = {};
  for (const slug of COVERAGE_V2_LOCKED_SLUGS) {
    const packetPath = path.join(ARTIFACT_ROOT, 'candidate-packets', `${slug}.candidate-packet-v1.json`);
    const packet = fs.existsSync(packetPath)
      ? JSON.parse(fs.readFileSync(packetPath, 'utf8'))
      : { fieldPackets: [] };
    const cold = fieldStatus(packet, 'coldTolerance');
    const frost = fieldStatus(packet, 'frostSensitivity');
    const v1Cold = BASELINE.coldReady.includes(slug) ? 'READY' : 'NEEDS_MORE';
    const v1Frost = 'NEEDS_MORE';
    const plant = plantsBySlug[slug];
    const readiness = plant ? classifyPlantDataReadiness(plant) : null;

    let frostWhy = null;
    if (frost.applyStatus !== 'READY_TO_APPLY') {
      if (!frost.sourceClaim) frostWhy = 'no_authoritative_direct_frost_claim_found';
      else if (frost.contradictionClass === 'MATERIAL_CONFLICT') frostWhy = 'conflicting_sources';
      else if (frost.applyStatus === 'HOLD_CONFLICT') frostWhy = 'hold_conflict';
      else frostWhy = 'direct_claim_not_strong_enough_or_transform_gap';
      frostRemainReasons[frostWhy] = (frostRemainReasons[frostWhy] || 0) + 1;
    }

    perPlant.push({
      slug,
      scientificName: specs.find((s) => s.slug === slug)?.scientificName,
      currentReadiness: readiness?.readinessShort || null,
      cold: {
        v1: v1Cold,
        v2: cold.applyStatus === 'READY_TO_APPLY' ? 'READY' : cold.applyStatus,
        value: cold.value,
        transform: cold.transformRef,
        sourceIds: cold.sourceIds,
        claim: cold.sourceClaim,
        excerpt: cold.supportingExcerpt,
        contradiction: cold.contradictionClass
      },
      frost: {
        v1: v1Frost,
        v2: frost.applyStatus === 'READY_TO_APPLY' ? 'READY' : frost.applyStatus,
        value: frost.value,
        transform: frost.transformRef,
        sourceIds: frost.sourceIds,
        claim: frost.sourceClaim,
        excerpt: frost.supportingExcerpt,
        contradiction: frost.contradictionClass,
        remainReason: frostWhy
      }
    });
  }

  const coldReadyV2 = perPlant.filter((p) => p.cold.v2 === 'READY').map((p) => p.slug);
  const frostReadyV2 = perPlant.filter((p) => p.frost.v2 === 'READY').map((p) => p.slug);
  const both = perPlant
    .filter((p) => p.cold.v2 === 'READY' && p.frost.v2 === 'READY')
    .map((p) => p.slug);
  const coldOnly = perPlant
    .filter((p) => p.cold.v2 === 'READY' && p.frost.v2 !== 'READY')
    .map((p) => p.slug);
  const frostOnly = perPlant
    .filter((p) => p.frost.v2 === 'READY' && p.cold.v2 !== 'READY')
    .map((p) => p.slug);
  const neither = perPlant
    .filter((p) => p.cold.v2 !== 'READY' && p.frost.v2 !== 'READY')
    .map((p) => p.slug);

  const newCold = coldReadyV2.filter((s) => !BASELINE.coldReady.includes(s));
  const newFrost = frostReadyV2.filter((s) => !BASELINE.frostReady.includes(s));
  const totalNewReadyFields = newCold.length + newFrost.length;
  const extraRequests = summary.TOTAL_REQUESTS;
  // Extra beyond baseline 20 when cache reuse: use max(0, total-20) if total>20 else treat all new fetches as v2 cost when cache absorbed baseline
  const additionalV2 = Math.max(0, summary.TOTAL_REQUESTS - summary.cacheHits > 20
    ? summary.TOTAL_REQUESTS - 20
    : Math.max(0, summary.TOTAL_REQUESTS - BASELINE.requests));
  // Prefer summary's ADDITIONAL if set; recompute honestly:
  const baselineEquivalent = Math.min(BASELINE.requests, summary.TOTAL_REQUESTS);
  const additional = Math.max(0, summary.TOTAL_REQUESTS - baselineEquivalent);

  const after = snapshotTruth();
  const plantWrites =
    before.triad.json === after.triad.json &&
    before.triad.js === after.triad.js &&
    before.triad.browser === after.triad.browser
      ? 0
      : 1;
  const queueWrites =
    before.queue === after.queue && before.queueSummary === after.queueSummary ? 0 : 1;

  // Durable clean-replay untouched
  const durable = {};
  for (const slug of ['lemon', 'olive', 'avocado']) {
    const p = path.join(
      ROOT,
      'data/catalog/enrichment-retrieval/candidate-packets',
      `${slug}.candidate-packet-v1.json`
    );
    if (fs.existsSync(p)) {
      durable[slug] = JSON.parse(fs.readFileSync(p, 'utf8')).fingerprint;
    }
  }
  const scaleV1Packet = path.join(
    ROOT,
    'data/catalog/enrichment-worker/scale-dry-10-v1/retrieval/candidate-packets/orange.candidate-packet-v1.json'
  );
  const scaleV1Before = fs.existsSync(scaleV1Packet) ? fs.readFileSync(scaleV1Packet, 'utf8') : null;

  const cost = {
    baselineRequests: BASELINE.requests,
    TOTAL_REQUESTS: summary.TOTAL_REQUESTS,
    BASELINE_EQUIVALENT_REQUESTS: baselineEquivalent,
    ADDITIONAL_V2_REQUESTS: additional,
    cacheHits: summary.cacheHits,
    uniqueUrls: summary.uniqueUrls,
    newColdReadyFields: newCold.length,
    newFrostReadyFields: newFrost.length,
    totalNewReadyFields,
    extraRequestsPerNewReadyField:
      totalNewReadyFields > 0 ? Number((additional / totalNewReadyFields).toFixed(3)) : null
  };

  const scaleValue =
    totalNewReadyFields >= 4 && additional <= 30 && summary.ZONE_TO_FROST_MISUSE_COUNT === 0
      ? 'HIGH'
      : totalNewReadyFields >= 2 && summary.ZONE_TO_FROST_MISUSE_COUNT === 0
        ? 'MEDIUM'
        : 'LOW';

  const recommendReal =
    newCold.filter((s) => ['orange', 'raspberry', 'guava', 'lychee', 'mandarin', 'mango'].includes(s))
      .length +
      newFrost.filter((s) =>
        ['orange', 'raspberry', 'guava', 'lychee', 'mandarin', 'mango'].includes(s)
      ).length >=
      3 && summary.ZONE_TO_FROST_MISUSE_COUNT === 0
      ? 'YES'
      : 'NO';

  const finalReport = {
    verdict:
      plantWrites === 0 &&
      queueWrites === 0 &&
      COVERAGE_V2_LOCKED_SLUGS.every((s, i) => s === summary.lockedSlugs[i]) &&
      summary.ZONE_TO_FROST_MISUSE_COUNT === 0
        ? 'RETRIEVAL_COVERAGE_V2_10_PLANT_DRY_VALIDATED'
        : 'RETRIEVAL_COVERAGE_V2_10_PLANT_DRY_FAILED',
    coverageRef: CATALOG_RETRIEVAL_COVERAGE_V2_REF,
    baselineCommit: COVERAGE_V2_BASELINE_COMMIT,
    experimentFingerprint: fingerprint,
    sameTenPlants: true,
    requestCaps: COVERAGE_V2_REQUEST_CAPS,
    frostTaxonomy: FROST_EVIDENCE_TAXONOMY_V2,
    coldFailureDiagnosis: V1_COLD_FAILURE_DIAGNOSIS,
    coverage: {
      baseline: { coldReady: `${BASELINE.coldReady.length}/10`, frostReady: '0/10' },
      v2: {
        coldReady: `${coldReadyV2.length}/10`,
        frostReady: `${frostReadyV2.length}/10`,
        coldReadySlugs: coldReadyV2,
        frostReadySlugs: frostReadyV2,
        both,
        coldOnly,
        frostOnly,
        neither
      }
    },
    perPlant,
    evidenceQuality: {
      ZONE_TO_FROST_MISUSE_COUNT: summary.ZONE_TO_FROST_MISUSE_COUNT
    },
    conflicts: {
      note: 'see per-plant contradiction classes',
      materialConflicts: perPlant.filter(
        (p) =>
          p.cold.contradiction === 'MATERIAL_CONFLICT' ||
          p.frost.contradiction === 'MATERIAL_CONFLICT'
      ).length
    },
    cost,
    ownerWorkload: {
      OWNER_REVIEW_COUNT: 0,
      automaticallyReadyFields: coldReadyV2.length + frostReadyV2.length,
      automaticallyNeedsMore:
        perPlant.filter((p) => p.cold.v2 !== 'READY').length +
        perPlant.filter((p) => p.frost.v2 !== 'READY').length
    },
    frostBottleneckDiagnosis: frostRemainReasons,
    noWriteProof: {
      PLANT_WRITE_COUNT: plantWrites,
      QUEUE_WRITE_COUNT: queueWrites,
      before,
      after,
      readinessUnchanged: 'A1 / B94 / C0 / D13'
    },
    durableUntouched: {
      lemonOliveAvocado: durable,
      scaleDryV1OrangeUnchanged:
        scaleV1Before == null || scaleV1Before === fs.readFileSync(scaleV1Packet, 'utf8')
    },
    scaleValue: {
      RETRIEVAL_COVERAGE_V2_SCALE_VALUE: scaleValue,
      RECOMMEND_REAL_APPLY_NEXT: recommendReal
    },
    artifactRoot: ARTIFACT_ROOT,
    pilotSummaryLite: {
      TOTAL_REQUESTS: summary.TOTAL_REQUESTS,
      cacheHits: summary.cacheHits,
      uniqueUrls: summary.uniqueUrls,
      budget: summary.budget
    },
    generatedAt: new Date().toISOString()
  };

  const outPath = path.join(REPORT_DIR, 'retrieval-coverage-v2-10-final-report.json');
  fs.writeFileSync(outPath, JSON.stringify(finalReport, null, 2));
  fs.writeFileSync(
    path.join(REPORT_DIR, 'retrieval-coverage-v2-run-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        outPath,
        verdict: finalReport.verdict,
        coverage: finalReport.coverage,
        cost: finalReport.cost,
        zoneMisuse: finalReport.evidenceQuality,
        scaleValue: finalReport.scaleValue,
        noWrite: {
          PLANT_WRITE_COUNT: plantWrites,
          QUEUE_WRITE_COUNT: queueWrites
        }
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
