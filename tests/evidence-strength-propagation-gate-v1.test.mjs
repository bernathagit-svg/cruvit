/**
 * CRUVIT Evidence-Strength Propagation — final pre-commit gate.
 * Heuristic/unknown plant traits must not authorize confident botanical truth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile,
  plantNeedsWinterChill
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { buildPlantDiscriminatedSuitabilityStub } from '../modules/personal-domain/plant-climate-suitability-baseline-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  annotatePacketFieldProvenance,
  FIELD_PROVENANCE_EVIDENCE_CLASSES
} from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import {
  applyEvidenceStrengthPropagation,
  auditConfidentDependsOnWeakEvidence,
  BATCH_2_EVIDENCE_INGESTION_RULE,
  EVIDENCE_STRENGTH_PROPAGATION_VERSION,
  inferGrowthMaterialFields,
  inferSurvivalMaterialFields,
  isConfidentOutcomeStatus,
  resolveTraitEvidenceClass,
  tracePlantEvidenceForDimension
} from '../modules/personal-domain/evidence-strength-propagation-v1-contract.js';
import {
  enforceBatch2EvidenceIngestionRule,
  CATALOG_EXPANSION_BATCH_2_EVIDENCE_RULE
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PILOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'pilot');
const QA = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'qa');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'packets'
);
const OUT = path.join(ROOT, 'tests', '_evidence-strength-propagation-gate-report.json');

const EXTERNAL = Object.freeze({
  chelsa: 0,
  terrain: 0,
  openMeteoStructural: 0,
  era5: 0,
  botanicalApi: 0,
  aiLlm: 0
});

function loadTraitEvidenceFromPacket(slug) {
  const packet = JSON.parse(
    fs.readFileSync(path.join(PACKET_DIR, `${slug}.packet.json`), 'utf8')
  );
  const ann = annotatePacketFieldProvenance(packet);
  const traitEvidenceClasses = {};
  const traitProvenance = {};
  for (const c of ann.claims) {
    traitEvidenceClasses[c.field] = c.evidenceClass;
    traitProvenance[c.field] = {
      evidenceClass: c.evidenceClass,
      sourceIds: c.sourceIds || [],
      shortExcerpt: c.shortExcerpt || null,
      title: packet.sources?.find((s) => s.sourceId === (c.sourceIds || [])[0])?.title || null,
      url: packet.sources?.find((s) => s.sourceId === (c.sourceIds || [])[0])?.url || null
    };
  }
  return { packet, traitEvidenceClasses, traitProvenance };
}

function plantFromDef(def) {
  const { traitEvidenceClasses, traitProvenance } = loadTraitEvidenceFromPacket(def.slug);
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
    floweringRequirements: def.floweringUnknown ? null : def.floweringRequirements || null,
    fruitingRequirements: def.fruitingUnknown ? null : def.fruitingRequirements || null,
    needsReview: def.needsReview === true || def.slug === 'blue-gum',
    traitEvidenceClasses,
    traitProvenance
  };
  return {
    slug: def.slug,
    name: def.common,
    scientific: def.scientific,
    climateTraits,
    needsReview: climateTraits.needsReview
  };
}

function loadClimate(siteId) {
  const raw = JSON.parse(fs.readFileSync(path.join(PILOT, `${siteId}.json`), 'utf8'));
  let qa = null;
  const qaPath = path.join(QA, `${siteId}.json`);
  if (fs.existsSync(qaPath)) qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  const confidence = buildCoordinateClimateConfidenceV2({ profile: raw, qaRecord: qa });
  const profile = {
    ...raw,
    confidence: confidence.overall,
    confidenceDimensions: confidence.dimensions,
    localRepresentativeness: confidence.localRepresentativeness
  };
  const structural = coordinateClimateProfileToStructuralPersistence(profile);
  const base = {
    ...structural,
    coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
    warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC,
    alwaysHot: profile.alwaysHot,
    coolSeasonSignal: profile.coolSeasonSignal,
    highlandModifier: profile.highlandModifier,
    monthlyHursPct: profile.monthlyHursPct,
    meanRelativeHumidityPct: profile.meanRelativeHumidityPct,
    meanVpdPa: profile.meanVpdPa,
    atmosphericHumidityRegime: profile.atmosphericHumidityRegime,
    confidence: profile.confidence,
    confidenceDimensions: profile.confidenceDimensions,
    localRepresentativeness: profile.localRepresentativeness,
    coordinateClimateV2: profile
  };
  const env = structuralEnvironmentFromClimateProfile(base);
  return {
    siteId,
    climateProfile: {
      ...base,
      ...env,
      isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate
    }
  };
}

function evaluate(plant, climateBundle) {
  const meta = plant.climateTraits;
  let suitability = buildPlantDiscriminatedSuitabilityStub(meta, climateBundle.climateProfile);
  if (
    plantNeedsWinterChill(meta) &&
    climateBundle.climateProfile.alwaysHot &&
    !climateBundle.climateProfile.coolSeasonSignal
  ) {
    suitability = {
      ...suitability,
      thriveFit: Math.min(suitability.thriveFit, 30)
    };
  }
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
    evidenceStrength: outcomes.evidenceStrength,
    env: {
      freezingRisk: climateBundle.climateProfile.freezingRisk,
      thermalRegime: climateBundle.climateProfile.thermalRegime,
      isFrostFreeGrowingClimate: climateBundle.climateProfile.isFrostFreeGrowingClimate,
      coldestMonthMeanMinC: climateBundle.climateProfile.coldestMonthMeanMinC,
      humiditySignal: climateBundle.climateProfile.humiditySignal,
      moistureRegime: climateBundle.climateProfile.moistureRegime
    },
    meta
  };
}

test('contract version + Batch 2 rule frozen', () => {
  assert.equal(EVIDENCE_STRENGTH_PROPAGATION_VERSION, '1.0.0');
  assert.equal(BATCH_2_EVIDENCE_INGESTION_RULE.templateExcerptIsNotSourceQuote, true);
  assert.equal(CATALOG_EXPANSION_BATCH_2_EVIDENCE_RULE.unknownAcceptable, true);
  assert.equal(
    enforceBatch2EvidenceIngestionRule({
      claims: [
        {
          claimId: 'frost',
          field: 'frostSensitivity',
          status: 'asserted',
          value: 'medium',
          sourceIds: ['x'],
          shortExcerpt: 'Frost sensitivity characterized as medium.'
        }
      ]
    }).ok,
    false
  );
});

test('SOURCE_SUPPORTED may keep confident outcome; HEURISTIC demotes', () => {
  const heuristic = applyEvidenceStrengthPropagation({
    meta: {
      frostSensitivity: 'medium',
      traitEvidenceClasses: { frostSensitivity: 'HEURISTIC_ASSERTION' }
    },
    env: { freezingRisk: 'low' },
    survival: 'reliable',
    growth: 'supported',
    flowering: 'unknown',
    fruiting: 'unknown',
    evidenceHints: { survivalFields: ['frostSensitivity'], growthFields: ['frostSensitivity'] }
  });
  assert.equal(heuristic.survival, 'constrained');
  assert.equal(heuristic.growth, 'constrained');

  const sourced = applyEvidenceStrengthPropagation({
    meta: {
      frostSensitivity: 'medium',
      humidityTolerance: 'low',
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        humidityTolerance: 'SOURCE_SUPPORTED'
      }
    },
    env: { freezingRisk: 'low' },
    survival: 'reliable',
    growth: 'supported',
    flowering: 'unknown',
    fruiting: 'unknown',
    evidenceHints: {
      survivalFields: ['frostSensitivity'],
      growthFields: ['frostSensitivity', 'humidityTolerance']
    }
  });
  assert.equal(sourced.survival, 'reliable');
  assert.equal(sourced.growth, 'supported');
});

test('heuristic frostSensitivity=high does not keep confident Unreliable', () => {
  const bound = applyEvidenceStrengthPropagation({
    meta: {
      frostSensitivity: 'high',
      traitEvidenceClasses: { frostSensitivity: 'HEURISTIC_ASSERTION' }
    },
    env: { freezingRisk: 'high' },
    survival: 'unreliable',
    growth: 'poor',
    flowering: 'unlikely',
    fruiting: 'unreliable',
    evidenceHints: {
      survivalFields: ['frostSensitivity'],
      growthFields: ['frostSensitivity']
    }
  });
  assert.equal(bound.survival, 'constrained');
  assert.equal(bound.growth, 'constrained');
  assert.equal(bound.flowering, 'unknown'); // floweringRequirements unknown field
});

test('PART A/D — Bay Laurel evidence trace + six-site after propagation', () => {
  const bay = plantFromDef(BATCH1_PLANTS.find((p) => p.slug === 'bay-laurel'));
  const sites = ['yehiam', 'singapore', 'cairo', 'tokyo', 'helsinki', 'quito'];
  const traces = {};
  const table = [];
  for (const s of sites) {
    const row = evaluate(bay, loadClimate(s));
    const survFields = inferSurvivalMaterialFields({
      meta: bay.climateTraits,
      survival: row.survival,
      env: row.env
    });
    const growFields = inferGrowthMaterialFields({
      meta: bay.climateTraits,
      growth: row.growth
    });
    traces[s] = {
      Survival: tracePlantEvidenceForDimension(bay.climateTraits, survFields).map((t) => ({
        ...t,
        materiallyAffected: (row.evidenceStrength?.demotions || []).some(
          (d) => d.dimension === 'Survival'
        ) || isConfidentOutcomeStatus(row.evidenceStrength?.traces?.Survival?.previousStatus)
      })),
      Growth: tracePlantEvidenceForDimension(bay.climateTraits, growFields),
      Flowering: tracePlantEvidenceForDimension(bay.climateTraits, ['floweringRequirements']),
      Fruiting: tracePlantEvidenceForDimension(bay.climateTraits, ['fruitingRequirements']),
      demotions: row.evidenceStrength?.demotions || []
    };
    // Yehiam/Cairo: must NOT stay Reliable/Supported on heuristic traits
    if (s === 'yehiam' || s === 'cairo') {
      assert.notEqual(row.survival, 'reliable', `${s} survival`);
      assert.notEqual(row.growth, 'supported', `${s} growth`);
    }
    assert.ok(!isConfidentOutcomeStatus(row.survival) || false);
    // After propagation, no confident dimension statuses for Bay Laurel (all traits heuristic/unknown)
    for (const dim of [row.survival, row.growth, row.flowering, row.fruiting]) {
      assert.equal(isConfidentOutcomeStatus(dim), false, `${s} ${dim}`);
    }
    assert.notEqual(row.overall, 'good');
    assert.notEqual(row.overall, 'blocked');
    table.push({
      Location: s,
      Survival: row.survival,
      Growth: row.growth,
      Flowering: row.flowering,
      Fruiting: row.fruiting,
      Overall: row.overall,
      Confidence: 'bounded-heuristic-plant-evidence'
    });
  }
  // Explain Yehiam/Cairo authorization: previously heuristic frost/humidity masqueraded as truth
  assert.ok(
    resolveTraitEvidenceClass(bay.climateTraits, 'frostSensitivity') ===
      FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION
  );
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_bay-laurel-evidence-trace.json'),
    `${JSON.stringify({ traces, table }, null, 2)}\n`
  );
});

test('PART E — 30-plant audit CONFIDENT_RESULTS_DEPENDING_ON_HEURISTIC_EVIDENCE = 0', () => {
  const sites = ['yehiam', 'helsinki', 'singapore', 'kochi', 'cairo', 'tokyo', 'quito'];
  const climates = Object.fromEntries(sites.map((s) => [s, loadClimate(s)]));
  let confidentWeak = 0;
  const examples = [];
  const enrichmentHits = new Map();

  for (const def of BATCH1_PLANTS) {
    const plant = plantFromDef(def);
    for (const s of sites) {
      const row = evaluate(plant, climates[s]);
      const hits = auditConfidentDependsOnWeakEvidence(row, plant.climateTraits);
      if (hits.length) {
        confidentWeak += hits.length;
        if (examples.length < 12) {
          examples.push({ plant: def.slug, site: s, hits });
        }
      }
      // Enrichment priority: heuristic traits that would have been material
      for (const d of row.evidenceStrength?.demotions || []) {
        for (const f of d.materialEvidence?.fields || []) {
          if (f.evidenceClass !== 'HEURISTIC_ASSERTION') continue;
          const key = `${def.slug}|${f.field}`;
          const dim = d.dimension || 'Survival';
          const weight =
            dim === 'Survival' ? 4 : dim === 'Growth' ? 3 : dim === 'Flowering' ? 2 : 1;
          const prev = enrichmentHits.get(key) || {
            plant: def.slug,
            field: f.field,
            weight: 0,
            sites: new Set()
          };
          prev.weight += weight;
          prev.sites.add(s);
          enrichmentHits.set(key, prev);
        }
      }
    }
  }

  assert.equal(
    confidentWeak,
    0,
    `CONFIDENT_RESULTS_DEPENDING_ON_HEURISTIC_EVIDENCE=${confidentWeak} examples=${JSON.stringify(examples).slice(0, 800)}`
  );

  const enrichmentQueue = [...enrichmentHits.values()]
    .map((x) => ({
      plant: x.plant,
      field: x.field,
      weight: x.weight,
      siteCount: x.sites.size
    }))
    .sort((a, b) => b.weight - a.weight || a.plant.localeCompare(b.plant))
    .slice(0, 40);

  const report = {
    gate: 'CRUVIT_EVIDENCE_STRENGTH_PROPAGATION_GATE',
    verdict: 'PASS',
    CONFIDENT_RESULTS_DEPENDING_ON_HEURISTIC_EVIDENCE: confidentWeak,
    previouslyEvaluatorConsumedHeuristicAsAuthoritative: true,
    enrichmentQueue,
    batch2Rule: BATCH_2_EVIDENCE_INGESTION_RULE,
    externalRuntimeCalls: EXTERNAL
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
});
