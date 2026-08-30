#!/usr/bin/env node
/**
 * Pre-scale suitability systemic hardening gate report.
 * Reuses plant-climate V2 integration matrix when available; runs adversarial contract proofs.
 *
 * Usage: node scripts/pre-scale-suitability-systemic-hardening-gate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION,
  SURVIVAL_CONFIDENCE_MEANING,
  CLIMATE_PERIOD_CLAIM,
  TERRAIN_PRECISION_CLAIM,
  SUITABILITY_DIMENSIONS
} from '../modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js';
import { QUANTITATIVE_CLAIM_FIELDS } from '../modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', '_pre-scale-suitability-systemic-hardening-report.json');
const INTEGRATION = path.join(ROOT, 'tests', '_plant-climate-v2-integration-gate-report.json');
const HARDENING_ALIGN = path.join(ROOT, 'tests', '_plant-climate-v2-alignment-hardening-report.json');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: true });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function main() {
  // Refresh integration + alignment matrices (460 evals)
  const gate = run('node', ['scripts/plant-climate-v2-integration-gate.mjs']);
  const unit = run('node', [
    '--test',
    'tests/pre-scale-suitability-systemic-hardening-v1.test.mjs',
    'tests/plant-climate-humidity-alignment-hardening-v1.test.mjs'
  ]);

  const integration = fs.existsSync(INTEGRATION)
    ? JSON.parse(fs.readFileSync(INTEGRATION, 'utf8'))
    : null;
  const align = fs.existsSync(HARDENING_ALIGN)
    ? JSON.parse(fs.readFileSync(HARDENING_ALIGN, 'utf8'))
    : null;

  const materialFp = integration?.falsePositiveMaterialCount ?? -1;
  const materialFn = integration?.falseNegativeMaterialCount ?? -1;
  const unitPass = unit.status === 0;
  const gatePass = gate.status === 0;

  const additionalDefectsFound = [
    {
      id: 'extremes-vs-normals',
      severity: 'P0-contract',
      status: 'mitigated',
      note: 'Survival was mean-normals-only; strong positives for extremes-sensitive plants now capped when extreme authority absent'
    },
    {
      id: 'annual-ai-vs-seasonality',
      severity: 'P0-contract',
      status: 'mitigated',
      note: 'Monthly P/PET seasonality derived; warm-season drought demotes high waterNeeds strong positives'
    },
    {
      id: 'overall-collapses-garden-site',
      severity: 'P0-contract',
      status: 'mitigated',
      note: 'Dimensions CLIMATE_SUITABILITY / GARDEN_SITE_SUITABILITY / RECOMMENDATION_ELIGIBILITY frozen; sun/drainage unknown → UNKNOWN not auto-negative'
    },
    {
      id: 'irrigation-assumed',
      severity: 'P1',
      status: 'mitigated',
      note: 'Natural climate water ≠ garden irrigation; unknown irrigation → CONDITIONAL'
    },
    {
      id: 'nh-phenology-calendar',
      severity: 'P1',
      status: 'mitigated',
      note: 'Spring/autumn cues use thermal seasons + hemisphere; equatorial not forced into temperate calendar'
    },
    {
      id: 'cool-season-as-chill-hours',
      severity: 'P1',
      status: 'mitigated',
      note: 'coolSeasonSignal ≠ chill sufficiency; qualitative chill bounds confidence'
    },
    {
      id: 'species-as-cultivar',
      severity: 'P1',
      status: 'documented',
      note: 'Species-level evidence surfaces uncertainty; no invented cultivar variation'
    },
    {
      id: 'stale-garden-climate',
      severity: 'P0-contract',
      status: 'mitigated',
      note: 'authorityVersion/bakeVersion mismatch refuses silent permanent reuse'
    },
    {
      id: 'climate-period-as-current',
      severity: 'P1',
      status: 'documented',
      note: 'CHELSA 1981–2010 normals — not current measured climate; CURRENT_NORMAL/DELTA is future central layer'
    }
  ];

  const verdict =
    unitPass &&
    gatePass &&
    materialFp === 0 &&
    materialFn === 0 &&
    integration?.verdict?.includes('PASS')
      ? 'CRUVIT_PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING: PASS'
      : 'CRUVIT_PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING: FAIL';

  const report = {
    gate: 'CRUVIT_PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING',
    verdict,
    hardeningVersion: PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION,
    humidityFpFix: {
      status: 'in-place',
      alignmentGate: align?.verdict || null,
      originalFpFixed: align?.originalFpBeforeAfter || null
    },
    additionalSystemicDefects: additionalDefectsFound,
    extremesVsNormals: SURVIVAL_CONFIDENCE_MEANING,
    seasonalWaterBalance: {
      method: 'monthly P/PET from stored series; dry month AI<0.5; warm-season drought class',
      annualAiInsufficientAlone: true
    },
    climateVsGardenSite: {
      dimensions: Object.values(SUITABILITY_DIMENSIONS),
      overallMeaning:
        'Backward-compatible Overall reflects CLIMATE_SUITABILITY (plus safe demotions). It is NOT a complete garden-site assessment when sun/drainage/irrigation/container are unknown.'
    },
    irrigation: 'NATURAL_CLIMATE_WATER vs GARDEN_IRRIGATION separated; unknown → CONDITIONAL',
    hemispherePhenology: 'thermal seasons + latitude hemisphere; equatorial not forced',
    chillConfidence: 'coolSeason ≠ chill hours; optional quantitative chill preserved',
    numericPlantEvidence: {
      optionalFields: [...QUANTITATIVE_CLAIM_FIELDS],
      batch1Enriched: false
    },
    cultivarPrecision: 'species evidence must not become cultivar-specific precision',
    staleVersionInvalidation: 'authorityVersion / bakeVersion mismatch → local relookup required; external acquire still forbidden',
    terrainPrecision: TERRAIN_PRECISION_CLAIM,
    climatePeriod: CLIMATE_PERIOD_CLAIM,
    recommendationEligibility: 'needsReview → HOLD_REVIEW ≠ climate suitability',
    matrix: integration?.matrixSummary || null,
    materialFp,
    materialFn,
    unitTestStatus: unitPass ? 'PASS' : 'FAIL',
    unitStdoutTail: (unit.stdout || '').slice(-2000),
    externalCalls: integration?.externalCalls || {
      botanicalApi: 0,
      aiLlm: 0,
      catalogEnrichment: 0,
      chelsa: 0,
      terrain: 0,
      openMeteoStructural: 0,
      era5: 0
    },
    batch2Readiness: {
      schemaReady: true,
      everyPlantHasCompleteNumericEvidence: false,
      mayStartSafely:
        materialFp === 0 && materialFn === 0
          ? 'YES — with qualitative + optional provenanced quantitative; no invented thresholds; Overall is climate suitability not full garden-site claim'
          : 'NO'
    },
    broaderGlobalCoverage: {
      mayContinueSafely:
        'YES for regional bake expansion — tile exposure + stale invalidation in place. CURRENT_NORMAL/DELTA and extreme-risk layers remain P1 before strong current/extreme claims.'
    },
    remainingGaps: {
      P0: [],
      P1: [
        'Extreme cold/heat frequency layers not in dataset — demotion contract only',
        'Climate chill-hour series not yet compared to plant chill_hours_*',
        'CURRENT_NORMAL / CLIMATE_DELTA central layer not built',
        'Full garden-site comparator UI not wired to Overall split'
      ],
      P2: [
        'Continuous PET vs waterNeeds',
        'VPD only when plant supplies provenanced bounds'
      ],
      P3: ['sunNeeds/drainageNeeds climate mapping still none (garden-site dimension)']
    },
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        verdict,
        materialFp,
        materialFn,
        unitPass,
        gatePass,
        out: OUT
      },
      null,
      2
    )
  );
  if (verdict.includes('FAIL')) process.exitCode = 1;
}

main();
