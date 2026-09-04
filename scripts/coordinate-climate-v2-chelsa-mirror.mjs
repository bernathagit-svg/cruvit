#!/usr/bin/env node
/**
 * Download/resume CHELSA V2.1 local mirror (84 global COG GeoTIFFs).
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-chelsa-mirror.mjs --inventory-only
 *   node scripts/coordinate-climate-v2-chelsa-mirror.mjs --max-files 3
 *   node scripts/coordinate-climate-v2-chelsa-mirror.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import { CHELSA_V21_BASELINE } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { CHELSA_WIDTH, CHELSA_HEIGHT } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { BAKE_MONTHS, BAKE_VARIABLES, chelsaUrl } from './coordinate-climate-v2-bake-shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR_ROOT = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/files');
const MANIFEST = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/mirror-manifest.json');
const INVENTORY = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/source-inventory.json');
const MIN_FREE_RESERVE_GB = 50;
const REQUEST_TIMEOUT_MS = 900_000;
const INACTIVITY_TIMEOUT_MS = 120_000;
const MAX_DOWNLOAD_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 3000;
const BACKOFF_CAP_MS = 60_000;

export const MIRROR_DOWNLOAD_POLICY = {
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS,
  maxAttempts: MAX_DOWNLOAD_ATTEMPTS,
  backoffBaseMs: BACKOFF_BASE_MS,
  backoffCapMs: BACKOFF_CAP_MS
};

function parseArgs(argv) {
  const out = { inventoryOnly: false, maxFiles: 0, force: false, startAt: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--inventory-only') out.inventoryOnly = true;
    if (argv[i] === '--max-files') out.maxFiles = Number(argv[++i]) || 0;
    if (argv[i] === '--force') out.force = true;
    if (argv[i] === '--start-at') out.startAt = argv[++i] || null;
  }
  return out;
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

async function headSize(url) {
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HEAD ${res.status}`);
  return Number(res.headers.get('content-length') || 0);
}

async function validateDownloadedTiff(dest, expected) {
  const tiff = await fromFile(dest);
  const image = await tiff.getImage();
  const w = image.getWidth();
  const h = image.getHeight();
  if (w !== CHELSA_WIDTH || h !== CHELSA_HEIGHT) {
    throw new Error(`dimension-mismatch:${w}x${h}`);
  }
  const nodata = image.getGDALNoData?.();
  return { width: w, height: h, nodata: nodata ?? expected.nodata, crs: 'WGS84' };
}

async function downloadFile(url, dest, expected) {
  const expectedBytes = expected?.expectedBytes;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let offset = 0;
  if (fs.existsSync(part)) offset = fs.statSync(part).size;
  if (fs.existsSync(dest) && !fs.existsSync(part)) {
    const sz = fs.statSync(dest).size;
    if (expectedBytes && sz === expectedBytes) return { skipped: true, bytes: sz };
    if (!expectedBytes) return { skipped: true, bytes: sz };
    offset = 0;
    fs.unlinkSync(dest);
  }

  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {};
  const controller = new AbortController();
  const requestTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(requestTimer);
  }

  if (!res.ok && res.status !== 206) throw new Error(`GET ${res.status}`);
  if (offset > 0 && res.status === 200) {
    offset = 0;
    if (fs.existsSync(part)) fs.unlinkSync(part);
  }

  const writeFlags = offset > 0 ? { flags: 'a' } : {};
  const ws = createWriteStream(part, writeFlags);
  const body = Readable.fromWeb(res.body);
  let inactivityTimer;
  const armInactivity = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      body.destroy(new Error('inactivity-timeout'));
      ws.destroy(new Error('inactivity-timeout'));
    }, INACTIVITY_TIMEOUT_MS);
  };
  armInactivity();
  body.on('data', armInactivity);
  try {
    await pipeline(body, ws);
  } finally {
    clearTimeout(inactivityTimer);
  }

  const finalSize = fs.statSync(part).size;
  if (expectedBytes && finalSize !== expectedBytes) {
    return { partial: true, bytes: finalSize };
  }
  await validateDownloadedTiff(part, expected);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(part, dest);
  return { complete: true, bytes: finalSize };
}

function loadManifest() {
  if (fs.existsSync(MANIFEST)) return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return {
    kind: 'cruvit-chelsa-mirror-manifest-v1',
    sourceClimatology: CHELSA_V21_BASELINE.id,
    entries: [],
    generatedAt: new Date().toISOString()
  };
}

import { execSync } from 'node:child_process';

function diskFreeBytes() {
  const out = execSync('powershell -NoProfile -Command "(Get-PSDrive C).Free"', { encoding: 'utf8' });
  return Number(out.trim());
}

async function buildInventoryEntries(refreshHead = false) {
  let cached = null;
  if (!refreshHead && fs.existsSync(INVENTORY)) {
    try {
      cached = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
    } catch {
      cached = null;
    }
  }
  const cachedById = Object.fromEntries((cached?.entries || []).map((e) => [e.sourceId, e]));
  const entries = [];
  for (const v of BAKE_VARIABLES) {
    for (const month of BAKE_MONTHS) {
      const url = chelsaUrl(v, month);
      const folder = v.folder || v.key;
      const fileName = url.split('/').pop();
      const localPath = path.join(MIRROR_ROOT, folder, fileName);
      const sourceId = `${v.key}-${String(month).padStart(2, '0')}`;
      const hit = cachedById[sourceId];
      let remoteBytes = hit?.expectedBytes ?? null;
      if (refreshHead || !remoteBytes) {
        try {
          remoteBytes = await headSize(url);
        } catch {
          /* optional */
        }
      }
      entries.push({
        sourceId,
        variable: v.key,
        month,
        remoteUrl: url,
        localPath: path.relative(ROOT, localPath).replace(/\\/g, '/'),
        expectedBytes: remoteBytes,
        format: 'GeoTIFF COG',
        dimensions: { width: CHELSA_WIDTH, height: CHELSA_HEIGHT },
        crs: 'WGS84',
        nodata: 65535,
        status: fs.existsSync(localPath) ? 'complete' : 'pending'
      });
    }
  }
  return entries;
}

async function main() {
  const args = parseArgs(process.argv);
  const entries = await buildInventoryEntries(false);
  const projectedBytes = entries.reduce((a, e) => a + (e.expectedBytes || 0), 0);
  const inv = {
    kind: 'cruvit-chelsa-source-inventory-v1',
    fileCount: 84,
    entries,
    projectedMirrorBytes: projectedBytes,
    projectedMirrorGb: projectedBytes / 1e9
  };
  fs.mkdirSync(path.dirname(INVENTORY), { recursive: true });
  fs.writeFileSync(INVENTORY, JSON.stringify(inv, null, 2));
  if (args.inventoryOnly) {
    console.log(JSON.stringify({ inventory: INVENTORY, projectedMirrorGb: inv.projectedMirrorGb }, null, 2));
    return;
  }

  const freeGb = diskFreeBytes() / 1e9;
  const requiredGb = projectedBytes / 1e9 + 20 + MIN_FREE_RESERVE_GB;
  if (freeGb < requiredGb && projectedBytes > 0) {
    console.log(
      JSON.stringify({
        verdict: 'LOCAL_MIRROR_DISK_BLOCKED',
        freeGb,
        requiredGb,
        additionalGbNeeded: requiredGb - freeGb
      })
    );
    process.exit(4);
  }

  const startedAt = Date.now();
  let retries = 0;
  let failed = 0;
  const manifest = loadManifest();
  const byId = Object.fromEntries((manifest.entries || []).map((e) => [e.sourceId, e]));
  let done = 0;
  let queue = entries.filter((e) => {
    const dest = path.join(ROOT, e.localPath);
    return !(
      byId[e.sourceId]?.status === 'validated' &&
      fs.existsSync(dest) &&
      byId[e.sourceId]?.sha256
    );
  });
  if (args.startAt) {
    const idx = queue.findIndex((e) => e.sourceId === args.startAt);
    if (idx < 0) throw new Error(`start-at-not-pending:${args.startAt}`);
    queue = queue.slice(idx);
  }
  if (args.maxFiles > 0) queue = queue.slice(0, args.maxFiles);
  for (const e of queue) {
    const dest = path.join(ROOT, e.localPath);
    if (
      !args.force &&
      byId[e.sourceId]?.status === 'validated' &&
      fs.existsSync(dest) &&
      byId[e.sourceId].sha256
    ) {
      done++;
      continue;
    }
    e.status = 'downloading';
    let attempts = 0;
    let ok = false;
    while (attempts < MAX_DOWNLOAD_ATTEMPTS && !ok) {
      attempts++;
      try {
        const r = await downloadFile(e.remoteUrl, dest, e);
        if (r.partial) {
          retries++;
          const wait = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
          await new Promise((res) => setTimeout(res, wait));
          continue;
        }
        e.downloadedBytes = r.bytes;
        e.sha256 = sha256File(dest);
        const meta = await validateDownloadedTiff(dest, e);
        e.dimensions = { width: meta.width, height: meta.height };
        e.crs = meta.crs;
        e.nodata = meta.nodata;
        e.status = 'validated';
        e.downloadedAt = new Date().toISOString();
        done++;
        ok = true;
        console.log(`OK ${e.sourceId} ${r.bytes} sha=${e.sha256.slice(0, 12)}`);
      } catch (err) {
        retries++;
        if (attempts >= MAX_DOWNLOAD_ATTEMPTS) {
          e.status = 'failed';
          e.error = String(err.message);
          failed++;
          console.error(`FAIL ${e.sourceId}`, err.message);
        } else {
          const wait = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
          await new Promise((res) => setTimeout(res, wait));
        }
      }
    }
    byId[e.sourceId] = e;
    manifest.entries = Object.values(byId);
    manifest.validatedCount = manifest.entries.filter((x) => x.status === 'validated').length;
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  }
  manifest.durationMs = Date.now() - startedAt;
  manifest.retries = retries;
  manifest.failedCount = failed;
  manifest.actualMirrorBytes = manifest.entries
    .filter((x) => x.status === 'validated')
    .reduce((a, e) => a + (e.downloadedBytes || 0), 0);
  const raw = JSON.stringify(manifest, null, 2);
  manifest.manifestSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify({
      validated: manifest.validatedCount || done,
      total: 84,
      actualMirrorGb: manifest.actualMirrorBytes / 1e9,
      durationMs: manifest.durationMs,
      retries: manifest.retries,
      failed: manifest.failedCount,
      manifestSha256: manifest.manifestSha256,
      manifest: MANIFEST
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
