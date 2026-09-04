#!/usr/bin/env node
/**
 * Upload global climate bake to Cloudflare R2 (optional).
 * Requires env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GLOBAL_PACK_ID } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', GLOBAL_PACK_ID);

function requiredEnv() {
  const vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = vars.filter((v) => !process.env[v]);
  return { vars, missing, ready: missing.length === 0 };
}

async function main() {
  const env = requiredEnv();
  if (!env.ready) {
    console.log(
      JSON.stringify({
        verdict: 'GLOBAL_STORAGE_CONNECTION_REQUIRED',
        missing: env.missing,
        required: env.vars
      })
    );
    process.exit(3);
  }

  const manifestPath = path.join(GLOBAL_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('manifest missing — run global bake first');
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
  const files = fs.readdirSync(tilesDir).filter((f) => f.endsWith('.cctb.gz'));
  console.log(
    JSON.stringify({
      verdict: 'UPLOAD_NOT_IMPLEMENTED_SDK',
      note: 'R2 credentials present but S3-compatible upload SDK not wired in this checkpoint',
      tileCount: files.length,
      globalBakeId: manifest.globalBakeId,
      blocker: 'GLOBAL_STORAGE_CONNECTION_REQUIRED — SDK wiring pending'
    })
  );
  process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
