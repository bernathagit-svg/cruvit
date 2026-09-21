import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name) {
  return Netlify.env.get(name) || '';
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

function safeManifestId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id) ? id : '';
}

function safeJobId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,180}$/.test(id) ? id : '';
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
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

async function loadManifest(req, manifestId) {
  const url = new URL(
    '/data/garden-design/plant-visual-qa-manifests/' + manifestId + '.json',
    req.url
  );
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    const err = new Error('QA_MANIFEST_NOT_FOUND');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data || data.contract !== 'plant-visual-qa-manifest-v1' || data.manifestId !== manifestId) {
    const err = new Error('QA_MANIFEST_INVALID');
    err.status = 422;
    throw err;
  }
  return data;
}

export default async (req) => {
  if (req.method !== 'GET') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((key) => !env(key));
  if (missing.length) return json(500, { ok: false, code: 'ENV_MISSING', missing });

  const url = new URL(req.url);
  const manifestId = safeManifestId(url.searchParams.get('manifest'));
  const jobId = safeJobId(url.searchParams.get('job'));
  if (!manifestId || !jobId) {
    return json(400, { ok: false, code: 'MANIFEST_AND_JOB_REQUIRED' });
  }

  let manifest;
  try {
    manifest = await loadManifest(req, manifestId);
  } catch (err) {
    return json(err?.status || 404, {
      ok: false,
      code: err?.message || 'QA_MANIFEST_LOAD_FAILED'
    });
  }

  const row = (manifest.rows || []).find((item) => item?.jobId === jobId);
  if (!row || !row.objectKey || !row.sha256) {
    return json(404, { ok: false, code: 'JOB_NOT_IN_QA_MANIFEST', manifestId, jobId });
  }
  if (!String(row.objectKey).startsWith('candidates/')) {
    return json(422, { ok: false, code: 'NON_CANDIDATE_OBJECT_FORBIDDEN', manifestId, jobId });
  }

  try {
    const out = await s3Client().send(new GetObjectCommand({
      Bucket: env('PLANT_VISUAL_R2_CANDIDATES_BUCKET'),
      Key: row.objectKey
    }));
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    const actualSha = sha256(bytes);

    if (Number(row.bytes) > 0 && bytes.length !== Number(row.bytes)) {
      return json(409, {
        ok: false,
        code: 'QA_CANDIDATE_BYTES_MISMATCH',
        manifestId,
        jobId
      });
    }
    if (actualSha !== String(row.sha256)) {
      return json(409, {
        ok: false,
        code: 'QA_CANDIDATE_SHA_MISMATCH',
        manifestId,
        jobId
      });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
        'x-cruvit-qa-manifest': manifestId,
        'x-cruvit-job-id': jobId
      }
    });
  } catch (err) {
    return json(502, {
      ok: false,
      code: 'R2_READ_FAILED',
      manifestId,
      jobId,
      errorName: err?.name || null
    });
  }
};

export const config = {
  path: '/.netlify/functions/plant-visual-qa-candidate'
};
