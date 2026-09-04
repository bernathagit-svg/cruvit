#!/usr/bin/env node
/**
 * Build global land-tile mask — one tasmin probe per candidate tile (cheap prefilter).
 * Run once before full bake. Resumable via output file.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-land-tile-mask.mjs
 *   node scripts/coordinate-climate-v2-land-tile-mask.mjs --sample 2000
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  candidateTileCount,
  maxTileIndex,
  probeTileLand,
  resetBakeEngineCaches
} from './coordinate-climate-v2-bake-engine.mjs';
import { mapPool } from './coordinate-climate-v2-bake-shared.mjs';
import { GLOBAL_PACK_ID } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/coordinate-climate/v2/coverage', GLOBAL_PACK_ID, 'land-tile-mask.json');

function parseArgs(argv) {
  let sample = 0;
  let concurrency = 3;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--sample') sample = Number(argv[++i]) || 0;
    if (argv[i] === '--concurrency') concurrency = Number(argv[++i]) || 3;
  }
  return { sample, concurrency };
}

async function main() {
  const args = parseArgs(process.argv);
  const { maxTx, maxTy } = maxTileIndex(64);
  const all = [];
  for (let ty = 0; ty <= maxTy; ty++) {
    for (let tx = 0; tx <= maxTx; tx++) all.push({ tx, ty });
  }
  const coords = args.sample > 0 ? all.filter((_, i) => i % Math.ceil(all.length / args.sample) === 0) : all;
  resetBakeEngineCaches();
  const land = [];
  const ocean = [];
  const started = Date.now();
  await mapPool(coords, args.concurrency, async ({ tx, ty }) => {
    const p = await probeTileLand(tx, ty, 64);
    if (p.isLand) land.push(`${tx}:${ty}`);
    else ocean.push(`${tx}:${ty}`);
  });
  const mask = {
    kind: 'cruvit-climate-land-tile-mask-v1',
    totalCandidateTiles: candidateTileCount(64),
    probedTiles: coords.length,
    landTileCount: land.length,
    oceanTileCount: ocean.length,
    landRatio: land.length / coords.length,
    projectedTerrestrialTiles: Math.round((land.length / coords.length) * candidateTileCount(64)),
    projectedOceanTiles: Math.round((ocean.length / coords.length) * candidateTileCount(64)),
    probeConcurrency: args.concurrency,
    durationMs: Date.now() - started,
    land,
    ocean,
    generatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(mask, null, 2));
  console.log(JSON.stringify({ out: OUT, ...mask, land: land.length, ocean: ocean.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
