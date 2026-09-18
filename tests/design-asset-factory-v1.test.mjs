/**
 * Design Asset Factory V1 tests. Zero paid AI. Zero network. Does not write the live registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_ASSET_FACTORY,
  FACTORY_JOB_STATES,
  AUTO_APPROVAL_ELIGIBLE_CRITERIA,
  deriveVariantDemand,
  detectDesignAssetGaps,
  createJobStore,
  upsertNeededJob,
  transitionJob,
  mayRetryJob,
  classifyException,
  buildPromptRecord,
  generateAsset,
  parseSpendEnvelope,
  assertSpendEnvelope,
  inspectTechnicalQa,
  assessIdentityQa,
  estimateScale,
  ownerWorkloadModel,
  buildProposedRegistryRecord,
  STORAGE_PLAN,
  PROPOSED_DB_CHANGES,
  runFactory,
  listFactoryProviders,
  inspectCanonicalCatalog,
  ownedPlantPriorityReport,
  genusEligibilityDelta,
  selectCalibrationBatch,
  replaceBlockedCalibrationJobs,
  classifyIdentityPrecision,
  IDENTITY_PRECISION,
  composeApprovalVerdict,
  assessInGardenQa,
  classifyCutoutIntegration,
  resolveSavedGardenDesignSourcePhoto,
  classifyCalibrationReviewReadiness,
  proposeSafeCalibrationEnvelope,
  estimateCalibrationApiSpend,
  LOCKED_CALIBRATION_SLUGS
} from '../modules/garden-design/asset-factory-v1/index.js';
import {
  loadCanonicalCatalog,
  loadOwnedGardenSignals
} from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { DESIGN_ASSET_PRODUCTION_PIPELINE } from '../modules/garden-design/garden-design-variant-policy-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REGISTRY_PATH = path.join(
  ROOT,
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);
const FACTORY_DIR = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1');
const CLI = path.join(ROOT, 'scripts', 'design-asset-factory-v1.mjs');

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, paint) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = paint(x, y, width, height);
      const i = (y * width + x) * 4;
      rgba[i] = px[0];
      rgba[i + 1] = px[1];
      rgba[i + 2] = px[2];
      rgba[i + 3] = px[3];
    }
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const treePlant = {
  slug: 'fixture-tree',
  canonicalSlug: 'fixture-tree',
  scientific: 'Ficus fixturea',
  tags: ['tree', 'evergreen'],
  growth: 'Evergreen landscape tree'
};
const deciduousPlant = {
  slug: 'fixture-deciduous',
  canonicalSlug: 'fixture-deciduous',
  scientific: 'Malus fixturea',
  tags: ['tree'],
  growth: 'Deciduous fruit tree'
};

test('live autonomous generation remains off; factory is architecture-ready', () => {
  assert.equal(DESIGN_ASSET_PRODUCTION_PIPELINE.autonomousGeneration, false);
  assert.equal(DESIGN_ASSET_FACTORY.autonomousGeneration, false);
  assert.equal(DESIGN_ASSET_FACTORY.generateOnLookup, false);
  assert.equal(DESIGN_ASSET_FACTORY.manualPerPlantWorkflowIsFinal, false);
  assert.equal(AUTO_APPROVAL_ELIGIBLE_CRITERIA.implemented, false);
});

test('variant demand comes from morphology, not a plant-name list', () => {
  const evergreen = deriveVariantDemand(treePlant);
  assert.equal(evergreen.visualForm, 'tree');
  assert.equal(evergreen.requiredVariants.length, 2);
  assert.ok(evergreen.optionalVariants.every((v) => v.required === false));
  const deciduous = deriveVariantDemand(deciduousPlant);
  assert.ok(deciduous.requiredVariants.some((v) => v.phenology === 'dormant'));
  const src = fs.readFileSync(path.join(FACTORY_DIR, 'prompt-factory-v1.js'), 'utf8');
  assert.doesNotMatch(src, /Mango|Olive|olive-tree|Mangifera/);
});

test('gap detector emits required jobs only and skips approved coverage', () => {
  const registry = {
    sets: [
      {
        canonicalSlug: 'fixture-tree',
        variants: [
          {
            growthStage: 'mature',
            phenology: 'vegetative',
            season: 'summer',
            approvalStatus: 'approved',
            transparencyReady: true,
            file: 'x.png',
            status: 'ready'
          }
        ]
      }
    ]
  };
  const gaps = detectDesignAssetGaps([treePlant], registry, {
    ownedCanonicalSlugs: ['fixture-tree']
  });
  assert.equal(gaps.generated, false);
  assert.equal(gaps.jobs.length, 1);
  assert.equal(gaps.jobs[0].growthStage, 'young');
  assert.equal(gaps.jobs[0].required, true);
  assert.equal(gaps.jobs[0].priority, 100);
});

test('job upsert is idempotent and cannot duplicate production identity', () => {
  const store = createJobStore();
  const gaps = detectDesignAssetGaps([treePlant], { sets: [] }).jobs;
  assert.ok(gaps.length >= 2);
  for (const gap of gaps) upsertNeededJob(store, gap);
  const first = upsertNeededJob(store, gaps[0]);
  assert.equal(first.created, false);
  assert.equal(first.duplicatePrevented, true);
  assert.equal(store.byId.size, gaps.length);
});

test('retry is bounded and non-retryable identity failures stay blocked', () => {
  const store = createJobStore();
  const gap = detectDesignAssetGaps([treePlant], { sets: [] }).jobs[0];
  const { job } = upsertNeededJob(store, gap);
  const queued = transitionJob(store, job.jobId, FACTORY_JOB_STATES.QUEUED);
  transitionJob(store, queued.jobId, FACTORY_JOB_STATES.APPROVED_FOR_SPEND);
  const envelope = { maxRetries: 1 };
  assert.equal(mayRetryJob({ ...job, retryCount: 0, qaReasons: ['crop'] }, envelope).ok, true);
  assert.equal(mayRetryJob({ ...job, retryCount: 1, qaReasons: ['crop'] }, envelope).ok, false);
  assert.equal(
    mayRetryJob({ ...job, qaReasons: ['unresolved-genus-species'] }, envelope).ok,
    false
  );
  const ex = classifyException(job, { identityUncertain: true });
  assert.ok(ex.reasons.includes('identity-uncertain'));
});

test('prompt factory records versioned template and does not hard-code species copy', () => {
  const job = detectDesignAssetGaps([treePlant], { sets: [] }).jobs[0];
  job.scientific = treePlant.scientific;
  job.habitModifiers = ['evergreen'];
  const record = buildPromptRecord(job, { provider: 'openai-images-api', model: 'gpt-image-2' });
  assert.equal(record.promptTemplateVersion, 'design-cutout-v1');
  assert.match(record.prompt, /Ficus fixturea/);
  assert.match(record.prompt, /transparent background/);
  assert.doesNotMatch(record.prompt, /\bOlive\b|\bMango\b/);
});

test('spend envelope default-deny and hard limits', () => {
  const denied = parseSpendEnvelope([]);
  assert.equal(denied.defaultDeny, true);
  assert.equal(denied.maxCalls, 0);
  const dry = parseSpendEnvelope(['--dry-run', '--max-calls=120', '--max-jobs=100', '--max-spend-usd=8', '--run-id=x']);
  assert.equal(dry.defaultDeny, true);
  const approved = parseSpendEnvelope([
    '--run-id=run-1',
    '--provider=openai-images-api',
    '--model=gpt-image-2',
    '--max-jobs=2',
    '--max-calls=2',
    '--max-retries=0',
    '--max-spend-usd=0.10'
  ]);
  assert.equal(approved.defaultDeny, false);
  assert.equal(approved.maxCalls, 2);
  assert.throws(
    () => assertSpendEnvelope(denied, { attemptedCalls: 0 }),
    (err) => err.code === 'PAID_SPEND_DENIED'
  );
  assert.throws(
    () =>
      assertSpendEnvelope(approved, {
        attemptedCalls: 2,
        jobsStarted: 0,
        spentUsd: 0,
        billingKeyReadiness: 'UNKNOWN'
      }),
    (err) => err.code === 'PAID_SPEND_CALL_LIMIT'
  );
  assert.throws(
    () =>
      assertSpendEnvelope(approved, {
        attemptedCalls: 0,
        jobsStarted: 2,
        spentUsd: 0,
        billingKeyReadiness: 'UNKNOWN'
      }),
    (err) => err.code === 'PAID_SPEND_JOB_LIMIT'
  );
});

test('generateAsset never networks and refuses without envelope', async () => {
  await assert.rejects(
    () => generateAsset({ jobId: 'x' }, { envelope: parseSpendEnvelope([]), allowNetwork: false }),
    (err) => err.code === 'PAID_SPEND_DENIED'
  );
  const envelope = parseSpendEnvelope([
    '--run-id=run-1',
    '--max-jobs=2',
    '--max-calls=2',
    '--max-spend-usd=8'
  ]);
  await assert.rejects(
    () =>
      generateAsset(
        { jobId: 'x' },
        { envelope, allowNetwork: false, counters: { billingKeyReadiness: 'UNKNOWN' } }
      ),
    (err) => err.code === 'FACTORY_NETWORK_DENIED'
  );
  assert.ok(listFactoryProviders().includes('openai-images-api'));
  assert.ok(listFactoryProviders().includes('replicate'));
});

test('technical QA passes a transparent cutout and fails jpeg / opaque plate', () => {
  const pass = encodeRgbaPng(320, 480, (x, y, w, h) => {
    const inside = x > 60 && x < w - 60 && y > 80 && y < h - 80;
    return inside ? [40, 110, 50, 255] : [0, 0, 0, 0];
  });
  const ok = inspectTechnicalQa(pass);
  assert.equal(ok.result, 'PASS', JSON.stringify(ok));
  const jpeg = inspectTechnicalQa(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  assert.equal(jpeg.result, 'FAIL');
  assert.ok(jpeg.reasons.includes('jpeg-not-allowed'));
  const opaque = encodeRgbaPng(320, 480, () => [255, 255, 255, 255]);
  const bad = inspectTechnicalQa(opaque);
  assert.equal(bad.result, 'FAIL');
  assert.ok(bad.reasons.includes('opaque-rectangular-background'));
});

test('identity QA never auto-approves and does not spend to test identity', () => {
  const job = { canonicalSlug: 'fixture-tree', visualForm: 'tree', growthStage: 'young' };
  const qa = assessIdentityQa(job, treePlant);
  assert.equal(qa.autoApproveEligible, false);
  assert.equal(qa.paidAssessment, false);
  assert.equal(qa.result, 'UNKNOWN');
  const mismatch = assessIdentityQa({ canonicalSlug: 'other' }, treePlant);
  assert.equal(mismatch.result, 'FAIL');
});

test('runner dry-run queues gaps with zero network and does not write registry', () => {
  const before = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const result = runFactory(['--dry-run'], {
    plants: [treePlant],
    registry: { sets: [] }
  });
  assert.equal(result.networkRequests, 0);
  assert.equal(result.imagesGenerated, false);
  assert.equal(result.liveRegistryWritten, false);
  assert.equal(result.blocked, true);
  assert.ok(result.requiredGapCount >= 2);
  assert.equal(fs.readFileSync(REGISTRY_PATH, 'utf8'), before);
});

test('cost and owner models label planning ranges; storage plan is object storage', () => {
  const scale = estimateScale(100);
  assert.equal(scale.expected.qaCostUsd, 0);
  assert.equal(scale.expected.storageCostUsd, 'UNKNOWN');
  assert.equal(scale.expected.source, 'PLANNING_RANGE_NOT_MEASURED');
  assert.ok(scale.expected.generationCostUsd > 0);
  const work = ownerWorkloadModel();
  assert.equal(work.routineOwnerActions, 0);
  assert.equal(STORAGE_PLAN.binaries, 'object-storage-cdn');
  assert.equal(PROPOSED_DB_CHANGES.applyNow, false);
  const rec = buildProposedRegistryRecord({ canonicalSlug: 'fixture-tree', variantKey: 'a', jobId: 'id' });
  assert.equal(rec.urlIsNotIdentity, true);
  assert.equal(rec.approvalStatus, 'candidate');
});

test('CLI --dry-run exits 0, prints preflight, prints no secret', () => {
  const proc = spawnSync(process.execPath, [CLI, '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: 'sk-test-not-a-real-secret-value-0123456789' }
  });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /DESIGN ASSET FACTORY SPEND PREFLIGHT/);
  assert.match(proc.stdout, /default deny: true/);
  assert.doesNotMatch(proc.stdout, /sk-test-not-a-real-secret/);
  assert.match(proc.stdout, /networkRequests": 0/);
  assert.match(proc.stdout, /attemptedPaidCalls": 0/);
});

test('owned priority follows Garden OS rows, not hard-coded plant names', () => {
  const factoryJs = [
    'gap-detector-v1.js',
    'catalog-inspect-v1.js',
    'spend-block-v1.js',
    'catalog-source-v1.js',
    'identity-precision-v1.js',
    'calibration-batch-v1.js'
  ].map((f) => fs.readFileSync(path.join(FACTORY_DIR, f), 'utf8')).join('\n');
  assert.doesNotMatch(factoryJs, /if \(slug === 'mango'\)/);
  assert.doesNotMatch(factoryJs, /if \(slug === 'banana'\)/);
  assert.doesNotMatch(factoryJs, /if \(slug === 'pineapple'\)/);
  const oliveOwned = loadOwnedGardenSignals({
    garden_plants: [{ id: 'gp-olive', profile_slug: 'olive', name: 'Olive' }]
  });
  const inspect = inspectCanonicalCatalog(
    [
      { slug: 'olive', canonicalSlug: 'olive', scientific: 'Olea europaea', tags: ['tree', 'evergreen'], growth: 'Evergreen tree' },
      { slug: 'mango', canonicalSlug: 'mango', scientific: 'Mangifera indica', tags: ['tree', 'evergreen'], growth: 'Evergreen tree' }
    ],
    { sets: [] },
    { ownedCanonicalSlugs: oliveOwned.ownedCanonicalSlugs }
  );
  const olive = inspect.plants.find((p) => p.canonicalSlug === 'olive');
  const mango = inspect.plants.find((p) => p.canonicalSlug === 'mango');
  assert.equal(olive.priorityBand, 'owned-plants');
  assert.equal(olive.priority, 100);
  assert.equal(mango.priorityBand, 'remaining-catalog');
  assert.notEqual(mango.priority, 100);
});

test('genus identity: coherent vegetative form is representable; woody genus stays blocked', () => {
  const clump = {
    slug: 'fixture-genus-clump',
    canonicalSlug: 'fixture-genus-clump',
    scientific: 'Musa spp.',
    identityScope: 'genus',
    tags: ['fruit'],
    growth: 'Fast herbaceous plant with pups'
  };
  const woody = {
    slug: 'fixture-genus-tree',
    canonicalSlug: 'fixture-genus-tree',
    scientific: 'Quercus spp.',
    identityScope: 'genus',
    tags: ['tree'],
    growth: 'Deciduous landscape tree'
  };
  const clumpDemand = deriveVariantDemand(clump);
  const woodyDemand = deriveVariantDemand(woody);
  const veg = clumpDemand.requiredVariants.find((r) => r.phenology === 'vegetative');
  assert.equal(
    classifyIdentityPrecision(clump, clumpDemand, veg).identityPrecision,
    IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE
  );
  assert.equal(classifyIdentityPrecision(clump, clumpDemand, veg).generationEligible, true);
  const treeRole = woodyDemand.requiredVariants.find((r) => r.phenology === 'vegetative');
  assert.equal(
    classifyIdentityPrecision(woody, woodyDemand, treeRole).identityPrecision,
    IDENTITY_PRECISION.GENUS_BLOCKED
  );
  const flowerRole = { growthStage: 'mature', phenology: 'flowering', season: 'season-neutral' };
  assert.equal(
    classifyIdentityPrecision(clump, clumpDemand, flowerRole).identityPrecision,
    IDENTITY_PRECISION.GENUS_BLOCKED
  );
  const src = fs.readFileSync(path.join(FACTORY_DIR, 'identity-precision-v1.js'), 'utf8');
  assert.doesNotMatch(src, /if \(slug === 'banana'\)/);
});

test('real catalog inspect: olive coverage, genus banana representable, candidates not approved', () => {
  const catalog = loadCanonicalCatalog(ROOT);
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const owned = loadOwnedGardenSignals(
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'garden-os', 'mojstrana-owned-plants-v1.json'), 'utf8')
    )
  );
  const inspect = inspectCanonicalCatalog(catalog.plants, registry, {
    ownedCanonicalSlugs: owned.ownedCanonicalSlugs,
    gardenDesignSurfacedSlugs: registry.sets.map((s) => s.canonicalSlug)
  });
  assert.ok(inspect.totals.canonicalPlantsInspected > 50);
  const olive = inspect.plants.find((p) => p.canonicalSlug === 'olive');
  assert.equal(olive.approvedRequiredCount, 1);
  assert.ok(olive.missingRequiredCount >= 1);
  assert.equal(olive.designReady, false);
  const banana = inspect.plants.find((p) => p.canonicalSlug === 'banana');
  assert.equal(banana.identityPrecision, IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE);
  assert.equal(banana.spendBlocked, false);
  assert.ok(inspect.eligibleJobs.some((j) => j.canonicalSlug === 'banana'));
  const bougainvillea = inspect.plants.find((p) => p.canonicalSlug === 'bougainvillea');
  assert.equal(bougainvillea.identityPrecision, IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE);
  const ownedReport = ownedPlantPriorityReport(inspect, owned);
  assert.deepEqual(
    ownedReport.map((r) => r.canonicalSlug).sort(),
    ['banana', 'mango', 'pineapple']
  );
  assert.ok(ownedReport.every((r) => r.priorityComponents.hardCodedNameBoost === false));
  assert.ok(ownedReport.every((r) => r.priorityBand === 'owned-plants'));
  const batch = selectCalibrationBatch(inspect.eligibleJobs, 8);
  assert.equal(batch.length, 8);
  assert.equal(new Set(batch.map((j) => j.visualForm)).size, 8);
  assert.equal(composeApprovalVerdict('PASS', 'UNKNOWN').approvalEligible, false);
  assert.equal(assessInGardenQa({ generated: false }).result, 'BLOCKED');
  assert.equal(
    assessInGardenQa({ generated: false, realSavedGardenPhotoReady: true }).result,
    'UNKNOWN'
  );
  assert.equal(batch.map((j) => j.canonicalSlug).join(','), LOCKED_CALIBRATION_SLUGS.join(','));
  const delta = genusEligibilityDelta(inspect);
  assert.ok(delta.newlyEligibleGenusNeutralPlants.some((p) => p.canonicalSlug === 'banana'));
  assert.equal(
    (registry.sets || []).some((s) =>
      (s.variants || []).some((v) => String(v.file || '').includes('batch-1-candidates'))
    ),
    false
  );
  assert.ok(inspect.eligibleJobs.every((j) => j.required === true));
  assert.equal(inspect.totals.cartesianExplosionAvoided, true);
});

test('real saved garden photo is required; local stand-ins are not a silent fallback', () => {
  const missing = resolveSavedGardenDesignSourcePhoto({});
  assert.equal(missing.status, 'BLOCKED');
  const local = resolveSavedGardenDesignSourcePhoto({
    sourceMediaId: '11111111-1111-1111-1111-111111111111',
    sourceMediaUrl: 'homepage-v1/assets/hero-garden.jpg'
  });
  assert.equal(local.status, 'BLOCKED');
  const copied = resolveSavedGardenDesignSourcePhoto({
    sourceMediaId: '11111111-1111-1111-1111-111111111111',
    sourceMediaUrl: 'https://signed.example/user-garden-media/x',
    copyToRepo: true
  });
  assert.equal(copied.status, 'BLOCKED');
  const ready = resolveSavedGardenDesignSourcePhoto({
    sourceMediaId: '11111111-1111-1111-1111-111111111111',
    sourceMediaUrl: 'https://signed.example/user-garden-media/x?token=1'
  });
  assert.equal(ready.status, 'READY');
  const blockedReview = classifyCalibrationReviewReadiness({});
  assert.equal(blockedReview.status, 'BLOCKED');
  assert.equal(blockedReview.sufficientForInGardenQa, false);
  assert.equal(blockedReview.silentLocalFallback, false);
});

test('evidence-quality block auto-replaces from a missing morphology class', () => {
  const jobs = [
    { canonicalSlug: 'mango', visualForm: 'tree', growthStage: 'mature', phenology: 'vegetative', priority: 100, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'lavender', visualForm: 'shrub', growthStage: 'mature', phenology: 'vegetative', priority: 60, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'pineapple', visualForm: 'rosette', growthStage: 'mature', phenology: 'vegetative', priority: 100, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'banana', visualForm: 'herbaceous-clump', growthStage: 'mature', phenology: 'vegetative', priority: 100, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'GENUS_VISUALLY_REPRESENTABLE' },
    { canonicalSlug: 'areca-palm', visualForm: 'palm', growthStage: 'mature', phenology: 'vegetative', priority: 10, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'bougainvillea', visualForm: 'climber', growthStage: 'mature', phenology: 'vegetative', priority: 60, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'GENUS_VISUALLY_REPRESENTABLE' },
    { canonicalSlug: 'aloe-vera', visualForm: 'succulent-form', growthStage: 'mature', phenology: 'vegetative', priority: 10, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'eggplant', visualForm: 'subshrub', growthStage: 'mature', phenology: 'vegetative', priority: 10, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'lemon-grass', visualForm: 'grass-like', growthStage: 'mature', phenology: 'vegetative', priority: 10, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' },
    { canonicalSlug: 'other-tree', visualForm: 'tree', growthStage: 'mature', phenology: 'vegetative', priority: 10, morphologyAuthority: 'canonical_growth_metadata', identityPrecision: 'SPECIES_SUPPORTED' }
  ];
  const batch = selectCalibrationBatch(jobs, 8);
  assert.deepEqual(batch.map((j) => j.canonicalSlug), LOCKED_CALIBRATION_SLUGS);
  const replaced = replaceBlockedCalibrationJobs(batch, jobs, ['mango']);
  assert.equal(replaced.length, 8);
  assert.equal(replaced.some((j) => j.canonicalSlug === 'mango'), false);
  assert.equal(replaced.some((j) => j.canonicalSlug === 'other-tree'), false);
  assert.ok(replaced.some((j) => j.canonicalSlug === 'lemon-grass' && j.visualForm === 'grass-like'));
  assert.equal(new Set(replaced.map((j) => j.visualForm)).size, 8);
});

test('spend gate uses total API spend; $0.50 is not a safe 12-call cap', () => {
  const spend = estimateCalibrationApiSpend();
  assert.equal(spend.rejectedMaxSpendUsd, 0.5);
  assert.ok(spend.expectedTotalApiSpendUsdAtMaxCalls > 0.5);
  assert.equal(spend.maxSpendUsd, 1.5);
  assert.equal(spend.authorized, false);
  const proposed = proposeSafeCalibrationEnvelope();
  assert.equal(proposed.approved, false);
  assert.equal(proposed.maxSpendUsd, 1.5);
  const halfDollar = parseSpendEnvelope([
    '--run-id=run-1',
    '--max-jobs=8',
    '--max-calls=12',
    '--max-spend-usd=0.50'
  ]);
  assert.throws(
    () =>
      assertSpendEnvelope(halfDollar, {
        attemptedCalls: 0,
        jobsStarted: 0,
        spentUsd: 0.492,
        billingKeyReadiness: 'UNKNOWN'
      }),
    (err) => err.code === 'PAID_SPEND_USD_LIMIT'
  );
  assert.equal(classifyCutoutIntegration({ ASSET_QA: 'PASS', IN_GARDEN_QA: 'PASS' }), 'RAW_PASS');
  assert.equal(
    classifyCutoutIntegration({
      ASSET_QA: 'PASS',
      IN_GARDEN_QA: 'FAIL',
      reasonCodes: ['STICKER_LOOK']
    }),
    'RUNTIME_BLEND_REQUIRED'
  );
  assert.equal(
    classifyCutoutIntegration({
      ASSET_QA: 'PASS',
      IN_GARDEN_QA: 'FAIL',
      reasonCodes: ['FLOATING']
    }),
    'FAIL'
  );
});
