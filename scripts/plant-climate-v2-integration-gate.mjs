#!/usr/bin/env node
/**
 * CRUVIT Plant × Coordinate Climate V2 Integration Gate (diagnostic / read-only).
 * Plants: Batch 1 definitions = traits materialized into public.catalog_plants (no seed rebuild).
 * Climate: CRUVIT V2 pilots + emed-n-israel-v1 tiles only. Zero external provider calls.
 *
 * Usage: node scripts/plant-climate-v2-integration-gate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile,
  plantNeedsWinterChill,
  atmosphericHumidityMismatchForLowTolerancePlant
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { buildPlantDiscriminatedSuitabilityStub } from '../modules/personal-domain/plant-climate-suitability-baseline-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import { lookupCoordinateClimateFromCoverage, clearCoverageRuntimeCaches } from '../modules/personal-domain/coordinate-climate-coverage-lookup-v2.js';
import { applyRepresentativenessToSuitabilityClaim } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  CATALOG_EXPANSION_CONTRACT_VERSION,
  CATALOG_EXPANSION_COMPATIBLE_VERSIONS
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { QUANTITATIVE_CLAIM_FIELDS } from '../modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';
import { annotatePacketFieldProvenance } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import { auditConfidentDependsOnWeakEvidence } from '../modules/personal-domain/evidence-strength-propagation-v1-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PILOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'pilot');
const QA = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'qa');
const COVERAGE = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'packets'
);
const OUT = path.join(ROOT, 'tests', '_plant-climate-v2-integration-gate-report.json');
const HARDENING_OUT = path.join(
  ROOT,
  'tests',
  '_plant-climate-v2-alignment-hardening-report.json'
);

/** Prior FAIL snapshot (pre-hardening) for the four material FPs — evidence audit only. */
const PRIOR_MATERIAL_FP_SNAPSHOT = Object.freeze([
  { plant: 'bay-laurel', site: 'singapore', overallBefore: 'good' },
  { plant: 'oleander', site: 'singapore', overallBefore: 'good' },
  { plant: 'common-thyme', site: 'singapore', overallBefore: 'good' },
  { plant: 'garden-sage', site: 'singapore', overallBefore: 'good' }
]);

const SITES = ['yehiam', 'helsinki', 'singapore', 'kochi', 'cairo', 'tokyo', 'quito'];

const EXTERNAL = {
  botanicalApi: 0,
  aiLlm: 0,
  catalogEnrichment: 0,
  chelsa: 0,
  terrain: 0,
  openMeteoStructural: 0,
  era5: 0
};

function plantFromBatchDef(def) {
  let traitEvidenceClasses = {};
  let traitProvenance = {};
  const packetPath = path.join(PACKET_DIR, `${def.slug}.packet.json`);
  if (fs.existsSync(packetPath)) {
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    const ann = annotatePacketFieldProvenance(packet);
    for (const c of ann.claims) {
      traitEvidenceClasses[c.field] = c.evidenceClass;
      traitProvenance[c.field] = {
        evidenceClass: c.evidenceClass,
        sourceIds: c.sourceIds || [],
        shortExcerpt: c.shortExcerpt || null
      };
    }
  }
  const climateTraits = {
    frostSensitivity: def.frostSensitivity ?? null,
    coldTolerance: def.coldTolerance ?? null,
    heatTolerance: def.heatTolerance ?? null,
    humidityTolerance: def.humidityTolerance ?? null,
    waterNeeds: def.waterNeeds ?? null,
    sunNeeds: def.sunNeeds ?? null,
    drainageNeeds: def.drainageNeeds ?? null,
    needsWinterChill: def.needsWinterChill === true,
    groupIds: Array.isArray(def.groupIds) ? def.groupIds : [],
    floweringRequirements: def.floweringRequirements || null,
    fruitingRequirements: def.fruitingRequirements || null,
    needsReview: def.needsReview === true || def.slug === 'blue-gum',
    traitEvidenceClasses,
    traitProvenance
  };
  return {
    slug: def.slug,
    name: def.common,
    scientific: def.scientific,
    aliases: def.aliases || [],
    climateTraits,
    provenance: def.sources || [],
    needsReview: climateTraits.needsReview,
    source: 'batch1-definitions-matching-catalog_plants-upsert'
  };
}

function loadClimateProfile(siteId) {
  const raw = JSON.parse(fs.readFileSync(path.join(PILOT, `${siteId}.json`), 'utf8'));
  let qa = null;
  const qaPath = path.join(QA, `${siteId}.json`);
  if (fs.existsSync(qaPath)) qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  return bundleFromStoredProfile(siteId, raw, qa);
}

function bundleFromStoredProfile(siteId, rawProfile, qaRecord = null) {
  const confidence = buildCoordinateClimateConfidenceV2({
    profile: rawProfile,
    qaRecord
  });
  const profile = {
    ...rawProfile,
    confidence: confidence.overall,
    confidenceDimensions: confidence.dimensions,
    localRepresentativeness: confidence.localRepresentativeness,
    confidenceWarnings: confidence.warnings
  };
  const structural = coordinateClimateProfileToStructuralPersistence(profile);
  const climateProfileBase = {
    ...structural,
    moistureRegime: structural.moistureRegime,
    humidityRegime: structural.humidityRegime,
    humiditySignal: structural.humiditySignal,
    freezingRisk: structural.freezingRisk,
    thermalRegime: structural.thermalRegime,
    elevationM: structural.elevationM,
    annualPrecipitationMm: profile.annualPrecipitationMm,
    annualPetMm: profile.annualPetMm,
    aridityIndex: profile.aridityIndex,
    coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
    warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC,
    alwaysHot: profile.alwaysHot,
    coolSeasonSignal: profile.coolSeasonSignal,
    highlandModifier: profile.highlandModifier,
    monthlyHursPct: profile.monthlyHursPct,
    monthlyVpdPa: profile.monthlyVpdPa,
    meanRelativeHumidityPct: profile.meanRelativeHumidityPct,
    meanVpdPa: profile.meanVpdPa,
    atmosphericHumidityRegime: profile.atmosphericHumidityRegime,
    confidence: profile.confidence,
    confidenceDimensions: profile.confidenceDimensions,
    localRepresentativeness: profile.localRepresentativeness,
    coordinateClimateV2: profile,
    structuralClimate: structural
  };
  const env = structuralEnvironmentFromClimateProfile(climateProfileBase);
  return {
    siteId,
    profile,
    structural,
    climateProfile: {
      ...climateProfileBase,
      ...env,
      isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate
    }
  };
}

/**
 * Plant-discriminated suitability stub — forbids generic freezingRisk→15 and !frostFree→55.
 */
function buildSuitabilityStub(meta, climateProfile) {
  const stub = buildPlantDiscriminatedSuitabilityStub(meta, climateProfile);
  if (
    plantNeedsWinterChill(meta) &&
    climateProfile.alwaysHot &&
    !climateProfile.coolSeasonSignal
  ) {
    stub.thriveFit = Math.min(stub.thriveFit, 30);
    stub.fruitingFit = Math.min(stub.fruitingFit, 10);
    stub.warnings.push(
      'Reliable fruiting is unlikely without winter chill or a clear cool season.'
    );
  }
  return stub;
}

function evaluate(plant, climateBundle) {
  const meta = plant.climateTraits;
  const suitability = buildSuitabilityStub(meta, climateBundle.climateProfile);
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateBundle.climateProfile,
    suitability,
    plant,
    protectedGrowing: false
  });
  return {
    plant: plant.slug,
    site: climateBundle.siteId,
    overall: outcomes.overall,
    survival: outcomes.survival,
    growth: outcomes.growth,
    flowering: outcomes.flowering,
    fruiting: outcomes.fruiting,
    limitingFactors: outcomes.limitingFactors || [],
    unknownEvidence: outcomes.unknownEvidence || [],
    needsReview: outcomes.needsReview,
    representativenessAdjustment: outcomes.representativenessAdjustment || null,
    climateAuthorityConfidence: outcomes.climateAuthorityConfidence || null,
    suitability,
    env: structuralEnvironmentFromClimateProfile(climateBundle.climateProfile)
  };
}

function isConfidentPositive(row) {
  const overallPos = row.overall === 'good' || row.overall === 'excellent';
  const survPos = row.survival === 'reliable' || row.survival === 'supported';
  const growPos = row.growth === 'reliable' || row.growth === 'supported';
  const flowerPos = row.flowering === 'reliable' || row.flowering === 'supported';
  const fruitPos = row.fruiting === 'reliable' || row.fruiting === 'supported';
  return { overallPos, survPos, growPos, flowerPos, fruitPos, any: overallPos || survPos || growPos || flowerPos || fruitPos };
}

function auditFalsePositive(row, plant, climateBundle) {
  const flags = isConfidentPositive(row);
  if (!flags.any) return null;
  const meta = plant.climateTraits;
  const reasons = [];
  const authorized = [];

  if (flags.survPos) {
    if (!meta.frostSensitivity) {
      reasons.push('survival-positive-without-frostSensitivity');
    } else {
      authorized.push(`frostSensitivity=${meta.frostSensitivity}`);
      authorized.push(`freezingRisk=${row.env.freezingRisk}`);
      authorized.push(`coldestMonthMeanMinC=${row.env.coldestMonthMeanMinC}`);
      authorized.push(`thermalRegime=${row.env.thermalRegime}`);
    }
    if (meta.humidityTolerance === 'high') {
      authorized.push(`humidityTolerance=high`);
      authorized.push(`moistureRegime=${row.env.moistureRegime}`);
      authorized.push(`humiditySignal=${row.env.humiditySignal}`);
    }
  }
  if (flags.growPos) {
    authorized.push(`thriveFit-path+climate moisture/thermal cues`);
    if (!meta.frostSensitivity && !meta.humidityTolerance) {
      reasons.push('growth-positive-without-core-climate-traits');
    }
  }
  if (flags.flowerPos || flags.fruitPos) {
    const fr = meta.floweringRequirements || meta.fruitingRequirements;
    if (!fr) reasons.push('reproductive-positive-without-catalog-text-evidence');
    else authorized.push('catalog-flowering/fruiting-requirements-text');
  }
  if (flags.overallPos) {
    const moistureDep =
      meta.humidityTolerance === 'high' ||
      meta.waterNeeds === 'high' ||
      (meta.groupIds || []).includes('tropical-frost-sensitive-fruit');
    const local = climateBundle.profile.confidenceDimensions?.LOCAL_REPRESENTATIVENESS;
    if (moistureDep && (local === 'low' || local === 'unknown')) {
      if (!row.representativenessAdjustment?.demoted && row.overall === 'good') {
        reasons.push(
          'overall-positive-despite-uncertain-local-representativeness-on-moisture-dependent-plant'
        );
      } else {
        authorized.push(`representativeness-demotion-or-non-good:${row.overall}`);
      }
    }
    if (meta.needsReview) reasons.push('overall-positive-with-needsReview');
    // Atmospheric humidityTolerance=low penalty requires atmospheric high OR borderline (hurs),
    // NOT moistureRegime=humid alone.
    if (
      meta.humidityTolerance === 'low' &&
      (row.env.humiditySignal === 'high' || row.env.humiditySignal === 'borderline')
    ) {
      authorized.push(`atmosphericHumiditySignal=${row.env.humiditySignal} meanRh path`);
    }
    if (
      meta.humidityTolerance === 'low' &&
      row.env.moistureRegime === 'humid' &&
      row.env.humiditySignal !== 'high' &&
      row.env.humiditySignal !== 'borderline' &&
      flags.overallPos
    ) {
      reasons.push('overall-positive-ok-moisture-humid-without-atmospheric-high-or-borderline');
    }
    if (
      meta.humidityTolerance === 'low' &&
      row.env.humiditySignal !== 'high' &&
      row.env.humiditySignal !== 'borderline' &&
      flags.overallPos &&
      row.env.moistureRegime === 'humid'
    ) {
      // moisture alone must not substitute atmospheric humidity
    }
    if (
      flags.overallPos &&
      meta.humidityTolerance === 'low' &&
      (row.env.humiditySignal === 'high' || row.env.humiditySignal === 'borderline')
    ) {
      if (row.overall === 'good' || row.overall === 'excellent') {
        reasons.push(
          'overall-positive-for-low-humidity-plant-despite-atmospheric-humidity-high-or-borderline'
        );
      }
    }
    if (authorized.length || meta.frostSensitivity) {
      authorized.push(`overall=${row.overall} survival=${row.survival} growth=${row.growth}`);
    }
  }

  return {
    plant: row.plant,
    site: row.site,
    flags,
    reasons,
    authorized,
    rejected: reasons.length > 0,
    material: reasons.some((r) =>
      /without-frost|without-catalog|despite-uncertain|needsReview|without-core|atmospheric-humidity-high/.test(
        r
      )
    )
  };
}

function auditFalseNegative(row, plant) {
  const neg =
    row.overall === 'blocked' ||
    row.survival === 'unreliable' ||
    row.growth === 'poor' ||
    row.growth === 'unreliable' ||
    row.flowering === 'unlikely' ||
    row.fruiting === 'unlikely';
  if (!neg) return null;
  const meta = plant.climateTraits;
  const onlyMissingMeta =
    (!meta.frostSensitivity && row.unknownEvidence?.includes('frostSensitivity')) ||
    (row.limitingFactors || []).every((f) => /needs review|insufficient|unknown/i.test(String(f)));
  const hasLimiting = (row.limitingFactors || []).length > 0;
  if (!hasLimiting && !meta.frostSensitivity) {
    return {
      plant: row.plant,
      site: row.site,
      reasons: ['negative-without-limiting-factors-and-missing-frostSensitivity'],
      material: true
    };
  }
  // Missing metadata alone → should be unknown/borderline not blocked
  if (
    row.overall === 'blocked' &&
    !meta.frostSensitivity &&
    !(row.limitingFactors || []).some((f) => /frost|cold|arid|humidity|chill/i.test(String(f)))
  ) {
    return {
      plant: row.plant,
      site: row.site,
      reasons: ['blocked-from-missing-metadata-alone'],
      material: true
    };
  }
  if (onlyMissingMeta && row.overall === 'blocked') {
    return {
      plant: row.plant,
      site: row.site,
      reasons: ['blocked-from-missing-metadata-alone'],
      material: true
    };
  }
  return null;
}

function fieldMapping() {
  return [
    {
      plant: 'frostSensitivity',
      climate: ['freezingRisk', 'structuralColdRisk', 'coldestMonthMeanMinC', 'thermalRegime'],
      status: 'SUPPORTED_MAPPING',
      note: 'Directly drives survival/unreliable paths'
    },
    {
      plant: 'coldTolerance',
      climate: ['coldestMonthMeanMinC', 'DAMAGING_COLD_MONTH_MEAN_MIN_C band'],
      status: 'PARTIAL_MAPPING',
      note: 'Used qualitatively with frostSensitivity for damaging-cold; not a numeric hardiness °C threshold'
    },
    {
      plant: 'heatTolerance',
      climate: ['warmestMonthMeanMaxC', 'alwaysHot', 'thermalRegime'],
      status: 'PARTIAL_MAPPING',
      note: 'Indirect via alwaysHot / tropical thermal; no numeric heat °C max used'
    },
    {
      plant: 'humidityTolerance',
      climate: ['humiditySignal', 'humidityRegime', 'meanRelativeHumidityPct', 'moistureRegime'],
      status: 'SUPPORTED_MAPPING',
      note: 'humiditySignal from atmospheric hurs/RH only; moistureRegime is separate P/PET authority'
    },
    {
      plant: 'waterNeeds',
      climate: ['moistureRegime', 'aridityIndex', 'annualPrecipitationMm', 'annualPetMm'],
      status: 'PARTIAL_MAPPING',
      note: 'Moisture regime (from PET AI when present) used via mismatch/drought cues; waterNeeds itself not a direct numeric comparator to PET'
    },
    {
      plant: 'needsWinterChill',
      climate: ['coolSeasonSignal', 'alwaysHot', 'thermalRegime'],
      status: 'SUPPORTED_MAPPING',
      note: 'Chill deficit when always-hot / lacks cool-season signal'
    },
    {
      plant: 'floweringRequirements / fruitingRequirements',
      climate: ['frostFree', 'humidity', 'thermal', 'moisture'],
      status: 'PARTIAL_MAPPING',
      note: 'Text evidence gates reproductive outcomes; climate cues applied when text present'
    },
    {
      plant: 'groupIds (tropical-frost-sensitive-fruit)',
      climate: ['frost', 'humidity', 'moisture', 'thermal'],
      status: 'SUPPORTED_MAPPING',
      note: 'Group strengthens tropical moisture plant logic'
    },
    {
      plant: 'sunNeeds / drainageNeeds',
      climate: ['—'],
      status: 'NO_MAPPING',
      note: 'Not consumed by specific-plant climate outcomes evaluator'
    },
    {
      plant: 'numeric minTempC / chill hours / VPD ranges',
      climate: ['Tmin', 'VPD', 'PET'],
      status: 'NO_MAPPING',
      note: 'Plant records lack numeric thresholds; climate fields exist but unused for hard cuts'
    },
    {
      plant: '—',
      climate: 'LOCAL_REPRESENTATIVENESS / OVERALL_AUTHORITY_CONFIDENCE',
      status: 'SUPPORTED_MAPPING',
      note: 'Demotes moisture-dependent strong positives; does not auto Not Recommended'
    }
  ];
}

function plantAdequacy(def) {
  const gaps = [];
  if (!def.frostSensitivity) gaps.push('frostSensitivity');
  const hasFlower = !!def.floweringRequirements;
  const hasFruit = !!def.fruitingRequirements;
  if (!hasFlower) gaps.push('floweringRequirements');
  if (!hasFruit) gaps.push('fruitingRequirements');
  gaps.push('no-numeric-minTempC');
  gaps.push('no-chill-hour-range');
  gaps.push('no-numeric-heat-threshold');
  gaps.push('no-VPD-humidity-range');
  gaps.push('no-numeric-aridity-tolerance');

  const risky =
    !def.frostSensitivity ||
    def.needsReview === true ||
    def.slug === 'blue-gum';
  const partial =
    !risky &&
    (!hasFlower || !hasFruit || def.humidityTolerance == null || def.waterNeeds == null);

  return {
    slug: def.slug,
    class: risky ? 'INSUFFICIENT_AND_RISKY' : partial ? 'PARTIAL_BUT_SAFE' : 'ADEQUATE_FOR_CURRENT_EVALUATOR',
    gaps,
    needsReview: def.needsReview === true || def.slug === 'blue-gum'
  };
}

function climateSignalsConsumed() {
  return {
    consumedMeaningfully: [
      'frost/freezingRisk + coldestMonthMeanMinC',
      'thermalRegime / cool-highland / year-round-warm',
      'moistureRegime (from UNEP AI when PET present on profile)',
      'humiditySignal / atmosphericHumidityRegime (from hurs/RH only; never P/PET)',
      'alwaysHot / coolSeasonSignal (winter chill)',
      'elevation → highlandModifier / cool-highland',
      'LOCAL_REPRESENTATIVENESS demotion for moisture-dependent positives'
    ],
    presentButNotDirectlyConsumed: [
      'monthly Tmean series (only extremes/derived used)',
      'monthly PET series as continuous comparator to plant waterNeeds (only via AI→moistureRegime class)',
      'meanVpdPa as numeric plant comparator (no plant VPD range)',
      'annualPrecipitationMm alone (PET/AI preferred when present)',
      'sunNeeds/drainage plant fields (no climate mapping)'
    ]
  };
}

function main() {
  const plants = BATCH1_PLANTS.map(plantFromBatchDef);
  if (plants.length !== 30) throw new Error(`expected 30 plants, got ${plants.length}`);

  const climates = Object.fromEntries(SITES.map((id) => [id, loadClimateProfile(id)]));

  const matrix = [];
  for (const plant of plants) {
    for (const site of SITES) {
      matrix.push(evaluate(plant, climates[site]));
    }
  }

  const fp = [];
  const fn = [];
  for (const row of matrix) {
    const plant = plants.find((p) => p.slug === row.plant);
    const fpHit = auditFalsePositive(row, plant, climates[row.site]);
    if (fpHit) fp.push(fpHit);
    const fnHit = auditFalseNegative(row, plant);
    if (fnHit) fn.push(fnHit);
  }
  const fpRejected = fp.filter((x) => x.rejected);
  const materialFp = fpRejected.filter((x) => x.material);

  let confidentHeuristicDeps = 0;
  const confidentHeuristicExamples = [];
  for (const row of matrix) {
    const plant = plants.find((p) => p.slug === row.plant);
    const hits = auditConfidentDependsOnWeakEvidence(
      { ...row, env: row.env },
      plant.climateTraits
    );
    if (hits.length) {
      confidentHeuristicDeps += hits.length;
      if (confidentHeuristicExamples.length < 25) {
        confidentHeuristicExamples.push({ plant: row.plant, site: row.site, hits });
      }
    }
  }
  if (confidentHeuristicDeps > 0) {
    materialFp.push({
      material: true,
      rejected: true,
      reasons: ['CONFIDENT_RESULTS_DEPENDING_ON_HEURISTIC_EVIDENCE'],
      count: confidentHeuristicDeps,
      examples: confidentHeuristicExamples
    });
  }

  // Regional gradient: 25 coords × 10 plants
  clearCoverageRuntimeCaches();
  const man = JSON.parse(
    fs.readFileSync(path.join(COVERAGE, 'emed-n-israel-v1', 'manifest.json'), 'utf8')
  );
  const { south, north, west, east } = man.bounds;
  const coords = [];
  // Deterministic span: coast↔inland, low↔high elev, wetter↔drier (AI/moisture classes)
  const spanTargets = [
    [0.02, 0.05], // SW coast
    [0.08, 0.12],
    [0.15, 0.2],
    [0.25, 0.35],
    [0.35, 0.5],
    [0.45, 0.65],
    [0.55, 0.8],
    [0.7, 0.9],
    [0.85, 0.95],
    [0.12, 0.55],
    [0.3, 0.25],
    [0.5, 0.15],
    [0.65, 0.4],
    [0.78, 0.55],
    [0.9, 0.7],
    [0.4, 0.85],
    [0.2, 0.75],
    [0.6, 0.2],
    [0.75, 0.3],
    [0.88, 0.45],
    [0.05, 0.4],
    [0.78, 0.35], // N humid-leaning
    [0.9, 0.4], // N humid
    [0.95, 0.45], // N humid coast
    [0.95, 0.55] // N humid inland
  ];
  for (let i = 0; i < 25; i++) {
    const [u, v] = spanTargets[i];
    coords.push({
      id: `emed-${i}`,
      lat: south + (north - south) * u,
      lon: west + (east - west) * v
    });
  }
  const gradientPlants = [
    'durian',
    'sweet-cherry',
    'carob',
    'loquat',
    'southern-magnolia', // high humidity — should flip on semi-arid vs humid moistureRegime
    'oleander',
    'garden-sage',
    'english-walnut',
    'jaboticaba',
    'blue-gum'
  ].map((slug) => plants.find((p) => p.slug === slug));
  if (gradientPlants.some((p) => !p)) {
    throw new Error('gradient plant missing from Batch 1');
  }

  const gradientRows = [];
  let gradientExt = 0;
  for (const c of coords) {
    const hit = lookupCoordinateClimateFromCoverage(c.lat, c.lon, {
      coverageRoot: COVERAGE,
      regionId: 'emed-n-israel-v1',
      allowLegacyPilot: false
    });
    gradientExt += hit.externalClimateProviderCalls || 0;
    if (!hit.ok) continue;
    const bundle = bundleFromStoredProfile(c.id, hit.profile, null);
    const profile = bundle.profile;
    for (const plant of gradientPlants) {
      const row = evaluate(plant, bundle);
      gradientRows.push({
        ...row,
        lat: c.lat,
        lon: c.lon,
        cellKey: hit.cellKey,
        P: profile.annualPrecipitationMm,
        AI: profile.aridityIndex,
        elev: profile.elevationM,
        ext: hit.externalClimateProviderCalls
      });
    }
  }

  // Per-plant outcome diversity across gradient
  const gradientDiversity = {};
  for (const plant of gradientPlants) {
    const rows = gradientRows.filter((r) => r.plant === plant.slug);
    const overalls = new Set(rows.map((r) => r.overall));
    const survivals = new Set(rows.map((r) => r.survival));
    const ais = rows.map((r) => r.AI).filter((x) => Number.isFinite(x));
    const elevs = rows.map((r) => r.elev).filter((x) => Number.isFinite(x));
    gradientDiversity[plant.slug] = {
      overallUnique: [...overalls],
      survivalUnique: [...survivals],
      climateVaried:
        new Set(ais.map((a) => a.toFixed(2))).size > 1 ||
        new Set(elevs.map((e) => Math.round(e / 50))).size > 1,
      outcomeVaried: overalls.size > 1 || survivals.size > 1,
      moistureRegimes: [
        ...new Set(rows.map((r) => r.env?.moistureRegime).filter(Boolean))
      ],
      freezingRisks: [...new Set(rows.map((r) => r.env?.freezingRisk).filter(Boolean))]
    };
  }

  // Part D: Mediterranean sanity for the four prior FP plants (same 25 EMED coords)
  const medFocusSlugs = ['bay-laurel', 'oleander', 'common-thyme', 'garden-sage'];
  const medFocusPlants = medFocusSlugs.map((slug) => plants.find((p) => p.slug === slug));
  const medSanityRows = [];
  clearCoverageRuntimeCaches();
  for (const c of coords) {
    const hit = lookupCoordinateClimateFromCoverage(c.lat, c.lon, {
      coverageRoot: COVERAGE,
      regionId: 'emed-n-israel-v1',
      allowLegacyPilot: false
    });
    gradientExt += hit.externalClimateProviderCalls || 0;
    if (!hit.ok) continue;
    const bundle = bundleFromStoredProfile(c.id, hit.profile, null);
    for (const plant of medFocusPlants) {
      const row = evaluate(plant, bundle);
      medSanityRows.push({
        ...row,
        lat: c.lat,
        lon: c.lon,
        P: bundle.profile.annualPrecipitationMm,
        AI: bundle.profile.aridityIndex,
        elev: bundle.profile.elevationM
      });
    }
  }

  const climateClassDiversity = {
    moistureRegimes: [
      ...new Set(gradientRows.map((r) => r.env?.moistureRegime).filter(Boolean))
    ],
    freezingRisks: [...new Set(gradientRows.map((r) => r.env?.freezingRisk).filter(Boolean))],
    thermalRegimes: [...new Set(gradientRows.map((r) => r.env?.thermalRegime).filter(Boolean))],
    AI: (() => {
      const a = gradientRows.map((r) => r.AI).filter((x) => Number.isFinite(x));
      return a.length ? { min: Math.min(...a), max: Math.max(...a) } : null;
    })(),
    elevM: (() => {
      const e = gradientRows.map((r) => r.elev).filter((x) => Number.isFinite(x));
      return e.length ? { min: Math.min(...e), max: Math.max(...e) } : null;
    })(),
    plantsWithOutcomeVariation: Object.entries(gradientDiversity)
      .filter(([, d]) => d.outcomeVaried)
      .map(([slug]) => slug)
  };

  // Yehiam confidence behavior
  const yehiam = climates.yehiam;
  const durianYehiam = evaluate(plants.find((p) => p.slug === 'durian'), yehiam);
  const confAdj = applyRepresentativenessToSuitabilityClaim({
    overallRecommendation: 'good',
    confidence: {
      dimensions: yehiam.profile.confidenceDimensions,
      localRepresentativeness: yehiam.profile.localRepresentativeness
    },
    moistureOrPrecipDependent: true
  });

  const adequacy = BATCH1_PLANTS.map(plantAdequacy);
  const materialFn = fn.filter((x) => x.material);

  // Real Yehiam path: moisture-dependent overall=good forced through demotion (acceptance proof)
  const jaboticaba = plants.find((p) => p.slug === 'jaboticaba');
  const jabYehiamRaw = evaluate(jaboticaba, yehiam);
  const jabForcedGoodAdj = applyRepresentativenessToSuitabilityClaim({
    overallRecommendation: 'good',
    confidence: {
      dimensions: yehiam.profile.confidenceDimensions,
      localRepresentativeness: yehiam.profile.localRepresentativeness
    },
    moistureOrPrecipDependent: true
  });

  const summary = {
    totals: {
      matrix: matrix.length,
      gradient: gradientRows.length,
      expected: 210 + 250
    },
    overallCounts: matrix.reduce((acc, r) => {
      acc[r.overall] = (acc[r.overall] || 0) + 1;
      return acc;
    }, {}),
    survivalCounts: matrix.reduce((acc, r) => {
      acc[r.survival] = (acc[r.survival] || 0) + 1;
      return acc;
    }, {})
  };

  const verdict =
    materialFp.length === 0 && materialFn.length === 0
      ? 'CRUVIT_PLANT_CLIMATE_V2_INTEGRATION_GATE: PASS'
      : 'CRUVIT_PLANT_CLIMATE_V2_INTEGRATION_GATE: FAIL';

  const report = {
    gate: 'CRUVIT_PLANT_CLIMATE_V2_INTEGRATION_GATE',
    verdict,
    plantSource:
      'Batch 1 definitions matching public.catalog_plants upsert traits (live Supabase env unavailable in this session; no plants.seed.json; no enrichment)',
    climateSource: 'CRUVIT V2 pilots + emed-n-israel-v1 coverage tiles',
    externalCalls: EXTERNAL,
    gradientExternalClimateCalls: gradientExt,
    fieldMapping: fieldMapping(),
    matrixSummary: summary,
    falsePositiveCandidates: fpRejected,
    falsePositiveAuditedCount: fp.length,
    falsePositiveAuthorizedCount: fp.filter((x) => !x.rejected).length,
    falsePositiveMaterialCount: materialFp.length,
    CONFIDENT_RESULTS_DEPENDING_ON_HEURISTIC_EVIDENCE: confidentHeuristicDeps,
    confidentHeuristicExamples,
    falseNegativeCandidates: fn,
    falseNegativeMaterialCount: materialFn.length,
    climateSignals: climateSignalsConsumed(),
    plantAdequacy: adequacy,
    adequacyCounts: adequacy.reduce((a, x) => {
      a[x.class] = (a[x.class] || 0) + 1;
      return a;
    }, {}),
    gradient: {
      coords: 25,
      plants: gradientPlants.map((p) => p.slug),
      evaluations: gradientRows.length,
      diversity: gradientDiversity,
      climateClassDiversity,
      note: 'Identical nearby outcomes kept when evaluator bands match; climate class diversity recorded separately'
    },
    yehiamConfidence: {
      LOCAL_REPRESENTATIVENESS: yehiam.profile.confidenceDimensions.LOCAL_REPRESENTATIVENESS,
      OVERALL_AUTHORITY_CONFIDENCE: yehiam.profile.confidenceDimensions.OVERALL_AUTHORITY_CONFIDENCE,
      SOURCE_DATA_INTEGRITY: yehiam.profile.confidenceDimensions.SOURCE_DATA_INTEGRITY,
      hypotheticalGoodDemotion: confAdj,
      jaboticabaNaturalAtYehiam: {
        overall: jabYehiamRaw.overall,
        survival: jabYehiamRaw.survival,
        limiting: jabYehiamRaw.limitingFactors,
        note: 'Natural path is blocked by frost/cool-season evidence — not an auto-Not-Recommended from low representativeness alone'
      },
      moistureDependentGoodForcedDemotion: jabForcedGoodAdj,
      durianAtYehiam: {
        overall: durianYehiam.overall,
        survival: durianYehiam.survival,
        limiting: durianYehiam.limitingFactors,
        representativenessAdjustment: durianYehiam.representativenessAdjustment
      },
      requiredBehavior:
        'uncertain relevant evidence → demote confidence / Borderline / UNKNOWN; NOT automatic Not Recommended'
    },
    systemicGaps: {
      P0: materialFp.length
        ? ['Residual material false positives — see falsePositiveCandidates']
        : [],
      P1: [
        'Optional quantitative fields exist but Batch 1 plants are not populated (by design) — precision hardiness still qualitative',
        'Climate-side chill-hour series not yet compared to plant chill_hours_min/max (additive when both sides exist later)'
      ],
      P2: [
        'Continuous PET vs waterNeeds still class-only via moistureRegime',
        'meanVpdPa unused unless plant supplies provenanced vpd_min/max_kpa'
      ],
      P3: ['sunNeeds / drainageNeeds unused by climate outcomes evaluator']
    },
    batch2Recommendation:
      materialFp.length === 0 && materialFn.length === 0
        ? {
            schemaReady: true,
            everyPlantHasCompleteNumericEvidence: false,
            note: 'SCHEMA READY for Batch 2: qualitative + optional provenanced quantitative. Do not invent numeric thresholds. UNKNOWN/Borderline when evidence thin.'
          }
        : {
            schemaReady: false,
            everyPlantHasCompleteNumericEvidence: false,
            note: 'Fix material FP/FN before Batch 2'
          },
    originalFpBeforeAfter: PRIOR_MATERIAL_FP_SNAPSHOT.map((s) => {
      const row = matrix.find((r) => r.plant === s.plant && r.site === s.site);
      return {
        plant: s.plant,
        site: s.site,
        overallBefore: s.overallBefore,
        overallAfter: row?.overall,
        survivalAfter: row?.survival,
        growthAfter: row?.growth,
        limiting: row?.limitingFactors?.[0] || null,
        fixed: row && row.overall !== 'good' && row.overall !== 'excellent'
      };
    }),
    mediterraneanSanity: (() => {
      const byPlant = {};
      for (const slug of medFocusSlugs) {
        const rows = medSanityRows.filter((r) => r.plant === slug);
        const overalls = [...new Set(rows.map((r) => r.overall))];
        const mrs = [...new Set(rows.map((r) => r.env?.moistureRegime).filter(Boolean))];
        const notAllBlocked = rows.some((r) => r.overall !== 'blocked');
        const humidRows = rows.filter((r) => r.env?.moistureRegime === 'humid');
        const semiRows = rows.filter((r) => r.env?.moistureRegime === 'semi-arid');
        byPlant[slug] = {
          overallUnique: overalls,
          moistureRegimes: mrs,
          notBlanketNotRecommended: notAllBlocked,
          humidSampleOverall: [...new Set(humidRows.map((r) => r.overall))],
          semiAridSampleOverall: [...new Set(semiRows.map((r) => r.overall))],
          climateSensitive:
            humidRows.length > 0 &&
            semiRows.length > 0 &&
            (humidRows.some((r) => r.survival === 'constrained') ||
              overalls.length > 1 ||
              humidRows[0]?.survival !== semiRows[0]?.survival)
        };
      }
      return { evaluations: medSanityRows.length, byPlant };
    })(),
    lowHumidityRegressionGuard: (() => {
      const lowHum = plants.filter((p) => p.climateTraits.humidityTolerance === 'low');
      const rows = matrix.filter((r) => lowHum.some((p) => p.slug === r.plant));
      const blocked = rows.filter((r) => r.overall === 'blocked').length;
      const goodOrBorder = rows.filter((r) => r.overall === 'good' || r.overall === 'borderline')
        .length;
      return {
        plantCount: lowHum.length,
        evalCount: rows.length,
        blockedCount: blocked,
        nonBlockedCount: rows.length - blocked,
        goodOrBorderlineCount: goodOrBorder,
        notBlanketNotRecommended: blocked < rows.length
      };
    })(),
    tileProfileExposureEquivalence: (() => {
      const pilot = climates.yehiam.climateProfile;
      clearCoverageRuntimeCaches();
      const hit = lookupCoordinateClimateFromCoverage(32.966, 35.333, {
        coverageRoot: COVERAGE,
        regionId: 'emed-n-israel-v1',
        allowLegacyPilot: false
      });
      const cov = hit.ok ? bundleFromStoredProfile('emed-sample', hit.profile, null).climateProfile : null;
      const keys = [
        'freezingRisk',
        'humiditySignal',
        'moistureRegime',
        'thermalRegime',
        'coolSeasonSignal',
        'alwaysHot',
        'coldestMonthMeanMinC'
      ];
      return {
        pilotYehiam: Object.fromEntries(keys.map((k) => [k, pilot[k] ?? null])),
        coverageSample: cov
          ? Object.fromEntries(keys.map((k) => [k, cov[k] ?? null]))
          : null,
        coverageHasRequiredEnums: !!(
          cov &&
          cov.freezingRisk &&
          cov.humiditySignal &&
          cov.thermalRegime != null
        ),
        externalCalls: hit.externalClimateProviderCalls || 0
      };
    })(),
    noSingaporeHardcodeInRule: (() => {
      const src = fs.readFileSync(
        path.join(ROOT, 'modules/personal-domain/structural-climate-authority-v1.js'),
        'utf8'
      );
      const i = src.indexOf('function atmosphericHumidityMismatchForLowTolerancePlant');
      const block = src.slice(i, i + 1400);
      return !/singapore|bay-laurel|oleander|common-thyme|garden-sage/i.test(block);
    })(),
    quantitativeSchema: {
      contractVersion: CATALOG_EXPANSION_CONTRACT_VERSION,
      compatibleVersions: [...CATALOG_EXPANSION_COMPATIBLE_VERSIONS],
      optionalClaimFields: [...QUANTITATIVE_CLAIM_FIELDS],
      batch1NumericEnrichment: false,
      provenanceRule:
        'Asserted quantitative fields require sourceIds + shortExcerpt; inventing from qualitative labels forbidden'
    },
    matrixSample: matrix.filter((r) =>
      ['durian', 'sweet-cherry', 'carob', 'bay-laurel', 'oleander', 'garden-sage'].includes(
        r.plant
      )
    ),
    generatedAt: new Date().toISOString()
  };

  const hardeningVerdict =
    materialFp.length === 0 &&
    materialFn.length === 0 &&
    report.originalFpBeforeAfter.every((x) => x.fixed) &&
    report.lowHumidityRegressionGuard.notBlanketNotRecommended &&
    report.tileProfileExposureEquivalence.coverageHasRequiredEnums &&
    report.noSingaporeHardcodeInRule &&
    report.batch2Recommendation.schemaReady
      ? 'CRUVIT_PLANT_CLIMATE_V2_ALIGNMENT_HARDENING: PASS'
      : 'CRUVIT_PLANT_CLIMATE_V2_ALIGNMENT_HARDENING: FAIL';

  report.hardeningVerdict = hardeningVerdict;
  // Keep integration gate verdict aligned with material FP/FN after fix
  report.verdict =
    materialFp.length === 0 && materialFn.length === 0
      ? 'CRUVIT_PLANT_CLIMATE_V2_INTEGRATION_GATE: PASS'
      : 'CRUVIT_PLANT_CLIMATE_V2_INTEGRATION_GATE: FAIL';

  // Refresh P0 after fix path
  report.systemicGaps.P0 = materialFp.length
    ? ['Residual material false positives — see falsePositiveCandidates']
    : [];
  if (materialFp.length === 0) {
    report.systemicGaps.P1 = report.systemicGaps.P1.filter(
      (x) => !/Tighten low-humidity/i.test(x)
    );
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(
    HARDENING_OUT,
    JSON.stringify(
      {
        gate: 'CRUVIT_PLANT_CLIMATE_V2_ALIGNMENT_HARDENING',
        verdict: hardeningVerdict,
        integrationVerdict: report.verdict,
        materialFp: materialFp.length,
        materialFn: materialFn.length,
        originalFpBeforeAfter: report.originalFpBeforeAfter,
        matrixSummary: summary,
        mediterraneanSanity: report.mediterraneanSanity,
        lowHumidityRegressionGuard: report.lowHumidityRegressionGuard,
        tileProfileExposureEquivalence: report.tileProfileExposureEquivalence,
        noSingaporeHardcodeInRule: report.noSingaporeHardcodeInRule,
        quantitativeSchema: report.quantitativeSchema,
        batch2Recommendation: report.batch2Recommendation,
        systemicGaps: report.systemicGaps,
        externalCalls: EXTERNAL,
        gradientExternalClimateCalls: gradientExt,
        generatedAt: report.generatedAt
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify(
      {
        hardeningVerdict,
        integrationVerdict: report.verdict,
        matrix: matrix.length,
        gradient: gradientRows.length,
        materialFp: materialFp.length,
        materialFn: materialFn.length,
        fpFixed: report.originalFpBeforeAfter.filter((x) => x.fixed).length,
        noHardcode: report.noSingaporeHardcodeInRule,
        tileEnums: report.tileProfileExposureEquivalence.coverageHasRequiredEnums,
        schemaReady: report.batch2Recommendation.schemaReady,
        out: HARDENING_OUT
      },
      null,
      2
    )
  );
}

main();
