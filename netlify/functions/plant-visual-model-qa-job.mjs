import crypto from 'node:crypto';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';

const PLAN_CONTRACT = 'plant-visual-model-qa-plan-v1';
const APPROVAL_CONTRACT = 'plant-visual-model-qa-spend-approval-v1';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';

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
  try { return JSON.parse(bytes.toString('utf8')); } catch { return null; }
}

async function putJson(client, bucket, key, body, options = {}) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(JSON.stringify(body, null, 2)),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'private, no-store',
    ...(options.ifNoneMatch ? { IfNoneMatch: '*' } : {})
  }));
}

async function loadStaticJson(req, relativePath) {
  const res = await fetch(new URL(relativePath, req.url), {
    headers: { 'cache-control': 'no-cache' }
  });
  if (!res.ok) return null;
  return res.json();
}

async function loadPlan(req, runId) {
  const plan = await loadStaticJson(
    req,
    '/data/garden-design/plant-visual-model-qa-plans/' + runId + '.json'
  );
  if (
    !plan
    || plan.contract !== PLAN_CONTRACT
    || plan.runId !== runId
    || !Array.isArray(plan.jobs)
    || plan.jobs.length !== Number(plan.jobCount)
  ) return null;
  return plan;
}

async function loadApproval(req, runId) {
  const approval = await loadStaticJson(
    req,
    '/data/garden-design/plant-visual-model-qa-spend-approvals/' + runId + '.json'
  );
  if (!approval || approval.contract !== APPROVAL_CONTRACT || approval.runId !== runId) {
    return null;
  }
  return approval;
}

function approvalAuthorizes(approval, plan) {
  if (!approval || !plan || approval.approved !== true) return false;
  if (approval.provider !== plan.provider || approval.model !== plan.model) return false;
  if (Number(approval.maxCalls) !== Number(plan.jobCount)) return false;
  if (Number(approval.maxRetries) !== 0) return false;
  if (!(Number(approval.maxSpendUsd) > 0)) return false;
  if (approval.productionWritesAllowed !== false) return false;
  if (approval.registryWritesAllowed !== false) return false;
  const approved = new Set(Array.isArray(approval.jobIds) ? approval.jobIds : []);
  const planJobs = plan.jobs.map((j) => j.jobId);
  return approved.size === planJobs.length && planJobs.every((id) => approved.has(id));
}

function lockKey(plan, jobId) {
  return `candidates/${safeSegment(plan.sourceManifestId)}/model-qa-locks/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;
}

function evidenceKey(plan, jobId) {
  return `candidates/${safeSegment(plan.sourceManifestId)}/model-qa/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;
}

function outputText(responseBody) {
  const direct = String(responseBody?.output_text || '').trim();
  if (direct) return direct;
  const parts = [];
  for (const item of responseBody?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

function cleanJsonText(raw) {
  const text = String(raw || '').trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const fenced = text.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  return fenced ? fenced[1].trim() : text;
}

function normalizeVerdict(v) {
  const x = String(v || '').trim().toUpperCase();
  return ['PASS','FAIL','UNCERTAIN'].includes(x) ? x : 'UNCERTAIN';
}

function validateAssessment(parsed = {}) {
  const checks = ['botanicalIdentity','architecture','growthStage','phenologyState'];
  const out = {};
  for (const key of checks) {
    const row = parsed[key] || {};
    out[key] = {
      verdict: normalizeVerdict(row.verdict),
      confidence: String(row.confidence || 'unknown').toLowerCase(),
      reason: String(row.reason || '').slice(0, 400)
    };
  }
  const allPass = checks.every((k) => out[k].verdict === 'PASS');
  const anyFail = checks.some((k) => out[k].verdict === 'FAIL');
  const overall = anyFail ? 'FAIL' : allPass ? 'PASS' : 'UNCERTAIN';
  return {
    overall,
    checks: out,
    autoPassEligible:
      overall === 'PASS'
      && checks.every((k) => ['high','very-high'].includes(out[k].confidence))
  };
}

function spendFromUsage(usage = {}) {
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  if (!Number.isFinite(input + output)) return null;
  return +((input * 0.20 + output * 1.20) / 1_000_000).toFixed(6);
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok:false, code:'METHOD_NOT_ALLOWED' });

  let body = {};
  try { body = await req.json(); }
  catch { return json(400, { ok:false, code:'JSON_BODY_REQUIRED' }); }

  const runId = safeId(body.runId);
  const jobId = safeId(body.jobId);
  if (!runId || !jobId) {
    return json(400, { ok:false, code:'RUN_ID_AND_JOB_ID_REQUIRED' });
  }

  const plan = await loadPlan(req, runId);
  if (!plan) return json(404, { ok:false, code:'MODEL_QA_PLAN_NOT_FOUND' });
  const job = plan.jobs.find((j) => j.jobId === jobId);
  if (!job) return json(404, { ok:false, code:'JOB_NOT_IN_MODEL_QA_PLAN' });

  const approval = await loadApproval(req, runId);
  if (!approvalAuthorizes(approval, plan)) {
    return json(403, {
      ok:false,
      code:'MODEL_QA_SPEND_OWNER_APPROVAL_REQUIRED',
      runId,
      jobId
    });
  }

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing = required.filter((name) => !env(name));
  const apiKey = env('OPENAI_KEY') || env('OPENAI_API_KEY');
  if (!apiKey) missing.push('OPENAI_KEY_OR_OPENAI_API_KEY');
  if (missing.length) return json(500, { ok:false, code:'ENV_MISSING', missing });

  const client = s3Client();
  const bucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const existingEvidence = await readJsonObject(client, bucket, evidenceKey(plan, jobId));
  if (existingEvidence) {
    return json(200, {
      ok:true,
      code:'MODEL_QA_ALREADY_HAS_EVIDENCE',
      evidence:existingEvidence
    });
  }

  try {
    await putJson(client, bucket, lockKey(plan, jobId), {
      contract:'plant-visual-model-qa-lock-v1',
      runId,
      jobId,
      claimedAt:new Date().toISOString(),
      retriesAllowed:false
    }, { ifNoneMatch:true });
  } catch (err) {
    if (err?.name === 'PreconditionFailed' || err?.$metadata?.httpStatusCode === 412) {
      return json(409, { ok:false, code:'MODEL_QA_JOB_ALREADY_CLAIMED', runId, jobId });
    }
    throw err;
  }

  const bytes = await readBytes(client, bucket, job.objectKey);
  if (!bytes) {
    return json(409, { ok:false, code:'CANDIDATE_NOT_FOUND', runId, jobId });
  }
  if (bytes.length !== Number(job.bytes) || sha256(bytes) !== String(job.sha256).toLowerCase()) {
    return json(409, { ok:false, code:'CANDIDATE_INTEGRITY_MISMATCH', runId, jobId });
  }

  const prompt = [
    'You are a conservative visual QA reviewer for a garden-design plant cutout.',
    'Inspect ONLY the visible plant pixels in the supplied transparent PNG.',
    'Expected canonical slug: ' + job.canonicalSlug,
    'Expected scientific identity: ' + job.scientific,
    'Expected visual form: ' + job.visualForm,
    'Expected architecture mode: ' + job.architectureMode,
    'Expected growth stage: ' + job.growthStage,
    'Expected phenology state: ' + job.phenology,
    '',
    'Evaluate four checks: botanicalIdentity, architecture, growthStage, phenologyState.',
    'For each return verdict PASS, FAIL, or UNCERTAIN; confidence high, medium, or low; and a short reason.',
    'Use UNCERTAIN whenever the pixels cannot safely distinguish the expected identity or state.',
    'Do not infer hidden cultivar/rootstock facts. Do not treat metadata as proof of the pixels.',
    'Return JSON only, with exactly these four top-level keys.'
  ].join('\n');

  const providerRes = await fetch(RESPONSES_URL, {
    method:'POST',
    headers:{
      'authorization':'Bearer ' + apiKey,
      'content-type':'application/json'
    },
    body:JSON.stringify({
      model:plan.model,
      reasoning:{ effort:plan.reasoningEffort || 'low' },
      max_output_tokens:700,
      input:[{
        role:'user',
        content:[
          { type:'input_text', text:prompt },
          {
            type:'input_image',
            image_url:'data:image/png;base64,' + bytes.toString('base64'),
            detail:'high'
          }
        ]
      }]
    })
  });

  const providerBody = await providerRes.json();
  if (!providerRes.ok) {
    const evidence = {
      contract:'plant-visual-model-qa-evidence-v1',
      runId, jobId, generated:false,
      code:'MODEL_QA_PROVIDER_FAILURE',
      httpStatus:providerRes.status,
      productionWrites:0,
      registryWrites:0,
      recordedAt:new Date().toISOString()
    };
    await putJson(client, bucket, evidenceKey(plan, jobId), evidence);
    return json(502, { ok:false, ...evidence });
  }

  const raw = outputText(providerBody);
  let parsed = null;
  try { parsed = JSON.parse(cleanJsonText(raw)); } catch {}
  if (!parsed) {
    const evidence = {
      contract:'plant-visual-model-qa-evidence-v1',
      runId, jobId,
      code:'MODEL_QA_INVALID_JSON',
      overall:'UNCERTAIN',
      rawPreview:raw.slice(0,600),
      actualSpendUsd:spendFromUsage(providerBody.usage),
      usage:providerBody.usage || null,
      productionWrites:0,
      registryWrites:0,
      recordedAt:new Date().toISOString()
    };
    await putJson(client, bucket, evidenceKey(plan, jobId), evidence);
    return json(200, { ok:true, ...evidence });
  }

  const assessment = validateAssessment(parsed);
  const evidence = {
    contract:'plant-visual-model-qa-evidence-v1',
    runId,
    jobId,
    canonicalSlug:job.canonicalSlug,
    scientific:job.scientific,
    sourceObjectKey:job.objectKey,
    sourceSha256:job.sha256,
    model:plan.model,
    ...assessment,
    actualSpendUsd:spendFromUsage(providerBody.usage),
    usage:providerBody.usage || null,
    productionWrites:0,
    registryWrites:0,
    recordedAt:new Date().toISOString()
  };
  await putJson(client, bucket, evidenceKey(plan, jobId), evidence);

  return json(200, { ok:true, code:'MODEL_QA_RECORDED', evidence });
};

export const config = {
  path:'/.netlify/functions/plant-visual-model-qa-job'
};
