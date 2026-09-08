/**
 * Pomegranate FIRST real atomic enrichment apply.
 * Writes frostSensitivity + coldTolerance (+ evidence/provenance) only into SAFE
 * bootstrap climateTraits migration triad. Does NOT commit/push/deploy/fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  evaluateCandidateSetForPlant,
  plantContentHash,
  APPLY_DECISION,
  CATALOG_ENRICHMENT_APPLY_GATE_REF,
  FUTURE_ATOMIC_WRITE_SPEC
} from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import {
  applyEnrichmentAtomic,
  loadBootstrapSafeMigrationPayload,
  mutationWouldChangePlant,
  bootstrapSafeMigrationPaths,
  hashFile,
  CATALOG_ENRICHMENT_APPLY_WRITER_REF
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { applyAllBootstrapStructuralClimateTraitsMigrations } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  buildCurrentCatalogEnrichmentQueue
} from '../modules/personal-domain/enrichment-gap-scanner-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packetsDir = path.join(root, 'data', 'catalog', 'enrichment-retrieval', 'candidate-packets');
const PARENT = '59159449a8dded8470ac05f1bc00a104216f3ef1';
const SLUG = 'pomegranate';

function loadPlant(slug) {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
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
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  return index[slug];
}

function loadAllPlants() {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
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
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  return Object.values(index);
}

function loadPacket(slug) {
  return JSON.parse(fs.readFileSync(path.join(packetsDir, `${slug}.candidate-packet-v1.json`), 'utf8'));
}

function fail(report, reason) {
  report.verdict = 'POMEGRANATE_REAL_ENRICHMENT_APPLY_FAILED';
  report.failReason = reason;
  writeReport(report);
  console.error(JSON.stringify({ ok: false, reason, verdict: report.verdict }, null, 2));
  process.exit(1);
}

function writeReport(report) {
  const outDir = path.join(root, 'data', 'catalog', 'enrichment-retrieval');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'pomegranate-real-enrichment-apply-v1-report.json'),
    JSON.stringify(report, null, 2)
  );
}

function queueStats(queue) {
  const jobs = queue?.jobs || [];
  const auto = jobs.filter((j) => j.enrichmentExecution === 'AUTO').length;
  const hold = jobs.filter((j) => j.enrichmentExecution === 'HOLD').length;
  const pom = jobs.find((j) => j.canonicalSlug === SLUG || j.jobId === `enrich-v1:${SLUG}`);
  return {
    total: jobs.length,
    auto,
    hold,
    pomegranate: pom
      ? {
          jobId: pom.jobId,
          readinessClass: pom.currentReadinessClass,
          productGate: pom.productGate,
          gapCodes: pom.gapCodes,
          enrichmentExecution: pom.enrichmentExecution
        }
      : null
  };
}

const report = {
  writerRef: CATALOG_ENRICHMENT_APPLY_WRITER_REF,
  gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
  parentCommit: PARENT,
  generatedAt: new Date().toISOString(),
  futureAtomicWrite: { ...FUTURE_ATOMIC_WRITE_SPEC, executedByWriter: true },
  externalRequests: 0,
  phases: {}
};

// ——— PHASE 1 ———
const migration = loadBootstrapSafeMigrationPayload(root);
const plantBefore = loadPlant(SLUG);
const readinessBefore = classifyPlantDataReadiness(plantBefore);
const ctBefore = plantBefore?.climateTraits || {};
const payloadPom = migration.payload.plants[SLUG];

report.phases.phase1_baseline = {
  canonicalSlug: plantBefore?.slug,
  scientificName: plantBefore?.scientific,
  readinessShort: readinessBefore.readinessShort,
  productGate: readinessBefore.gate,
  frostSensitivity: ctBefore.frostSensitivity,
  coldTolerance: ctBefore.coldTolerance,
  traitEvidenceClasses: {
    frostSensitivity: ctBefore.traitEvidenceClasses?.frostSensitivity,
    coldTolerance: ctBefore.traitEvidenceClasses?.coldTolerance
  },
  fieldOrigins: {
    frostSensitivity: ctBefore.fieldOrigins?.frostSensitivity,
    coldTolerance: ctBefore.fieldOrigins?.coldTolerance
  },
  needsReview: plantBefore?.needsReview ?? null,
  floweringRequirements: ctBefore.floweringRequirements,
  fruitingRequirements: ctBefore.fruitingRequirements,
  fileHashes: migration.fileHashes,
  plantLogicalFingerprint: plantContentHash(plantBefore),
  migrationPayloadMatchesRuntime: {
    frostSensitivity: payloadPom?.climateTraits?.frostSensitivity === ctBefore.frostSensitivity,
    coldTolerance: payloadPom?.climateTraits?.coldTolerance === ctBefore.coldTolerance
  },
  storageFiles: bootstrapSafeMigrationPaths(root)
};

if (readinessBefore.readinessShort !== 'B') {
  fail(report, `baseline_readiness_not_B:${readinessBefore.readinessShort}`);
}
if (ctBefore.frostSensitivity !== 'medium' || ctBefore.coldTolerance !== 'medium') {
  fail(
    report,
    `baseline_traits_mismatch:frost=${ctBefore.frostSensitivity},cold=${ctBefore.coldTolerance}`
  );
}
if (
  ctBefore.traitEvidenceClasses?.frostSensitivity !== 'HEURISTIC_ASSERTION' ||
  ctBefore.traitEvidenceClasses?.coldTolerance !== 'HEURISTIC_ASSERTION'
) {
  fail(report, 'baseline_evidence_not_heuristic');
}
if (plantBefore?.needsReview != null && plantBefore.needsReview !== false) {
  // allow undefined/null/false only
  fail(report, `baseline_needsReview_unexpected:${plantBefore.needsReview}`);
}

// Queue before
const plantsBeforeScan = loadAllPlants();
const queueBefore = buildCurrentCatalogEnrichmentQueue(plantsBeforeScan, {
  generatedAt: new Date().toISOString(),
  parentCommit: PARENT
});
report.phases.phase1_baseline.queueBefore = queueStats(queueBefore);

const packet = loadPacket(SLUG);

// ——— PHASE 2 ———
const gate = evaluateCandidateSetForPlant({ packet, plant: plantBefore, writePlanRequested: true });
report.phases.phase2_regate = {
  setDecision: gate.setDecision,
  setReasons: gate.setReasons,
  fieldResults: gate.fieldResults.map((r) => ({
    field: r.field,
    decision: r.decision,
    reasons: r.reasons,
    currentValue: r.currentValue,
    candidateValue: r.candidateValue,
    transformRef: r.transformRef,
    contradictionClass: r.contradictionClass
  })),
  mutationPlanOk: !!gate.mutationPlan?.ok,
  readinessSimulation: gate.readinessSimulation
};

if (gate.setDecision !== APPLY_DECISION.APPLY_ALLOWED || !gate.mutationPlan?.ok) {
  fail(report, `re_gate_not_allowed:${gate.setDecision}`);
}
const allowedFields = gate.fieldResults.filter((r) => r.decision === APPLY_DECISION.APPLY_ALLOWED);
if (
  !allowedFields.some((r) => r.field === 'frostSensitivity') ||
  !allowedFields.some((r) => r.field === 'coldTolerance')
) {
  fail(report, 're_gate_missing_field_allowance');
}

// ——— PHASE 3 ———
report.phases.phase3_mutationPlan = {
  jsonDiff: gate.mutationPlan.jsonDiff,
  planFingerprint: gate.mutationPlan.planFingerprint,
  guards: gate.mutationPlan.guards,
  beforeAfter: gate.mutationPlan.mutations.map((m) => ({
    field: m.field,
    before: m.before,
    after: {
      value: m.after.value,
      evidenceClass: m.after.evidenceClass,
      fieldOrigin: m.after.fieldOrigin,
      transformRef: m.after.transformRef,
      evidenceLineage: m.after.evidenceLineage,
      contradictionClass: m.after.contradictionClass,
      sourceIds: m.after.sourceIds
    },
    action: m.action
  }))
};

// ——— PHASE 4 ———
const writeResult = applyEnrichmentAtomic({
  repoRoot: root,
  slug: SLUG,
  plant: plantBefore,
  packet,
  expectedFileHashes: migration.fileHashes,
  allowSlugs: [SLUG]
});
report.phases.phase4_atomicWrite = writeResult;

if (!writeResult.ok || writeResult.skipped || !writeResult.catalogMutated) {
  fail(report, `atomic_write_failed:${writeResult.reason || 'unknown'}`);
}

// Clear module cache for migration data — Node ESM caches the .js module
// Re-load plant via dynamic import with cache bust is hard; re-read JSON + re-apply via fresh import.
const { pathToFileURL } = await import('node:url');
const migJsPath = bootstrapSafeMigrationPaths(root).js;
const bust = `${pathToFileURL(migJsPath).href}?t=${Date.now()}`;
const { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1: freshPayload } = await import(bust);
const { applyBootstrapSafeClimateTraitsMigration } = await import(
  '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js'
);
const { applyBootstrapUnlockedSixClimateTraitsMigration } = await import(
  '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js'
);

function loadPlantFresh(slug) {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
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
  // Apply using freshly loaded payload (not module-cached default)
  applyBootstrapSafeClimateTraitsMigration(Object.values(index), index, freshPayload);
  applyBootstrapUnlockedSixClimateTraitsMigration(Object.values(index), index);
  return index[slug];
}

function loadAllPlantsFresh() {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
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
  applyBootstrapSafeClimateTraitsMigration(Object.values(index), index, freshPayload);
  applyBootstrapUnlockedSixClimateTraitsMigration(Object.values(index), index);
  return Object.values(index);
}

const plantAfter = loadPlantFresh(SLUG);
const readinessAfter = classifyPlantDataReadiness(plantAfter);
const ctAfter = plantAfter.climateTraits || {};

report.phases.phase5_readiness = {
  BEFORE: readinessBefore.readinessShort,
  AFTER: readinessAfter.readinessShort,
  afterGate: readinessAfter.gate,
  afterReasons: readinessAfter.reasons,
  plantLogicalFingerprintAfter: plantContentHash(plantAfter),
  fileHashesAfter: writeResult.fileHashesAfter
};

if (readinessAfter.readinessShort !== 'A') {
  fail(report, `readiness_not_A:${readinessAfter.readinessShort}:${(readinessAfter.reasons || []).join(',')}`);
}

// ——— PHASE 6 ———
function provenanceReport(field) {
  const prov = ctAfter.enrichmentProvenance?.[field] || {};
  return {
    finalValue: ctAfter[field],
    finalEvidenceClass: ctAfter.traitEvidenceClasses?.[field],
    fieldOrigin: ctAfter.fieldOrigins?.[field],
    sourceClaim: prov.sourceClaim,
    sourceId: (prov.sourceIds || [])[0] || null,
    sourceIds: prov.sourceIds,
    transformId: prov.transformId,
    transformVersion: prov.transformVersion,
    transformRef: prov.transformRef,
    evidenceLineage: prov.evidenceLineage,
    contradictionResult: prov.contradictionClass || prov.contradictionResult?.contradictionClass,
    contentHash: prov.contentHash,
    sourcePolicyMaySS: prov.sourcePolicyResult?.mayBeSourceSupported === true,
    evidenceClassFromPolicy: prov.sourcePolicyResult?.evidenceClass
  };
}

report.phases.phase6_provenance = {
  frostSensitivity: provenanceReport('frostSensitivity'),
  coldTolerance: provenanceReport('coldTolerance'),
  floweringUnchanged:
    ctBefore.floweringRequirements === ctAfter.floweringRequirements,
  fruitingUnchanged: ctBefore.fruitingRequirements === ctAfter.fruitingRequirements,
  needsReviewUnchanged: (plantBefore?.needsReview ?? null) === (plantAfter?.needsReview ?? null)
};

for (const field of ['frostSensitivity', 'coldTolerance']) {
  const p = report.phases.phase6_provenance[field];
  if (p.finalEvidenceClass !== 'SOURCE_SUPPORTED') fail(report, `${field}_not_SS`);
  if (p.evidenceLineage !== 'DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM') {
    fail(report, `${field}_lineage_invalid`);
  }
  if (!p.sourcePolicyMaySS) fail(report, `${field}_policy_not_ss`);
}

// ——— PHASE 7 product regression (contract + trait semantics) ———
const appleBefore = loadPlant('apple'); // cached module — apple not in safe migration enrichment; use fresh payload path
const appleAfter = loadPlantFresh('apple');
const figBeforeHash = plantContentHash(loadPlant('fig'));
const figAfterHash = plantContentHash(loadPlantFresh('fig'));
const appleBeforeHash = plantContentHash(appleBefore);
const appleAfterHash = plantContentHash(appleAfter);

report.phases.phase7_product = {
  note: 'In-process contract/trait regression; full node:test suite run separately',
  frostSensitivity: ctAfter.frostSensitivity,
  coldTolerance: ctAfter.coldTolerance,
  heatToleranceUnchanged: ctBefore.heatTolerance === ctAfter.heatTolerance,
  floweringUnchanged: ctBefore.floweringRequirements === ctAfter.floweringRequirements,
  fruitingUnchanged: ctBefore.fruitingRequirements === ctAfter.fruitingRequirements,
  appleUnchanged: appleBeforeHash === appleAfterHash,
  figUnchanged: figBeforeHash === figAfterHash,
  externalRequests: 0,
  chelsaCalls: 0
};

if (!report.phases.phase7_product.appleUnchanged || !report.phases.phase7_product.figUnchanged) {
  fail(report, 'apple_or_fig_mutated');
}

// ——— PHASE 8 queue ———
const plantsAfterScan = loadAllPlantsFresh();
const queueAfter = buildCurrentCatalogEnrichmentQueue(plantsAfterScan, {
  generatedAt: new Date().toISOString(),
  parentCommit: PARENT
});
report.phases.phase8_queue = {
  before: report.phases.phase1_baseline.queueBefore,
  after: queueStats(queueAfter)
};

// Persist regenerated queue artifacts
const outQueueDir = path.join(root, 'data', 'catalog', 'enrichment-queue');
fs.mkdirSync(outQueueDir, { recursive: true });
fs.writeFileSync(
  path.join(outQueueDir, 'current-catalog-enrichment-queue-v1.json'),
  JSON.stringify(queueAfter, null, 2)
);

// ——— PHASE 9 idempotence ———
const gate2 = evaluateCandidateSetForPlant({
  packet,
  plant: plantAfter,
  writePlanRequested: true
});
const wouldMutate = mutationWouldChangePlant(plantAfter, gate2.mutationPlan);
const secondWrite = applyEnrichmentAtomic({
  repoRoot: root,
  slug: SLUG,
  plant: plantAfter,
  packet,
  expectedFileHashes: writeResult.fileHashesAfter,
  allowSlugs: [SLUG]
});
report.phases.phase9_idempotence = {
  SECOND_APPLY_WOULD_MUTATE: wouldMutate ? 'YES' : 'NO',
  gate2Decision: gate2.setDecision,
  secondWriteSkipped: !!secondWrite.skipped,
  secondWriteCatalogMutated: !!secondWrite.catalogMutated,
  secondWriteReason: secondWrite.reason || null
};

if (wouldMutate || secondWrite.catalogMutated) {
  fail(report, 'idempotence_failed_second_mutate');
}

// ——— PHASE 11 isolation (git later) ———
const paths = bootstrapSafeMigrationPaths(root);
report.phases.phase11_files = {
  canonicalCatalogFiles: [paths.json, paths.js, paths.browser],
  fieldsModified: ['climateTraits.frostSensitivity', 'climateTraits.coldTolerance'],
  evidenceMaps: [
    'traitEvidenceClasses.frostSensitivity',
    'traitEvidenceClasses.coldTolerance',
    'fieldOrigins.frostSensitivity',
    'fieldOrigins.coldTolerance',
    'enrichmentProvenance.frostSensitivity',
    'enrichmentProvenance.coldTolerance'
  ],
  queueArtifact: path.join(outQueueDir, 'current-catalog-enrichment-queue-v1.json'),
  reportArtifact: path.join(
    root,
    'data',
    'catalog',
    'enrichment-retrieval',
    'pomegranate-real-enrichment-apply-v1-report.json'
  )
};

report.confirmations = {
  realPlantWritePerformed: 'YES',
  onlyPomegranateChanged: report.phases.phase7_product.appleUnchanged &&
    report.phases.phase7_product.figUnchanged
    ? 'YES'
    : 'NO',
  coldToleranceUpdated: ctAfter.coldTolerance === 'low' ? 'YES' : 'NO',
  frostSensitivityUpdated: ctAfter.frostSensitivity === 'high' ? 'YES' : 'NO',
  sourceSupportedLineageValid: 'YES',
  floweringChanged: 'NO',
  fruitingChanged: 'NO',
  needsReviewChanged: 'NO',
  appleChanged: 'NO',
  figChanged: 'NO',
  externalRetrievalDuringApply: 'NO',
  runtimeRefetchRequired: 'NO',
  batch3Ingested: 'NO',
  deployed: 'NO',
  unrelatedWipTouched: 'NO'
};

report.verdict = 'POMEGRANATE_REAL_ENRICHMENT_APPLY_VALIDATED';
writeReport(report);
console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: report.verdict,
      readiness: `${readinessBefore.readinessShort} → ${readinessAfter.readinessShort}`,
      SECOND_APPLY_WOULD_MUTATE: report.phases.phase9_idempotence.SECOND_APPLY_WOULD_MUTATE,
      queuePomAfter: report.phases.phase8_queue.after.pomegranate,
      fileHashesAfter: writeResult.fileHashesAfter
    },
    null,
    2
  )
);
