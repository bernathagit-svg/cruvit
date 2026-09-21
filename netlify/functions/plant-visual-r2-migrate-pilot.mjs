import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const RUN_ID = 'pilot-migration-2026-09-21-v1';

const ITEMS = Object.freeze([
  {
    jobId: 'banana__young__default__vegetative__v1',
    canonicalSlug: 'banana',
    sourceType: 'site-static',
    sourcePath: '/modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/banana__young__default__vegetative__v1.png',
    expectedSha256: null,
    expectedBytes: 1498667,
    lineage: 'visual-state-calibration-batch-2'
  },
  {
    jobId: 'mango__young__tree__vegetative__v1',
    canonicalSlug: 'mango',
    sourceType: 'netlify-blob',
    blobStore: 'cruvit-plant-visual-approved-pilot',
    blobKey: '2026-09-21-retry-v2/mango__young__tree__vegetative__v1.png',
    expectedSha256: 'ea86bfc3c56e79dcf081a9b5cfb45d50be48c3b19d736c0ae31e4786e6816f2a',
    expectedBytes: 2009221,
    lineage: 'plant-visual-owned-retry-pilot-v2'
  },
  {
    jobId: 'pineapple__mature__default__fruiting__v1',
    canonicalSlug: 'pineapple',
    sourceType: 'netlify-blob',
    blobStore: 'cruvit-plant-visual-approved-pilot',
    blobKey: '2026-09-21-retry-v2/pineapple__mature__default__fruiting__v1.png',
    expectedSha256: '4621a27684d852ef3f28c7fd16505ef28351f260d3bae912802d8809ac17ceef',
    expectedBytes: 2340288,
    lineage: 'plant-visual-owned-retry-pilot-v2'
  },
  {
    jobId: 'mango__mature__tree__fruiting__v1',
    canonicalSlug: 'mango',
    sourceType: 'netlify-blob',
    blobStore: 'cruvit-plant-visual-approved-pilot',
    blobKey: '2026-09-21-mango-fruiting-v3/mango__mature__tree__fruiting__v1.png',
    expectedSha256: '85718e325a3f65a8d3701dc66dfef36f2c3ff17ffcf9267e851dcb801384fa12',
    expectedBytes: 2638119,
    lineage: 'plant-visual-mango-fruiting-v3'
  }
]);

function env(name) {
  return Netlify.env.get(name) || '';
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safe(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function candidateKey(item, sha) {
  return `candidates/${RUN_ID}/${safe(item.canonicalSlug)}/${safe(item.jobId)}__${sha}.png`;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function blobBytes(item) {
  const store = getStore(item.blobStore, { consistency: 'strong' });
  const out = await store.getWithMetadata(item.blobKey, { type: 'arrayBuffer' });
  if (!out?.data) throw new Error('SOURCE_BLOB_NOT_FOUND:' + item.jobId);
  return Buffer.from(out.data);
}

async function siteBytes(item, req) {
  const u = new URL(item.sourcePath, req.url);
  const res = await fetch(u);
  if (!res.ok) throw new Error('SOURCE_SITE_FETCH_FAILED:' + item.jobId + ':' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function readR2Bytes(client, bucket, key) {
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await out.Body.transformToByteArray());
}

export default async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const url = new URL(req.url);
  const nonce = env('CRUVIT_R2_BOOTSTRAP_NONCE');
  if (!nonce || url.searchParams.get('nonce') !== nonce) {
    return json(403, { ok: false, code: 'NONCE_DENIED' });
  }

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((k) => !env(k));
  if (missing.length) return json(500, { ok: false, code: 'ENV_MISSING', missing });

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey: env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });

  const bucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const rows = [];

  for (const item of ITEMS) {
    try {
      const bytes = item.sourceType === 'netlify-blob'
        ? await blobBytes(item)
        : await siteBytes(item, req);

      const sourceSha = sha256(bytes);
      if (item.expectedBytes && bytes.length !== item.expectedBytes) {
        rows.push({
          jobId: item.jobId,
          ok: false,
          code: 'SOURCE_BYTES_MISMATCH',
          expectedBytes: item.expectedBytes,
          actualBytes: bytes.length
        });
        continue;
      }
      if (item.expectedSha256 && sourceSha !== item.expectedSha256) {
        rows.push({
          jobId: item.jobId,
          ok: false,
          code: 'SOURCE_SHA_MISMATCH',
          expectedSha256: item.expectedSha256,
          actualSha256: sourceSha
        });
        continue;
      }

      const key = candidateKey(item, sourceSha);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: 'image/png',
        CacheControl: 'private, no-store',
        Metadata: {
          'cruvit-job-id': item.jobId,
          'cruvit-run-id': RUN_ID,
          'cruvit-lineage': item.lineage,
          'sha256': sourceSha
        }
      }));

      const remoteBytes = await readR2Bytes(client, bucket, key);
      const remoteSha = sha256(remoteBytes);
      const verified = remoteBytes.length === bytes.length && remoteSha === sourceSha;

      rows.push({
        jobId: item.jobId,
        canonicalSlug: item.canonicalSlug,
        ok: verified,
        code: verified ? 'COPIED_AND_VERIFIED' : 'REMOTE_VERIFY_FAILED',
        objectKey: key,
        bytes: bytes.length,
        sha256: sourceSha,
        sourceType: item.sourceType,
        lineage: item.lineage
      });
    } catch (err) {
      rows.push({
        jobId: item.jobId,
        ok: false,
        code: 'MIGRATION_FAILED',
        errorName: err?.name || null,
        error: String(err?.message || err)
      });
    }
  }

  return json(200, {
    ok: rows.every((r) => r.ok),
    code: rows.every((r) => r.ok)
      ? 'PILOT_CANDIDATE_R2_MIGRATION_VERIFIED'
      : 'PILOT_CANDIDATE_R2_MIGRATION_INCOMPLETE',
    runId: RUN_ID,
    bucket,
    rows,
    productionBucketWrites: 0,
    registryWrites: 0,
    paidGenerationCalls: 0,
    secretsExposed: false
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-r2-migrate-pilot'
};
