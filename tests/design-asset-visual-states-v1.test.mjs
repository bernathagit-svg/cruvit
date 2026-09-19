/**
 * Design Asset Visual States V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCanonicalCatalog } from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { deriveVariantDemand } from '../modules/garden-design/asset-factory-v1/variant-demand-v1.js';
import {
  DESIGN_ASSET_VISUAL_STATES_VERSION,
  VARIANT_REASON,
  deriveVisualStateRequirements,
  selectVisualStateFallback,
  writeDesignAssetVisualStatesReports,
  visualStateKey,
  VISUAL_STATE_CALIBRATION_ROLES
} from '../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js';
import { CALIBRATION_BATCH_1_CANDIDATES } from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';
import { FACTORY_PIPELINE_STEPS } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');

test('visual-state contract separates axes and does not cartesian-explode', () => {
  const catalog = loadCanonicalCatalog(ROOT);
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const registryBefore = fs.readFileSync(REGISTRY, 'utf8');
  const written = writeDesignAssetVisualStatesReports(ROOT, catalog.plants, registry);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  assert.equal(written.verdict, 'DESIGN_ASSET_VISUAL_STATES_V1_READY');
  assert.equal(summary.treePhysicalScaleReopened, false);
  assert.equal(summary.productionAssetRegistryChanged, false);
  assert.equal(summary.axes.seasonIsIdentity, false);
  assert.equal(summary.fallback.generateOnRender, false);
  assert.ok(summary.counts.canonicalPlantsAudited > 40);
  assert.ok(summary.counts.totalRequiredVariants >= summary.counts.canonicalPlantsAudited);
  assert.ok(summary.counts.totalRequiredVariants < summary.counts.canonicalPlantsAudited * 8);
  assert.equal(fs.readFileSync(REGISTRY, 'utf8'), registryBefore);

  const mango = deriveVisualStateRequirements({
    canonicalSlug: 'mango',
    tags: ['tree', 'fruit', 'evergreen'],
    growth: 'Evergreen fruit tree'
  });
  assert.equal(mango.youngRequired, 'REQUIRED');
  assert.equal(mango.floweringRequired, 'UNKNOWN');
  assert.equal(mango.fruitingRequired, 'REQUIRED');
  assert.equal(mango.dormantRequired, 'NOT_REQUIRED');
  assert.ok(!mango.reasonCodes.includes(VARIANT_REASON.FLOWERING_VISUALLY_SIGNIFICANT));
  assert.equal(visualStateKey(mango.baselineVariant).includes('summer'), false);

  const olive = deriveVisualStateRequirements({
    canonicalSlug: 'olive',
    tags: ['tree', 'evergreen', 'olives'],
    growth: 'Evergreen Mediterranean tree'
  });
  assert.equal(olive.fruitingRequired, 'NOT_REQUIRED');
  assert.equal(olive.dormantRequired, 'NOT_REQUIRED');

  const aloe = deriveVisualStateRequirements({
    canonicalSlug: 'aloe-vera',
    tags: ['succulent', 'rosette'],
    growth: 'Succulent rosette'
  });
  assert.equal(aloe.youngRequired, 'NOT_REQUIRED');

  const pomegranate = deriveVisualStateRequirements({
    canonicalSlug: 'pomegranate',
    tags: ['tree', 'shrub'],
    growth: 'Deciduous shrub or small tree'
  });
  assert.deepEqual(pomegranate.architectureModeSupport, ['tree', 'shrub']);
  assert.ok(pomegranate.reasonCodes.includes(VARIANT_REASON.MULTI_FORM_ARCHITECTURE));

  const fallback = selectVisualStateFallback(
    { growthStage: 'mature', architectureMode: 'tree', phenologyState: 'fruiting' },
    [{ growthStage: 'mature', architectureMode: 'tree', phenology: 'vegetative' }]
  );
  assert.equal(fallback.fallbackReason, 'PHENOLOGY_VISUAL_FALLBACK');
  assert.equal(fallback.desiredVisualState.phenologyState, 'fruiting');
  assert.equal(fallback.actualRenderedVisualState.phenologyState, 'vegetative');
  assert.equal(FACTORY_PIPELINE_STEPS[1], 'visual-state-requirements');
  assert.equal(CALIBRATION_BATCH_1_CANDIDATES.length, 8);
  assert.equal(VISUAL_STATE_CALIBRATION_ROLES.length, 8);
  assert.equal(DESIGN_ASSET_VISUAL_STATES_VERSION, 'design-asset-visual-states-v1');

  const evergreenDemand = deriveVariantDemand({
    slug: 'fixture-tree',
    canonicalSlug: 'fixture-tree',
    scientific: 'Ficus fixturea',
    tags: ['tree', 'evergreen'],
    growth: 'Evergreen landscape tree'
  });
  assert.equal(evergreenDemand.requiredVariants.length, 2);
});
