/**
 * Owned Garden Design Asset Promotion Gate V1. Zero spend. No registry write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  BANANA_PROMOTION_CANDIDATE,
  EXCLUDED_FROM_THIS_GATE,
  MANGO_PROMOTION_CANDIDATE,
  NEXT_PRIORITY_WAVE_CONCEPT,
  OWNED_GARDEN_PROMOTION_REVIEW_HASH,
  OWNED_GARDEN_PROMOTION_RUN_ID,
  OWNED_GARDEN_PROMOTION_SPEND_GATE,
  OWNER_PROMOTION_CHOICES,
  PINEAPPLE_PROMOTION_CANDIDATE,
  PROMOTION_CANDIDATES,
  executeOwnedGardenDesignAssetPromotionV1,
  selectOwnedGardenPromotionCandidates,
  writeOwnedGardenPromotionReports
} from '../modules/garden-design/asset-factory-v1/owned-garden-design-asset-promotion-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
const MANGO_A = path.join(
  ROOT,
  'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__medium.png'
);
const BANANA_FRUITING = path.join(
  ROOT,
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/banana__mature__default__fruiting__detail-v2__medium.png'
);
const PINEAPPLE_HISTORICAL = path.join(
  ROOT,
  'modules/garden-design/assets/plants/batch-1-candidates/pineapple-mature-rosette-vegetative-v1.png'
);

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('owned garden promotion reuses three paid candidates and does not spend or write the registry', () => {
  const registryBefore = sha(REGISTRY);
  const mangoBBefore = sha(path.join(ROOT, MANGO_PROMOTION_CANDIDATE.file));
  const bananaBefore = sha(path.join(ROOT, BANANA_PROMOTION_CANDIDATE.file));
  const pineappleBefore = sha(path.join(ROOT, PINEAPPLE_PROMOTION_CANDIDATE.file));
  const mangoABefore = fs.existsSync(MANGO_A) ? sha(MANGO_A) : null;
  const bananaFruitingBefore = fs.existsSync(BANANA_FRUITING) ? sha(BANANA_FRUITING) : null;
  const pineappleHistoricalBefore = fs.existsSync(PINEAPPLE_HISTORICAL) ? sha(PINEAPPLE_HISTORICAL) : null;

  assert.equal(OWNED_GARDEN_PROMOTION_RUN_ID, 'owned-garden-design-asset-promotion-v1');
  assert.equal(OWNED_GARDEN_PROMOTION_REVIEW_HASH, '#owned-garden-design-asset-promotion-v1');
  assert.equal(OWNED_GARDEN_PROMOTION_SPEND_GATE.state, 'DENIED');
  assert.equal(OWNED_GARDEN_PROMOTION_SPEND_GATE.generateNow, false);
  assert.equal(OWNED_GARDEN_PROMOTION_SPEND_GATE.productionRegistryWrite, false);
  assert.deepEqual(
    PROMOTION_CANDIDATES.map((row) => row.canonicalSlug),
    ['mango', 'banana', 'pineapple']
  );
  assert.equal(MANGO_PROMOTION_CANDIDATE.arm, 'B');
  assert.equal(MANGO_PROMOTION_CANDIDATE.quality, 'high');
  assert.equal(MANGO_PROMOTION_CANDIDATE.prompt, 'Detail V2');
  assert.equal(BANANA_PROMOTION_CANDIDATE.phenologyState, 'vegetative');
  assert.notEqual(BANANA_PROMOTION_CANDIDATE.phenologyState, 'fruiting');
  assert.equal(BANANA_PROMOTION_CANDIDATE.runId, 'design-asset-visual-state-calibration-batch-2');
  assert.equal(PINEAPPLE_PROMOTION_CANDIDATE.quality, 'medium');
  assert.equal(PINEAPPLE_PROMOTION_CANDIDATE.prompt, 'Detail V2');
  assert.equal(PINEAPPLE_PROMOTION_CANDIDATE.runId, 'design-asset-quality-family-calibration-final-1');
  assert.ok(EXCLUDED_FROM_THIS_GATE.includes('apple'));
  assert.ok(EXCLUDED_FROM_THIS_GATE.includes('avocado'));
  assert.deepEqual(OWNER_PROMOTION_CHOICES, [
    'APPROVE_FOR_PRODUCTION_REGISTRY',
    'NEEDS_REGENERATION',
    'REJECT_IDENTITY',
    'NEEDS_ARCHITECTURE_FIX'
  ]);
  assert.equal(NEXT_PRIORITY_WAVE_CONCEPT.execute, false);
  assert.equal(NEXT_PRIORITY_WAVE_CONCEPT.broad240Plan, false);

  const selected = selectOwnedGardenPromotionCandidates(ROOT);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].jobId, 'mango__mature__tree__vegetative__detail-v2__high');
  assert.equal(selected[1].jobId, 'banana__mature__default__vegetative__v1');
  assert.equal(selected[2].jobId, 'pineapple__mature__default__vegetative__detail-v2__medium');
  assert.equal(selected[1].phenologyState, 'vegetative');
  assert.equal(selected[2].phenologyState, 'vegetative');

  const spend = executeOwnedGardenDesignAssetPromotionV1();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.assetsAutoApproved, 0);
  assert.equal(spend.massGenerationStarted, false);
  assert.equal(spend.productionRegistryChanged, false);

  const written = writeOwnedGardenPromotionReports(ROOT);
  const html = fs.readFileSync(written.reviewHtml, 'utf8');
  assert.match(html, /OWNED GARDEN — PRODUCTION ASSET REVIEW/);
  assert.match(html, /1\. MANGO/);
  assert.match(html, /2\. BANANA/);
  assert.match(html, /3\. PINEAPPLE/);
  assert.match(html, /mango__mature__tree__vegetative__detail-v2__high\.png/);
  assert.match(html, /banana__mature__default__vegetative__v1\.png/);
  assert.match(html, /pineapple__mature__default__vegetative__detail-v2__medium\.png/);
  assert.match(html, /APPROVE_FOR_PRODUCTION_REGISTRY/);
  assert.match(html, /NEEDS_REGENERATION/);
  assert.match(html, /REJECT_IDENTITY/);
  assert.match(html, /NEEDS_ARCHITECTURE_FIX/);
  assert.match(html, /does not write the catalog registry/);
  assert.match(html, /data-lock-range-band="LOW"/);
  assert.match(html, /data-visual-form="herbaceous-clump"/);
  assert.match(html, /data-visual-form="rosette"/);
  assert.match(html, /Would this asset look natural/);
  assert.doesNotMatch(html, /banana__mature__default__fruiting/);
  assert.doesNotMatch(html, /pineapple-mature-rosette-vegetative-v1/);
  assert.doesNotMatch(html, /canonical-slug="apple"/);
  assert.doesNotMatch(html, /canonical-slug="lavender"/);
  assert.doesNotMatch(html, /canonical-slug="avocado"/);
  assert.doesNotMatch(html, /canonical-slug="aloe-vera"/);
  assert.doesNotMatch(html, /canonical-slug="pomegranate"/);
  assert.doesNotMatch(html, /data:image/);

  const proposal = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'data/garden-design/owned-garden-design-asset-promotion-v1/promotion-proposal.json'),
      'utf8'
    )
  );
  assert.equal(proposal.writeRegistry, false);
  assert.equal(proposal.writeSupabase, false);
  assert.equal(proposal.writeR2, false);
  assert.equal(proposal.autoApproved, 0);

  assert.equal(sha(REGISTRY), registryBefore);
  assert.equal(sha(path.join(ROOT, MANGO_PROMOTION_CANDIDATE.file)), mangoBBefore);
  assert.equal(sha(path.join(ROOT, BANANA_PROMOTION_CANDIDATE.file)), bananaBefore);
  assert.equal(sha(path.join(ROOT, PINEAPPLE_PROMOTION_CANDIDATE.file)), pineappleBefore);
  if (mangoABefore) assert.equal(sha(MANGO_A), mangoABefore);
  if (bananaFruitingBefore) assert.equal(sha(BANANA_FRUITING), bananaFruitingBefore);
  if (pineappleHistoricalBefore) assert.equal(sha(PINEAPPLE_HISTORICAL), pineappleHistoricalBefore);
});
