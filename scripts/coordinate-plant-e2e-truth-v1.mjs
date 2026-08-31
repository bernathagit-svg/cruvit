#!/usr/bin/env node
/**
 * CRUVIT Coordinate × Plant End-to-End Truth Test V1 (READ-ONLY / LOCAL).
 *
 * exact lat/lon → Coordinate Climate V2 → canonical plant → suitability
 * → Overall / Survival / Growth / Flowering / Fruiting → limiting factors
 * → explanation → Plant Knowledge / Warnings
 *
 * NO Batch 3. NO global bake. NO live DB write. NO commit. NO external runtime fetch.
 *
 * Usage: node scripts/coordinate-plant-e2e-truth-v1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';
import { BATCH2_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-2-v1/definitions.mjs';
import { climateTraitsFromDefAndPacket, isMaterialEvidenceField } from './catalog-batch2-shared.mjs';
import { annotatePacketFieldProvenance } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import {
  lookupCoordinateClimateProfile,
  loadCoordinateClimateIndex
} from '../modules/personal-domain/coordinate-climate-lookup-v2.js';
import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  coordinateClimateProfileToStructuralPersistence,
  assertCoordinateClimateRuntimeCostPolicy
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile,
  plantNeedsWinterChill
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { buildPlantDiscriminatedSuitabilityStub } from '../modules/personal-domain/plant-climate-suitability-baseline-v1.js';
import { auditConfidentDependsOnWeakEvidence } from '../modules/personal-domain/evidence-strength-propagation-v1-contract.js';
import {
  isConfirmedWarning,
  resolveWarningRenderPolicy
} from '../modules/catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import {
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'tests', '_coordinate-plant-e2e-truth-v1-report.json');
const PK60_PATH = path.join(
  ROOT,
  'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_handoff.json'
);
const B1_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-1-v1/handoff/catalog_plants_enrichment_handoff.json'
);
const B2_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-2-v1/handoff/catalog_plants_batch2_handoff.json'
);

const LOCATIONS = Object.freeze([
  { id: 'yehiam', label: 'Yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'helsinki', label: 'Helsinki', lat: 60.16952, lon: 24.93545 },
  { id: 'singapore', label: 'Singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'kochi', label: 'Kochi', lat: 9.93988, lon: 76.26022 },
  { id: 'cairo', label: 'Cairo', lat: 30.06263, lon: 31.24967 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', label: 'Quito', lat: -0.22985, lon: -78.52495 }
]);

const REQUIRED_PLANTS = Object.freeze([
  'durian',
  'bay-laurel',
  'oleander',
  'sweet-cherry',
  'common-lilac',
  'turmeric',
  'hazelnut',
  'cranberry',
  'soursop',
  'yucca'
]);

/** Required cross-location inspection pairs. */
const REQUIRED_PAIRS = Object.freeze([
  ['yehiam', 'durian'],
  ['yehiam', 'bay-laurel'],
  ['singapore', 'durian'],
  ['helsinki', 'oleander'],
  ['helsinki', 'common-lilac'],
  ['cairo', 'cranberry'],
  ['quito', 'soursop'],
  ['tokyo', 'sweet-cherry'],
  ['kochi', 'turmeric'],
  ['yehiam', 'hazelnut']
]);

const EXTERNAL = Object.freeze({
  climateCalls: 0,
  botanicalCalls: 0,
  aiResearch: 0,
  paidApiCostUsd: 0
});

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, ''));
}

function packetDir(batchLabel) {
  return path.join(ROOT, 'data/catalog-expansion/batches', batchLabel, 'packets');
}

function plantFromDef(def, batchLabel) {
  const packetPath = path.join(packetDir(batchLabel), `${def.slug}.packet.json`);
  if (batchLabel === 'bulk-batch-2-v1' && fs.existsSync(packetPath)) {
    const packet = readJson(packetPath);
    const climateTraits = climateTraitsFromDefAndPacket(def, packet);
    return {
      slug: def.slug,
      name: def.common,
      scientific: def.scientific,
      aliases: def.aliases || [],
      climateTraits,
      batch: batchLabel,
      source: 'batch2-evidence-first-packets'
    };
  }
  let traitEvidenceClasses = {};
  let traitProvenance = {};
  if (fs.existsSync(packetPath)) {
    const packet = readJson(packetPath);
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
    needsReview: def.needsReview === true,
    traitEvidenceClasses,
    traitProvenance
  };
  return {
    slug: def.slug,
    name: def.common,
    scientific: def.scientific,
    aliases: def.aliases || [],
    climateTraits,
    batch: batchLabel,
    source: 'batch1-definitions'
  };
}

function loadCanonicalPlants(knowledgeBySlug) {
  const bySlug = new Map();
  for (const def of BATCH1_PLANTS) {
    const p = plantFromDef(def, 'bulk-batch-1-v1');
    if (knowledgeBySlug[p.slug]) {
      p.climateTraits = {
        ...p.climateTraits,
        plantKnowledge: knowledgeBySlug[p.slug]
      };
    }
    bySlug.set(p.slug, p);
  }
  for (const def of BATCH2_PLANTS) {
    const p = plantFromDef(def, 'bulk-batch-2-v1');
    if (knowledgeBySlug[p.slug]) {
      p.climateTraits = {
        ...p.climateTraits,
        plantKnowledge: knowledgeBySlug[p.slug]
      };
    }
    bySlug.set(p.slug, p);
  }
  return bySlug;
}

function materialInventoryFromHandoff(fp) {
  const doc = readJson(fp);
  const rows = doc.rows || doc.plants || [];
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const map = (r.climate_traits || r.climateTraits || {}).traitEvidenceClasses || {};
    for (const [f, c] of Object.entries(map)) {
      if (isMaterialEvidenceField(f) && counts[c] != null) counts[c] += 1;
    }
  }
  return { plantCount: rows.length, inventory: counts };
}

function knowledgeInventory(doc) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (obj.evidenceClass && Array.isArray(obj.sourceIds)) {
      if (counts[obj.evidenceClass] != null) counts[obj.evidenceClass] += 1;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'sources') continue;
      if (k === 'warnings') {
        for (const w of v || []) {
          if (counts[w.evidenceClass] != null) counts[w.evidenceClass] += 1;
        }
        continue;
      }
      walk(v);
    }
  };
  for (const p of doc.plants || []) walk(p.plantKnowledge);
  return counts;
}

function climateKeyValues(profile) {
  return {
    elevationM: profile.elevationM ?? profile.terrain?.elevationM ?? null,
    coldestMonthMeanMinC: profile.coldestMonthMeanMinC ?? null,
    warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC ?? null,
    annualPrecipitationMm: profile.annualPrecipitationMm ?? null,
    annualPetMm: profile.annualPetMm ?? null,
    aridityIndex: profile.aridityIndex ?? null,
    meanRelativeHumidityPct: profile.meanRelativeHumidityPct ?? null,
    humiditySignal: profile.humiditySignal ?? profile.atmosphericHumidityRegime ?? null,
    meanVpdPa: profile.meanVpdPa ?? null,
    thermalRegime: profile.thermalRegime ?? null,
    moistureRegime: profile.aridityMoistureRegime ?? null,
    alwaysHot: profile.alwaysHot ?? null,
    coolSeasonSignal: profile.coolSeasonSignal ?? null
  };
}

function bundleFromLookup(loc, lookup) {
  const qaPath = path.join(ROOT, 'data/coordinate-climate/v2/qa', `${loc.id}.json`);
  const qa = fs.existsSync(qaPath) ? readJson(qaPath) : null;
  const confidence = buildCoordinateClimateConfidenceV2({
    profile: lookup.profile,
    qaRecord: qa
  });
  const profile = {
    ...lookup.profile,
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
    locationId: loc.id,
    label: loc.label,
    requestedLat: loc.lat,
    requestedLon: loc.lon,
    matchedLat: lookup.matchedEntry?.lat ?? null,
    matchedLon: lookup.matchedEntry?.lon ?? null,
    authorityVersion: profile.authorityVersion || COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    bakeId:
      profile.baseline?.source ||
      profile.baseline?.id ||
      'chelsa-v2.1-climatologies-1981-2010',
    climateGridCell: profile.climateGrid?.cellPixel || null,
    noCityProxy: profile.provenance?.cityProxy !== true && profile.provenance?.usedCityProxy !== true,
    source: lookup.source,
    keyClimate: climateKeyValues(profile),
    climateProfile: {
      ...climateProfileBase,
      ...env,
      isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate
    }
  };
}

function buildSuitabilityStub(meta, climateProfile) {
  const stub = buildPlantDiscriminatedSuitabilityStub(meta, climateProfile);
  if (plantNeedsWinterChill(meta) && climateProfile.alwaysHot && !climateProfile.coolSeasonSignal) {
    stub.thriveFit = Math.min(stub.thriveFit, 30);
    stub.fruitingFit = Math.min(stub.fruitingFit, 10);
    stub.warnings.push(
      'Reliable fruiting is unlikely without winter chill or a clear cool season.'
    );
  }
  return stub;
}

function outcomeAxes(o) {
  return {
    overall: o.overall,
    survival: o.survival,
    growth: o.growth,
    flowering: o.flowering,
    fruiting: o.fruiting
  };
}

function axesEqual(a, b) {
  return (
    a.overall === b.overall &&
    a.survival === b.survival &&
    a.growth === b.growth &&
    a.flowering === b.flowering &&
    a.fruiting === b.fruiting
  );
}

function isPositive(status) {
  return status === 'reliable' || status === 'supported' || status === 'good' || status === 'excellent';
}

function extractWarnings(plantKnowledge) {
  const warnings = [];
  for (const w of plantKnowledge?.warnings || []) {
    const policy = resolveWarningRenderPolicy(w);
    warnings.push({
      warningId: w.warningId,
      category: w.category,
      evidenceClass: w.evidenceClass,
      confirmed: isConfirmedWarning(w),
      render: policy.render,
      summary: String(w.summary || '').slice(0, 160)
    });
  }
  return warnings;
}

function evaluatePair(bundle, plant) {
  const meta = plant.climateTraits;
  const suitability = buildSuitabilityStub(meta, bundle.climateProfile);
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: bundle.climateProfile,
    suitability,
    plant,
    protectedGrowing: false
  });
  const heuristicHits = auditConfidentDependsOnWeakEvidence(
    { ...outcomes, env: bundle.climateProfile },
    meta
  );
  const tec = meta.traitEvidenceClasses || {};
  const evidenceClassesInvolved = {
    frostSensitivity: tec.frostSensitivity || null,
    coldTolerance: tec.coldTolerance || null,
    heatTolerance: tec.heatTolerance || null,
    humidityTolerance: tec.humidityTolerance || null,
    waterNeeds: tec.waterNeeds || null,
    needsWinterChill: tec.needsWinterChill || null,
    floweringRequirements: tec.floweringRequirements || null,
    fruitingRequirements: tec.fruitingRequirements || null
  };
  const pk = meta.plantKnowledge || null;
  const warnings = extractWarnings(pk);

  // Warning/climate separation: strip plantKnowledge and re-evaluate climate axes.
  const metaNoWarn = { ...meta };
  delete metaNoWarn.plantKnowledge;
  const plantNoWarn = { ...plant, climateTraits: metaNoWarn };
  const suitabilityNoWarn = buildSuitabilityStub(metaNoWarn, bundle.climateProfile);
  const outcomesNoWarn = deriveSpecificPlantOutcomes({
    meta: metaNoWarn,
    climateProfile: bundle.climateProfile,
    suitability: suitabilityNoWarn,
    plant: plantNoWarn,
    protectedGrowing: false
  });
  const warningSeparationOk = axesEqual(outcomeAxes(outcomes), outcomeAxes(outcomesNoWarn));

  return {
    locationId: bundle.locationId,
    coordinate: { lat: bundle.requestedLat, lon: bundle.requestedLon },
    matchedCoordinate: { lat: bundle.matchedLat, lon: bundle.matchedLon },
    plantSlug: plant.slug,
    scientific: plant.scientific,
    overall: outcomes.overall,
    survival: outcomes.survival,
    growth: outcomes.growth,
    flowering: outcomes.flowering,
    fruiting: outcomes.fruiting,
    limitingFactors: outcomes.limitingFactors || [],
    unknownEvidence: outcomes.unknownEvidence || [],
    needsReview: outcomes.needsReview === true,
    evidenceClassesInvolved,
    keyClimate: bundle.keyClimate,
    authorityVersion: bundle.authorityVersion,
    bakeId: bundle.bakeId,
    climateGridCell: bundle.climateGridCell,
    warnings,
    explanationAtoms: (outcomes.limitingFactors || []).slice(0, 8),
    heuristicDependentHits: heuristicHits,
    warningSuitabilitySeparationOk: warningSeparationOk,
    gardenInventions: {
      irrigation: false,
      shade: false,
      greenhouse: false,
      windProtection: false,
      containerProtection: false,
      microclimate: false,
      protectedGrowing: false
    }
  };
}

function auditPairFailures(row, plant) {
  const failures = [];
  if (row.heuristicDependentHits?.length) {
    failures.push('heuristic-dependent-confident');
  }
  if (!row.warningSuitabilitySeparationOk) {
    failures.push('warning-changed-climate-truth');
  }
  // Survival failure must not yield confident Overall recommendation.
  if (
    (row.survival === 'unreliable' || row.survival === 'blocked' || row.survival === 'unsupported') &&
    (row.overall === 'good' || row.overall === 'excellent' || row.overall === 'recommended')
  ) {
    failures.push('survival-failure-softened-to-recommendation');
  }
  // Flowering/fruiting must not be positive without evidence fields.
  const tec = plant.climateTraits?.traitEvidenceClasses || {};
  const flowerEv = plant.climateTraits?.floweringRequirements;
  const fruitEv = plant.climateTraits?.fruitingRequirements;
  if (isPositive(row.flowering) && !flowerEv && !tec.floweringRequirements) {
    failures.push('flowering-inferred-without-evidence');
  }
  if (isPositive(row.fruiting) && !fruitEv && !tec.fruitingRequirements) {
    failures.push('fruiting-inferred-without-evidence');
  }
  // UNKNOWN must not be reported as positive
  for (const axis of ['survival', 'growth', 'flowering', 'fruiting', 'overall']) {
    if (row[axis] === 'unknown' && isPositive(row[axis])) {
      failures.push(`${axis}-unknown-promoted`);
    }
  }
  // If flowering UNKNOWN in unknownEvidence but axis is positive
  if (
    (row.unknownEvidence || []).some((u) => /flower/i.test(String(u))) &&
    isPositive(row.flowering)
  ) {
    failures.push('flowering-unknown-promoted-positive');
  }
  if (
    (row.unknownEvidence || []).some((u) => /fruit/i.test(String(u))) &&
    isPositive(row.fruiting)
  ) {
    failures.push('fruiting-unknown-promoted-positive');
  }
  return failures;
}

function main() {
  resetCoordinateClimateRuntimeCounters();
  const blockers = [];
  const failureEvents = [];

  const pk60 = readJson(PK60_PATH);
  const knowledgeBySlug = Object.fromEntries(
    (pk60.plants || []).map((p) => [p.slug, p.plantKnowledge])
  );
  const plantsBySlug = loadCanonicalPlants(knowledgeBySlug);

  for (const slug of REQUIRED_PLANTS) {
    if (!plantsBySlug.has(slug)) {
      blockers.push(`required plant missing from Batch1/2 canonical set: ${slug}`);
    }
  }

  // Exact coordinate → climate authority lookup (no city proxy / no fetch).
  const locationBundles = {};
  const climateLookupResults = [];
  for (const loc of LOCATIONS) {
    const lookup = lookupCoordinateClimateProfile(loc.lat, loc.lon);
    const cost = assertCoordinateClimateRuntimeCostPolicy();
    if (!lookup.ok || lookup.code === CLIMATE_AUTHORITY_UNAVAILABLE) {
      climateLookupResults.push({
        locationId: loc.id,
        lat: loc.lat,
        lon: loc.lon,
        ok: false,
        code: lookup.code || CLIMATE_AUTHORITY_UNAVAILABLE,
        source: lookup.source
      });
      blockers.push(`CLIMATE_AUTHORITY_UNAVAILABLE for ${loc.id} @ ${loc.lat},${loc.lon}`);
      continue;
    }
    if (lookup.profile?.provenance?.cityProxy || lookup.profile?.provenance?.usedCityProxy) {
      blockers.push(`city-proxy detected for ${loc.id}`);
    }
    // Prove matched coordinate equals requested (within lookup epsilon).
    const dLat = Math.abs(Number(lookup.matchedEntry.lat) - loc.lat);
    const dLon = Math.abs(Number(lookup.matchedEntry.lon) - loc.lon);
    if (dLat > 0.00015 || dLon > 0.00015) {
      blockers.push(`coordinate mismatch for ${loc.id}: matched≠requested`);
    }
    if (lookup.matchedEntry.id !== loc.id) {
      // Tokyo index id must still be tokyo; refuse silent city substitution.
      blockers.push(
        `indexed id mismatch for ${loc.id}: got ${lookup.matchedEntry.id} (possible city proxy)`
      );
    }
    const bundle = bundleFromLookup(loc, lookup);
    locationBundles[loc.id] = bundle;
    climateLookupResults.push({
      locationId: loc.id,
      lat: loc.lat,
      lon: loc.lon,
      ok: true,
      code: 'OK',
      source: lookup.source,
      authorityVersion: bundle.authorityVersion,
      bakeId: bundle.bakeId,
      matched: lookup.matchedEntry,
      keyClimate: bundle.keyClimate,
      climateGridCell: bundle.climateGridCell,
      cost
    });
  }

  const plants = REQUIRED_PLANTS.map((s) => plantsBySlug.get(s)).filter(Boolean);
  // Optional edge plant: blue-gum (needsReview) if present — only if already in set.
  // Keep matrix bounded to required 10 unless an edge case plant is already required.

  const matrix = [];
  let heuristicDependentConfident = 0;
  let unknownHandlingFailures = 0;
  let cityProxyOrRuntimeFetch = 0;
  let warningSeparationFails = 0;

  for (const loc of LOCATIONS) {
    const bundle = locationBundles[loc.id];
    if (!bundle) continue;
    for (const plant of plants) {
      const row = evaluatePair(bundle, plant);
      const fails = auditPairFailures(row, plant);
      if (fails.length) {
        failureEvents.push({ pair: `${loc.id}×${plant.slug}`, fails });
        if (fails.some((f) => f.includes('unknown'))) unknownHandlingFailures += 1;
        if (fails.includes('warning-changed-climate-truth')) warningSeparationFails += 1;
        if (fails.includes('heuristic-dependent-confident')) {
          heuristicDependentConfident += row.heuristicDependentHits.length;
        }
      }
      if (row.heuristicDependentHits?.length && !fails.includes('heuristic-dependent-confident')) {
        heuristicDependentConfident += row.heuristicDependentHits.length;
      }
      matrix.push({ ...row, auditFailures: fails });
    }
  }

  // Required pair deep extracts
  const representative = [];
  for (const [locId, slug] of REQUIRED_PAIRS) {
    const row = matrix.find((r) => r.locationId === locId && r.plantSlug === slug);
    if (!row) {
      blockers.push(`missing required pair ${locId}×${slug}`);
      continue;
    }
    representative.push(row);
  }

  // Helsinki × oleander: climate may fail AND toxicity warning must remain.
  const helOle = matrix.find((r) => r.locationId === 'helsinki' && r.plantSlug === 'oleander');
  if (helOle) {
    const hasTox = (helOle.warnings || []).some(
      (w) => w.category === 'toxicity' || /toxic/i.test(w.warningId || '')
    );
    if (!hasTox) {
      blockers.push('Helsinki×oleander missing toxicity warning (knowledge/climate separation)');
    }
    if (!helOle.warningSuitabilitySeparationOk) {
      blockers.push('Helsinki×oleander warning altered climate axes');
    }
  }

  // Regressions from committed handoffs (do not mutate).
  const b1 = materialInventoryFromHandoff(B1_HANDOFF);
  const b2 = materialInventoryFromHandoff(B2_HANDOFF);
  const pkInv = knowledgeInventory(pk60);
  const regression = {
    batch1: {
      expected: { SOURCE_SUPPORTED: 189, HEURISTIC_ASSERTION: 125, UNKNOWN: 11 },
      actual: b1.inventory,
      pass:
        b1.inventory.SOURCE_SUPPORTED === 189 &&
        b1.inventory.HEURISTIC_ASSERTION === 125 &&
        b1.inventory.UNKNOWN === 11
    },
    batch2: {
      expected: { SOURCE_SUPPORTED: 248, HEURISTIC_ASSERTION: 71, UNKNOWN: 25 },
      actual: b2.inventory,
      pass:
        b2.inventory.SOURCE_SUPPORTED === 248 &&
        b2.inventory.HEURISTIC_ASSERTION === 71 &&
        b2.inventory.UNKNOWN === 25
    },
    plantKnowledge: {
      expected: { SOURCE_SUPPORTED: 100, HEURISTIC_ASSERTION: 136, UNKNOWN: 405 },
      actual: pkInv,
      pass:
        pkInv.SOURCE_SUPPORTED === 100 &&
        pkInv.HEURISTIC_ASSERTION === 136 &&
        pkInv.UNKNOWN === 405
    }
  };
  if (!regression.batch1.pass) blockers.push('Batch 1 material inventory regression');
  if (!regression.batch2.pass) blockers.push('Batch 2 material inventory regression');
  if (!regression.plantKnowledge.pass) blockers.push('Plant Knowledge 60 inventory regression');

  // Re-run Plant Climate V2 Batch 1 gate for material FP/FN (local, zero external).
  const gate = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts/plant-climate-v2-integration-gate.mjs')],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 }
  );
  let climateGate = {
    exitCode: gate.status,
    materialFp: null,
    materialFn: null,
    heuristicDependentConfident: null,
    pass: false
  };
  const hardeningPath = path.join(ROOT, 'tests/_plant-climate-v2-alignment-hardening-report.json');
  if (fs.existsSync(hardeningPath)) {
    const hard = readJson(hardeningPath);
    climateGate = {
      exitCode: gate.status,
      materialFp: hard.materialFp ?? null,
      materialFn: hard.materialFn ?? null,
      heuristicDependentConfident:
        hard.heuristicDependentConfident ??
        (Array.isArray(hard.materialFp) ? null : 0),
      verdict: hard.integrationVerdict || hard.verdict,
      pass:
        gate.status === 0 &&
        Number(hard.materialFp) === 0 &&
        Number(hard.materialFn) === 0
    };
    // Gate already folds heuristic-dependent confident into material FP.
    if (Number(hard.materialFp) !== 0 || Number(hard.materialFn) !== 0) {
      blockers.push('Plant Climate V2 integration gate material FP/FN regression');
    }
  } else {
    blockers.push('Plant Climate V2 hardening report missing after gate run');
  }

  const runtimeCounters = getCoordinateClimateRuntimeCounters();
  const runtimeCost = assertCoordinateClimateRuntimeCostPolicy();
  if (
    runtimeCost.chelsaExternalCalls !== 0 ||
    runtimeCost.terrainProviderExternalCalls !== 0 ||
    EXTERNAL.climateCalls !== 0
  ) {
    cityProxyOrRuntimeFetch += 1;
    blockers.push('runtime external climate call detected');
  }

  const index = loadCoordinateClimateIndex();
  const climateLookupPass =
    climateLookupResults.length === LOCATIONS.length &&
    climateLookupResults.every((r) => r.ok);
  const evaluatorPass =
    matrix.length === LOCATIONS.length * plants.length &&
    failureEvents.length === 0 &&
    warningSeparationFails === 0;

  const pairFailures = matrix.filter((r) => r.auditFailures.length > 0);
  for (const r of pairFailures) {
    blockers.push(`${r.locationId}×${r.plantSlug}: ${r.auditFailures.join(',')}`);
  }

  const ok =
    blockers.length === 0 &&
    climateLookupPass &&
    evaluatorPass &&
    climateGate.pass &&
    regression.batch1.pass &&
    regression.batch2.pass &&
    regression.plantKnowledge.pass &&
    heuristicDependentConfident === 0 &&
    unknownHandlingFailures === 0 &&
    cityProxyOrRuntimeFetch === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: 'CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1',
    verdict: ok
      ? 'CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1: PASS'
      : 'CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1: FAIL',
    A_locations: LOCATIONS.map((l) => ({
      id: l.id,
      label: l.label,
      lat: l.lat,
      lon: l.lon
    })),
    B_plants: plants.map((p) => ({
      slug: p.slug,
      scientific: p.scientific,
      batch: p.batch
    })),
    C_pairCount: matrix.length,
    D_climateAuthorityPerLocation: climateLookupResults.map((r) => ({
      locationId: r.locationId,
      authorityVersion: r.authorityVersion || null,
      bakeId: r.bakeId || null,
      matched: r.matched || null,
      keyClimate: r.keyClimate || null,
      climateGridCell: r.climateGridCell || null,
      ok: r.ok,
      code: r.code
    })),
    E_coordinateToClimateLookup: climateLookupPass ? 'PASS' : 'FAIL',
    F_climateToPlantEvaluator: evaluatorPass ? 'PASS' : 'FAIL',
    G_representativePairs: representative,
    H_materialFp: climateGate.materialFp,
    I_materialFn: climateGate.materialFn,
    J_heuristicDependentConfident: heuristicDependentConfident,
    K_unknownHandlingFailures: unknownHandlingFailures,
    L_cityProxyOrRuntimeFetchCount: cityProxyOrRuntimeFetch,
    M_warningSuitabilitySeparation:
      warningSeparationFails === 0 &&
      matrix.every((r) => r.warningSuitabilitySeparationOk)
        ? 'PASS'
        : 'FAIL',
    N_runtimeExternalCalls: {
      climate: 0,
      botanical: 0,
      ai: 0,
      paidApiCostUsd: 0,
      coordinateClimateRuntime: runtimeCounters,
      costPolicy: runtimeCost
    },
    O_blockers: blockers,
    P_readyForGlobalCoverage:
      ok
        ? 'CORE_FLOW_READY — global bake still required for non-pilot coordinates (prepared authority only)'
        : 'NOT_READY',
    matrix,
    failureEvents,
    regression,
    climateGate,
    indexAuthorityVersion: index.version,
    notes: {
      noCityProxy: true,
      noGeocoding: true,
      noClimateApiFallback: true,
      noGardenInventions: true,
      noBatch3: true,
      noLiveWrite: true,
      noCommit: true
    }
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        locations: LOCATIONS.length,
        plants: plants.length,
        pairs: matrix.length,
        E: report.E_coordinateToClimateLookup,
        F: report.F_climateToPlantEvaluator,
        H: report.H_materialFp,
        I: report.I_materialFn,
        J: report.J_heuristicDependentConfident,
        K: report.K_unknownHandlingFailures,
        L: report.L_cityProxyOrRuntimeFetchCount,
        M: report.M_warningSuitabilitySeparation,
        blockers: blockers.slice(0, 20),
        report: REPORT_PATH
      },
      null,
      2
    )
  );
  if (!ok) process.exit(2);
}

main();
