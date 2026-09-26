import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');
const fn=fs.readFileSync('netlify/functions/catalog-runtime-climate-bootstrap.mjs','utf8');

test('canonical climate bootstrap loads before inline plant library',()=>{
  const external=app.indexOf('/.netlify/functions/catalog-runtime-climate-bootstrap');
  const library=app.indexOf('const PLANT_LIBRARY=[');
  assert.ok(external>=0);
  assert.ok(library>external);
});

test('canonical climate overlay runs before PLANT_INDEX creation',()=>{
  const overlay=app.indexOf('function applyCanonicalRuntimeClimateOverlay');
  const index=app.indexOf('const PLANT_INDEX=Object.fromEntries');
  assert.ok(overlay>=0);
  assert.ok(index>overlay);
  const body=app.slice(overlay,index);
  assert.match(body,/plant\.climateTraits=/);
  assert.match(body,/source:'catalog_plants'/);
});

test('runtime bootstrap is server-side canonical catalog climate authority',()=>{
  assert.match(fn,/SUPABASE_URL/);
  assert.match(fn,/SUPABASE_ANON_KEY/);
  assert.match(fn,/\/rest\/v1\/catalog_plants/);
  assert.match(fn,/climate_traits/);
  assert.match(fn,/verification_state/);
  assert.match(fn,/window\.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP/);
});

test('fruit recommendations fail closed when structured fruiting climate is missing',()=>{
  assert.match(app,/fruitRecommendationClimateRequired/);
  assert.match(app,/structuredFruitingClimateReady/);
  assert.match(app,/positiveRecommendationEligible/);
  assert.match(app,/Structured fruiting-climate evidence is incomplete/);
  assert.match(app,/s\.positiveRecommendationEligible===false/);
});
