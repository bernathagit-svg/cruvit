import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');
test('broad identities are explicitly ineligible for positive Smart Recommendations',()=>{
  const start=app.indexOf('function smartRecEvaluateSuitability(p)');
  const end=app.indexOf('/**\n * Specific Plant Suitability Check V1',start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/broadIdentityScope=\/\\bspp\\\.\?\\b\/i/);
  assert.match(body,/positiveRecommendationEligible=false/);
  assert.match(body,/recommendationLevel='borderline'/);
  assert.match(body,/Select the exact species or cultivar before CRUVIT can make a positive suitability recommendation/);
});
test('broad identities remain filtered out of browse when explicitly ineligible',()=>{
  const start=app.indexOf('function getSmartRecBrowsePlants()');
  const end=app.indexOf('function renderSmartRecComposerOptions',start);
  const body=app.slice(start,end);
  assert.match(body,/!smartRecPlantIsBlocked\(p\)/);
  const blockStart=app.indexOf('function smartRecPlantIsBlocked(p)');
  const blockEnd=app.indexOf('function smartRecPlantSort',blockStart);
  const blockBody=app.slice(blockStart,blockEnd);
  assert.match(blockBody,/positiveRecommendationEligible===false/);
});
