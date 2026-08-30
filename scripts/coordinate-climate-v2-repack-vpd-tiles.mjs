/**
 * Local VPD rescale for coverage tiles (no CHELSA re-download).
 * Divides packed VPD Pa by 10 when values look like pre-scale DN (≫3000).
 *
 * Usage: node scripts/coordinate-climate-v2-repack-vpd-tiles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  decodeBinaryCoverageTile,
  encodeBinaryCoverageTile,
  packBinaryClimateCell
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGION = 'emed-n-israel-v1';
const OUT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', REGION);
const MANIFEST = path.join(OUT, 'manifest.json');
const NEW_BAKE = 'bake-2026-08-30-emed-n-israel-v1-vpd-scale';

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const tilesDir = path.join(OUT, 'tiles');

function rescaleCellVpd(cell) {
  const vpd = (cell.vpd || []).map((v) => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n > 3000) return Math.round(n * 0.1);
    return Math.round(n);
  });
  return { ...cell, vpd };
}

const newTiles = [];
for (const t of manifest.tiles || []) {
  const fp = path.join(tilesDir, t.fileName);
  const gzip = fs.readFileSync(fp);
  const decoded = decodeBinaryCoverageTile(gzip);
  const cells = decoded.cells.map(rescaleCellVpd);
  const packed = encodeBinaryCoverageTile({
    tileKey: t.tileKey,
    tx: t.tx,
    ty: t.ty,
    cells: cells.map((c) => packBinaryClimateCell(c)),
    bakeVersion: NEW_BAKE,
    regionId: REGION
  });
  fs.writeFileSync(fp, packed.buffer);
  const sha256 = crypto.createHash('sha256').update(packed.buffer).digest('hex');
  newTiles.push({
    ...t,
    gzipBytes: packed.gzipBytes,
    rawBytes: packed.rawBytes,
    bytesPerCellGzip: packed.bytesPerCellGzip,
    sha256,
    cellCount: cells.length
  });
  console.log(t.tileKey, 'cells', cells.length, 'gzip', packed.gzipBytes);
}

manifest.bakeVersion = NEW_BAKE;
manifest.sourceVersions = {
  ...(manifest.sourceVersions || {}),
  vpdScale: 'raw×0.1 → Pa',
  vpdScaleFix: '2026-08-30-vpd-scale-0.1'
};
manifest.tiles = newTiles;
manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log('repacked', newTiles.length, 'tiles bake=', NEW_BAKE);
