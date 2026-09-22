import {
  S3Client,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import {
  buildPlantVisualQaManifest
} from '../../modules/garden-design/asset-factory-v1/plant-visual-qa-manifest-v1.js';

function env(name) {
  try {
    const value = globalThis.Netlify?.env?.get?.(name);
    if (value) return value;
  } catch {}
  return process.env[name] || '';
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow'
    }
  });
}

function safeId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(id) ? id : '';
}

function safeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function s3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey: env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });
}

async function readJsonObject(client, bucket, key) {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    return JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    if (
      err?.name === 'NoSuchKey'
      || err?.Code === 'NoSuchKey'
      || err?.$metadata?.httpStatusCode === 404
    ) return null;
    throw err;
  }
}

async function loadStaticJson(req, path) {
  const res = await fetch(new URL(path, req.url), {
    headers: { 'cache-control': 'no-cache' }
  });
  if (!res.ok) return null;
  return res.json();
}

function evidenceKey(runId, jobId) {
  return `candidates/${safeSegment(runId)}/evidence/${safeSegment(jobId)}.json`;
}

export default async (req) => {
  if (req.method !== 'GET') {
    return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  }

  const url = new URL(req.url);
  const runId = safeId(url.searchParams.get('runId'));
  if (!runId) return json(400, { ok: false, code: 'RUN_ID_REQUIRED' });

  const execution = await loadStaticJson(
    req,
    '/data/garden-design/plant-visual-production-wave-execution-manifests/' + runId + '.json'
  );
  if (!execution || !Array.isArray(execution.jobs)) {
    return json(404, { ok: false, code: 'EXECUTION_MANIFEST_NOT_FOUND' });
  }

  const anchorRegistry = await loadStaticJson(
    req,
    '/data/garden-design/garden-design-qa-saved-placement-anchor-registry-v1.json'
  );

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((name) => !env(name));
  if (missing.length) {
    return json(500, { ok: false, code: 'ENV_MISSING', missing });
  }

  const client = s3Client();
  const bucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const candidates = [];
  const qaRows = [];
  const missingJobs = [];
  let actualSpendUsd = 0;

  for (const job of execution.jobs) {
    const evidence = await readJsonObject(client, bucket, evidenceKey(runId, job.jobId));
    if (!evidence || evidence.generated !== true) {
      missingJobs.push({
        jobId: job.jobId,
        canonicalSlug: job.canonicalSlug,
        status: evidence?.code || 'NO_GENERATED_EVIDENCE'
      });
      continue;
    }

    const spend = Number(evidence.actualSpendUsd);
    if (Number.isFinite(spend)) actualSpendUsd += spend;

    candidates.push({
      jobId: job.jobId,
      canonicalSlug: job.canonicalSlug,
      scientific: job.scientific || evidence.scientific || null,
      visualForm: job.visualForm || evidence.visualForm || null,
      architectureMode: job.architectureMode || evidence.architectureMode || null,
      growthStage: job.growthStage || evidence.growthStage || 'unspecified',
      phenology: job.phenology || evidence.phenology || 'vegetative',
      objectKey: evidence.objectKey,
      bytes: evidence.bytes,
      sha256: evidence.sha256,
      lineage: runId,
      status: evidence.code || 'R2_GENERATED_VERIFIED',
      sizeAuthorityPlan: {
        state: job.sizeAuthorityState || evidence.sizeAuthorityState || null,
        ownerReviewRequired:
          job.sizeAuthorityOwnerReviewRequired === true
          || evidence.sizeAuthorityOwnerReviewRequired === true,
        reasonCodes:
          job.sizeAuthorityReasonCodes
          || evidence.sizeAuthorityReasonCodes
          || []
      }
    });

    qaRows.push({
      jobId: job.jobId,
      canonicalSlug: job.canonicalSlug,
      scientific: job.scientific || evidence.scientific || null,
      visualForm: job.visualForm || evidence.visualForm || null,
      architectureMode: job.architectureMode || evidence.architectureMode || null,
      growthStage: job.growthStage || evidence.growthStage || 'unspecified',
      phenology: job.phenology || evidence.phenology || 'vegetative',
      sourceStatus: evidence.code || 'R2_GENERATED_VERIFIED',
      technicalQA: evidence.technicalQA?.result || 'UNKNOWN',
      framingQA: evidence.framingQA?.result || 'UNKNOWN',
      technicalMetrics: evidence.technicalQA?.metrics || null,
      botanicalIdentityQA: 'OWNER_REVIEW_REQUIRED',
      architectureQA: 'OWNER_REVIEW_REQUIRED',
      growthStageQA: 'OWNER_REVIEW_REQUIRED',
      phenologyStateQA: 'OWNER_REVIEW_REQUIRED',
      inGardenQA: 'OWNER_REVIEW_REQUIRED',
      sizeAuthorityPlan: {
        state: job.sizeAuthorityState || evidence.sizeAuthorityState || null,
        ownerReviewRequired:
          job.sizeAuthorityOwnerReviewRequired === true
          || evidence.sizeAuthorityOwnerReviewRequired === true,
        reasonCodes:
          job.sizeAuthorityReasonCodes
          || evidence.sizeAuthorityReasonCodes
          || []
      }
    });
  }

  const manifest = buildPlantVisualQaManifest({
    manifestId: 'wave1-2026-09-22-v1',
    batchId: runId,
    generatedAt: '2026-09-22',
    bucket,
    candidates,
    qaRows,
    anchorRegistry: anchorRegistry || { records: [] },
    paidAiCalls: candidates.length
  });

  return json(200, {
    ok: true,
    runId,
    actualSpendUsd: +actualSpendUsd.toFixed(6),
    generatedCandidates: candidates.length,
    missingJobs,
    productionWrites: 0,
    registryWrites: 0,
    manifest
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-wave-qa-manifest'
};
