import crypto from 'node:crypto';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import {
  planDesignAssetGeneration
} from '../../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import {
  postOpenAiImagesJson,
  OPENAI_IMAGES_GENERATIONS_URL
} from '../../modules/garden-design/asset-factory-v1/openai-images-http-v1.js';
import {
  inspectTechnicalQa
} from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import {
  assessProductionFramingQa
} from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import {
  actualSpendUsdFromUsage
} from '../../modules/garden-design/asset-factory-v1/total-api-cost-v1.js';

const MANIFEST_CONTRACT = 'plant-visual-production-wave-execution-manifest-v1';
const APPROVAL_CONTRACT = 'plant-visual-production-wave-spend-approval-v1';

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

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function projectedCallUsd(quality) {
  return quality === 'high' ? 0.364 : 0.091;
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

async function readBytes(client, bucket, key) {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  } catch (err) {
    if (
      err?.name === 'NoSuchKey'
      || err?.Code === 'NoSuchKey'
      || err?.$metadata?.httpStatusCode === 404
    ) return null;
    throw err;
  }
}

async function readJsonObject(client, bucket, key) {
  const bytes = await readBytes(client, bucket, key);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

async function putJson(client, bucket, key, body) {
  const bytes = Buffer.from(JSON.stringify(body, null, 2));
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bytes,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'private, no-store'
  }));
}

async function loadStaticJson(req, relativePath) {
  const url = new URL(relativePath, req.url);
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return null;
  return res.json();
}

async function loadManifest(req, runId) {
  const doc = await loadStaticJson(
    req,
    '/data/garden-design/plant-visual-production-wave-execution-manifests/' + runId + '.json'
  );
  if (
    !doc
    || doc.contract !== MANIFEST_CONTRACT
    || doc.runId !== runId
    || !Array.isArray(doc.jobs)
    || doc.jobs.length !== Number(doc.jobCount)
  ) return null;
  return doc;
}

async function loadApproval(req, runId) {
  const doc = await loadStaticJson(
    req,
    '/data/garden-design/plant-visual-production-wave-spend-approvals/' + runId + '.json'
  );
  if (!doc || doc.contract !== APPROVAL_CONTRACT || doc.runId !== runId) return null;
  return doc;
}

function approvalAuthorizesManifest(approval, manifest) {
  if (!approval || !manifest) return false;
  if (approval.approved !== true) return false;
  if (approval.provider !== manifest.executionPolicy?.provider) return false;
  if (approval.model !== manifest.executionPolicy?.model) return false;
  if (Number(approval.maxCalls) !== Number(manifest.jobCount)) return false;
  if (Number(approval.maxRetries) !== 0) return false;
  if (
    Number(approval.maxSpendUsd) + 1e-9
    < Number(manifest.spendPreflight?.projectedMaximumSpendUsd || 0)
  ) return false;

  const approvedJobs = Array.isArray(approval.jobIds) ? approval.jobIds : [];
  const manifestJobs = manifest.jobs.map((row) => row.jobId);
  if (approvedJobs.length !== manifestJobs.length) return false;
  const set = new Set(approvedJobs);
  if (!manifestJobs.every((jobId) => set.has(jobId))) return false;

  const actions = new Set(Array.isArray(approval.allowedActions) ? approval.allowedActions : []);
  const required = [
    'generate exact approved Wave 1 candidate jobs',
    'write generated PNGs only to candidate R2',
    'write generation and technical QA evidence only to candidate R2'
  ];
  if (!required.every((action) => actions.has(action))) return false;
  if (approval.productionWritesAllowed !== false) return false;
  if (approval.registryWritesAllowed !== false) return false;
  return true;
}

function evidenceKey(runId, jobId) {
  return `candidates/${safeSegment(runId)}/evidence/${safeSegment(jobId)}.json`;
}

function lockKey(runId, jobId) {
  return `candidates/${safeSegment(runId)}/locks/${safeSegment(jobId)}.json`;
}

async function claimJob(client, bucket, runId, jobId) {
  const key = lockKey(runId, jobId);
  const existing = await readJsonObject(client, bucket, key);
  if (existing) return { ok: false, key, existing };
  const body = {
    contract: 'plant-visual-wave-job-lock-v1',
    runId,
    jobId,
    claimedAt: new Date().toISOString(),
    retryAllowed: false
  };
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(JSON.stringify(body)),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'private, no-store',
      IfNoneMatch: '*'
    }));
    return { ok: true, key };
  } catch (err) {
    if (
      err?.name === 'PreconditionFailed'
      || err?.$metadata?.httpStatusCode === 412
    ) {
      return { ok: false, key, existing: await readJsonObject(client, bucket, key) };
    }
    throw err;
  }
}

async function persistEvidence(client, bucket, runId, jobId, evidence) {
  await putJson(client, bucket, evidenceKey(runId, jobId), evidence);
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'JSON_BODY_REQUIRED' });
  }

  const runId = safeId(body.runId);
  const jobId = safeId(body.jobId);
  if (!runId || !jobId) {
    return json(400, { ok: false, code: 'RUN_ID_AND_JOB_ID_REQUIRED' });
  }

  const manifest = await loadManifest(req, runId);
  if (!manifest) {
    return json(404, { ok: false, code: 'EXECUTION_MANIFEST_NOT_FOUND', runId });
  }

  const job = manifest.jobs.find((row) => row.jobId === jobId);
  if (!job) {
    return json(404, { ok: false, code: 'JOB_NOT_IN_APPROVED_WAVE', runId, jobId });
  }

  const approval = await loadApproval(req, runId);
  if (!approvalAuthorizesManifest(approval, manifest)) {
    return json(403, {
      ok: false,
      code: 'PAID_SPEND_OWNER_APPROVAL_REQUIRED',
      runId,
      jobId,
      projectedMaximumSpendUsd: manifest.spendPreflight?.projectedMaximumSpendUsd || null
    });
  }

  const requiredEnv = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = requiredEnv.filter((name) => !env(name));
  const apiKey = env('OPENAI_KEY') || env('OPENAI_API_KEY');
  if (!apiKey) missing.push('OPENAI_KEY_OR_OPENAI_API_KEY');
  if (missing.length) {
    return json(500, { ok: false, code: 'ENV_MISSING', missing });
  }

  const client = s3Client();
  const bucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const existingEvidence = await readJsonObject(client, bucket, evidenceKey(runId, jobId));
  if (existingEvidence) {
    return json(200, {
      ok: existingEvidence.generated === true,
      code: 'JOB_ALREADY_HAS_EVIDENCE',
      runId,
      jobId,
      evidence: existingEvidence
    });
  }

  const claim = await claimJob(client, bucket, runId, jobId);
  if (!claim.ok) {
    return json(409, { ok: false, code: 'JOB_ALREADY_CLAIMED', runId, jobId });
  }

  const qualityPlan = planDesignAssetGeneration({
    ...job,
    phenologyState: job.phenology,
    detailClass: job.detailClass
  });
  if (
    qualityPlan.quality !== job.quality
    || qualityPlan.detailClass !== job.detailClass
  ) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'MANIFEST_PLANNER_DRIFT',
      expected: { quality: job.quality, detailClass: job.detailClass },
      actual: { quality: qualityPlan.quality, detailClass: qualityPlan.detailClass },
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(409, { ok: false, ...evidence });
  }

  const prompt = String(qualityPlan.promptRecord?.prompt || '');
  if (!prompt) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'PROMPT_MISSING',
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(409, { ok: false, ...evidence });
  }

  const projectedUsd = projectedCallUsd(job.quality);
  let providerResult;
  try {
    providerResult = await postOpenAiImagesJson(
      OPENAI_IMAGES_GENERATIONS_URL,
      apiKey,
      {
        model: manifest.executionPolicy.model,
        prompt,
        size: '1024x1536',
        quality: job.quality,
        background: 'transparent',
        output_format: 'png',
        n: 1
      }
    );
  } catch (err) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'PROVIDER_REQUEST_FAILURE',
      providerErrorName: err?.name || null,
      projectedUsd,
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(502, { ok: false, ...evidence });
  }

  const b64 = providerResult?.body?.data?.[0]?.b64_json || null;
  const providerOk =
    Number(providerResult?.status || 0) >= 200
    && Number(providerResult?.status || 0) < 300
    && Boolean(b64);
  const usage = providerResult?.body?.usage || null;
  const actualSpendUsd = actualSpendUsdFromUsage(usage);

  if (!providerOk) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'GENERATION_FAILED',
      httpStatus: providerResult?.status || null,
      projectedUsd,
      actualSpendUsd,
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(502, { ok: false, ...evidence });
  }

  const bytes = Buffer.from(b64, 'base64');
  const digest = sha256(bytes);
  const technicalQA = inspectTechnicalQa(bytes);
  const framingQA = assessProductionFramingQa(technicalQA);
  const assetId = job.jobId;
  const objectKey =
    `candidates/${safeSegment(runId)}/${safeSegment(job.canonicalSlug)}/`
    + `${safeSegment(assetId)}__${digest}.png`;

  const existing = await readBytes(client, bucket, objectKey);
  if (existing && (existing.length !== bytes.length || sha256(existing) !== digest)) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'IMMUTABLE_CANDIDATE_KEY_CONFLICT',
      objectKey,
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(409, { ok: false, ...evidence });
  }

  if (!existing) {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: 'image/png',
      CacheControl: 'private, no-store',
      Metadata: {
        'cruvit-run-id': runId,
        'cruvit-job-id': jobId,
        'cruvit-sha256': digest
      }
    }));
  }

  const readback = await readBytes(client, bucket, objectKey);
  if (!readback || readback.length !== bytes.length || sha256(readback) !== digest) {
    const evidence = {
      contract: 'plant-visual-wave-job-evidence-v1',
      runId,
      jobId,
      generated: false,
      code: 'CANDIDATE_READBACK_INTEGRITY_MISMATCH',
      objectKey,
      recordedAt: new Date().toISOString()
    };
    await persistEvidence(client, bucket, runId, jobId, evidence);
    return json(409, { ok: false, ...evidence });
  }

  const evidence = {
    contract: 'plant-visual-wave-job-evidence-v1',
    runId,
    jobId,
    canonicalSlug: job.canonicalSlug,
    scientific: job.scientific,
    identityScope: job.identityScope,
    visualForm: job.visualForm,
    architectureMode: job.architectureMode,
    growthStage: job.growthStage,
    phenology: job.phenology,
    quality: job.quality,
    detailClass: job.detailClass,
    sizeAuthorityState: job.sizeAuthorityState,
    sizeAuthorityOwnerReviewRequired: job.sizeAuthorityOwnerReviewRequired,
    sizeAuthorityReasonCodes: job.sizeAuthorityReasonCodes || [],
    generated: true,
    code: 'CANDIDATE_GENERATED_AND_R2_VERIFIED',
    objectKey,
    bytes: bytes.length,
    sha256: digest,
    promptTemplateVersion: qualityPlan.promptTemplateVersion,
    promptSha256: sha256(Buffer.from(prompt)),
    provider: manifest.executionPolicy.provider,
    model: manifest.executionPolicy.model,
    technicalQA,
    framingQA,
    projectedUsd,
    actualSpendUsd,
    usage,
    productionWrites: 0,
    registryWrites: 0,
    recordedAt: new Date().toISOString()
  };
  await persistEvidence(client, bucket, runId, jobId, evidence);

  return json(200, {
    ok: true,
    code: evidence.code,
    runId,
    jobId,
    objectKey,
    bytes: evidence.bytes,
    sha256: evidence.sha256,
    technicalQA: evidence.technicalQA,
    framingQA: evidence.framingQA,
    projectedUsd,
    actualSpendUsd,
    productionWrites: 0,
    registryWrites: 0
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-generate-wave-job'
};
