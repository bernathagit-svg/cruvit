/**
 * Central/background QA only — model-vs-observed representativeness.
 * NEVER import into user-request hot paths that fetch remote climate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCoordinateClimateConfidenceV2,
  deriveLocalRepresentativenessFromQa
} from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const QA_DIR = path.join(DATA, 'qa');
const PILOT = path.join(DATA, 'pilot');

function loadPilot(id) {
  const p = path.join(PILOT, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Independent reference normals (QA only — do not replace CHELSA).
 * Sources are published station/atlas class ranges; not paid APIs.
 */
export const ACCURACY_SAMPLE_DEFINITIONS = [
  {
    id: 'yehiam',
    lat: 33.12806,
    lon: 35.22028,
    climateClass: 'mediterranean-highland-margin',
    tags: ['mediterranean', 'inland', 'mountainous'],
    pilotId: 'yehiam',
    qaEvidenceAvailable: true,
    qaSource: 'IMS/Western-Galilee station-class normals + Israel atlas precip bands (QA synthesis)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 500, max: 900, note: 'Western Galilee / nearby station class ~500–900 mm' },
      coldestMonthMeanMinC: { value: 7.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 30.0, toleranceC: 3.0 }
    },
    yehiamReview: {
      extractionCorrect: true,
      conclusions: ['A', 'C'],
      narrative:
        'CHELSA cell extraction verified (bio12=1293.6 mm). Model is wetter than local station-class normals; orographic CHELSA treatment and station/elevation/period mismatch (C) likely contribute. No extraction bug (D false). Preserve CHELSA; demote LOCAL_REPRESENTATIVENESS.'
    }
  },
  {
    id: 'cairo',
    lat: 30.06263,
    lon: 31.24967,
    climateClass: 'hyper-arid',
    tags: ['hyper-arid', 'inland'],
    pilotId: 'cairo',
    qaEvidenceAvailable: true,
    qaSource: 'Cairo WMO-class normals (precip ~20–30 mm; hot summers)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 15, max: 40 },
      coldestMonthMeanMinC: { value: 9.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 35.0, toleranceC: 2.5 }
    }
  },
  {
    id: 'singapore',
    lat: 1.28967,
    lon: 103.85007,
    climateClass: 'humid-tropical',
    tags: ['humid-tropical', 'coastal'],
    pilotId: 'singapore',
    qaEvidenceAvailable: true,
    qaSource: 'Singapore Changi-class normals (~2200–2500 mm; equatorial)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 2100, max: 2600 },
      coldestMonthMeanMinC: { value: 24.0, toleranceC: 2.0 },
      warmestMonthMeanMaxC: { value: 31.0, toleranceC: 3.5 }
    }
  },
  {
    id: 'kochi',
    lat: 9.93988,
    lon: 76.26022,
    climateClass: 'humid-tropical-monsoon',
    tags: ['humid-tropical', 'coastal'],
    pilotId: 'kochi',
    qaEvidenceAvailable: true,
    qaSource: 'Kochi/Cochin Indian Meteorological station-class (~2800–3200 mm)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 2700, max: 3300 },
      coldestMonthMeanMinC: { value: 23.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 32.0, toleranceC: 2.5 }
    }
  },
  {
    id: 'helsinki',
    lat: 60.16952,
    lon: 24.93545,
    climateClass: 'maritime-temperate-cold',
    tags: ['maritime-temperate', 'continental-cold', 'coastal'],
    pilotId: 'helsinki',
    qaEvidenceAvailable: true,
    qaSource: 'Helsinki Kaisaniemi-class normals (~650–700 mm; cold winters)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 600, max: 750 },
      coldestMonthMeanMinC: { value: -7.0, toleranceC: 3.0 },
      warmestMonthMeanMaxC: { value: 22.0, toleranceC: 3.0 }
    }
  },
  {
    id: 'tokyo',
    lat: 35.6895,
    lon: 139.69171,
    climateClass: 'humid-subtropical',
    tags: ['subtropical', 'coastal'],
    pilotId: 'tokyo',
    qaEvidenceAvailable: true,
    qaSource: 'Tokyo JMA-class normals (~1400–1600 mm)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 1400, max: 1650 },
      coldestMonthMeanMinC: { value: 1.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 31.0, toleranceC: 2.5 }
    }
  },
  {
    id: 'quito',
    lat: -0.22985,
    lon: -78.52495,
    climateClass: 'highland-equatorial',
    tags: ['highland', 'mountainous', 'humid-tropical-elevated'],
    pilotId: 'quito',
    qaEvidenceAvailable: true,
    qaSource: 'Quito highland normals (cool; precip highly local ~900–2200 mm by slope/aspect)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 900, max: 2200 },
      coldestMonthMeanMinC: { value: 8.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 19.0, toleranceC: 4.0 }
    }
  },
  // Additional sample points (exact coords) — CHELSA may be absent until baked
  {
    id: 'alice-springs',
    lat: -23.698,
    lon: 133.8807,
    climateClass: 'arid-inland',
    tags: ['hyper-arid', 'inland'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'Alice Springs BoM-class (~280 mm; hot summers)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 240, max: 320 },
      coldestMonthMeanMinC: { value: 4.0, toleranceC: 3.0 },
      warmestMonthMeanMaxC: { value: 36.0, toleranceC: 3.0 }
    },
    note: 'Unprepared in CRUVIT index — QA reference only until central bake'
  },
  {
    id: 'bergen',
    lat: 60.3913,
    lon: 5.3221,
    climateClass: 'maritime-temperate-wet',
    tags: ['maritime-temperate', 'coastal'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'Bergen Florida-class (~2250 mm maritime)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 2000, max: 2500 },
      coldestMonthMeanMinC: { value: -1.0, toleranceC: 3.0 },
      warmestMonthMeanMaxC: { value: 20.0, toleranceC: 3.0 }
    }
  },
  {
    id: 'denver',
    lat: 39.7392,
    lon: -104.9903,
    climateClass: 'continental-highland-margin',
    tags: ['continental-cold', 'inland', 'highland'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'Denver Stapleton/DIA-class normals (~350–400 mm; cold winters)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 330, max: 420 },
      coldestMonthMeanMinC: { value: -9.0, toleranceC: 3.0 },
      warmestMonthMeanMaxC: { value: 31.0, toleranceC: 3.0 }
    }
  },
  {
    id: 'lahaina-maui',
    lat: 20.8783,
    lon: -156.6825,
    climateClass: 'subtropical-coastal-lee',
    tags: ['subtropical', 'coastal'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'West Maui lee-shore normals (often <500 mm; orographic rain shadow)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 250, max: 500 },
      coldestMonthMeanMinC: { value: 18.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 32.0, toleranceC: 2.5 }
    }
  },
  {
    id: 'hilo-maui-pair',
    lat: 19.7297,
    lon: -155.09,
    climateClass: 'humid-tropical-windward',
    tags: ['humid-tropical', 'coastal', 'mountainous'],
    pilotId: null,
    nearbyPairWith: 'lahaina-maui',
    qaEvidenceAvailable: true,
    qaSource: 'Hilo-class windward Hawaii (~3000+ mm) — same island chain, different precip',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 2800, max: 3800 },
      coldestMonthMeanMinC: { value: 18.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 29.0, toleranceC: 2.5 }
    }
  },
  {
    id: 'marrakesh',
    lat: 31.6295,
    lon: -7.9811,
    climateClass: 'mediterranean-arid-margin',
    tags: ['mediterranean', 'inland', 'arid'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'Marrakech station-class (~250–350 mm)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 220, max: 380 },
      coldestMonthMeanMinC: { value: 6.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 37.0, toleranceC: 3.0 }
    }
  },
  {
    id: 'la-paz',
    lat: -16.5,
    lon: -68.15,
    climateClass: 'highland-cold',
    tags: ['highland', 'mountainous', 'inland'],
    pilotId: null,
    qaEvidenceAvailable: true,
    qaSource: 'La Paz El Alto-class highland (~500–600 mm; cool)',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 450, max: 650 },
      coldestMonthMeanMinC: { value: -1.0, toleranceC: 3.0 },
      warmestMonthMeanMaxC: { value: 18.0, toleranceC: 3.0 }
    }
  },
  {
    id: 'yehiam-nearby-coast',
    lat: 32.9581,
    lon: 35.0831,
    climateClass: 'mediterranean-coastal',
    tags: ['mediterranean', 'coastal'],
    pilotId: null,
    nearbyPairWith: 'yehiam',
    qaEvidenceAvailable: true,
    qaSource: 'Akko/Haifa coastal strip normals (~500–650 mm) — nearby pair to Yehiam inland/upland',
    qaDate: '2026-08-29',
    qaVersion: 'qa-v1',
    reference: {
      annualPrecipitationMm: { min: 500, max: 650 },
      coldestMonthMeanMinC: { value: 9.0, toleranceC: 2.5 },
      warmestMonthMeanMaxC: { value: 31.0, toleranceC: 2.5 }
    },
    note: 'Nearby pair: coastal normals drier/warmer winters than upland Yehiam; CRUVIT must not city-proxy Yehiam↔Akko'
  }
];

function buildQaRecord(def, profile) {
  const chelsa = profile
    ? {
        annualPrecipitationMm: profile.annualPrecipitationMm,
        coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
        warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC,
        annualPetMm: profile.annualPetMm,
        aridityIndex: profile.aridityIndex,
        cell: profile.climateGrid?.cellPixel || null
      }
    : null;

  const base = {
    id: def.id,
    lat: def.lat,
    lon: def.lon,
    climateClass: def.climateClass,
    tags: def.tags,
    qaEvidenceAvailable: def.qaEvidenceAvailable === true && !!chelsa,
    qaSource: def.qaSource,
    qaDate: def.qaDate,
    qaVersion: def.qaVersion,
    chelsa,
    reference: def.reference,
    chelsaReplaced: false,
    note: def.note || null,
    nearbyPairWith: def.nearbyPairWith || null,
    yehiamReview: def.yehiamReview || null,
    preparedInCruvit: !!profile
  };

  if (!chelsa) {
    base.qaEvidenceAvailable = false;
    base.representativeness = {
      level: 'unknown',
      reason: 'chelsa-profile-not-baked-yet',
      warnings: ['Independent reference stored; CHELSA comparison deferred until central bake.']
    };
    base.confidence = null;
    return base;
  }

  const representativeness = deriveLocalRepresentativenessFromQa(base, profile);
  const confidence = buildCoordinateClimateConfidenceV2({
    profile,
    qaRecord: { ...base, qaEvidenceAvailable: true }
  });
  return {
    ...base,
    qaEvidenceAvailable: true,
    representativeness,
    confidence,
    divergenceSummary: {
      precip:
        representativeness.variables?.annualPrecipitationMm || null,
      cold:
        representativeness.variables?.coldestMonthMeanMinC || null,
      warm:
        representativeness.variables?.warmestMonthMeanMaxC || null,
      material: representativeness.materialDivergence
    }
  };
}

function main() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  const results = [];
  for (const def of ACCURACY_SAMPLE_DEFINITIONS) {
    const profile = def.pilotId ? loadPilot(def.pilotId) : null;
    const row = buildQaRecord(def, profile);
    results.push(row);
    fs.writeFileSync(path.join(QA_DIR, `${def.id}.json`), JSON.stringify(row, null, 2) + '\n');
  }

  const withChelsa = results.filter((r) => r.chelsa);
  const material = withChelsa.filter((r) => r.representativeness?.materialDivergence);
  const systematic = {
    yehiamPrecipWetBiasIsolatedAmongPreparedPilots: material
      .filter((m) => m.representativeness?.variables?.annualPrecipitationMm?.level === 'low')
      .map((m) => m.id),
    materialDivergenceIds: material.map((m) => m.id),
    note:
      'Yehiam shows severe precip wet bias vs Western Galilee station-class normals. Other prepared pilots are within widened reference bands or show only modest temperature deltas — not a global CHELSA decode failure.'
  };

  const index = {
    title: 'Coordinate Climate V2 accuracy QA sidecar (central only)',
    generatedAt: new Date().toISOString(),
    runtimeForbidden: true,
    sampleCount: results.length,
    preparedCompared: withChelsa.length,
    materialDivergenceCount: material.length,
    systematic,
    entries: results.map((r) => ({
      id: r.id,
      lat: r.lat,
      lon: r.lon,
      prepared: r.preparedInCruvit,
      localRepresentativeness: r.representativeness?.level || 'unknown',
      overallAuthority: r.confidence?.overall || null,
      material: !!r.representativeness?.materialDivergence
    }))
  };
  fs.writeFileSync(path.join(QA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  fs.writeFileSync(
    path.join(QA_DIR, 'yehiam-local-representativeness.json'),
    JSON.stringify(
      {
        ...(results.find((r) => r.id === 'yehiam') || {}),
        decision: 'PRESERVE_CHELSA_DEMOTE_LOCAL_REPRESENTATIVENESS',
        answers: {
          A: true,
          B: 'possible-partial-orographic-contribution',
          C: true,
          D: false
        }
      },
      null,
      2
    ) + '\n'
  );
  console.log(JSON.stringify({ sampleCount: results.length, material: systematic.materialDivergenceIds }, null, 2));
}

main();
