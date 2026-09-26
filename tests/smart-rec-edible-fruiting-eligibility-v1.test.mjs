import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');

test('edible-first recommendation requires supported structured fruiting climate',()=>{
  const start=app.indexOf("function smartRecEvaluateSuitability(p)");
  const end=app.indexOf("function searchCatalogForSpecificPlantCheck",start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/ctx\.edibleIntent && fruitRecommendationClimateRequired/);
  assert.match(body,/fruitingClimateStatus!=='supported'/);
  assert.match(body,/positiveRecommendationEligible=false/);
  assert.match(body,/Fruiting climate is not reliable enough for an edible-first recommendation here/);
});

test('specific plant check does not itself create edible intent',()=>{
  const start=app.indexOf("function evaluateSpecificPlantSuitability");
  const end=app.indexOf("window.cruvitSpecificPlantSuitability",start);
  const body=app.slice(start,end);
  assert.match(body,/smartRecSession\.answers=\{\}/);
  assert.doesNotMatch(body,/yes-edible|food-herbs/);
});
