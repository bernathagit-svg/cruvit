#!/usr/bin/env node
/**
 * Stage Product Proof remote canary objects (same R2 key layout).
 * Copies existing global-v1 tiles — does not regenerate climate / does not call CHELSA.
 *
 * Usage: node scripts/coordinate-climate-v2-stage-remote-canary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { coverageTileIndexFromLatLon, tileFileNameFromKey } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import {
  GLOBAL_BAKE_ID_DEFAULT,
  GLOBAL_PACK_ID
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import { buildClimateObjectKey } from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', GLOBAL_PACK_ID);
const OUT = path.join(ROOT, 'data', 'catalog', 'product-proof-v1', 'remote-canary');
const MIRROR = path.join(OUT, 'object-mirror');

const CANARY_COORDS = [
  { id: 'mojstrana', lat: 46.42383, lon: 13.8752 },
  { id: 'ljubljana', lat: 46.0569, lon: 14.5058 },
  { id: 'nyc', lat: 40.7128, lon: -74.006 }
];

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function copyToMirror(objectKey, srcAbs) {
  const dest = path.join(MIRROR, ...objectKey.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcAbs, dest);
  return {
    objectKey,
    bytes: fs.statSync(dest).size,
    sourceLocalPath: srcAbs,
    sha256: sha256File(dest)
  };
}

function main() {
  const bake = GLOBAL_BAKE_ID_DEFAULT;
  const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
  if (!fs.existsSync(tilesDir)) {
    console.error(JSON.stringify({ error: 'local_global_tiles_missing', tilesDir }));
    process.exit(2);
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(MIRROR, { recursive: true });

  const objects = [];
  const seenTiles = new Set();

  for (const c of CANARY_COORDS) {
    const tip = coverageTileIndexFromLatLon(c.lat, c.lon);
    if (!tip) throw new Error(`tile_index_failed:${c.id}`);
    const fn = tileFileNameFromKey(tip.tileKey);
    const src = path.join(tilesDir, fn);
    if (!fs.existsSync(src)) throw new Error(`tile_missing:${fn}`);
    const objectKey = buildClimateObjectKey({
      kind: 'tile',
      tileKey: tip.tileKey,
      globalBakeId: bake
    });
    if (!seenTiles.has(objectKey)) {
      objects.push({
        kind: 'tile',
        for: c.id,
        lat: c.lat,
        lon: c.lon,
        tileKey: tip.tileKey,
        ...copyToMirror(objectKey, src)
      });
      seenTiles.add(objectKey);
    }
  }

  const manifestSrc = path.join(GLOBAL_ROOT, 'manifest.json');
  const indexSrc = path.join(GLOBAL_ROOT, 'global-index.json');
  objects.push({
    kind: 'manifest',
    ...copyToMirror(
      buildClimateObjectKey({ kind: 'manifest', globalBakeId: bake }),
      manifestSrc
    )
  });
  objects.push({
    kind: 'global-index',
    ...copyToMirror(
      buildClimateObjectKey({ kind: 'global-index', globalBakeId: bake }),
      indexSrc
    )
  });

  const list = {
    policyId: 'product-proof-remote-canary-v1',
    globalBakeId: bake,
    packId: GLOBAL_PACK_ID,
    objectMirrorRoot: MIRROR,
    REMOTE_CANARY_OBJECT_LIST: objects.map((o) => ({
      kind: o.kind,
      objectKey: o.objectKey,
      bytes: o.bytes,
      sha256: o.sha256,
      sourceLocalPath: o.sourceLocalPath,
      tileKey: o.tileKey || null,
      for: o.for || null,
      lat: o.lat ?? null,
      lon: o.lon ?? null
    })),
    totalBytes: objects.reduce((s, o) => s + o.bytes, 0),
    note: 'Objects use normal global-v1 keying. No city-named climate files.'
  };

  fs.writeFileSync(path.join(OUT, 'REMOTE_CANARY_OBJECT_LIST.json'), JSON.stringify(list, null, 2));
  console.log(JSON.stringify(list, null, 2));
}

main();
