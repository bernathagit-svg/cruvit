/**
 * Plant Data Contract v1 — freeze + read-only classifier proofs.
 * Does not mutate catalog. Does not ingest Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANT_DATA_CONTRACT_VERSION,
  PLANT_DATA_CONTRACT_ID,
  PLANT_DATA_READINESS,
  PLANT_DATA_REASON,
  VALUE_ORIGIN,
  SMART_REC_MERGE_DEFAULT_CORE,
  classifyPlantDataReadiness,
  assertPlantRealSuitabilityReady,
  classifyCatalogReadOnly,
  normalizeBatch3PacketForClassification,
  simulateSmartRecMergeDefaults,
  resolveClimateFieldValueOrigin,
  readAssertedClimateField
} from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  applyBootstrapSafeClimateTraitsMigration,
  applyBootstrapUnlockedSixClimateTraitsMigration,
  applyAllBootstrapStructuralClimateTraitsMigrations,
  getBootstrapSafeClimateTraitsMigrationPayload,
  getBootstrapUnlockedSixClimateTraitsMigrationPayload
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-3-v1',
  'packets'
);

function loadSeedPlants() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return Array.isArray(raw) ? raw : raw.plants || [];
}

function bootstrapSlugsFromApp() {
  const html = fs.readFileSync(APP, 'utf8');
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('];', start);
  const block = html.slice(start, end);
  return [...new Set([...block.matchAll(/slug\s*:\s*'([^']+)'/g)].map((m) => m[1].toLowerCase()))];
}

function completeClassAPlant(overrides = {}) {
  return {
    slug: 'demo-complete',
    name: 'Demo Complete',
    scientific: 'Demo completus',
    climateTraits: {
      frostSensitivity: 'medium',
      coldTolerance: 'medium',
      heatTolerance: 'medium',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'high',
      floweringRequirements: 'Needs full sun and mild frost risk for bloom.',
      fruitingRequirements: 'Fruit set needs warmth and pollination.',
      needsReview: false,
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        floweringRequirements: 'SOURCE_SUPPORTED',
        fruitingRequirements: 'SOURCE_SUPPORTED'
      },
      ...(overrides.climateTraits || {})
    },
    ...overrides,
    climateTraits: {
      frostSensitivity: 'medium',
      coldTolerance: 'medium',
      heatTolerance: 'medium',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'high',
      floweringRequirements: 'Needs full sun and mild frost risk for bloom.',
      fruitingRequirements: 'Fruit set needs warmth and pollination.',
      needsReview: false,
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        floweringRequirements: 'SOURCE_SUPPORTED',
        fruitingRequirements: 'SOURCE_SUPPORTED'
      },
      ...(overrides.climateTraits || {})
    }
  };
}

test('contract version frozen', () => {
  assert.equal(PLANT_DATA_CONTRACT_ID, 'plant-data-contract-v1');
  assert.equal(PLANT_DATA_CONTRACT_VERSION, '1.0.0');
  assert.equal(SMART_REC_MERGE_DEFAULT_CORE.frostSensitivity, 'medium');
});

test('1. missing frostSensitivity + runtime medium fallback does NOT make Class A', () => {
  const plant = {
    slug: 'no-frost',
    name: 'No Frost Data',
    scientific: 'Fake plantus',
    climateTraits: {
      // frostSensitivity intentionally absent
      coldTolerance: 'medium',
      heatTolerance: 'high',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'high',
      floweringRequirements: 'bloom',
      fruitingRequirements: 'fruit',
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'SOURCE_SUPPORTED',
        humidityTolerance: 'SOURCE_SUPPORTED'
      }
    }
  };
  const merged = simulateSmartRecMergeDefaults({
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    drainageNeeds: 'high'
    // frostSensitivity left as merge default medium
  });
  assert.equal(merged.frostSensitivity, 'medium');
  const origin = resolveClimateFieldValueOrigin('frostSensitivity', {
    plant,
    mergedRuntimeMeta: merged
  });
  assert.equal(origin, VALUE_ORIGIN.MERGE_DEFAULT);
  const r = classifyPlantDataReadiness(plant, { mergedRuntimeMeta: merged });
  assert.notEqual(r.readinessShort, 'A');
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.SYNTHETIC_DEFAULT_CORE_VALUE));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY));
  assert.equal(assertPlantRealSuitabilityReady(plant, { mergedRuntimeMeta: merged }).ok, false);
});

test('2. missing coldTolerance + fallback remains readiness gap', () => {
  const plant = {
    slug: 'no-cold',
    name: 'No Cold',
    scientific: 'Fake coldii',
    climateTraits: {
      frostSensitivity: 'high',
      heatTolerance: 'high',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'high'
    }
  };
  const merged = simulateSmartRecMergeDefaults({
    frostSensitivity: 'high',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    drainageNeeds: 'high'
  });
  assert.equal(merged.coldTolerance, 'medium');
  const origin = resolveClimateFieldValueOrigin('coldTolerance', {
    plant,
    mergedRuntimeMeta: merged
  });
  assert.equal(origin, VALUE_ORIGIN.MERGE_DEFAULT);
  const r = classifyPlantDataReadiness(plant, { mergedRuntimeMeta: merged });
  assert.equal(r.corePresence.coldTolerance, false);
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.SYNTHETIC_DEFAULT_CORE_VALUE));
  assert.notEqual(r.readinessShort, 'A');
});

test('3. real explicit medium source value can count as asserted data', () => {
  const plant = {
    slug: 'explicit-medium',
    name: 'Explicit Medium',
    scientific: 'Medium assertus',
    climateTraits: {
      frostSensitivity: 'medium',
      coldTolerance: 'medium',
      heatTolerance: 'medium',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'medium',
      floweringRequirements: 'Needs seasonal cues.',
      fruitingRequirements: 'Needs chill hours.',
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION'
      }
    }
  };
  const asserted = readAssertedClimateField(plant, 'frostSensitivity');
  assert.equal(asserted.present, true);
  assert.equal(asserted.value, 'medium');
  assert.equal(asserted.origin, VALUE_ORIGIN.ASSERTED_SOURCE);
  const origin = resolveClimateFieldValueOrigin('frostSensitivity', {
    plant,
    mergedRuntimeMeta: simulateSmartRecMergeDefaults(plant.climateTraits)
  });
  assert.equal(origin, VALUE_ORIGIN.ASSERTED_SOURCE);
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'A');
  assert.equal(r.readiness, PLANT_DATA_READINESS.A_REAL_SUITABILITY_READY);
});

test('4. missing flowering requirements → flowering UNKNOWN stance', () => {
  const plant = completeClassAPlant({
    climateTraits: { floweringRequirements: '' }
  });
  delete plant.climateTraits.floweringRequirements;
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.floweringStanceReady, false);
  assert.ok(r.unknownOutcomes.includes('flowering'));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.FLOWERING_REQUIREMENTS_MISSING));
  assert.notEqual(r.readinessShort, 'A');
});

test('5. missing fruiting requirements → fruiting UNKNOWN stance', () => {
  const plant = completeClassAPlant({
    climateTraits: { fruitingRequirements: '' }
  });
  delete plant.climateTraits.fruitingRequirements;
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.fruitingStanceReady, false);
  assert.ok(r.unknownOutcomes.includes('fruiting'));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.FRUITING_REQUIREMENTS_MISSING));
  assert.notEqual(r.readinessShort, 'A');
});

test('6. absent traitEvidenceClasses → cannot be A', () => {
  const plant = completeClassAPlant();
  delete plant.climateTraits.traitEvidenceClasses;
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.evidenceOk, false);
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE));
  assert.notEqual(r.readinessShort, 'A');
  assert.equal(assertPlantRealSuitabilityReady(plant).ok, false);
});

test('7. needsReview=true → cannot be A', () => {
  const plant = completeClassAPlant({
    climateTraits: { needsReview: true }
  });
  const r = classifyPlantDataReadiness(plant);
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.NEEDS_REVIEW));
  assert.notEqual(r.readinessShort, 'A');
  assert.equal(r.readinessShort, 'B');
});

test('8. valid complete supported plant → A', () => {
  const plant = completeClassAPlant();
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'A');
  assert.equal(assertPlantRealSuitabilityReady(plant).ok, true);
  assert.equal(r.allowedClaims.survival, true);
  assert.equal(r.allowedClaims.growth, true);
  assert.equal(r.allowedClaims.flowering, true);
  assert.equal(r.allowedClaims.fruiting, true);
});

test('anti-gaming 1: HEURISTIC frost+cold complete plant must NOT be Class A', () => {
  const plant = completeClassAPlant({
    climateTraits: {
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        floweringRequirements: 'SOURCE_SUPPORTED',
        fruitingRequirements: 'SOURCE_SUPPORTED'
      }
    }
  });
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.evidenceOk, true, 'HEURISTIC is allowed evidence class for B path');
  assert.notEqual(r.readinessShort, 'A');
  assert.equal(r.readinessShort, 'B');
  assert.equal(assertPlantRealSuitabilityReady(plant).ok, false);
});

test('anti-gaming 2: SOURCE_SUPPORTED frost+cold otherwise complete → may be Class A', () => {
  const plant = completeClassAPlant();
  assert.equal(plant.climateTraits.traitEvidenceClasses.frostSensitivity, 'SOURCE_SUPPORTED');
  assert.equal(plant.climateTraits.traitEvidenceClasses.coldTolerance, 'SOURCE_SUPPORTED');
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.readinessShort, 'A');
  assert.equal(assertPlantRealSuitabilityReady(plant).ok, true);
});

test('anti-gaming 3: HEURISTIC severe frost does not soften readiness gap into A; severity separate', async () => {
  const { boundOutcomeByEvidenceStrength, SEVERE_NEGATIVE_OUTCOME_STATUSES } = await import(
    '../modules/personal-domain/evidence-strength-propagation-v1-contract.js'
  );
  const plant = completeClassAPlant({
    climateTraits: {
      frostSensitivity: 'high',
      coldTolerance: 'low',
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'SOURCE_SUPPORTED',
        waterNeeds: 'SOURCE_SUPPORTED',
        drainageNeeds: 'SOURCE_SUPPORTED',
        floweringRequirements: 'SOURCE_SUPPORTED',
        fruitingRequirements: 'SOURCE_SUPPORTED'
      }
    }
  });
  const readiness = classifyPlantDataReadiness(plant);
  assert.notEqual(readiness.readinessShort, 'A');
  assert.equal(readiness.readinessShort, 'B');
  const bound = boundOutcomeByEvidenceStrength(
    'unreliable',
    plant.climateTraits,
    ['frostSensitivity', 'coldTolerance'],
    { dimension: 'survival' }
  );
  assert.equal(bound.status, 'unreliable');
  assert.equal(bound.severityPreserved, true);
  assert.ok(SEVERE_NEGATIVE_OUTCOME_STATUSES.includes(bound.status));
  // Readiness confidence ≠ outcome severity
  assert.notEqual(readiness.readinessShort, 'A');
  assert.equal(bound.status, 'unreliable');
});

test('anti-gaming 4: missing frost/cold → not Class A', () => {
  const plant = completeClassAPlant({
    climateTraits: {
      frostSensitivity: undefined,
      coldTolerance: undefined
    }
  });
  delete plant.climateTraits.frostSensitivity;
  delete plant.climateTraits.coldTolerance;
  delete plant.climateTraits.traitEvidenceClasses.frostSensitivity;
  delete plant.climateTraits.traitEvidenceClasses.coldTolerance;
  const r = classifyPlantDataReadiness(plant);
  assert.notEqual(r.readinessShort, 'A');
  assert.ok(
    r.readinessShort === 'D' || r.readinessShort === 'C' || r.readinessShort === 'B'
  );
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY));
});

test('explicit floweringOutcomeApplicable false satisfies flowering stance', () => {
  const plant = completeClassAPlant({
    climateTraits: {
      floweringRequirements: '',
      floweringOutcomeApplicable: false
    }
  });
  delete plant.climateTraits.floweringRequirements;
  const r = classifyPlantDataReadiness(plant);
  assert.equal(r.floweringStanceReady, true);
});

test('Pineapple / Ananas comosus → PARTIAL_OUTCOME_READY', () => {
  const seed = loadSeedPlants();
  const pineapple = seed.find((p) => String(p.slug).toLowerCase() === 'pineapple');
  assert.ok(pineapple);
  assert.match(String(pineapple.scientific || ''), /Ananas comosus/i);
  const r = classifyPlantDataReadiness(pineapple);
  assert.equal(r.readinessShort, 'B');
  assert.equal(r.readiness, PLANT_DATA_READINESS.B_PARTIAL_OUTCOME_READY);
  assert.equal(r.climateCoreOk, true);
  assert.equal(r.floweringStanceReady, false);
  assert.equal(r.fruitingStanceReady, false);
  assert.equal(r.evidenceOk, false);
  assert.equal(r.needsReview, true);
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.FLOWERING_REQUIREMENTS_MISSING));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.FRUITING_REQUIREMENTS_MISSING));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE));
  assert.ok(r.reasons.includes(PLANT_DATA_REASON.NEEDS_REVIEW));
  assert.equal(r.allowedClaims.survival, true);
  assert.equal(r.allowedClaims.growth, true);
  assert.equal(r.allowedClaims.flowering, false);
  assert.equal(r.allowedClaims.fruiting, false);
  assert.deepEqual(r.unknownOutcomes.sort(), ['flowering', 'fruiting']);
});

test('read-only current catalog classification (seed + bootstrap)', () => {
  const seed = loadSeedPlants();
  const bootstrap = bootstrapSlugsFromApp();
  const migration = getBootstrapSafeClimateTraitsMigrationPayload();
  const unlocked = getBootstrapUnlockedSixClimateTraitsMigrationPayload();
  const bySlug = new Map();
  for (const slug of bootstrap) {
    const migrated = migration.plants[slug] || unlocked.plants[slug];
    bySlug.set(slug, {
      slug,
      name: migrated?.name || slug,
      scientific: migrated?.scientific || 'Various bootstrap species',
      aliases: migrated?.aliases || [],
      _source: 'bootstrap'
    });
  }
  applyAllBootstrapStructuralClimateTraitsMigrations(
    [...bySlug.values()],
    Object.fromEntries(bySlug)
  );
  for (const p of seed) {
    const slug = String(p.slug || '').toLowerCase();
    if (!slug) continue;
    bySlug.set(slug, p);
  }
  const catalog = [...bySlug.values()];
  const report = classifyCatalogReadOnly(catalog);
  assert.equal(report.total, catalog.length);
  assert.ok(report.total >= 100 && report.total <= 120, `unexpected total=${report.total}`);
  // Seed plants dominate B; SAFE + unlocked-six bootstrap migrate structurally.
  // First real enrichment apply: pomegranate alone is Class A (SOURCE_SUPPORTED frost+cold).
  assert.equal(report.counts.A, 1, 'exactly one Class A expected (pomegranate)');
  assert.ok(report.counts.B >= 90, `expected many B, got ${report.counts.B}`);
  assert.ok(
    report.counts.D >= 10 && report.counts.D <= 20,
    `expected ~13 remaining conflict bootstrap D after unlocked-six migration, got ${report.counts.D}`
  );
  // Persist machine-readable summary for owner report (test artifact under tests/)
  const out = {
    generatedAt: new Date().toISOString(),
    contractId: PLANT_DATA_CONTRACT_ID,
    contractVersion: PLANT_DATA_CONTRACT_VERSION,
    total: report.total,
    counts: report.counts,
    gates: report.gates,
    seedCount: seed.length,
    bootstrapUniqueCount: bootstrap.length,
    safeMigratedCount: migration.safeCount,
    unlockedSixMigratedCount: unlocked.unlockedCount,
    reasonFrequency: {}
  };
  for (const row of report.rows) {
    for (const reason of row.reasons) {
      out.reasonFrequency[reason] = (out.reasonFrequency[reason] || 0) + 1;
    }
  }
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_plant-data-contract-v1-catalog-report.json'),
    JSON.stringify(out, null, 2)
  );
  // Soft check: pineapple row
  const pine = report.rows.find((r) => r.slug === 'pineapple');
  assert.ok(pine);
  assert.equal(pine.readinessShort, 'B');
});

test('Batch 3 dry classification (no ingest)', () => {
  assert.ok(fs.existsSync(PACKET_DIR));
  const files = fs.readdirSync(PACKET_DIR).filter((f) => f.endsWith('.packet.json'));
  assert.equal(files.length, 75);
  const plants = files.map((f) =>
    normalizeBatch3PacketForClassification(
      JSON.parse(fs.readFileSync(path.join(PACKET_DIR, f), 'utf8'))
    )
  );
  const report = classifyCatalogReadOnly(plants);
  assert.equal(report.total, 75);

  const humidityUnknown = plants.filter(
    (p) => !p.climateTraits?.humidityTolerance
  ).length;
  assert.ok(humidityUnknown >= 70, `expected humidity gaps, got ${humidityUnknown}`);

  const seed = loadSeedPlants();
  const seedSlugs = new Set(seed.map((p) => String(p.slug).toLowerCase()));
  const bootstrap = new Set(bootstrapSlugsFromApp());
  const slugConflicts = plants
    .map((p) => p.slug)
    .filter((s) => seedSlugs.has(s) || bootstrap.has(s));
  const seedSci = new Map(
    seed
      .filter((p) => p.scientific)
      .map((p) => [String(p.scientific).toLowerCase(), String(p.slug).toLowerCase()])
  );
  const sciConflicts = plants.filter((p) => {
    const sci = String(p.scientific || '').toLowerCase();
    return sci && seedSci.has(sci) && seedSci.get(sci) !== p.slug;
  });

  const blockedFromA = report.rows.filter((r) => r.readinessShort !== 'A');
  const summary = {
    total: 75,
    counts: report.counts,
    gates: report.gates,
    humidityUnknown,
    slugConflictsUnique: [...new Set(slugConflicts)].sort(),
    scientificConflicts: sciConflicts.map((p) => ({
      batchSlug: p.slug,
      seedSlug: seedSci.get(String(p.scientific).toLowerCase()),
      scientific: p.scientific
    })),
    blockedFromA: blockedFromA.length,
    sampleReasons: report.rows.slice(0, 5).map((r) => ({
      slug: r.slug,
      readinessShort: r.readinessShort,
      reasons: r.reasons
    }))
  };
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_plant-data-contract-v1-batch3-dry-report.json'),
    JSON.stringify(summary, null, 2)
  );
  assert.ok(report.counts.A + report.counts.B + report.counts.C + report.counts.D === 75);
  // Unchanged product: almost all B due to humidity UNKNOWN / evidence gaps; A rare
  assert.ok(report.counts.B >= 70);
});

test('scale gate labels are deterministic PASS/PARTIAL/HOLD/REJECT', () => {
  const a = classifyPlantDataReadiness(completeClassAPlant());
  assert.equal(a.gate, 'PASS');
  // Ordinary B (missing SS frost/cold only) is PARTIAL — enrichment debt, not product HOLD
  const bPartial = classifyPlantDataReadiness(
    completeClassAPlant({
      climateTraits: {
        traitEvidenceClasses: {
          frostSensitivity: 'HEURISTIC_ASSERTION',
          coldTolerance: 'HEURISTIC_ASSERTION',
          heatTolerance: 'HEURISTIC_ASSERTION',
          humidityTolerance: 'HEURISTIC_ASSERTION',
          sunNeeds: 'HEURISTIC_ASSERTION',
          waterNeeds: 'HEURISTIC_ASSERTION',
          drainageNeeds: 'HEURISTIC_ASSERTION',
          floweringRequirements: 'HEURISTIC_ASSERTION',
          fruitingRequirements: 'HEURISTIC_ASSERTION'
        }
      }
    })
  );
  assert.equal(bPartial.readinessShort, 'B');
  assert.equal(bPartial.gate, 'PARTIAL');
  // Real hold: needsReview
  const bHold = classifyPlantDataReadiness(
    completeClassAPlant({ climateTraits: { needsReview: true } })
  );
  assert.equal(bHold.gate, 'HOLD');
  const d = classifyPlantDataReadiness({ slug: 'x', name: 'X', scientific: 'X x' });
  assert.equal(d.gate, 'REJECT');
});

test('app.html still documents merge defaults medium (regression guard)', () => {
  const html = fs.readFileSync(APP, 'utf8');
  assert.match(html, /function smartRecMergeClimateMeta/);
  assert.match(html, /frostSensitivity:'medium'/);
  // Contract mirrors those defaults; this checkpoint does not rewrite merge behavior.
  assert.equal(SMART_REC_MERGE_DEFAULT_CORE.frostSensitivity, 'medium');
});
