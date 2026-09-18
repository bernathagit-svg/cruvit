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
  listFactoryProviders
} from '../modules/garden-design/asset-factory-v1/index.js';
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
});
