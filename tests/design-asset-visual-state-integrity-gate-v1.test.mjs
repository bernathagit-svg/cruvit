/**
 * Visual State Integrity Gate V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCanonicalCatalog } from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { deriveVariantDemand } from '../modules/garden-design/asset-factory-v1/variant-demand-v1.js';
import { detectDesignAssetGaps } from '../modules/garden-design/asset-factory-v1/gap-detector-v1.js';
import {
  FALLBACK_REASON,
  REQUIREMENT,
  deriveVisualStateRequirements,
  selectVisualStateFallback
} from '../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js';
import {
  FACTORY_GENERATION_RULE,
  writeVisualStateIntegrityReports
} from '../modules/garden-design/asset-factory-v1/design-asset-visual-state-integrity-gate-v1.js';
import { CALIBRATION_BATCH_1_CANDIDATES } from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');

test('integrity gate uses four-way states and does not convert UNKNOWN to NOT_REQUIRED', () => {
  const catalog = loadCanonicalCatalog(ROOT);
  const registryBefore = fs.readFileSync(REGISTRY, 'utf8');
  const registry = JSON.parse(registryBefore);
  const written = writeVisualStateIntegrityReports(ROOT, catalog.plants, registry);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const unknown = JSON.parse(fs.readFileSync(written.unknownPath, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(written.baselinePath, 'utf8'));
  const delta = JSON.parse(fs.readFileSync(written.calibrationPath, 'utf8'));

  assert.equal(written.verdict, 'DESIGN_ASSET_VISUAL_STATE_INTEGRITY_GATE_V1_READY');
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.total, 80);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.identityBlocked, 16);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.architectureUnresolved, 22);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.lifecycleEvidenceMissing, 42);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.phenologyEvidenceMissing, 0);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.growthStageEvidenceMissing, 0);
  assert.equal(unknown.legacyUnknownOrBlocked.exclusive.other, 0);
  assert.equal(unknown.legacyUnknownOrBlocked.unknownConvertedToNotRequired, false);

  assert.equal(baseline.baseline.canonicalPlants, 122);
  assert.equal(baseline.baseline.architectureBaselines, 127);
  assert.equal(baseline.baseline.additionalArchitectureBaselineCount, 5);
  assert.equal(baseline.baseline.matchesExpected, true);
  assert.deepEqual(
    baseline.baseline.additionalArchitectureBaselines.map((row) => row.canonicalSlug).sort(),
    ['fig', 'plumeria', 'pomegranate', 'quince', 'strawberry-guava']
  );

  assert.equal(summary.confirms.unknownConvertedToNotRequiredAutomatically, false);
  assert.equal(summary.confirms.dormantSilentlyFallsBackToLeafyVegetative, false);
  assert.equal(summary.confirms.youngRequiredSilentlyFallsBackToMature, false);
  assert.equal(summary.confirms.architectureMismatchFallbackAllowed, false);
  assert.equal(summary.spend.additionalSpendUsd, 0);
  assert.equal(FACTORY_GENERATION_RULE.generateUnknown, false);
  assert.equal(FACTORY_GENERATION_RULE.generateOptional, false);
  assert.equal(fs.readFileSync(REGISTRY, 'utf8'), registryBefore);
  assert.equal(CALIBRATION_BATCH_1_CANDIDATES.length, 8);
  assert.equal(delta.delta.generateNow, false);
  assert.ok(delta.delta.missingVariantsOnly.length >= 5);

  const mango = deriveVisualStateRequirements({
    canonicalSlug: 'mango',
    tags: ['tree', 'fruit', 'evergreen'],
    growth: 'Evergreen fruit tree'
  });
  assert.equal(mango.floweringRequired, REQUIREMENT.UNKNOWN);
  assert.equal(mango.floweringDecision.reasonCode, 'FLOWERING_EVIDENCE_UNKNOWN');

  const evergreen = deriveVariantDemand({
    slug: 'fixture-tree',
    canonicalSlug: 'fixture-tree',
    scientific: 'Ficus fixturea',
    tags: ['tree', 'evergreen'],
    growth: 'Evergreen landscape tree'
  });
  assert.equal(evergreen.requiredVariants.length, 2);
  assert.ok(evergreen.optionalVariants.every((row) => row.required === false));
  assert.ok(!evergreen.requiredVariants.some((row) => row.phenology === 'flowering'));
  assert.ok(evergreen.generationDemandUsesRequiredOnly);

  const gaps = detectDesignAssetGaps([
    {
      slug: 'fixture-tree',
      canonicalSlug: 'fixture-tree',
      scientific: 'Ficus fixturea',
      tags: ['tree', 'evergreen'],
      growth: 'Evergreen landscape tree'
    }
  ], { sets: [] });
  assert.ok(gaps.jobs.every((job) => job.required === true));

  const dormantFallback = selectVisualStateFallback(
    { canonicalSlug: 'apple', growthStage: 'mature', architectureMode: 'tree', phenologyState: 'dormant' },
    [{ canonicalSlug: 'apple', growthStage: 'mature', architectureMode: 'tree', phenology: 'vegetative' }]
  );
  assert.equal(dormantFallback.fallbackReason, FALLBACK_REASON.DORMANT_ASSET_UNAVAILABLE);
  assert.equal(dormantFallback.actualRenderedVisualState, null);

  const youngFallback = selectVisualStateFallback(
    { canonicalSlug: 'mango', growthStage: 'young', architectureMode: 'tree', phenologyState: 'vegetative' },
    [{ canonicalSlug: 'mango', growthStage: 'mature', architectureMode: 'tree', phenology: 'vegetative' }]
  );
  assert.equal(youngFallback.fallbackReason, FALLBACK_REASON.YOUNG_ASSET_UNAVAILABLE);
  assert.equal(youngFallback.usedMatureAsEquivalent, false);

  const archFallback = selectVisualStateFallback(
    { canonicalSlug: 'pomegranate', growthStage: 'mature', architectureMode: 'shrub', phenologyState: 'vegetative' },
    [{ canonicalSlug: 'pomegranate', growthStage: 'mature', architectureMode: 'tree', phenology: 'vegetative' }]
  );
  assert.equal(archFallback.fallbackReason, FALLBACK_REASON.ARCHITECTURE_MISMATCH_FORBIDDEN);

  const identityFallback = selectVisualStateFallback(
    { canonicalSlug: 'mango', growthStage: 'mature', architectureMode: 'tree', phenologyState: 'vegetative' },
    [{ canonicalSlug: 'olive', growthStage: 'mature', architectureMode: 'tree', phenology: 'vegetative' }]
  );
  assert.equal(identityFallback.fallbackReason, FALLBACK_REASON.IDENTITY_MISMATCH_FORBIDDEN);
});
