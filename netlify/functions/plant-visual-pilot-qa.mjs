import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { assessProductionFramingQa } from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';

const ITEMS = Object.freeze({
  'banana__young__default__vegetative__v1': Object.freeze({
    canonicalSlug: 'banana',
    scientific: 'Musa spp.',
    visualForm: 'herbaceous-clump',
    growthStage: 'young',
    architectureMode: 'default',
    phenology: 'vegetative',
    sourceStatus: 'VERIFIED',
    objectKey: 'candidates/pilot-migration-2026-09-21-v1/banana/banana__young__default__vegetative__v1__ae409cc13ac0badbca5bfac98ecdc04f6f03fd0c52d064874adc0e243ad1dfbf.png',
    sha256: 'ae409cc13ac0badbca5bfac98ecdc04f6f03fd0c52d064874adc0e243ad1dfbf'
  }),
  'mango__young__tree__vegetative__v1': Object.freeze({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    visualForm: 'tree',
    growthStage: 'young',
    architectureMode: 'tree',
    phenology: 'vegetative',
    sourceStatus: 'VERIFIED',
    objectKey: 'candidates/pilot-migration-2026-09-21-v1/mango/mango__young__tree__vegetative__v1__ea86bfc3c56e79dcf081a9b5cfb45d50be48c3b19d736c0ae31e4786e6816f2a.png',
    sha256: 'ea86bfc3c56e79dcf081a9b5cfb45d50be48c3b19d736c0ae31e4786e6816f2a'
  }),
  'pineapple__mature__default__fruiting__v1': Object.freeze({
    canonicalSlug: 'pineapple',
    scientific: 'Ananas comosus',
    visualForm: 'rosette',
    growthStage: 'mature',
    architectureMode: 'default',
    phenology: 'fruiting',
    sourceStatus: 'RECOVERED_EVIDENCE_MISMATCH',
    objectKey: 'candidates/pilot-migration-2026-09-21-v1/recovered/pineapple/pineapple__mature__default__fruiting__v1__2feb2d10bf0cfbc6e794430c73d2c84735346d05d61216f3040640f0547c5e75.png',
    sha256: '2feb2d10bf0cfbc6e794430c73d2c84735346d05d61216f3040640f0547c5e75'
  }),
  'mango__mature__tree__fruiting__v1': Object.freeze({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    visualForm: 'tree',
    growthStage: 'mature',
    architectureMode: 'tree',
    phenology: 'fruiting',
    sourceStatus: 'RECOVERED_EVIDENCE_MISMATCH',
    objectKey: 'candidates/pilot-migration-2026-09-21-v1/recovered/mango/mango__mature__tree__fruiting__v1__833f36814f05672466cc125c334936fc60b452b5160daa340be63cc89b40be29.png',
    sha256: '833f36814f05672466cc125c334936fc60b452b5160daa340be63cc89b40be29'
  })
});

function env(name) {
  return Netlify.env.get(name) || '';
}

function headers(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow'
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: headers('application/json; charset=utf-8') });
}

function client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey: env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });
}

async function getBytes(s3, item) {
  const out = await s3.send(new GetObjectCommand({
    Bucket: env('PLANT_VISUAL_R2_CANDIDATES_BUCKET'),
    Key: item.objectKey
  }));
  return Buffer.from(await out.Body.transformToByteArray());
}

export default async (req) => {
  if (req.method !== 'GET') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((k) => !env(k));
  if (missing.length) return json(500, { ok: false, code: 'ENV_MISSING', missing });

  const url = new URL(req.url);
  const jobId = String(url.searchParams.get('job') || '');
  const action = String(url.searchParams.get('action') || 'summary');
  const s3 = client();

  if (jobId) {
    const item = ITEMS[jobId];
    if (!item) return json(404, { ok: false, code: 'JOB_NOT_ALLOWED' });
    try {
      const bytes = await getBytes(s3, item);
      return new Response(bytes, {
        status: 200,
        headers: {
          ...headers('image/png'),
          'x-cruvit-job-id': jobId,
          'x-cruvit-source-status': item.sourceStatus
        }
      });
    } catch (err) {
      return json(502, { ok: false, code: 'R2_READ_FAILED', jobId, errorName: err?.name || null });
    }
  }

  if (action !== 'summary') return json(400, { ok: false, code: 'UNKNOWN_ACTION' });

  const rows = [];
  for (const [id, item] of Object.entries(ITEMS)) {
    try {
      const bytes = await getBytes(s3, item);
      const technicalQa = inspectTechnicalQa(bytes);
      const framingQa = assessProductionFramingQa(technicalQa);
      rows.push({
        jobId: id,
        canonicalSlug: item.canonicalSlug,
        scientific: item.scientific,
        visualForm: item.visualForm,
        growthStage: item.growthStage,
        architectureMode: item.architectureMode,
        phenology: item.phenology,
        sourceStatus: item.sourceStatus,
        sha256: item.sha256,
        bytes: bytes.length,
        technicalQA: technicalQa.result,
        technicalReasons: technicalQa.reasons || [],
        technicalMetrics: technicalQa.metrics || null,
        framingQA: framingQa.result,
        framingReasons: framingQa.reasons || [],
        botanicalIdentityQA: 'OWNER_REVIEW_REQUIRED',
        architectureQA: 'OWNER_REVIEW_REQUIRED',
        growthStageQA: 'OWNER_REVIEW_REQUIRED',
        phenologyStateQA: 'OWNER_REVIEW_REQUIRED',
        inGardenQA: 'OWNER_REVIEW_REQUIRED',
        productionApproved: false
      });
    } catch (err) {
      rows.push({ jobId: id, ok: false, code: 'R2_READ_FAILED', errorName: err?.name || null });
    }
  }

  return json(200, {
    ok: rows.every((r) => r.technicalQA === 'PASS'),
    code: 'PLANT_VISUAL_PILOT_QA_SUMMARY',
    rows,
    paidAiCalls: 0,
    imageGenerationCalls: 0,
    productionWrites: 0,
    registryWrites: 0
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-pilot-qa'
};
