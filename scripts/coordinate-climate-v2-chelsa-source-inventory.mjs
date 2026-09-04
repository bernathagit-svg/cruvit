#!/usr/bin/env node
/**
 * CHELSA V2.1 source inventory — 84 climatology rasters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHELSA_V21_BASELINE } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { CHELSA_WIDTH, CHELSA_HEIGHT } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { BAKE_MONTHS, BAKE_VARIABLES, chelsaUrl } from './coordinate-climate-v2-bake-shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/source-inventory.json');

async function headSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60000) });
    if (!res.ok) return { ok: false, status: res.status };
    const len = res.headers.get('content-length');
    return { ok: true, bytes: len ? Number(len) : null, acceptRanges: res.headers.get('accept-ranges') };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function main() {
  const entries = [];
  let totalBytes = 0;
  let known = 0;
  for (const v of BAKE_VARIABLES) {
    for (const month of BAKE_MONTHS) {
      const url = chelsaUrl(v, month);
      const fileName = url.split('/').pop();
      const head = await headSize(url);
      if (head.ok && head.bytes) {
        totalBytes += head.bytes;
        known++;
      }
      entries.push({
        variable: v.key,
        month,
        url,
        fileName,
        remotePath: url.replace(CHELSA_V21_BASELINE.baseUrl + '/', ''),
        format: 'GeoTIFF COG',
        dimensions: { width: CHELSA_WIDTH, height: CHELSA_HEIGHT },
        crs: 'WGS84 geographic (EPSG:4326 class)',
        nodata: 65535,
        sourceClimatology: CHELSA_V21_BASELINE.id,
        remoteBytes: head.bytes ?? null,
        acceptRanges: head.acceptRanges ?? null,
        headOk: head.ok,
        headError: head.error || null
      });
      process.stderr.write(`${fileName} ${head.bytes ?? '?'}\n`);
    }
  }
  const avgBytes = known > 0 ? totalBytes / known : null;
  const projectedTotal = avgBytes ? avgBytes * 84 : null;
  const inv = {
    kind: 'cruvit-chelsa-source-inventory-v1',
    sourceClimatology: CHELSA_V21_BASELINE.id,
    authorityVersion: '2.0.3-vpd-scale',
    fileCount: 84,
    entries,
    measuredRemoteBytes: totalBytes,
    measuredFileCount: known,
    projectedMirrorBytes: projectedTotal,
    projectedMirrorGb: projectedTotal ? projectedTotal / 1e9 : null,
    generatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(inv, null, 2));
  console.log(JSON.stringify({ out: OUT, projectedMirrorGb: inv.projectedMirrorGb, measuredFileCount: known }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
