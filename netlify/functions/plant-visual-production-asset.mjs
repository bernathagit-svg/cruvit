import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name) {
  return Netlify.env.get(name) || '';
}

function safeKey(value) {
  const key = String(value || '').trim();
  if (!key.startsWith('production/')) return '';
  if (key.includes('..') || key.includes('\\')) return '';
  if (!/^[A-Za-z0-9._\/-]+$/.test(key)) return '';
  return key;
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

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const key = safeKey(new URL(req.url).searchParams.get('key'));
  if (!key) return new Response('Not Found', { status: 404 });

  const bucket = env('PLANT_VISUAL_R2_PRODUCTION_BUCKET');
  if (!bucket) return new Response('Storage unavailable', { status: 503 });

  try {
    const out = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await out.Body.transformToByteArray();
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': out.ContentType || 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex'
      }
    });
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey' ? 404 : 502;
    return new Response(status === 404 ? 'Not Found' : 'Storage read failed', { status });
  }
};

export const config = {
  path: '/.netlify/functions/plant-visual-production-asset'
};
