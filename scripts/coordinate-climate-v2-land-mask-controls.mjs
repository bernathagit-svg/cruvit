#!/usr/bin/env node
/** Ocean/land control probes for CHELSA raw nodata semantics (pet_penman authority). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import { chelsaGridCellIndex } from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { CHELSA_BBOX } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { isRawChelsaSourcePixelValid } from './coordinate-climate-v2-bake-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PET_PATH = path.join(
  ROOT,
  'data/coordinate-climate/v2/source-mirror/files/pet/CHELSA_pet_penman_01_1981-2010_V.2.1.tif'
);
const OUT = path.join(ROOT, 'tests/_coordinate-climate-v2-land-mask-controls.json');

const OCEAN = [
  { id: 'ocean-0--140', lat: 0, lon: -140 },
  { id: 'ocean-0--30', lat: 0, lon: -30 },
  { id: 'ocean--40--130', lat: -40, lon: -130 },
  { id: 'ocean-30--150', lat: 30, lon: -150 },
  { id: 'ocean--50-20', lat: -50, lon: 20 }
];

const LAND = [
  { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', lat: -0.22985, lon: -78.52495 },
  { id: 'singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'cairo', lat: 30.06263, lon: 31.24967 }
];

async function probePoint(image, gdalNoData, pt) {
  const cell = chelsaGridCellIndex(pt.lat, pt.lon, CHELSA_BBOX, 0.0083333333);
  const data = await image.readRasters({ window: [cell.x, cell.y, cell.x + 1, cell.y + 1], width: 1, height: 1 });
  const raw = data[0][0];
  const valid = isRawChelsaSourcePixelValid(raw, gdalNoData);
  return {
    id: pt.id,
    lat: pt.lat,
    lon: pt.lon,
    cellX: cell.x,
    cellY: cell.y,
    rawSourceValue: raw,
    rawNodataValue: gdalNoData,
    decodedValidity: valid,
    classification: valid ? 'LAND' : 'NODATA'
  };
}

async function main() {
  if (!fs.existsSync(PET_PATH)) throw new Error('pet_penman-01 mirror missing');
  const image = await (await fromFile(PET_PATH)).getImage();
  const gdalNoData = image.getGDALNoData?.() ?? 65535;
  const ocean = [];
  for (const pt of OCEAN) ocean.push(await probePoint(image, gdalNoData, pt));
  const land = [];
  for (const pt of LAND) land.push(await probePoint(image, gdalNoData, pt));
  const pass =
    ocean.every((r) => r.classification === 'NODATA') && land.every((r) => r.classification === 'LAND');
  const report = {
    generatedAt: new Date().toISOString(),
    probeLayer: 'pet_penman month 1',
    rootCauseNote:
      'tasmin/tas/tasmax carry numeric values over ocean; pet_penman uses UInt16 65535 GDAL nodata at ocean cells',
    ocean,
    land,
    pass
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass, ocean: ocean.map((r) => r.classification), land: land.map((r) => r.classification) }));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
