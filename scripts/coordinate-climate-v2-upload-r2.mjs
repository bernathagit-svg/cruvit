#!/usr/bin/env node
/**
 * Rewrite R2 upload entrypoint: full corpus plan + canary pointer.
 * Credentials still required for any upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOBAL_PACK_ID, GLOBAL_BAKE_ID_DEFAULT } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  getR2ConnectionStatus,
  buildClimateObjectKey,
  loadClimateObjectStorageContract
} from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', GLOBAL_PACK_ID);

async function main() {
  const mode = String(process.argv[2] || 'plan').trim();
  const envStatus = getR2ConnectionStatus();
  const manifestPath = path.join(GLOBAL_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('manifest missing');
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
  const files = fs.existsSync(tilesDir)
    ? fs.readdirSync(tilesDir).filter((f) => f.endsWith('.cctb.gz'))
    : [];
  const bake = manifest.globalBakeId || GLOBAL_BAKE_ID_DEFAULT;
  const totalBytes = files.reduce((s, f) => s + fs.statSync(path.join(tilesDir, f)).size, 0);

  const plan = {
    policyId: 'global-v1-full-corpus-sync-plan-v1',
    globalBakeId: bake,
    tileCount: files.length,
    approximateBytes: totalBytes,
    approximateGiB: Number((totalBytes / (1024 ** 3)).toFixed(2)),
    objectKeyScheme: loadClimateObjectStorageContract().immutablePathPattern,
    manifestKey: buildClimateObjectKey({ kind: 'manifest', globalBakeId: bake }),
    globalIndexKey: buildClimateObjectKey({ kind: 'global-index', globalBakeId: bake }),
    estimatedObjectCount: files.length + 2,
    strategy: {
      resumable: true,
      idempotent: true,
      skipIdentical: 'compare local sha256 to optional remote checksum map / Content-MD5 when available',
      retry: 'exponential backoff on 5xx/timeout; fail closed on auth errors',
      checksumValidation: 'use tile-checksums.json when present; do not regenerate tiles',
      verification: 'spot-check GetObject for N random tile keys + Mojstrana/Ljubljana/NYC canary keys',
      authority: 'existing ~61,964 validated local tiles remain authority — no CHELSA, no rebake'
    },
    r2: envStatus,
    canaryUploadScript: 'scripts/coordinate-climate-v2-upload-r2-canary.mjs'
  };

  if (mode === 'plan' || !envStatus.ready) {
    console.log(
      JSON.stringify(
        {
          ...plan,
          verdict: envStatus.ready ? 'FULL_CORPUS_PLAN_READY' : 'OWNER_ACTION_REQUIRED',
          note:
            mode === 'upload-full'
              ? 'Full upload not started — credentials or explicit authorization required'
              : 'Plan only — full 17GB upload not executed in this checkpoint'
        },
        null,
        2
      )
    );
    process.exit(envStatus.ready ? 0 : 3);
  }

  if (mode !== 'upload-full') {
    console.error('Usage: node scripts/coordinate-climate-v2-upload-r2.mjs [plan|upload-full]');
    process.exit(2);
  }

  // Guard: full upload must be explicit; still skip-identical by sha when possible.
  console.log(
    JSON.stringify({
      verdict: 'FULL_UPLOAD_NOT_EXECUTED_IN_THIS_CHECKPOINT',
      reason: 'Product Proof canary must succeed on R2 first; owner must authorize 17GB sync separately',
      plan
    })
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
