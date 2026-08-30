/**
 * One-shot local VPD rescale for V2 pilots (no external fetch).
 * Fixes CHELSA VPD decode: physical Pa = DN × 0.1 + 0 (was incorrectly DN as Pa).
 *
 * Usage: node scripts/coordinate-climate-v2-rescale-vpd.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCoordinateClimateProfileV2,
  coordinateClimateProfileToStructuralPersistence,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  CHELSA_VPD_GEOTIFF_ENCODING
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT = path.join(DATA, 'pilot');
const INDEX = path.join(DATA, 'index.json');

const FIX_ID = '2026-08-30-vpd-scale-0.1';

const ids = fs
  .readdirSync(PILOT)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

for (const id of ids) {
  const prev = JSON.parse(fs.readFileSync(path.join(PILOT, `${id}.json`), 'utf8'));
  const already =
    prev.provenance?.vpdScaleFix === FIX_ID ||
    prev.provenance?.vpdScale === 'raw×0.1 → Pa';
  const vpd = (prev.monthlyVpdPa || []).map((v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // Idempotent: if already ~physical (< 3000 typical), skip divide
    if (already || (prev.meanVpdPa != null && Number(prev.meanVpdPa) < 3000 && n < 3000)) {
      return Math.round(n * 10) / 10;
    }
    return Math.round(n * CHELSA_VPD_GEOTIFF_ENCODING.scale * 10) / 10;
  });
  const profile = buildCoordinateClimateProfileV2({
    lat: prev.coordinate.lat,
    lon: prev.coordinate.lon,
    label: prev.coordinate.label,
    monthlyTminC: prev.monthlyTminC,
    monthlyTmeanC: prev.monthlyTmeanC,
    monthlyTmaxC: prev.monthlyTmaxC,
    monthlyPrecipMm: prev.monthlyPrecipMm,
    monthlyPetMm: prev.monthlyPetMm,
    monthlyVpdPa: vpd,
    monthlyHursPct: prev.monthlyHursPct,
    elevationM: prev.elevationM,
    climateGrid: prev.climateGrid,
    terrain: prev.terrain,
    provenance: {
      ...(prev.provenance || {}),
      pilotId: id,
      cityProxy: false,
      usedCityProxy: false,
      petScale: prev.provenance?.petScale,
      petScaleFix: prev.provenance?.petScaleFix,
      vpdScale: 'raw×0.1 → Pa (CHELSA GDAL SCALE=0.1 OFFSET=0)',
      vpdScaleFix: FIX_ID,
      vpdEncoding: CHELSA_VPD_GEOTIFF_ENCODING
    },
    derivedAt: new Date().toISOString()
  });
  const structural = coordinateClimateProfileToStructuralPersistence(profile);
  fs.writeFileSync(
    path.join(PILOT, `${id}.json`),
    JSON.stringify({ ...profile, structuralPersistencePreview: structural }, null, 2) + '\n'
  );
  console.log(
    id,
    `meanVpdPa=${profile.meanVpdPa}`,
    `atm=${profile.atmosphericHumidityRegime || profile.humiditySignal}`,
    `RH=${profile.meanRelativeHumidityPct}`
  );
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
index.authorityVersion = COORDINATE_CLIMATE_AUTHORITY_V2_VERSION;
index.vpdScale = 'raw×0.1';
index.vpdScaleNote =
  'CHELSA COG GDAL SCALE=0.1 OFFSET=0; corrected from raw-as-Pa on 2026-08-30';
index.updatedAt = new Date().toISOString();
for (const e of index.entries || []) {
  const p = JSON.parse(fs.readFileSync(path.join(DATA, e.profilePath), 'utf8'));
  e.moisture = p.aridityMoistureRegime;
  e.aridityIndex = p.aridityIndex;
  e.meanVpdPa = p.meanVpdPa;
  e.humiditySignal = p.humiditySignal;
  e.atmosphericHumidityRegime = p.atmosphericHumidityRegime || p.humiditySignal;
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
console.log('rescaled', ids.length, 'pilots →', COORDINATE_CLIMATE_AUTHORITY_V2_VERSION);
