#!/usr/bin/env node
/**
 * Optimized resumable global bake — macro windows, TIFF cache, land prefilter.
 * DO NOT run full planet until scalability gate PASS.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-bake-global-optimized.mjs --max-macro 10
 *   node scripts/coordinate-climate-v2-bake-global-optimized.mjs --require-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  COVERAGE_FORMAT_BINARY,
  COVERAGE_TILE_SCHEMA_VERSION,
  COVERAGE_TILE_CELLS,
  CHELSA_WIDTH,
  CHELSA_HEIGHT,
  tileFileNameFromKey
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { GLOBAL_BAKE_ID_DEFAULT, GLOBAL_PACK_ID } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  bakeMacroBlock,
  maxTileIndex,
  resetBakeEngineCaches,
  getSourceBytesRead
} from './coordinate-climate-v2-bake-engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GLOBAL_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', GLOBAL_PACK_ID);

/** V1 scalability defaults — see scalability report. */
const MACRO_TILES = 8;
const LAYER_CONCURRENCY = 4;
const PROGRESS_EVERY = 4;

function parseArgs(argv) {
  const out = {
    maxMacro: 0,
    requireGate: false,
    skipTerrain: true,
    macroTiles: MACRO_TILES,
    layerConcurrency: LAYER_CONCURRENCY,
    globalBakeId: GLOBAL_BAKE_ID_DEFAULT
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--max-macro') out.maxMacro = Number(argv[++i]) || 0;
    if (argv[i] === '--require-gate') out.requireGate = true;
    if (argv[i] === '--skip-terrain') out.skipTerrain = true;
    if (argv[i] === '--macro-tiles') out.macroTiles = Number(argv[++i]) || MACRO_TILES;
    if (argv[i] === '--layer-concurrency') out.layerConcurrency = Number(argv[++i]) || LAYER_CONCURRENCY;
  }
  return out;
}

function loadLandMask() {
  const p = path.join(GLOBAL_ROOT, 'land-tile-mask.json');
  if (!fs.existsSync(p)) return null;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Set(m.land || []);
}

function loadProgress() {
  const p = path.join(GLOBAL_ROOT, 'progress-optimized.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    engine: 'macro-block-v1',
    macroTiles: MACRO_TILES,
    completedTiles: [],
    completedMacros: [],
    skippedOceanTiles: [],
    stats: { landTiles: 0, oceanTilesSkipped: 0, validCells: 0, totalGzipBytes: 0, sourceBytesRead: 0 }
  };
}

function allMacroCoords(macroTiles) {
  const { maxTx, maxTy } = maxTileIndex(COVERAGE_TILE_CELLS);
  const maxMbx = Math.floor(maxTx / macroTiles);
  const maxMby = Math.floor(maxTy / macroTiles);
  const out = [];
  for (let mby = 0; mby <= maxMby; mby++) {
    for (let mbx = 0; mbx <= maxMbx; mbx++) out.push({ mbx, mby });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.requireGate) {
    const gatePath = path.join(ROOT, 'tests', '_coordinate-climate-v2-scalability-v1-report.json');
    if (!fs.existsSync(gatePath)) {
      console.error('Scalability gate report missing');
      process.exit(2);
    }
    const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
    if (gate.AE_fullGlobalBakeMayResume !== 'YES') {
      console.error('Scalability gate blocks full bake:', gate.verdict);
      process.exit(3);
    }
  }

  const landMask = loadLandMask();
  const progressPath = path.join(GLOBAL_ROOT, 'progress-optimized.json');
  const checksumPath = path.join(GLOBAL_ROOT, 'tile-checksums.json');
  const progress = loadProgress();
  const completed = new Set(progress.completedTiles || []);
  const completedMacros = new Set(progress.completedMacros || []);
  const checksums = fs.existsSync(checksumPath) ? JSON.parse(fs.readFileSync(checksumPath, 'utf8')) : {};
  const macros = allMacroCoords(args.macroTiles);
  const pending = macros.filter(({ mbx, mby }) => !completedMacros.has(`${mbx}:${mby}`));
  const toRun = args.maxMacro > 0 ? pending.slice(0, args.maxMacro) : pending;

  console.log(
    JSON.stringify({
      engine: 'optimized-macro',
      macroTiles: args.macroTiles,
      layerConcurrency: args.layerConcurrency,
      pendingMacros: pending.length,
      running: toRun.length,
      landMaskLoaded: Boolean(landMask)
    })
  );

  resetBakeEngineCaches();
  const started = Date.now();
  let baked = 0;

  for (const { mbx, mby } of toRun) {
    const key = `${mbx}:${mby}`;
    try {
      const r = await bakeMacroBlock(mbx, mby, {
        tileCells: COVERAGE_TILE_CELLS,
        macroTiles: args.macroTiles,
        layerConcurrency: args.layerConcurrency,
        globalBakeId: args.globalBakeId,
        regionId: GLOBAL_PACK_ID
      });
      for (const t of r.results) {
        const tk = `${t.tx}:${t.ty}`;
        if (t.skipped) {
          progress.skippedOceanTiles.push(tk);
          progress.stats.oceanTilesSkipped += 1;
          continue;
        }
        if (landMask && !landMask.has(tk)) continue;
        if (completed.has(tk)) continue;
        const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
        fs.mkdirSync(tilesDir, { recursive: true });
        fs.writeFileSync(path.join(tilesDir, t.fileName), t.buffer);
        checksums[t.fileName] = t.sha256;
        completed.add(tk);
        progress.completedTiles.push(tk);
        progress.stats.landTiles += 1;
        progress.stats.validCells += t.cellCount;
        progress.stats.totalGzipBytes += t.gzipBytes;
        baked += 1;
      }
      completedMacros.add(key);
      progress.completedMacros.push(key);
      progress.stats.sourceBytesRead = getSourceBytesRead();
      progress.updatedAt = new Date().toISOString();
      if (baked % PROGRESS_EVERY === 0) {
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
        fs.writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));
      }
      console.log(`MACRO ${key} baked=${r.tilesBaked} skipped=${r.tilesSkipped} ms=${Math.round(r.durationMs)}`);
    } catch (err) {
      console.error(`FAIL macro ${key}:`, err.message);
      progress.lastError = { key, message: String(err.message), at: new Date().toISOString() };
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      throw err;
    }
  }

  progress.durationMs = Date.now() - started;
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  fs.writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));
  console.log(JSON.stringify({ verdict: 'OPTIMIZED_BAKE_PHASE', bakedThisRun: baked, stats: progress.stats }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
