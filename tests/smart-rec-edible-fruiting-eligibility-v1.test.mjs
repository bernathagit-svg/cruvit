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

test('catalog fruit identity alone does not disable a general climate recommendation',()=>{
  const start=app.indexOf("function smartRecEvaluateSuitability(p)");
  const end=app.indexOf("function searchCatalogForSpecificPlantCheck",start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/let positiveRecommendationEligible=true/);
  assert.match(body,/ctx\.edibleIntent&&fruitRecommendationClimateRequired&&!structuredFruitingClimateReady/);
  assert.doesNotMatch(body,/positiveRecommendationEligible=!\(fruitRecommendationClimateRequired&&!structuredFruitingClimateReady\)/);
});

test('reproductive warnings do not penalize general fit without matching user purpose',()=>{
  const start=app.indexOf("const addStructuredWarning=(phase,res)=>");
  const end=app.indexOf("addStructuredWarning('flowering'",start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/ctx\.edibleIntent&&fruitRecommendationClimateRequired/);
  assert.match(body,/:ctx\.floweringIntent/);
  assert.match(body,/smartRecAddUniqueMessage\(warnings,res\.reason\)/);
  assert.match(body,/if\(purposePenaltyActive\) addWarning/);
});

test('specific plant check does not itself create edible intent',()=>{
  const start=app.indexOf("function evaluateSpecificPlantSuitability");
  const end=app.indexOf("window.cruvitSpecificPlantSuitability",start);
  const body=app.slice(start,end);
  assert.match(body,/smartRecSession\.answers=\{\}/);
  assert.doesNotMatch(body,/yes-edible|food-herbs/);
});

test('ripe-fruit-only edible plants always surface an explicit edible-intent warning',()=>{
  const start=app.indexOf("function smartRecEvaluateSuitability(p)");
  const end=app.indexOf("function searchCatalogForSpecificPlantCheck",start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/ctx\.edibleIntent&&meta\.warningFlags\.includes\('ripe_fruit_only'\)/);
  assert.match(body,/Only fully ripe fruit is edible; unripe fruit and other plant parts may be irritating or toxic/);
});
