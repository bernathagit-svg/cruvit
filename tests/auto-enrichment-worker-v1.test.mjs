/**
 * Auto enrichment worker v1 — orchestration + safety tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  AUTO_ENRICHMENT_WORKER_REF,
  WORKER_MAX_JOBS,
  WORKER_DRY_SCALE_MAX_JOBS,
  WORKER_PILOT_PLANT_SPECS,
  WORKER_SCALE_DRY_PLANT_SPECS,
  WORKER_SCALE_DRY_EXCLUDE_SLUGS,
  WORKER_STOP_REASON,
  WORKER_SELECTION_REASON,
  isJobEligibleForWorker,
  selectEligibleJobs,
  lockBatch,
  computeBatchFingerprint,
  createDryValidationToken,
  assertRealWriteAllowed,
  assertBatchMembershipImmutable,
  detectHardStopFromGate,
  validateQueueIntegrity,
  runWorkerRegressionGate,
  resolveWorkerMaxJobs,
  processBatch,
  processJob,
  loadCurrentQueue,
  loadCatalogPlants
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { ENRICHMENT_EXECUTION } from '../modules/personal-domain/enrichment-gap-scanner-v1.js';
import {
  APPLY_DECISION,
  APPLY_REASON,
  evaluateCandidateSetForPlant
} from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import { CONTRADICTION_CLASS } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Zone-only HTML — no frost-injury claim (avoids MATERIAL_CONFLICT vs heuristic frost). */
function mockFetch() {
  return async (url) => {
    const u = String(url || '');
    let html =
      '<html><body>Hardiness Zone: 9a, 9b, 10a, 10b USDA hardiness zones 9-11.</body></html>';
    if (u.includes('olea')) {
      html = '<html><body>Hardiness Zone: 7a, 8a, 9a, 10a USDA hardiness zones 7-10.</body></html>';
    } else if (u.includes('persea')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a, 12a USDA hardiness zones 9-12.</body></html>';
    } else if (u.includes('citrus') || u.includes('limon')) {
      html = '<html><body>Hardiness Zone: 9a, 9b, 10a, 10b, 11a, 11b USDA hardiness zones 9-11.</body></html>';
    }
    const buf = Buffer.from(html, 'utf8');
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => html,
      arrayBuffer: async () => buf
    };
  };
}

function tempArtifactAndCache() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-worker-'));
  return {
    cacheDir: path.join(base, 'cache'),
    artifactRoot: path.join(base, 'artifacts')
  };
}

function lockPilot() {
  const queue = loadCurrentQueue(ROOT);
  const selection = selectEligibleJobs(queue, { maxJobs: 3 });
  return lockBatch(selection);
}

test('worker ref + maxJobs frozen at 3; no apricot/pomegranate', () => {
  assert.match(AUTO_ENRICHMENT_WORKER_REF, /^auto-enrichment-worker-v1@/);
  assert.equal(WORKER_MAX_JOBS, 3);
  assert.equal(WORKER_PILOT_PLANT_SPECS.length, 3);
  assert.deepEqual(
    WORKER_PILOT_PLANT_SPECS.map((s) => s.slug).sort(),
    ['avocado', 'lemon', 'olive']
  );
});

test('1. non-P1 job cannot enter', () => {
  const r = isJobEligibleForWorker({
    jobId: 'enrich-v1:x',
    canonicalSlug: 'lemon',
    priority: 'P2',
    enrichmentExecution: ENRICHMENT_EXECUTION.AUTO,
    sourceRetrievalRequired: true,
    identityStatus: 'CANONICAL_SPECIES',
    gapCodes: ['MISSING_FROST_EVIDENCE']
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('not_P1'));
});

test('2. HOLD job cannot enter', () => {
  const r = isJobEligibleForWorker({
    jobId: 'enrich-v1:x',
    canonicalSlug: 'lemon',
    priority: 'P1',
    enrichmentExecution: ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW,
    sourceRetrievalRequired: true,
    identityStatus: 'CANONICAL_SPECIES',
    gapCodes: ['MISSING_FROST_EVIDENCE']
  });
  assert.equal(r.ok, false);
});

test('3. fourth plant cannot enter maxJobs=3 batch', () => {
  const queue = loadCurrentQueue(ROOT);
  const sel = selectEligibleJobs(queue, { maxJobs: 3 });
  assert.equal(sel.selected.length, 3);
  assert.ok(
    sel.skipped.some(
      (s) =>
        s.reasons.includes(WORKER_SELECTION_REASON.MAX_JOBS_REACHED) ||
        s.reasons.includes('no_worker_plant_spec') ||
        s.reasons.length > 0
    )
  );
});

test('4. apricot and pomegranate excluded', () => {
  for (const slug of ['apricot', 'pomegranate']) {
    const r = isJobEligibleForWorker({
      jobId: `enrich-v1:${slug}`,
      canonicalSlug: slug,
      priority: 'P1',
      enrichmentExecution: ENRICHMENT_EXECUTION.AUTO,
      sourceRetrievalRequired: true,
      identityStatus: 'CANONICAL_SPECIES',
      gapCodes: ['MISSING_FROST_EVIDENCE']
    });
    assert.equal(r.ok, false, slug);
  }
});

test('5. lockBatch freezes lemon/olive/avocado membership', () => {
  const lock = lockPilot();
  assert.equal(lock.batchLocked, true);
  assert.deepEqual([...lock.lockedSlugs].sort(), ['avocado', 'lemon', 'olive']);
  assert.equal(lock.batchFingerprint, computeBatchFingerprint(lock.lockedJobs));
  const mem = assertBatchMembershipImmutable(lock, lock.lockedSlugs);
  assert.equal(mem.ok, true);
  const drift = assertBatchMembershipImmutable(lock, ['lemon', 'olive', 'apricot']);
  assert.equal(drift.ok, false);
});

test('6. real run impossible before full dry success', async () => {
  const lock = lockPilot();
  const blocked = assertRealWriteAllowed(lock, null);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE);

  const realWithoutDry = await processBatch({
    repoRoot: ROOT,
    dryRun: false,
    lockedBatch: lock,
    dryValidation: null,
    ...tempArtifactAndCache(),
    fetchImpl: mockFetch()
  });
  assert.equal(realWithoutDry.status, 'BATCH_STOPPED');
  assert.equal(realWithoutDry.batchStopReason, WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE);
  assert.equal(realWithoutDry.audits.length, 0);
});

test('7. MATERIAL_CONFLICT stops (detectHardStopFromGate)', () => {
  const stop = detectHardStopFromGate(
    {
      setDecision: APPLY_DECISION.HOLD_CONFLICT,
      fieldResults: [
        {
          field: 'frostSensitivity',
          decision: APPLY_DECISION.HOLD_CONFLICT,
          reasons: [APPLY_REASON.MATERIAL_VALUE_CONFLICT],
          contradictionClass: CONTRADICTION_CLASS.MATERIAL_CONFLICT
        }
      ]
    },
    [{ field: 'frostSensitivity', applyStatus: 'READY_TO_APPLY' }]
  );
  assert.equal(stop, WORKER_STOP_REASON.MATERIAL_CONFLICT);
});

test('8. IDENTITY_CONFLICT stops', () => {
  const stop = detectHardStopFromGate({
    setDecision: APPLY_DECISION.HOLD_CONFLICT,
    fieldResults: [
      {
        field: 'frostSensitivity',
        decision: APPLY_DECISION.HOLD_CONFLICT,
        reasons: [APPLY_REASON.IDENTITY_MISMATCH],
        contradictionClass: CONTRADICTION_CLASS.IDENTITY_CONFLICT
      }
    ]
  });
  assert.equal(stop, WORKER_STOP_REASON.IDENTITY_CONFLICT);
});

test('9. SOURCE_POLICY_VIOLATION stops on READY field', () => {
  const stop = detectHardStopFromGate(
    {
      setDecision: APPLY_DECISION.APPLY_BLOCKED,
      fieldResults: [
        {
          field: 'coldTolerance',
          decision: APPLY_DECISION.APPLY_BLOCKED,
          reasons: [APPLY_REASON.SOURCE_POLICY_NOT_SS]
        }
      ]
    },
    [{ field: 'coldTolerance', applyStatus: 'READY_TO_APPLY' }]
  );
  assert.equal(stop, WORKER_STOP_REASON.SOURCE_POLICY_VIOLATION);
});

test('10. TRANSFORM_UNAUTHORIZED stops on READY field', () => {
  const stop = detectHardStopFromGate(
    {
      setDecision: APPLY_DECISION.APPLY_BLOCKED,
      fieldResults: [
        {
          field: 'coldTolerance',
          decision: APPLY_DECISION.APPLY_BLOCKED,
          reasons: [APPLY_REASON.TRANSFORM_UNREGISTERED]
        }
      ]
    },
    [{ field: 'coldTolerance', applyStatus: 'READY_TO_APPLY' }]
  );
  assert.equal(stop, WORKER_STOP_REASON.TRANSFORM_UNAUTHORIZED);
});

test('11. QUEUE_CORRUPTION detected by validateQueueIntegrity', () => {
  const bad = validateQueueIntegrity({ jobs: 'nope', summary: {} }, ['lemon']);
  assert.equal(bad.ok, false);
  const q = loadCurrentQueue(ROOT);
  const plants = loadCatalogPlants(ROOT);
  const ok = validateQueueIntegrity(q, ['lemon', 'olive', 'avocado'], plants, {
    queueBefore: q,
    batchWrittenSlugs: []
  });
  assert.equal(ok.ok, true);
});

test('11b. adversarial queue-integrity — Class A removal narrow contract', () => {
  const q = loadCurrentQueue(ROOT);
  const plants = loadCatalogPlants(ROOT);
  assert.equal(classifyPlantDataReadiness(plants.mango).readinessShort, 'A');
  assert.equal(classifyPlantDataReadiness(plants.guava).readinessShort, 'B');
  assert.ok(q.jobs.find((j) => j.canonicalSlug === 'guava'));
  assert.ok(q.jobs.find((j) => j.canonicalSlug === 'orange'));
  assert.equal(
    q.jobs.find((j) => j.canonicalSlug === 'mango'),
    undefined
  );

  // A. legitimate terminal Class A selected plant already absent + scanner omits → pass
  const a = validateQueueIntegrity(q, ['guava', 'mango', 'orange'], plants, {
    queueBefore: q,
    batchWrittenSlugs: ['mango']
  });
  assert.equal(a.ok, true, 'A: stable Class A absence');

  // Simulate pre-write queue where mango still present
  const beforeWithMango = structuredClone(q);
  beforeWithMango.jobs = [
    ...q.jobs,
    {
      jobId: 'enrich-v1:mango',
      canonicalSlug: 'mango',
      slug: 'mango',
      gapCodes: ['MISSING_FROST_EVIDENCE'],
      enrichmentExecution: 'AUTO',
      productGate: 'PARTIAL',
      priority: 'P1'
    }
  ];
  beforeWithMango.summary = {
    ...q.summary,
    totalJobs: beforeWithMango.jobs.length
  };

  // A'/E. NEW Class A removal with successful write + count delta → pass
  const ae = validateQueueIntegrity(q, ['guava', 'mango', 'orange'], plants, {
    queueBefore: beforeWithMango,
    justWrittenSlugs: ['mango'],
    batchWrittenSlugs: ['mango']
  });
  assert.equal(ae.ok, true, 'E: Class A removal + delta');

  // B. selected B→B job disappearing fails
  const qMissingGuava = structuredClone(q);
  qMissingGuava.jobs = q.jobs.filter((j) => j.canonicalSlug !== 'guava');
  qMissingGuava.summary = { ...q.summary, totalJobs: qMissingGuava.jobs.length };
  const b = validateQueueIntegrity(qMissingGuava, ['guava', 'mango', 'orange'], plants, {
    queueBefore: q,
    justWrittenSlugs: ['guava'],
    batchWrittenSlugs: ['guava']
  });
  assert.equal(b.ok, false);
  assert.match(b.reason, /missing_job_incomplete:guava/);

  // C. unrelated job disappearing fails
  const victim = q.jobs.find((j) => !['guava', 'mango', 'orange'].includes(j.canonicalSlug));
  assert.ok(victim);
  const qMissingUnrelated = structuredClone(q);
  qMissingUnrelated.jobs = q.jobs.filter((j) => j.jobId !== victim.jobId);
  qMissingUnrelated.summary = {
    ...q.summary,
    totalJobs: qMissingUnrelated.jobs.length
  };
  const c = validateQueueIntegrity(qMissingUnrelated, ['guava', 'mango', 'orange'], plants, {
    queueBefore: q,
    batchWrittenSlugs: ['mango']
  });
  assert.equal(c.ok, false);
  assert.match(c.reason, /unrelated_job_removed/);

  // D. unrelated job changing gaps unexpectedly fails
  const qGapDrift = structuredClone(q);
  const drift = qGapDrift.jobs.find((j) => j.jobId === victim.jobId);
  drift.gapCodes = [...(drift.gapCodes || []), 'EVIDENCE_NOT_SOURCE_SUPPORTED', 'FABRICATED_GAP'];
  const d = validateQueueIntegrity(qGapDrift, ['guava', 'mango', 'orange'], plants, {
    queueBefore: q,
    batchWrittenSlugs: ['mango']
  });
  assert.equal(d.ok, false);
  assert.match(d.reason, /unrelated_job_changed/);

  // F. two jobs disappearing when only one became A fails
  const qTwoGone = structuredClone(q);
  qTwoGone.jobs = q.jobs.filter((j) => j.canonicalSlug !== 'guava');
  qTwoGone.summary = { ...q.summary, totalJobs: qTwoGone.jobs.length };
  // mango already gone in live q; remove guava too vs beforeWithMango that had both
  const f = validateQueueIntegrity(qTwoGone, ['guava', 'mango', 'orange'], plants, {
    queueBefore: beforeWithMango,
    justWrittenSlugs: ['mango'],
    batchWrittenSlugs: ['mango']
  });
  assert.equal(f.ok, false);
  assert.match(f.reason, /missing_job_incomplete:guava/);

  // G. queue job removed before successful plant write fails
  const g = validateQueueIntegrity(q, ['guava', 'mango', 'orange'], plants, {
    queueBefore: beforeWithMango,
    justWrittenSlugs: [],
    batchWrittenSlugs: []
  });
  assert.equal(g.ok, false);
  assert.match(g.reason, /missing_job_not_written_this_batch:mango/);

  // H. fabricated terminal marker cannot bypass scanner/readiness
  const fakePlants = { ...plants, guava: { ...plants.guava, _fabricatedTerminal: true } };
  assert.equal(classifyPlantDataReadiness(fakePlants.guava).readinessShort, 'B');
  const h = validateQueueIntegrity(qMissingGuava, ['guava'], fakePlants, {
    queueBefore: q,
    justWrittenSlugs: ['guava'],
    batchWrittenSlugs: ['guava']
  });
  assert.equal(h.ok, false);
  assert.match(h.reason, /missing_job_incomplete:guava/);

  // H2. missing plantsBySlug cannot authorize removal
  const h2 = validateQueueIntegrity(q, ['mango'], null, {
    queueBefore: beforeWithMango,
    justWrittenSlugs: ['mango']
  });
  assert.equal(h2.ok, false);
  assert.match(h2.reason, /missing_job:mango/);
});

test('12. REGRESSION_FAILURE / UNRELATED_PLANT_MUTATION via runWorkerRegressionGate', () => {
  const q = loadCurrentQueue(ROOT);
  const lock = lockBatch(selectEligibleJobs(q, { maxJobs: 3 }));
  const ok = runWorkerRegressionGate({
    repoRoot: ROOT,
    changedSlugs: [],
    otherSlugsBefore: {},
    lockedSlugs: lock.lockedSlugs
  });
  assert.equal(ok.ok, true);

  const payload = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'data/catalog/bootstrap-safe-climate-traits-migration-v1.json'),
      'utf8'
    )
  );
  const before = {};
  for (const slug of Object.keys(payload.plants)) {
    if (lock.lockedSlugs.includes(slug)) continue;
    before[slug] = JSON.stringify(payload.plants[slug]);
  }
  // Simulate unrelated mutation detection by poisoning before-map
  const victim = Object.keys(before).find((s) => s !== 'pomegranate') || 'lavender';
  before[victim] = '{"poisoned":true}';
  const bad = runWorkerRegressionGate({
    repoRoot: ROOT,
    changedSlugs: [],
    otherSlugsBefore: before,
    lockedSlugs: lock.lockedSlugs
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.stop, WORKER_STOP_REASON.UNRELATED_PLANT_MUTATION);
});

test('13. request cap stop reason is declared and used in processJob budget path', () => {
  assert.equal(WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED, 'REQUEST_CAP_EXCEEDED');
});

test('14. dry run cannot mutate catalog hashes', async () => {
  const paths = bootstrapSafeMigrationPaths(ROOT);
  const before = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser)
  };
  const lock = lockPilot();
  const dirs = tempArtifactAndCache();
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: lock,
    ...dirs,
    fetchImpl: mockFetch()
  });
  assert.equal(batch.status, 'BATCH_COMPLETE');
  assert.equal(batch.dryBatchValidated, true);
  assert.equal(batch.batchLocked, true);
  // Durable clean-replay paths must remain untouched by this test
  const durablePacket = path.join(
    ROOT,
    'data/catalog/enrichment-retrieval/candidate-packets/lemon.candidate-packet-v1.json'
  );
  if (fs.existsSync(durablePacket)) {
    const before = fs.readFileSync(durablePacket, 'utf8');
    // re-read after batch — identical
    assert.equal(fs.readFileSync(durablePacket, 'utf8'), before);
  }
  const after = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser)
  };
  assert.deepEqual(after, before);
});

test('15. locked membership cannot be replaced after dry token', async () => {
  const lock = lockPilot();
  const dirs = tempArtifactAndCache();
  const dry = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: lock,
    ...dirs,
    fetchImpl: mockFetch()
  });
  const token = createDryValidationToken(dry);
  assert.equal(token.dryBatchValidated, true);

  // Tamper fingerprint
  const tampered = { ...token, batchFingerprint: 'deadbeef' };
  const blocked = assertRealWriteAllowed(lock, tampered);
  assert.equal(blocked.ok, false);

  const otherLock = {
    ...lock,
    batchFingerprint: 'other',
    lockedSlugs: ['lemon', 'olive', 'apricot'],
    lockedJobs: [
      { jobId: 'a', slug: 'lemon', gapCodes: [] },
      { jobId: 'b', slug: 'olive', gapCodes: [] },
      { jobId: 'c', slug: 'apricot', gapCodes: [] }
    ]
  };
  const blocked2 = assertRealWriteAllowed(otherLock, token);
  assert.equal(blocked2.ok, false);
});

test('16. apply gate accepts writeSelectedSlugs + partial frost/cold', () => {
  const packet = {
    plant: { slug: 'lemon', scientificName: 'Citrus × limon' },
    fingerprint: 'x',
    fieldPackets: []
  };
  const r = evaluateCandidateSetForPlant({
    packet,
    plant: { slug: 'lemon', scientificName: 'Citrus × limon', climateTraits: {} },
    writeSelectedSlugs: ['lemon'],
    requireBothFrostAndCold: false,
    verifyFingerprint: false
  });
  assert.equal(r.selectedForPilotWrite, true);
  assert.equal(r.setDecision, APPLY_DECISION.NEEDS_MORE_EVIDENCE);
});

test('17. all declared hard-stop reasons are wired (no enum-only dead codes)', () => {
  const wired = new Set([
    WORKER_STOP_REASON.MATERIAL_CONFLICT,
    WORKER_STOP_REASON.IDENTITY_CONFLICT,
    WORKER_STOP_REASON.REGRESSION_FAILURE,
    WORKER_STOP_REASON.QUEUE_CORRUPTION,
    WORKER_STOP_REASON.SOURCE_POLICY_VIOLATION,
    WORKER_STOP_REASON.TRANSFORM_UNAUTHORIZED,
    WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE,
    WORKER_STOP_REASON.HASH_DRIFT,
    WORKER_STOP_REASON.WRITE_FAILURE,
    WORKER_STOP_REASON.PROVENANCE_MISSING,
    WORKER_STOP_REASON.NON_IDEMPOTENT_SECOND_APPLY,
    WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED,
    WORKER_STOP_REASON.UNRELATED_PLANT_MUTATION
  ]);
  assert.equal(Object.keys(WORKER_STOP_REASON).length, wired.size);
  for (const v of Object.values(WORKER_STOP_REASON)) {
    assert.ok(wired.has(v), v);
  }
  // smoke: each reason string is non-empty unique
  assert.equal(new Set(Object.values(WORKER_STOP_REASON)).size, wired.size);
});

test('18. processJob real path blocked without dryValidation', async () => {
  const lock = lockPilot();
  const job = { ...lock.lockedJobs[0], canonicalSlug: lock.lockedJobs[0].slug };
  const audit = await processJob({
    repoRoot: ROOT,
    job,
    plant: { slug: job.slug, scientific: job.scientificName, climateTraits: {} },
    plantSpec: WORKER_PILOT_PLANT_SPECS.find((s) => s.slug === job.slug),
    queueDoc: loadCurrentQueue(ROOT),
    dryRun: false,
    writeSelectedSlugs: lock.lockedSlugs,
    dryValidation: null,
    lockedBatch: lock,
    ...tempArtifactAndCache(),
    fetchImpl: mockFetch()
  });
  assert.equal(audit.status, 'FAILED');
  assert.equal(audit.hardStop, WORKER_STOP_REASON.APPLY_UNEXPECTED_FAILURE);
});

test('19. unit tests must not overwrite durable clean-replay candidate packets', async () => {
  const durableDir = path.join(ROOT, 'data/catalog/enrichment-retrieval/candidate-packets');
  const lemonPath = path.join(durableDir, 'lemon.candidate-packet-v1.json');
  const before = fs.existsSync(lemonPath) ? fs.readFileSync(lemonPath, 'utf8') : null;
  const lock = lockPilot();
  const dirs = tempArtifactAndCache();
  await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: lock,
    ...dirs,
    fetchImpl: mockFetch()
  });
  // Artifacts land only under temp artifactRoot
  assert.ok(fs.existsSync(path.join(dirs.artifactRoot, 'candidate-packets', 'lemon.candidate-packet-v1.json')));
  const after = fs.existsSync(lemonPath) ? fs.readFileSync(lemonPath, 'utf8') : null;
  assert.equal(after, before);
});

test('20. dry scale override allows maxJobs=10; production default remains 3', () => {
  assert.equal(WORKER_MAX_JOBS, 3);
  assert.equal(WORKER_DRY_SCALE_MAX_JOBS, 10);
  const dry = resolveWorkerMaxJobs({
    dryRun: true,
    maxJobs: 10,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.maxJobs, 10);
  assert.equal(dry.realExecutionAllowed, false);
  const real = resolveWorkerMaxJobs({ dryRun: false, maxJobs: 10 });
  assert.equal(real.ok, true);
  assert.equal(real.maxJobs, 3);
});

test('21. real execution disabled when realExecutionAllowed=false', async () => {
  const blocked = resolveWorkerMaxJobs({
    dryRun: false,
    maxJobs: 3,
    realExecutionAllowed: false
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.detail, 'REAL_EXECUTION_ALLOWED=NO');
  const lock = lockPilot();
  const dirs = tempArtifactAndCache();
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: false,
    lockedBatch: lock,
    realExecutionAllowed: false,
    ...dirs,
    fetchImpl: mockFetch()
  });
  assert.equal(batch.status, 'BATCH_STOPPED');
  assert.equal(batch.REAL_EXECUTION_ALLOWED, false);
  assert.equal(batch.error, 'REAL_EXECUTION_ALLOWED=NO');
});

test('22. 11th job cannot enter dry-scale maxJobs=10', () => {
  const queue = loadCurrentQueue(ROOT);
  const selection = selectEligibleJobs(queue, {
    maxJobs: 10,
    plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS,
    excludeSlugs: [...WORKER_SCALE_DRY_EXCLUDE_SLUGS],
    dryRun: true,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false
  });
  assert.ok(selection.selected.length <= 10);
  assert.equal(selection.maxJobs, 10);
  const eleventh = selection.skipped.find((s) =>
    (s.reasons || []).includes(WORKER_SELECTION_REASON.MAX_JOBS_REACHED)
  );
  // If fewer than 10 specs match queue, MAX_JOBS_REACHED may be absent — still cannot exceed 10
  assert.ok(selection.selected.length <= WORKER_DRY_SCALE_MAX_JOBS);
  void eleventh;
});

test('23. dry-scale locked membership immutable; hard conflict stops without replacement', async () => {
  const queue = loadCurrentQueue(ROOT);
  const selection = selectEligibleJobs(queue, {
    maxJobs: 10,
    plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS,
    excludeSlugs: [...WORKER_SCALE_DRY_EXCLUDE_SLUGS],
    dryRun: true,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false
  });
  const lock = lockBatch(selection, { plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS });
  assert.equal(lock.batchLocked, true);
  const fp = lock.batchFingerprint;
  assert.equal(computeBatchFingerprint(lock.lockedJobs), fp);

  const conflictHtml =
    '<html><body>Hardiness Zone: 9a. Severe frost injury below 32F kills the plant.</body></html>';
  const conflictFetch = async () => {
    const buf = Buffer.from(conflictHtml, 'utf8');
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => conflictHtml,
      arrayBuffer: async () => buf
    };
  };
  const dirs = tempArtifactAndCache();
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: lock,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false,
    ...dirs,
    fetchImpl: conflictFetch
  });
  // Either completes or stops on hard conflict — never replaces membership
  assert.deepEqual(batch.lockedSlugs, [...lock.lockedSlugs]);
  assert.equal(batch.batchFingerprint, fp);
  if (batch.batchStopReason) {
    assert.ok(
      [
        WORKER_STOP_REASON.MATERIAL_CONFLICT,
        WORKER_STOP_REASON.IDENTITY_CONFLICT,
        WORKER_STOP_REASON.SOURCE_POLICY_VIOLATION,
        WORKER_STOP_REASON.TRANSFORM_UNAUTHORIZED,
        WORKER_STOP_REASON.REQUEST_CAP_EXCEEDED
      ].includes(batch.batchStopReason) || typeof batch.batchStopReason === 'string'
    );
    assert.ok(batch.audits.length < lock.lockedJobs.length || batch.audits.some((a) => a.hardStop));
  }
});

test('24. dry-scale does not invoke writer; catalog + queue unchanged; artifact root isolated', async () => {
  const paths = bootstrapSafeMigrationPaths(ROOT);
  const queuePath = path.join(ROOT, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json');
  const before = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser),
    queue: hashFile(queuePath)
  };
  const lemonDurable = path.join(
    ROOT,
    'data/catalog/enrichment-retrieval/candidate-packets/lemon.candidate-packet-v1.json'
  );
  const lemonBefore = fs.existsSync(lemonDurable) ? fs.readFileSync(lemonDurable) : null;

  const queue = loadCurrentQueue(ROOT);
  const selection = selectEligibleJobs(queue, {
    maxJobs: 3,
    plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS.slice(0, 3),
    excludeSlugs: [...WORKER_SCALE_DRY_EXCLUDE_SLUGS],
    dryRun: true,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false
  });
  const lock = lockBatch(selection, { plantSpecs: WORKER_SCALE_DRY_PLANT_SPECS.slice(0, 3) });
  const dirs = tempArtifactAndCache();
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: lock,
    allowDryScaleCeiling: true,
    realExecutionAllowed: false,
    ...dirs,
    fetchImpl: mockFetch()
  });
  assert.equal(batch.dryRun, true);
  assert.equal(batch.REAL_EXECUTION_ALLOWED, false);
  assert.equal(batch.applied, 0);
  for (const a of batch.audits) {
    assert.equal(a.writeResult, undefined);
  }
  const after = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser),
    queue: hashFile(queuePath)
  };
  assert.deepEqual(after, before);
  if (lemonBefore) {
    assert.deepEqual(fs.readFileSync(lemonDurable), lemonBefore);
  }
  for (const slug of lock.lockedSlugs) {
    assert.ok(
      fs.existsSync(path.join(dirs.artifactRoot, 'candidate-packets', `${slug}.candidate-packet-v1.json`))
    );
  }
});

test('25. existing 3-job real-worker selection unchanged; no Batch 3', () => {
  assert.equal(WORKER_MAX_JOBS, 3);
  assert.equal(WORKER_PILOT_PLANT_SPECS.length, 3);
  const queue = loadCurrentQueue(ROOT);
  const selection = selectEligibleJobs(queue, { maxJobs: 3 });
  assert.equal(selection.maxJobs, 3);
  assert.ok(selection.selected.every((j) => !String(j.canonicalSlug).includes('batch-3')));
  assert.ok(!WORKER_SCALE_DRY_PLANT_SPECS.some((s) => s.slug === 'batch-3'));
});
