import crypto from 'node:crypto';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { assessProductionFramingQa } from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import { getStore } from '@netlify/blobs';
import { planDesignAssetGeneration } from '../../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import { actualSpendUsdFromUsage } from '../../modules/garden-design/asset-factory-v1/total-api-cost-v1.js';

const JOBS = Object.freeze({
  'mango__mature__tree__fruiting__v1': Object.freeze({
    jobId: 'mango__mature__tree__fruiting__v1',
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    identityScope: 'species',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenology: 'fruiting',
    phenologyState: 'fruiting',
    season: 'unknown',
    required: true
  }),
  'mango__young__tree__vegetative__v1': Object.freeze({
    jobId: 'mango__young__tree__vegetative__v1',
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    identityScope: 'species',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'young',
    phenology: 'vegetative',
    phenologyState: 'vegetative',
    season: 'unknown',
    required: true
  }),
  'pineapple__mature__default__fruiting__v1': Object.freeze({
    jobId: 'pineapple__mature__default__fruiting__v1',
    canonicalSlug: 'pineapple',
    scientific: 'Ananas comosus',
    identityScope: 'species',
    visualForm: 'rosette',
    architectureMode: 'default',
    growthStage: 'mature',
    phenology: 'fruiting',
    phenologyState: 'fruiting',
    season: 'unknown',
    required: true
  })
});

function env(name) {
  return typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function'
    ? Netlify.env.get(name)
    : undefined;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export default async (req) => {
  if (req.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  const url = new URL(req.url);
  const runtimeNonce = String(env('CRUVIT_PILOT_NONCE') || '');
  const store = getStore('cruvit-plant-visual-approved-pilot', { consistency: 'strong' });

  if (url.searchParams.get('status') === '1') {
    const rows = [];
    for (const jobId of Object.keys(JOBS)) {
      const blobKey = '2026-09-21/' + jobId + '.png';
      const cached = await store.getWithMetadata(blobKey, { type: 'arrayBuffer' });
      if (!cached || !cached.data) {
        rows.push({ jobId, exists: false });
        continue;
      }
      const bytes = Buffer.from(cached.data);
      const technicalQa = inspectTechnicalQa(bytes);
      const framingQa = assessProductionFramingQa(technicalQa);
      rows.push({
        jobId,
        exists: true,
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        spendUsd: cached.metadata?.spendUsd ?? null,
        quality: cached.metadata?.quality ?? null,
        detailClass: cached.metadata?.detailClass ?? null,
        model: cached.metadata?.model ?? null,
        technicalQa,
        framingQa
      });
    }
    const totalSpendUsd = rows.reduce((sum, row) => sum + Number(row.spendUsd || 0), 0);
    return json(200, {
      generationGateOpen: Boolean(runtimeNonce),
      totalSpendUsd: +totalSpendUsd.toFixed(6),
      rows
    });
  }
  if (url.searchParams.get('index') === '1') {
    if (!runtimeNonce) return json(403, { error: 'PILOT_NONCE_NOT_READY' });
    const links = Object.keys(JOBS).map((jobId) => {
      const href = '/.netlify/functions/plant-visual-approved-pilot?job=' + encodeURIComponent(jobId) + '&token=' + encodeURIComponent(runtimeNonce);
      return '<li><a href="' + href + '">' + jobId + '</a></li>';
    }).join('');
    return new Response('<!doctype html><html><body><ul>' + links + '</ul></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  const jobId = String(url.searchParams.get('job') || '');
  const token = String(url.searchParams.get('token') || '');
  const job = JOBS[jobId];
  if (!job) return json(404, { error: 'JOB_NOT_APPROVED' });
  const expectedToken = runtimeNonce;
  if (!expectedToken || token !== expectedToken) return json(403, { error: 'PILOT_TOKEN_DENIED' });
  if (String(env('CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER') || '') !== 'true') {
    return json(403, { error: 'PAID_PLANT_IDENTIFIER_GATE_DENIED' });
  }

  const blobKey = '2026-09-21/' + jobId + '.png';
  const cached = await store.getWithMetadata(blobKey, { type: 'arrayBuffer' });
  if (cached && cached.data) {
    return new Response(cached.data, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'x-cruvit-job-id': jobId,
        'x-cruvit-cache': 'hit',
        'x-cruvit-spend-usd': String(cached.metadata?.spendUsd ?? 'unknown')
      }
    });
  }

  const apiKey = String(env('OPENAI_KEY') || env('OPENAI_API_KEY') || '').trim();
  if (!apiKey) return json(500, { error: 'OPENAI_KEY_NOT_READY' });

  const generation = planDesignAssetGeneration(job);
  if (generation.quality !== 'medium') {
    return json(409, { error: 'UNEXPECTED_QUALITY', quality: generation.quality });
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: generation.promptRecord.prompt,
      size: '1024x1536',
      quality: 'medium',
      background: 'transparent',
      output_format: 'png',
      n: 1
    })
  });

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json || null;
  if (!response.ok || !b64) {
    return json(502, {
      error: 'GENERATION_FAILED',
      status: response.status,
      providerCode: data?.error?.code || null,
      providerType: data?.error?.type || null
    });
  }

  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  const spendUsd = actualSpendUsdFromUsage(data?.usage);
  await store.set(blobKey, bytes, {
    metadata: {
      jobId,
      spendUsd,
      quality: generation.quality,
      detailClass: generation.detailClass,
      model: 'gpt-image-2'
    }
  });

  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
      'x-cruvit-job-id': jobId,
      'x-cruvit-quality': generation.quality,
      'x-cruvit-detail-class': generation.detailClass,
      'x-cruvit-spend-usd': spendUsd == null ? 'unknown' : String(spendUsd),
      'x-cruvit-cache': 'miss'
    }
  });
};
