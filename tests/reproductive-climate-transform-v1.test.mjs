import test from 'node:test';
import assert from 'node:assert/strict';
import {
  warmSeasonFruitingTransform,
  explicitCoolSeasonFruitingTransform,
  qualitativeSummerHeatFruitingTransform
} from '../modules/suitability/reproductive-climate-transform-v1.js';

test('explicit warm-season fruit crop maps to warm fruiting band at heuristic strength',()=>{
  const r=warmSeasonFruitingTransform({
    sourceText:'Warm Season Vegetable',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.field,'reproductiveClimate.fruiting.summerHeatBand');
  assert.equal(r.value,'warm');
  assert.equal(r.evidenceClass,'HEURISTIC_ASSERTION');
});

test('warm-season wording alone cannot authorize non-fruit production',()=>{
  const r=warmSeasonFruitingTransform({
    sourceText:'Warm Season Vegetable',
    fruitProductionRelevant:false,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,false);
});

test('source lineage is mandatory',()=>{
  const r=warmSeasonFruitingTransform({
    sourceText:'Warm Season Vegetable',
    fruitProductionRelevant:true,
    sourceIds:[]
  });
  assert.equal(r.eligible,false);
});

test('generic warm adjective is not enough',()=>{
  const r=warmSeasonFruitingTransform({
    sourceText:'Prefers a warm location',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,false);
});


test('explicit low non-freezing fall/winter production signal maps to cool-season requirement',()=>{
  const r=explicitCoolSeasonFruitingTransform({
    sourceText:'Longans produce more reliably in areas characterized by low non-freezing temperatures and a dry period during the fall and winter.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.field,'reproductiveClimate.fruiting.requiresCoolSeason');
  assert.equal(r.value,true);
});

test('high summer temperatures for fruit development map to hot summer band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'High summer temperatures are best for fruit development.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.value,'hot');
});

test('generic tropical label alone cannot authorize summer heat band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'A tropical fruit tree.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,false);
});
