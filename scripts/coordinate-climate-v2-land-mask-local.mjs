#!/usr/bin/env node
/** Run full land-tile mask from LOCAL pet_penman-01 mirror (correct ocean nodata). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  buildLandTileMask,
  setSourceMode,
  SOURCE_MODE,
  resetNetworkChelsaCalls,
  getNetworkChelsaCalls
} from './coordinate-climate-v2-bake-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASK = path.join(ROOT, 'data/coordinate-climate/v2/coverage/global-v1/land-tile-mask.json');

function parseArgs(argv) {
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--force') force = true;
  }
  return { force };
}

async function main() {
  const args = parseArgs(process.argv);
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);
  resetNetworkChelsaCalls();
  const t0 = performance.now();
  const mask = await buildLandTileMask({
    tileCells: 64,
    maskPath: MASK,
    probeConcurrency: 12,
    force: args.force
  });
  mask.durationMs = performance.now() - t0;
  mask.networkChelsaCalls = getNetworkChelsaCalls();
  mask.sourceMode = 'LOCAL_MIRROR';
  fs.writeFileSync(MASK, JSON.stringify(mask, null, 2));
  console.log(
    JSON.stringify(
      {
        candidate: mask.totalCandidateTiles,
        landOnly: mask.landOnlyTileCount,
        mixed: mask.mixedLandOceanTileCount,
        ocean: mask.oceanTileCount,
        validLandCells: mask.totalValidLandCells,
        nodataCells: mask.totalNodataCells,
        ms: mask.durationMs,
        network: mask.networkChelsaCalls
      },
      null,
      2
    )
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
