import test from 'node:test';
import assert from 'node:assert/strict';
import {
  warmSeasonFruitingTransform,
  explicitCoolSeasonFruitingTransform,
  explicitFrostFreeFruitingTransform,
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


test('warm conditions explicitly needed for fruit ripening map to warm summer band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'Warm conditions are needed for the fruit to ripen well.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.value,'warm');
});


test('explicit frost-free fruiting wording maps to reproductive frost-free requirement',()=>{
  const r=explicitFrostFreeFruitingTransform({
    sourceText:'Produces fruit in frost-free humid tropical conditions.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.field,'reproductiveClimate.fruiting.requiresFrostFree');
  assert.equal(r.value,true);
  assert.equal(r.evidenceClass,'HEURISTIC_ASSERTION');
});

test('frost-free wording cannot authorize a non-fruit purpose',()=>{
  const r=explicitFrostFreeFruitingTransform({
    sourceText:'Frost-free site preferred.',
    fruitProductionRelevant:false,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,false);
});

test('explicit strictly-tropical fruiting climate maps conservatively to warm band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'Strictly tropical climates; flowering and fruiting are more prolific in seasonal tropical conditions.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.value,'warm');
});

test('fruit production explicitly repeating in warm climates maps to warm band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'Fruit may be produced several times a year in warm climates.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.value,'warm');
});

test('best fruit quality with heat maps to hot band',()=>{
  const r=qualitativeSummerHeatFruitingTransform({
    sourceText:'Best fruit quality is achieved with heat.',
    fruitProductionRelevant:true,
    sourceIds:['authority-1']
  });
  assert.equal(r.eligible,true);
  assert.equal(r.value,'hot');
});
