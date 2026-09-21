// CRUVIT plant visual R2 health check - deployment refresh 2026-09-21
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

function getEnv(name) {
  return Netlify.env.get(name) || '';
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const nonce = getEnv('CRUVIT_R2_BOOTSTRAP_NONCE');
  if (!nonce || url.searchParams.get('nonce') !== nonce) {
    return response(403, { ok: false, code: 'NONCE_DENIED' });
  }

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET',
    'PLANT_VISUAL_R2_PRODUCTION_BUCKET'
  ];
  const presence = Object.fromEntries(required.map((k) => [k, !!getEnv(k)]));
  const missing = required.filter((k) => !presence[k]);
  if (missing.length) {
    return response(200, {
      ok: false,
      code: 'PLANT_VISUAL_ENV_MISSING',
      presence,
      missing
    });
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${getEnv('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getEnv('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });

  const buckets = [
    getEnv('PLANT_VISUAL_R2_CANDIDATES_BUCKET'),
    getEnv('PLANT_VISUAL_R2_PRODUCTION_BUCKET')
  ];

  const checks = [];
  for (const bucket of buckets) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      checks.push({ bucket, ok: true, code: 'HEAD_OK' });
    } catch (err) {
      checks.push({
        bucket,
        ok: false,
        code: 'HEAD_FAILED',
        httpStatus: err?.$metadata?.httpStatusCode || null,
        errorName: err?.name || null
      });
    }
  }

  return response(200, {
    ok: checks.every((x) => x.ok),
    code: checks.every((x) => x.ok) ? 'PLANT_VISUAL_R2_READY' : 'PLANT_VISUAL_R2_NOT_READY',
    presence,
    checks,
    secretsExposed: false,
    writesPerformed: false
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-r2-health'
};
