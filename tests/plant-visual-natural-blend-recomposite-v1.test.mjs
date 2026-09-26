import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const host=fs.readFileSync('modules/garden-design/cruvit-natural-blend-auto-repair.html','utf8');
const job=fs.readFileSync('netlify/functions/plant-visual-natural-blend-job.mjs','utf8');
const store=fs.readFileSync('netlify/functions/plant-visual-natural-blend-composite-store.mjs','utf8');
const lettuce=JSON.parse(fs.readFileSync('data/garden-design/plant-visual-natural-blend-plans/cruvit-e2e-batch-b-lettuce-natural-blend-repair-2026-09-25-v1.json','utf8'));

test('low plants support a tight feathered recomposite profile',()=>{
  assert.match(host,/LOW_PLANT_TIGHT_FEATHER_V1/);
  assert.match(host,/FEATHERED_EDIT_REGION_V1/);
  assert.match(host,/filter='blur\('/);
  assert.equal(lettuce.inputContract.finalCompositeBoundaryMode,'FEATHERED_EDIT_REGION_V1');
  assert.equal(lettuce.inputContract.compositeProfile,'LOW_PLANT_TIGHT_FEATHER_V1');
  assert.equal(lettuce.inputContract.reuseExistingNaturalBlendEvidenceAllowed,true);
  assert.equal(lettuce.governance.recompositeOnlyNoProviderRetry,true);
});

test('recomposite reuses existing Natural Blend evidence before provider call',()=>{
  const existing=job.indexOf('const existing=await readJson');
  const provider=job.indexOf('const response=await fetch(OPENAI_EDIT_URL');
  assert.ok(existing>=0);
  assert.ok(provider>=0);
  assert.ok(existing<provider);
  assert.match(job,/NATURAL_BLEND_ALREADY_HAS_EVIDENCE/);
});

test('composite evidence records boundary mode and remains non-production',()=>{
  assert.match(store,/compositeMode/);
  assert.match(store,/featheredCompositeClientApplied/);
  assert.match(store,/productionWrites:0/);
  assert.match(store,/registryWrites:0/);
  assert.doesNotMatch(store,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
});
