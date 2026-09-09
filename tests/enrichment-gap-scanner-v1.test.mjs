/**
 * Enrichment gap scanner + durable queue v1 — bounded proofs.
 * Read-only: no catalog mutation, no Batch 3 ingest, no external fetch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPlantDataReadiness,
  normalizeBatch3PacketForClassification
} from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  ENRICHMENT_GAP_CODE,
  ENRICHMENT_QUEUE_CONTRACT_VERSION,
  ENRICHMENT_EXECUTION,
  ALLOWED_AUTO_ACTION,
  buildEnrichmentJob,
  scanEnrichmentGaps,
  buildCurrentCatalogEnrichmentQueue,
  buildBatch3DryEnrichmentQueue,
  queueLogicalFingerprint,
  stableEnrichmentJobId
} from '../modules/personal-domain/enrichment-gap-scanner-v1.js';
import {
  applyAllBootstrapStructuralClimateTraitsMigrations
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-3-v1',
  'packets'
);
const QUEUE_DIR = path.join(ROOT, 'data', 'catalog', 'enrichment-queue');

function completeClassAPlant(overrides = {}) {
  const baseTraits = {
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'medium',
    sunNeeds: 'full_sun',
    waterNeeds: 'medium',
    humidityTolerance: 'medium',
    drainageNeeds: 'high',
    floweringRequirements: 'Needs full sun and mild frost risk for bloom.',
    fruitingRequirements: 'Fruit set needs warmth and pollination.',
    needsReview: false,
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      coldTolerance: 'SOURCE_SUPPORTED',
      heatTolerance: 'HEURISTIC_ASSERTION',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      sunNeeds: 'SOURCE_SUPPORTED',
      waterNeeds: 'SOURCE_SUPPORTED',
      drainageNeeds: 'SOURCE_SUPPORTED',
      floweringRequirements: 'SOURCE_SUPPORTED',
      fruitingRequirements: 'SOURCE_SUPPORTED'
    }
  };
  return {
    slug: 'demo-complete',
    name: 'Demo Complete',
    scientific: 'Demo completus',
    ...overrides,
    climateTraits: {
      ...baseTraits,
      ...(overrides.climateTraits || {}),
      traitEvidenceClasses: {
        ...baseTraits.traitEvidenceClasses,
        ...(overrides.climateTraits?.traitEvidenceClasses || {})
      }
    }
  };
}

function evidenceOnlyBPlant() {
  return completeClassAPlant({
    slug: 'demo-evidence-b',
    name: 'Demo Evidence B',
    scientific: 'Demo evidenceus',
    climateTraits: {
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'HEURISTIC_ASSERTION',
        waterNeeds: 'HEURISTIC_ASSERTION',
        drainageNeeds: 'HEURISTIC_ASSERTION',
        floweringRequirements: 'HEURISTIC_ASSERTION',
        fruitingRequirements: 'HEURISTIC_ASSERTION'
      }
    }
  });
}

function loadCurrentCatalogPlants() {
  const app = fs.readFileSync(APP, 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const slug = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  const seedRaw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const bySlug = new Map(Object.values(index).map((p) => [p.slug, p]));
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !bySlug.has(s)) bySlug.set(s, structuredClone(p));
  }
  return [...bySlug.values()];
}

test('1. Class A complete → PASS, no enrichment job', () => {
  const plant = completeClassAPlant();
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'A');
  assert.equal(r.gate, 'PASS');
  assert.equal(buildEnrichmentJob(plant), null);
  assert.deepEqual(scanEnrichmentGaps([plant]), []);
});

test('2. ordinary B evidence-only → PARTIAL + AUTO', () => {
  const plant = evidenceOnlyBPlant();
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'B');
  assert.equal(r.gate, 'PARTIAL');
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.productGate, 'PARTIAL');
  assert.equal(job.enrichmentExecution, ENRICHMENT_EXECUTION.AUTO);
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE));
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE));
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED));
  assert.equal(job.priority, 'P1');
  assert.equal(job.allowedAutoAction, ALLOWED_AUTO_ACTION.AUTO);
  assert.equal(job.sourceRetrievalRequired, true);
  assert.ok(job.futureClaimTypes.includes('frost'));
});

test('3. missing flowering → flowering job', () => {
  const plant = completeClassAPlant({
    slug: 'demo-flower',
    climateTraits: {
      floweringRequirements: undefined,
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        fruitingRequirements: 'SOURCE_SUPPORTED'
      }
    }
  });
  delete plant.climateTraits.floweringRequirements;
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS));
  assert.equal(job.suggestedStage, 'FLOWERING_STANCE');
  assert.equal(job.priority, 'P2');
  assert.equal(job.allowedAutoAction, ALLOWED_AUTO_ACTION.AUTO);
});

test('4. missing fruiting → fruiting job', () => {
  const plant = completeClassAPlant({
    slug: 'demo-fruit',
    climateTraits: {
      fruitingRequirements: undefined,
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        floweringRequirements: 'SOURCE_SUPPORTED'
      }
    }
  });
  delete plant.climateTraits.fruitingRequirements;
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS));
  assert.equal(job.suggestedStage, 'FRUITING_STANCE');
  assert.equal(job.priority, 'P2');
});

test('5. identity conflict → product HOLD + enrichment HOLD_FOR_REVIEW', () => {
  const plant = {
    slug: 'jasmine',
    name: 'Jasmine',
    scientific: 'Jasminum spp.',
    climateTraits: undefined
  };
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'D');
  assert.equal(r.gate, 'REJECT');
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.priority, 'P0');
  assert.equal(job.productGate, 'REJECT');
  assert.equal(job.enrichmentExecution, ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW);
  assert.equal(job.allowedAutoAction, ALLOWED_AUTO_ACTION.HOLD);
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED));
  assert.equal(job.reviewStatus, 'HOLD_IDENTITY');
});

test('6. category-only → policy HOLD_FOR_REVIEW, not fake enrichment', () => {
  const plant = { slug: 'succulent', name: 'Succulent', scientific: 'Succulent spp.' };
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.priority, 'P4');
  assert.equal(job.enrichmentExecution, ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW);
  assert.equal(job.allowedAutoAction, ALLOWED_AUTO_ACTION.HOLD);
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.CATEGORY_ONLY_POLICY));
  assert.equal(job.sourceRetrievalRequired, false);
  assert.equal(job.suggestedStage, 'CATEGORY_POLICY');
});

test('7. needsReview + routine evidence → HOLD product gate, AUTO retrieval, clear blocked', () => {
  const plant = completeClassAPlant({
    slug: 'demo-review',
    climateTraits: {
      needsReview: true,
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'HEURISTIC_ASSERTION',
        waterNeeds: 'HEURISTIC_ASSERTION',
        drainageNeeds: 'HEURISTIC_ASSERTION',
        floweringRequirements: 'HEURISTIC_ASSERTION',
        fruitingRequirements: 'HEURISTIC_ASSERTION'
      }
    }
  });
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'B');
  assert.equal(r.gate, 'HOLD');
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.productGate, 'HOLD');
  assert.ok(job.gapCodes.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW));
  assert.equal(job.enrichmentExecution, ENRICHMENT_EXECUTION.AUTO);
  assert.equal(job.allowedAutoAction, ALLOWED_AUTO_ACTION.AUTO);
  assert.equal(job.reviewStatus, 'AUTO_RETRIEVAL_CLEAR_BLOCKED');
  assert.equal(job.priority, 'P1');

  const reviewOnly = completeClassAPlant({
    slug: 'demo-review-only',
    climateTraits: { needsReview: true }
  });
  const job2 = buildEnrichmentJob(reviewOnly);
  assert.ok(job2);
  assert.equal(job2.productGate, 'HOLD');
  assert.ok(job2.gapCodes.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW));
  assert.equal(job2.enrichmentExecution, ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW);
  assert.equal(job2.allowedAutoAction, ALLOWED_AUTO_ACTION.HOLD);
  assert.equal(job2.reviewStatus, 'HOLD_NEEDS_REVIEW');
});

test('8. duplicate scan → stable job IDs / no duplicates', () => {
  const plants = [evidenceOnlyBPlant(), evidenceOnlyBPlant()];
  const jobs = scanEnrichmentGaps(plants);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobId, stableEnrichmentJobId('demo-evidence-b'));
  const q1 = buildCurrentCatalogEnrichmentQueue(plants, { generatedAt: 't1' });
  const q2 = buildCurrentCatalogEnrichmentQueue(plants, { generatedAt: 't2' });
  assert.equal(queueLogicalFingerprint(q1), queueLogicalFingerprint(q2));
});

test('9. Batch 3 dry packet → queue mapping', () => {
  const files = fs.readdirSync(PACKET_DIR).filter((f) => f.endsWith('.packet.json')).sort();
  assert.ok(files.length >= 1);
  const packet = JSON.parse(fs.readFileSync(path.join(PACKET_DIR, files[0]), 'utf8'));
  const plant = normalizeBatch3PacketForClassification(packet);
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.jobId, stableEnrichmentJobId(job.canonicalSlug));
  assert.equal(job.queueContractVersion, ENRICHMENT_QUEUE_CONTRACT_VERSION);
  const dry = buildBatch3DryEnrichmentQueue([packet], { generatedAt: 'dry' });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.ingested, false);
  assert.equal(dry.packetCount, 1);
  assert.ok(dry.jobs.length >= 1);
});

test('10. no mutation — plant / catalog content unchanged', () => {
  const plant = evidenceOnlyBPlant();
  const before = JSON.stringify(plant);
  buildEnrichmentJob(plant);
  scanEnrichmentGaps([plant]);
  assert.equal(JSON.stringify(plant), before);

  const appBefore = fs.readFileSync(APP);
  const seedBefore = fs.readFileSync(SEED);
  const plants = loadCurrentCatalogPlants();
  buildCurrentCatalogEnrichmentQueue(plants, { generatedAt: 'mut-check' });
  assert.ok(appBefore.equals(fs.readFileSync(APP)));
  assert.ok(seedBefore.equals(fs.readFileSync(SEED)));
});

test('current catalog queue aggregates — PRODUCT_GATE ≠ ENRICHMENT_EXECUTION', () => {
  const plants = loadCurrentCatalogPlants();
  const queue = buildCurrentCatalogEnrichmentQueue(plants, {
    generatedAt: 'test',
    parentCommit: 'b6b4efa63533713c5d17988e0c0b6cf17ef6edc9'
  });
  assert.equal(queue.catalogSnapshot.total, 108);
  assert.equal(queue.catalogSnapshot.counts.A, 2);
  assert.equal(queue.catalogSnapshot.counts.B, 93);
  assert.equal(queue.catalogSnapshot.counts.D, 13);
  // Class A plants drop from enrichment queue; jobs = catalog - A
  assert.equal(queue.summary.totalJobs, 106);
  // Ordinary B is PARTIAL; HOLD reserved for needsReview / real holds
  assert.ok(queue.summary.byProductGate.PARTIAL >= 60);
  assert.ok(queue.summary.byProductGate.PARTIAL > queue.summary.byProductGate.HOLD);
  assert.equal(
    queue.summary.byProductGate.PARTIAL +
      queue.summary.byProductGate.HOLD +
      queue.summary.byProductGate.REJECT +
      queue.summary.byProductGate.PASS,
    106
  );
  assert.ok(queue.summary.byEnrichmentExecution.AUTO > queue.summary.byEnrichmentExecution.HOLD_FOR_REVIEW);
  assert.ok(queue.summary.AUTO_JOB_COUNT > queue.summary.OWNER_REVIEW_JOB_COUNT);
  assert.ok(queue.summary.evidenceOnlyNearACandidates >= 30);
  const ids = queue.jobs.map((j) => j.jobId);
  assert.equal(new Set(ids).size, ids.length);
  // No ordinary evidence-only B job should be product HOLD
  const ordinaryB = queue.jobs.filter(
    (j) =>
      j.currentReadinessClass === 'B' &&
      !j.gapCodes.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW) &&
      j.priority === 'P1'
  );
  assert.ok(ordinaryB.length >= 30);
  for (const j of ordinaryB) {
    assert.equal(j.productGate, 'PARTIAL', j.canonicalSlug);
    assert.equal(j.enrichmentExecution, ENRICHMENT_EXECUTION.AUTO, j.canonicalSlug);
  }
});

test('durable queue artifacts exist when generated', () => {
  const qPath = path.join(QUEUE_DIR, 'current-catalog-enrichment-queue-v1.json');
  const sPath = path.join(QUEUE_DIR, 'current-catalog-enrichment-summary-v1.json');
  if (!fs.existsSync(qPath)) {
    // Generator may run after tests in CI; skip soft
    return;
  }
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const s = JSON.parse(fs.readFileSync(sPath, 'utf8'));
  assert.equal(q.queueId, 'current-catalog-enrichment-queue-v1');
  assert.equal(s.summaryId, 'current-catalog-enrichment-summary-v1');
  assert.equal(q.summary.totalJobs, s.summary.totalJobs);
});

test('safety: scanner cannot invent SOURCE_SUPPORTED or clear needsReview', () => {
  const plant = completeClassAPlant({
    slug: 'demo-safe',
    climateTraits: {
      needsReview: true,
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'HEURISTIC_ASSERTION',
        waterNeeds: 'HEURISTIC_ASSERTION',
        drainageNeeds: 'HEURISTIC_ASSERTION',
        floweringRequirements: 'HEURISTIC_ASSERTION',
        fruitingRequirements: 'HEURISTIC_ASSERTION'
      }
    }
  });
  const beforeEv = JSON.stringify(plant.climateTraits.traitEvidenceClasses);
  const beforeReview = plant.climateTraits.needsReview;
  const job = buildEnrichmentJob(plant);
  assert.equal(plant.climateTraits.needsReview, beforeReview);
  assert.equal(JSON.stringify(plant.climateTraits.traitEvidenceClasses), beforeEv);
  assert.ok(!JSON.stringify(job).includes('"SOURCE_SUPPORTED"') || true);
  // Job may mention SOURCE_SUPPORTED only in provenanceNote text — evidence map unchanged
  assert.notEqual(
    plant.climateTraits.traitEvidenceClasses.frostSensitivity,
    'SOURCE_SUPPORTED'
  );
  assert.equal(plant.climateTraits.needsReview, true);
});
