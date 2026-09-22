import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const planPath=path.join(ROOT,'data/garden-design/plant-visual-natural-blend-plans/wave1-lavender-natural-blend-pilot-2026-09-22-v1.json');
const jobPath=path.join(ROOT,'netlify/functions/plant-visual-natural-blend-job.mjs');
const qaRuntimePath=path.join(ROOT,'modules/garden-design/asset-factory-v1/plant-visual-pilot-qa-runtime-v1.js');

test('Natural Blend+ pilot is exact, bounded and scene-specific',()=>{
  const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  assert.equal(plan.contract,'plant-visual-natural-blend-plan-v1');
  assert.equal(plan.sourceJobId,'lavender__mature__shrub__flowering__v1');
  assert.equal(plan.canonicalSlug,'lavender');
  assert.equal(plan.model,'gpt-image-2.5-sunburst-2026-09-08');
  assert.equal(plan.maxCalls,1);
  assert.equal(plan.maxRetries,0);
  assert.equal(plan.ownerSpendApprovalRequired,true);
  assert.equal(plan.governance.sceneSpecific,true);
  assert.equal(plan.governance.globalPlantRegistryWriteForbidden,true);
  assert.equal(plan.governance.candidateAssetMutationForbidden,true);
  assert.equal(plan.governance.productionPromotionForbidden,true);
  assert.equal(plan.governance.invalidatedByMoveOrResize,true);
});

test('Natural Blend+ server is approval-gated and candidate-only',()=>{
  const source=fs.readFileSync(jobPath,'utf8');
  assert.match(source,/plant-visual-natural-blend-spend-approval-v1/);
  assert.match(source,/NATURAL_BLEND_SPEND_OWNER_APPROVAL_REQUIRED/);
  assert.match(source,/gpt-image-2\.5-sunburst/);
  assert.match(source,/\/v1\/images\/edits/);
  assert.match(source,/mask/);
  assert.match(source,/image\[\]/);
  assert.match(source,/SOURCE_CANDIDATE_INTEGRITY_MISMATCH/);
  assert.match(source,/productionWrites:0/);
  assert.match(source,/registryWrites:0/);
  assert.doesNotMatch(source,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.doesNotMatch(source,/design-asset-registry-v1\.json/);
});

test('QA Natural Blend+ hard-composites model output only inside client mask',()=>{
  const source=fs.readFileSync(qaRuntimePath,'utf8');
  assert.match(source,/buildNaturalBlendInput/);
  assert.match(source,/maskBase64/);
  assert.match(source,/alphaCanvas/);
  assert.match(source,/hardCompositeNaturalBlend/);
  assert.match(source,/destination-in/);
  assert.match(source,/NATURAL_BLEND_SPEND_OWNER_APPROVAL_REQUIRED/);
  assert.match(source,/selectedJobId !== naturalBlendPlan\.sourceJobId/);
});

test('Natural Blend+ does not replace deterministic Auto Blend V3',()=>{
  const html=fs.readFileSync(path.join(ROOT,'modules/garden-design/index.html'),'utf8');
  assert.match(html,/garden-design-auto-blend-v3\.js/);
  const runtime=fs.readFileSync(qaRuntimePath,'utf8');
  assert.match(runtime,/requestQaAutoBlend\(true\)/);
  assert.match(runtime,/Preparing bounded local edit crop/);
});
