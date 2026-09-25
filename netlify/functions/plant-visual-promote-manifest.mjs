import crypto from 'node:crypto';
import { evaluateLiveFullPlantOnboarding } from './_plant-full-onboarding-gate-v1.mjs';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';

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
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(id) ? id : '';
}

function safe(value) {
  return String(value == null ? '' : value)
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


async function loadApproval(req, manifestId) {
  const url = new URL(
    '/data/garden-design/plant-visual-production-promotion-approvals/' + manifestId + '.json',
    req.url
  );
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return null;
  const approval = await res.json();
  if (
    !approval
    || approval.contract !== 'plant-visual-production-promotion-approval-v1'
    || approval.manifestId !== manifestId
  ) return null;
  return approval;
}

function approvalAuthorizesManifest(approval, manifest) {
  if (!approval || !manifest) return false;
  const scope = approval.scope || {};
  if (scope.paidGenerationAllowed !== false) return false;
  if (scope.newImageGenerationAllowed !== false) return false;
  if (scope.unrelatedRegistryChangesAllowed !== false) return false;

  const allowedActions = Array.isArray(scope.allowedActions) ? scope.allowedActions : [];
  const requiredActions = [
    'copy exact verified candidate bytes to immutable Production R2 keys',
    'verify production readback checksum',
    'update design asset registry only for successfully verified production objects'
  ];
  if (!requiredActions.every((action) => allowedActions.includes(action))) return false;

  const approvedJobs = new Set(Array.isArray(scope.candidateJobs) ? scope.candidateJobs : []);
  const manifestJobs = (manifest.rows || []).map((row) => row.jobId);
  if (!manifestJobs.length || manifestJobs.length !== approvedJobs.size) return false;
  return manifestJobs.every((jobId) => approvedJobs.has(jobId));
}

async function loadManifest(req, manifestId) {
  const url = new URL(
    '/data/garden-design/plant-visual-qa-manifests/' + manifestId + '.json',
    req.url
  );
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error('QA_MANIFEST_NOT_FOUND');
  const manifest = await res.json();
  if (
    !manifest
    || manifest.contract !== 'plant-visual-qa-manifest-v1'
    || manifest.manifestId !== manifestId
    || !Array.isArray(manifest.rows)
  ) {
    throw new Error('QA_MANIFEST_INVALID');
  }
  return manifest;
}

function reconciliationMatches(row) {
  if (row.evidenceMismatch !== true) return true;
  const record = row.provenanceReconciliation;
  return Boolean(
    record
    && record.status === 'RECONCILED_CURRENT_BYTES'
    && record.productionPromotionMayProceed === true
    && record.jobId === row.jobId
    && record.currentCandidate?.objectKey === row.objectKey
    && String(record.currentCandidate?.sha256 || '').toLowerCase() === String(row.sha256 || '').toLowerCase()
    && Number(record.currentCandidate?.bytes) === Number(row.bytes)
  );
}

function allPass(row) {
  return [
    row.technicalQA,
    row.framingQA,
    row.botanicalIdentityQA,
    row.architectureQA,
    row.growthStageQA,
    row.phenologyStateQA,
    row.inGardenQA,
    row.ownerVisualQA
  ].every((value) => String(value || '').toUpperCase() === 'PASS');
}

function productionKey(row) {
  const assetId = row.assetId || (row.jobId + '__' + String(row.sha256 || '').slice(0, 12));
  return [
    'production',
    safe(row.canonicalSlug),
    [safe(row.growthStage), safe(row.architectureMode || row.visualForm || 'default'), safe(row.phenology)].join('__'),
    safe(assetId) + '__' + safe(row.sha256) + '.png'
  ].join('/');
}

async function readBytes(client, bucket, key) {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  } catch (err) {
    if (
      err?.name === 'NoSuchKey'
      || err?.$metadata?.httpStatusCode === 404
      || err?.Code === 'NoSuchKey'
    ) return null;
    throw err;
  }
}

async function copyOne(client, manifestId, row) {
  if (!row?.jobId || !row?.objectKey || !row?.sha256 || !(Number(row.bytes) > 0)) {
    return { jobId: row?.jobId || null, ok: false, code: 'PROMOTION_ROW_INCOMPLETE' };
  }
  if (!String(row.objectKey).startsWith('candidates/')) {
    return { jobId: row.jobId, ok: false, code: 'CANDIDATE_OBJECT_REQUIRED' };
  }
  if (!allPass(row)) {
    return { jobId: row.jobId, ok: false, code: 'QA_PASS_REQUIRED' };
  }
  if (!reconciliationMatches(row)) {
    return { jobId: row.jobId, ok: false, code: 'PROVENANCE_RECONCILIATION_REQUIRED' };
  }
  if (row.qaRendererInput?.ok !== true || !(Number(row.qaRendererInput.baseWidthPx) > 0)) {
    return { jobId: row.jobId, ok: false, code: 'REVIEWED_RENDERER_INPUT_REQUIRED' };
  }

  const candidateBucket = env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const productionBucket = env('PLANT_VISUAL_R2_PRODUCTION_BUCKET');
  const candidate = await readBytes(client, candidateBucket, row.objectKey);
  if (!candidate) return { jobId: row.jobId, ok: false, code: 'CANDIDATE_NOT_FOUND' };

  const actualCandidateSha = sha256(candidate);
  if (
    candidate.length !== Number(row.bytes)
    || actualCandidateSha !== String(row.sha256).toLowerCase()
  ) {
    return { jobId: row.jobId, ok: false, code: 'CANDIDATE_INTEGRITY_MISMATCH' };
  }

  const key = productionKey(row);
  const existing = await readBytes(client, productionBucket, key);
  if (existing) {
    const existingSha = sha256(existing);
    if (existing.length !== candidate.length || existingSha !== actualCandidateSha) {
      return { jobId: row.jobId, ok: false, code: 'IMMUTABLE_PRODUCTION_KEY_CONFLICT', productionKey: key };
    }
    return {
      jobId: row.jobId,
      ok: true,
      code: 'ALREADY_PROMOTED_IDENTICAL',
      productionKey: key,
      sha256: actualCandidateSha,
      bytes: candidate.length,
      wrote: false
    };
  }

  await client.send(new PutObjectCommand({
    Bucket: productionBucket,
    Key: key,
    Body: candidate,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      'cruvit-manifest-id': manifestId,
      'cruvit-job-id': row.jobId,
      'cruvit-sha256': actualCandidateSha
    }
  }));

  const readback = await readBytes(client, productionBucket, key);
  if (!readback) return { jobId: row.jobId, ok: false, code: 'PRODUCTION_READBACK_MISSING', productionKey: key };
  const readbackSha = sha256(readback);
  if (readback.length !== candidate.length || readbackSha !== actualCandidateSha) {
    return { jobId: row.jobId, ok: false, code: 'PRODUCTION_READBACK_INTEGRITY_MISMATCH', productionKey: key };
  }

  return {
    jobId: row.jobId,
    ok: true,
    code: 'PROMOTED_AND_VERIFIED',
    productionKey: key,
    sha256: actualCandidateSha,
    bytes: candidate.length,
    wrote: true
  };
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const required = [
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET',
    'PLANT_VISUAL_R2_PRODUCTION_BUCKET'
  ];
  const missing = required.filter((key) => !env(key));
  if (missing.length) return json(500, { ok: false, code: 'ENV_MISSING', missing });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'JSON_BODY_REQUIRED' });
  }

  const manifestId = safeManifestId(body.manifestId);
  if (!manifestId) return json(400, { ok: false, code: 'MANIFEST_ID_REQUIRED' });

  let manifest;
  try {
    manifest = await loadManifest(req, manifestId);
  } catch (err) {
    return json(404, { ok: false, code: err?.message || 'QA_MANIFEST_LOAD_FAILED' });
  }

  const nonceAuthorized = Boolean(
    env('CRUVIT_PLANT_VISUAL_PROMOTION_NONCE')
    && body.nonce
    && String(body.nonce) === String(env('CRUVIT_PLANT_VISUAL_PROMOTION_NONCE'))
  );
  const approval = await loadApproval(req, manifestId);
  const artifactAuthorized = approvalAuthorizesManifest(approval, manifest);

  if (!nonceAuthorized && !artifactAuthorized) {
    return json(403, {
      ok: false,
      code: 'PROMOTION_OWNER_APPROVAL_REQUIRED',
      manifestId
    });
  }

  const requestedJobId = body.jobId == null ? '' : safeJobId(body.jobId);
  if (body.jobId != null && !requestedJobId) {
    return json(400, { ok: false, code: 'JOB_ID_INVALID' });
  }

  const allRows = manifest.rows || [];
  if (!allRows.length) return json(422, { ok: false, code: 'QA_MANIFEST_EMPTY' });

  const rows = requestedJobId
    ? allRows.filter((row) => row.jobId === requestedJobId)
    : allRows;

  if (requestedJobId && rows.length !== 1) {
    return json(404, { ok: false, code: 'JOB_NOT_IN_MANIFEST', jobId: requestedJobId });
  }

  const approvedJobs = new Set(Array.isArray(approval?.scope?.candidateJobs)
    ? approval.scope.candidateJobs
    : []);
  if (requestedJobId && !approvedJobs.has(requestedJobId)) {
    return json(403, { ok: false, code: 'JOB_NOT_OWNER_APPROVED', jobId: requestedJobId });
  }

  let onboarding;
  try {
    onboarding = await evaluateLiveFullPlantOnboarding(
      rows.map((row) => ({
        canonicalSlug: row.canonicalSlug,
        scientific: row.scientific || null,
        phenology: row.phenology || 'vegetative'
      }))
    );
  } catch (err) {
    return json(503, {
      ok: false,
      code: 'FULL_PLANT_ONBOARDING_CHECK_UNAVAILABLE',
      manifestId,
      productionWrites: 0,
      registryWrites: 0,
      errorName: err?.message || null
    });
  }

  if (!onboarding.allReady) {
    return json(409, {
      ok: false,
      code: 'FULL_PLANT_ONBOARDING_REQUIRED',
      manifestId,
      productionWrites: 0,
      registryWrites: 0,
      onboardingVersion: onboarding.version,
      readyPlants: onboarding.ready,
      blockedPlants: onboarding.blocked,
      evaluations: onboarding.evaluations
    });
  }

  const client = s3Client();
  const results = [];
  for (const row of rows) {
    try {
      results.push(await copyOne(client, manifestId, row));
    } catch (err) {
      results.push({
        jobId: row?.jobId || null,
        ok: false,
        code: 'PROMOTION_EXCEPTION',
        errorName: err?.name || null
      });
    }
  }

  const failed = results.filter((row) => !row.ok);
  return json(failed.length ? 409 : 200, {
    ok: failed.length === 0,
    manifestId,
    jobId: requestedJobId || null,
    totalJobs: results.length,
    promotedOrVerified: results.filter((row) => row.ok).length,
    failed: failed.length,
    productionWrites: results.filter((row) => row.wrote === true).length,
    registryWrites: 0,
    authorization: artifactAuthorized ? 'OWNER_APPROVAL_ARTIFACT' : 'NONCE',
    fullPlantOnboarding: {
      version: onboarding.version,
      allReady: onboarding.allReady,
      ready: onboarding.ready,
      blocked: onboarding.blocked
    },
    results
  });
};

export const config = {
  path: '/.netlify/functions/plant-visual-promote-manifest'
};
