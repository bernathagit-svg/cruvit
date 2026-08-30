/**
 * Build CRUVIT compact climate tile prototype from pilot profiles + attach confidence.
 * Central/build only — no user runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packClimateCellFromProfile,
  buildCompactTileDocument,
  writeCompactTileFile,
  measureTilePrototypeStats
} from '../modules/personal-domain/coordinate-climate-compact-tiles-v2.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import { COORDINATE_CLIMATE_AUTHORITY_V2_VERSION } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT = path.join(DATA, 'pilot');
const QA = path.join(DATA, 'qa');
const TILES = path.join(DATA, 'tiles');

const ids = fs.readdirSync(PILOT).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const cells = [];

for (const id of ids) {
  const profile = JSON.parse(fs.readFileSync(path.join(PILOT, `${id}.json`), 'utf8'));
  let qa = null;
  const qaPath = path.join(QA, `${id}.json`);
  if (fs.existsSync(qaPath)) qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  const confidence = buildCoordinateClimateConfidenceV2({ profile, qaRecord: qa });
  profile.confidenceDimensions = confidence.dimensions;
  profile.confidence = confidence.overall;
  profile.localRepresentativeness = confidence.localRepresentativeness;
  profile.confidenceWarnings = confidence.warnings;
  profile.authorityVersion = COORDINATE_CLIMATE_AUTHORITY_V2_VERSION;
  fs.writeFileSync(path.join(PILOT, `${id}.json`), JSON.stringify(profile, null, 2) + '\n');
  cells.push(packClimateCellFromProfile(profile));
}

const tileDoc = buildCompactTileDocument({
  tileId: 'pilot-sparse-v1',
  cells,
  note: 'Bounded pilot prototype — not full global land dump'
});
const { meta } = writeCompactTileFile(TILES, tileDoc);
const projection = measureTilePrototypeStats(meta);

const report = {
  authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  tile: meta,
  projection,
  naiveJsonPerCellBytes: 13500,
  naiveGlobalJsonTb: Math.round(((13500 * 150_000_000) / 1e12) * 100) / 100,
  compressionVsNaiveJson:
    meta.bytesPerCellGzip && meta.bytesPerCellGzip > 0
      ? Math.round((13500 / meta.bytesPerCellGzip) * 10) / 10
      : null
};
fs.writeFileSync(path.join(TILES, 'prototype-metrics.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
