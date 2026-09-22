import {
  S3Client,
  GetObjectCommand
} from '@aws-sdk/client-s3';

const MANIFEST_CONTRACT = 'plant-visual-production-wave-execution-manifest-v1';

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

async function loadManifest(req, runId) {
  const url = new URL(
    '/data/garden-design/plant-visual-production-wave-execution-manifests/' + runId + '.json',
    req.url
  );
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return null;
  const doc = await res.json();
  if (
    !doc
    || doc.contract !== MANIFEST_CONTRACT
    || doc.runId !== runId
    || !Array.isArray(doc.jobs)
  ) return null;
  return doc;
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

  const manifest = await loadManifest(req, runId);
  if (!manifest) {
    return json(404, { ok: false, code: 'EXECUTION_MANIFEST_NOT_FOUND', runId });
  }

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((name) => !env(name));
  if (missing.length) return json(500, { ok: false, code: 'ENV_MISSING', missing });

  const client = s3Client();
  const bucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const rows = [];
  let actualSpendUsd = 0;

  for (const job of manifest.jobs) {
    const evidence = await readJsonObject(client, bucket, evidenceKey(runId, job.jobId));
    if (!evidence) {
      rows.push({
        jobId: job.jobId,
        canonicalSlug: job.canonicalSlug,
        status: 'PENDING',
        generated: false
      });
      continue;
    }
    const spend = Number(evidence.actualSpendUsd);
    if (Number.isFinite(spend)) actualSpendUsd += spend;
    rows.push({
      jobId: job.jobId,
      canonicalSlug: job.canonicalSlug,
      status: evidence.generated === true ? 'GENERATED' : 'FAILED_OR_BLOCKED',
      generated: evidence.generated === true,
      code: evidence.code || null,
      objectKey: evidence.objectKey || null,
      sha256: evidence.sha256 || null,
      bytes: evidence.bytes || null,
      technicalQA: evidence.technicalQA?.result || null,
      framingQA: evidence.framingQA?.result || null,
      quality: evidence.quality || job.quality,
      actualSpendUsd: Number.isFinite(spend) ? spend : null
    });
  }

  return json(200, {
    ok: true,
    runId,
    jobCount: manifest.jobCount,
    generated: rows.filter((row) => row.generated).length,
    pending: rows.filter((row) => row.status === 'PENDING').length,
    failedOrBlocked: rows.filter((row) => row.status === 'FAILED_OR_BLOCKED').length,
    technicalPass: rows.filter((row) => row.technicalQA === 'PASS').length,
    framingPass: rows.filter((row) => row.framingQA === 'PASS').length,
    actualSpendUsd: +actualSpendUsd.toFixed(6),
    productionWrites: 0,
    registryWrites: 0,
    rows
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-wave-status'
};
