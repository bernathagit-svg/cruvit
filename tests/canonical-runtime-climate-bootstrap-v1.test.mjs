import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as canonicalReadAuthority from '../modules/identity/canonical-alias-authority-v1.js';

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

test('verified canonical identity promotes accepted scientific identity over legacy inline identity',()=>{
  const overlay=app.indexOf('function applyCanonicalRuntimeClimateOverlay');
  const index=app.indexOf('const PLANT_INDEX=Object.fromEntries');
  const body=app.slice(overlay,index);
  assert.match(body,/canonicalIdentityVerified=row\.verificationState==='verified'&&row\.needsReview!==true/);
  assert.match(body,/row\.scientific&&\(canonicalIdentityVerified\|\|packetAlias\|\|!plant\.scientific/);
  assert.match(app,/SPECIES_PACKET_ALIAS_TO_CANONICAL=authority\.SPECIES_ALIAS_TO_CANONICAL/);
  assert.doesNotMatch(app,/'lesser-bougainvillea'\s*:\s*'bougainvillea'/);
  assert.equal(Object.hasOwn(canonicalReadAuthority.REGISTRY_ALIAS_TO_CANONICAL,'lesser-bougainvillea'),false);
  const start=app.indexOf('function resolveBootstrapPlantSlug(');
  const end=app.indexOf('function canonicalRuntimeCatalogProfile(',start);
  assert.ok(start>=0&&end>start);
  const context=vm.createContext({canonicalReadAuthority});
  vm.runInContext(app.slice(start,end),context);
  assert.equal(context.resolveBootstrapPlantSlug('lesser-bougainvillea'),'lesser-bougainvillea');
  assert.equal(context.resolveBootstrapPlantSlug('bougainvillea'),'bougainvillea');
});

test('unverified canonical catalog rows cannot force a scientific identity rewrite',()=>{
  const overlay=app.indexOf('function applyCanonicalRuntimeClimateOverlay');
  const index=app.indexOf('const PLANT_INDEX=Object.fromEntries');
  const body=app.slice(overlay,index);
  assert.doesNotMatch(body,/canonicalIdentityVerified=row\.verificationState!=='verified'/);
  assert.match(body,/row\.needsReview!==true/);
});
