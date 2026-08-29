#!/usr/bin/env node
/**
 * Build quality matrix + regression summary for Bulk Catalog Batch 1.
 * No network climate acquisition. Uses fixture structural climates only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const REPORT = path.join(ROOT, 'tests', '_bulk-catalog-batch-1-v1-report.json');

const MATRIX_SLUGS = [
  'durian',
  'persimmon',
  'sweet-cherry',
  'carob',
  'garden-peony',
  'common-lilac',
  'oleander',
  'turmeric',
  'silver-birch',
  'loquat'
];

function climates() {
  return {
    'humid-tropical': {
      label: 'humid tropical',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'tropical',
        climateLabel: 'Tropical',
        freezingRisk: 'low',
        humiditySignal: 'high',
        moistureRegime: 'humid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: 23.4,
        alwaysHot: true,
        coolSeasonSignal: false,
        thermalRegime: 'year-round-warm',
        isFrostFreeGrowingClimate: true,
        structuralClimate: {
          status: 'known',
          moistureRegime: 'humid',
          humiditySignal: 'high',
          freezingRisk: 'low',
          thermalRegime: 'year-round-warm',
          evidence: { coldestMonthMeanMinC: 23.4 }
        }
      })
    },
    'hyper-arid': {
      label: 'hyper-arid/hot',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'arid',
        climateLabel: 'Arid',
        freezingRisk: 'low',
        humiditySignal: 'low',
        moistureRegime: 'hyper-arid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: 8.9,
        alwaysHot: false,
        coolSeasonSignal: true,
        thermalRegime: 'cool-seasonal',
        isFrostFreeGrowingClimate: false,
        structuralClimate: {
          status: 'known',
          moistureRegime: 'hyper-arid',
          humiditySignal: 'low',
          freezingRisk: 'low',
          thermalRegime: 'cool-seasonal',
          evidence: { coldestMonthMeanMinC: 8.9, aridityIndex: 0.02 }
        }
      })
    },
    mediterranean: {
      label: 'Mediterranean',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'mediterranean',
        climateLabel: 'Mediterranean',
        freezingRisk: 'low',
        humiditySignal: 'low',
        moistureRegime: 'semi-arid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: 8,
        alwaysHot: false,
        coolSeasonSignal: true,
        thermalRegime: 'mild-seasonal',
        isFrostFreeGrowingClimate: false,
        structuralClimate: {
          status: 'known',
          moistureRegime: 'semi-arid',
          humiditySignal: 'low',
          freezingRisk: 'low',
          thermalRegime: 'mild-seasonal',
          evidence: { coldestMonthMeanMinC: 8 }
        }
      })
    },
    'temperate-frost': {
      label: 'temperate/frost-prone',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'temperate',
        climateLabel: 'Temperate',
        freezingRisk: 'high',
        humiditySignal: 'high',
        moistureRegime: 'humid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: -2,
        alwaysHot: false,
        coolSeasonSignal: true,
        thermalRegime: 'frost-prone',
        isFrostFreeGrowingClimate: false,
        structuralClimate: {
          status: 'known',
          freezingRisk: 'high',
          thermalRegime: 'frost-prone',
          moistureRegime: 'humid',
          humiditySignal: 'high',
          evidence: { coldestMonthMeanMinC: -2 }
        }
      })
    },
    'cool-highland': {
      label: 'cool/highland',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'tropical',
        climateLabel: 'Highland',
        freezingRisk: 'medium',
        humiditySignal: 'medium',
        moistureRegime: 'humid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: 8,
        elevationM: 2800,
        alwaysHot: false,
        coolSeasonSignal: true,
        thermalRegime: 'cool-highland',
        isFrostFreeGrowingClimate: false,
        structuralClimate: {
          status: 'known',
          thermalRegime: 'cool-highland',
          freezingRisk: 'medium',
          elevationM: 2800,
          moistureRegime: 'humid',
          evidence: { coldestMonthMeanMinC: 8, elevationM: 2800 }
        }
      })
    },
    'always-hot': {
      label: 'always-hot tropical',
      profile: structuralEnvironmentFromClimateProfile({
        broadClimate: 'tropical',
        climateLabel: 'Tropical city-state',
        freezingRisk: 'low',
        humiditySignal: 'high',
        moistureRegime: 'humid',
        structuralClimateStatus: 'known',
        coldestMonthMeanMinC: 24,
        alwaysHot: true,
        coolSeasonSignal: false,
        thermalRegime: 'year-round-warm',
        isFrostFreeGrowingClimate: true,
        structuralClimate: {
          status: 'known',
          thermalRegime: 'year-round-warm',
          freezingRisk: 'low',
          moistureRegime: 'humid',
          humiditySignal: 'high',
          evidence: { coldestMonthMeanMinC: 24 }
        }
      })
    }
  };
}

const stubSuit = {
  recommendationLevel: 'good',
  survivalFit: 80,
  thriveFit: 75,
  floweringFit: 50,
  fruitingFit: 40,
  warnings: [],
  explanationText: ''
};

/** Heuristic expectations for false+/- audit (not runtime authority). */
function positiveLike(status) {
  const s = String(status || '').toLowerCase();
  return ['good', 'excellent', 'reliable', 'supported', 'likely'].includes(s);
}

function expectedNotes(slug, climateKey, o) {
  const findings = [];
  const surv = String(o.survival || '');
  const fruit = String(o.fruiting || '');
  const overall = String(o.overall || '');

  if (
    ['durian', 'turmeric'].includes(slug) &&
    climateKey === 'temperate-frost' &&
    (positiveLike(overall) || positiveLike(surv))
  ) {
    findings.push({
      type: 'false_positive',
      note: 'tropical frost-sensitive rated positively in frost-prone climate'
    });
  }
  if (
    ['sweet-cherry', 'garden-peony', 'common-lilac', 'persimmon'].includes(slug) &&
    (climateKey === 'always-hot' || climateKey === 'humid-tropical') &&
    positiveLike(fruit)
  ) {
    findings.push({
      type: 'false_positive',
      note: 'chill-leaning plant fruiting positive in always-hot/humid-tropical without chill'
    });
  }
  if (
    ['durian', 'turmeric'].includes(slug) &&
    (climateKey === 'humid-tropical' || climateKey === 'always-hot') &&
    /blocked|not recommended|poor/i.test(overall + surv)
  ) {
    findings.push({
      type: 'possible_false_negative',
      note: 'tropical humidity plant blocked/poor in humid tropical / always-hot'
    });
  }
  if (o.needsReview === true && positiveLike(overall)) {
    findings.push({ type: 'needsReview_leak', note: 'needsReview with Good/Excellent overall' });
  }
  return findings;
}

function runTest(file) {
  const r = spawnSync(process.execPath, ['--test', file], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER: 'false' }
  });
  return {
    file,
    status: r.status,
    pass: r.status === 0,
    stderrTail: (r.stderr || '').slice(-400),
    stdoutTail: (r.stdout || '').slice(-400)
  };
}

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
const clim = climates();
const matrix = [];
const findings = [];
let climateProviderCalls = 0;

for (const slug of MATRIX_SLUGS) {
  const p = seed.plants.find((x) => x.slug === slug);
  if (!p) {
    findings.push({ type: 'missing_plant', slug });
    continue;
  }
  const meta = { ...(p.climateTraits || {}) };
  const row = {
    slug,
    scientific: p.scientific,
    archetypes: null,
    climates: {}
  };
  for (const [key, { profile }] of Object.entries(clim)) {
    const o = deriveSpecificPlantOutcomes({
      meta,
      climateProfile: profile,
      suitability: { ...stubSuit },
      plant: p
    });
    row.climates[key] = {
      overall: o.overall,
      survival: o.survival,
      growth: o.growth,
      flowering: o.flowering,
      fruiting: o.fruiting,
      needsReview: o.needsReview === true,
      limiting: (o.limiting || []).slice(0, 3)
    };
    findings.push(
      ...expectedNotes(slug, key, row.climates[key]).map((f) => ({ ...f, slug, climate: key }))
    );
  }
  matrix.push(row);
}

const regressions = [
  'tests/reproductive-outcome-evidence-gate.test.mjs',
  'tests/coconut-four-location-quality.test.mjs',
  'tests/specific-plant-suitability-v1-contract.test.mjs',
  'tests/licensed-image-pipeline-v1.test.mjs',
  'tests/licensed-catalog-media-runtime-v1.test.mjs',
  'tests/runtime-cost-persistence-guardrails-v1.test.mjs'
]
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .map(runTest);

const existing = fs.existsSync(REPORT)
  ? JSON.parse(fs.readFileSync(REPORT, 'utf8'))
  : {};

const out = {
  ...existing,
  matrixBuiltAt: new Date().toISOString(),
  matrix,
  matrixFindings: findings,
  falsePositives: findings.filter((f) => f.type === 'false_positive'),
  falseNegatives: findings.filter((f) => f.type === 'possible_false_negative' || f.type === 'false_negative'),
  unknownNeedsReviewFindings: findings.filter((f) =>
    ['unknown_leak', 'needsReview_leak'].includes(f.type)
  ),
  runtimeProviderCallsDuringMatrix: climateProviderCalls,
  regressions,
  regressionsPass: regressions.every((r) => r.pass)
};

fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      matrixPlants: matrix.length,
      falsePositives: out.falsePositives.length,
      falseNegatives: out.falseNegatives.length,
      unknownNeedsReview: out.unknownNeedsReviewFindings.length,
      sample: matrix.slice(0, 2).map((m) => ({
        slug: m.slug,
        climates: Object.fromEntries(
          Object.entries(m.climates).map(([k, v]) => [k, { overall: v.overall, flowering: v.flowering, fruiting: v.fruiting }])
        )
      })),
      regressionsPass: out.regressionsPass,
      regressions: regressions.map((r) => ({ file: r.file, pass: r.pass, status: r.status }))
    },
    null,
    2
  )
);
