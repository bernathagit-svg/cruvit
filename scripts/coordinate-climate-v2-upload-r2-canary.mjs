#!/usr/bin/env node
/**
 * Upload Product Proof remote canary objects to Cloudflare R2.
 * Loads `.env.r2.local` safely (never logs secret values).
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-upload-r2-canary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyR2LocalEnvFromFile,
  getR2ConnectionStatus,
  putClimateObjectBytes,
  fetchClimateObjectBytes,
  sha256Hex,
  loadClimateObjectStorageContract,
  clearClimateObjectStorageCaches
} from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = path.join(
  ROOT,
  'data',
  'catalog',
  'product-proof-v1',
  'remote-canary',
  'REMOTE_CANARY_OBJECT_LIST.json'
);
const MIRROR = path.join(ROOT, 'data', 'catalog', 'product-proof-v1', 'remote-canary', 'object-mirror');

async function main() {
  clearClimateObjectStorageCaches();
  applyR2LocalEnvFromFile(process.env);
  const status = getR2ConnectionStatus();
  if (!status.ready) {
    console.log(
      JSON.stringify(
        {
          verdict: 'OWNER_ACTION_REQUIRED',
          blocker: 'GLOBAL_STORAGE_CONNECTION_REQUIRED',
          missing: status.missing,
          presence: status.presence,
          bucketName: status.bucketName
        },
        null,
        2
      )
    );
    process.exit(3);
  }
  if (!status.bucketIsCruvitGlobalClimate) {
    console.log(
      JSON.stringify({
        verdict: 'R2_BUCKET_NAME_MISMATCH',
        expected: 'cruvit-global-climate',
        bucketName: status.bucketName
      })
    );
    process.exit(3);
  }

  if (!fs.existsSync(LIST)) {
    console.error('Canary list missing — run coordinate-climate-v2-stage-remote-canary.mjs first');
    process.exit(2);
  }

  const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const contract = loadClimateObjectStorageContract();
  let uploadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let uploadedBytes = 0;
  const rows = [];

  for (const obj of list.REMOTE_CANARY_OBJECT_LIST) {
    const abs = path.join(MIRROR, ...obj.objectKey.split('/'));
    const bytes = fs.readFileSync(abs);
    const contentType =
      obj.kind === 'tile' ? 'application/gzip' : 'application/json; charset=utf-8';
    const put = await putClimateObjectBytes(obj.objectKey, bytes, {
      contentType,
      cacheControl: contract.cacheControl,
      skipIdentical: true
    });
    if (!put.ok) {
      failedCount += 1;
      console.log(
        JSON.stringify(
          { verdict: 'CANARY_UPLOAD_FAILED', objectKey: obj.objectKey, code: put.code },
          null,
          2
        )
      );
      process.exit(1);
    }
    if (put.skipped) skippedCount += 1;
    else {
      uploadedCount += 1;
      uploadedBytes += bytes.length;
    }
    rows.push({
      objectKey: obj.objectKey,
      kind: obj.kind,
      bytes: obj.bytes,
      sha256: obj.sha256 || put.sha256,
      result: put.code
    });
  }

  // Post-upload checksum verify from REAL R2 (forceR2, no mirror).
  let verified = 0;
  const verifyRows = [];
  for (const obj of list.REMOTE_CANARY_OBJECT_LIST) {
    const expectedSha = obj.sha256;
    const remote = await fetchClimateObjectBytes(obj.objectKey, { forceR2: true });
    if (!remote.ok) {
      console.log(
        JSON.stringify({
          verdict: 'CANARY_VERIFY_FAILED',
          objectKey: obj.objectKey,
          code: remote.code
        })
      );
      process.exit(1);
    }
    const remoteSha = sha256Hex(remote.bytes);
    const ok = remote.bytes.length === obj.bytes && remoteSha === expectedSha;
    if (!ok) {
      console.log(
        JSON.stringify({
          verdict: 'CANARY_CHECKSUM_MISMATCH',
          objectKey: obj.objectKey,
          expectedBytes: obj.bytes,
          remoteBytes: remote.bytes.length,
          checksumMatch: remoteSha === expectedSha
        })
      );
      process.exit(1);
    }
    verified += 1;
    verifyRows.push({ objectKey: obj.objectKey, ok: true, bytes: remote.bytes.length });
  }

  console.log(
    JSON.stringify(
      {
        verdict: 'CANARY_UPLOAD_OK',
        bucketName: status.bucketName,
        uploadedCount,
        skippedIdenticalCount: skippedCount,
        failedCount,
        uploadedBytes,
        verifiedCount: verified,
        expectedCount: list.REMOTE_CANARY_OBJECT_LIST.length,
        rows,
        verifyRows
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
