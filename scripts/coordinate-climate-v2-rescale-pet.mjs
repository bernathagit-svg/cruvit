/**
 * One-shot local PET rescale for V2 pilots (no external fetch).
 * Fixes pet_penman decode ×100 (was incorrectly ×10).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCoordinateClimateProfileV2,
  coordinateClimateProfileToStructuralPersistence,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT = path.join(DATA, 'pilot');
const INDEX = path.join(DATA, 'index.json');

const ids = fs
  .readdirSync(PILOT)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

for (const id of ids) {
  const prev = JSON.parse(fs.readFileSync(path.join(PILOT, `${id}.json`), 'utf8'));
  const pet = (prev.monthlyPetMm || []).map((v) => Math.round((Number(v) / 10) * 10) / 10);
  const profile = buildCoordinateClimateProfileV2({
    lat: prev.coordinate.lat,
    lon: prev.coordinate.lon,
    label: prev.coordinate.label,
    monthlyTminC: prev.monthlyTminC,
    monthlyTmeanC: prev.monthlyTmeanC,
    monthlyTmaxC: prev.monthlyTmaxC,
    monthlyPrecipMm: prev.monthlyPrecipMm,
    monthlyPetMm: pet,
    monthlyVpdPa: prev.monthlyVpdPa,
    monthlyHursPct: prev.monthlyHursPct,
    elevationM: prev.elevationM,
    climateGrid: prev.climateGrid,
    terrain: prev.terrain,
    provenance: {
      ...(prev.provenance || {}),
      pilotId: id,
      cityProxy: false,
      usedCityProxy: false,
      petScale: 'raw/100 → mm month⁻¹ (CMI-validated; was incorrectly raw/10)',
      petScaleFix: '2026-08-29-production-hardening'
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
    `P=${profile.annualPrecipitationMm}`,
    `PET=${profile.annualPetMm}`,
    `AI=${profile.aridityIndex}`,
    profile.aridityMoistureRegime
  );
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
index.authorityVersion = COORDINATE_CLIMATE_AUTHORITY_V2_VERSION;
index.petScale = 'raw/100';
index.petScaleNote = 'CMI-validated; corrected from raw/10 on 2026-08-29';
index.updatedAt = new Date().toISOString();
for (const e of index.entries || []) {
  const p = JSON.parse(fs.readFileSync(path.join(DATA, e.profilePath), 'utf8'));
  e.moisture = p.aridityMoistureRegime;
  e.aridityIndex = p.aridityIndex;
  e.annualPetMm = p.annualPetMm;
  e.annualPrecipitationMm = p.annualPrecipitationMm;
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
console.log('rescaled', ids.length, 'pilots');
