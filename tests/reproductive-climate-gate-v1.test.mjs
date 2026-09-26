import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReproductiveClimateGate,
  applyReproductiveClimateToFits
} from '../modules/suitability/reproductive-climate-gate-v1.js';

const meta={
  reproductiveClimate:{
    flowering:{requiresFrostFree:true,evidenceClass:'SOURCE_SUPPORTED'},
    fruiting:{requiresFrostFree:true,summerHeatBand:'hot',evidenceClass:'HEURISTIC_ASSERTION'}
  }
};

test('hot summer + frost-free supports structured reproductive climate',()=>{
  const g=evaluateReproductiveClimateGate({
    meta,
    climateProfile:{isFrostFreeGrowingClimate:true,warmestMonthMeanMaxC:29,coolSeasonSignal:true}
  });
  assert.equal(g.flowering.status,'supported');
  assert.equal(g.fruiting.status,'supported');
});

test('cool summer constrains fruiting without changing survival',()=>{
  const g=evaluateReproductiveClimateGate({
    meta,
    climateProfile:{isFrostFreeGrowingClimate:true,warmestMonthMeanMaxC:21,coolSeasonSignal:true}
  });
  assert.equal(g.fruiting.status,'constrained');
  const out=applyReproductiveClimateToFits({
    survivalFit:85,thriveFit:80,floweringFit:70,fruitingFit:70
  },g);
  assert.equal(out.survivalFit,85);
  assert.equal(out.thriveFit,80);
  assert.equal(out.fruitingFit,45);
});

test('missing summer evidence remains UNKNOWN, never silently passes',()=>{
  const g=evaluateReproductiveClimateGate({
    meta,
    climateProfile:{isFrostFreeGrowingClimate:true}
  });
  assert.equal(g.fruiting.status,'unknown');
  assert.deepEqual(g.fruiting.missing,['warmestMonthMeanMaxC']);
});

test('greenhouse removes frost limiter but not summer heat requirement',()=>{
  const g=evaluateReproductiveClimateGate({
    meta,
    climateProfile:{isFrostFreeGrowingClimate:false,warmestMonthMeanMaxC:20},
    protectedGrowing:true
  });
  assert.equal(g.flowering.status,'supported');
  assert.equal(g.fruiting.status,'constrained');
});

test('source-supported numeric summer minimum can mark severe deficit unreliable',()=>{
  const m={reproductiveClimate:{fruiting:{
    minWarmestMonthMeanMaxC:26,
    evidenceClass:'SOURCE_SUPPORTED'
  }}};
  const g=evaluateReproductiveClimateGate({
    meta:m,
    climateProfile:{warmestMonthMeanMaxC:20,isFrostFreeGrowingClimate:true}
  });
  assert.equal(g.fruiting.status,'unreliable');
});


test('researched unquantified evidence remains UNKNOWN rather than becoming supported',()=>{
  const m={reproductiveClimate:{fruiting:{
    evidenceState:'RESEARCHED_UNQUANTIFIED',
    evidenceClass:'SOURCE_SUPPORTED',
    sourceIds:['authority-1']
  }}};
  const g=evaluateReproductiveClimateGate({meta:m,climateProfile:{}});
  assert.equal(g.fruiting.status,'unknown');
  assert.equal(g.fruiting.evidence,'researched:unquantified');
});

test('context-dependent reproductive evidence remains UNKNOWN and exposes missing context',()=>{
  const m={reproductiveClimate:{fruiting:{
    evidenceState:'CONTEXT_DEPENDENT',
    contextKeys:['cultivar','bearingType'],
    evidenceClass:'SOURCE_SUPPORTED',
    sourceIds:['authority-1']
  }}};
  const g=evaluateReproductiveClimateGate({meta:m,climateProfile:{}});
  assert.equal(g.fruiting.status,'unknown');
  assert.deepEqual(g.fruiting.missingContext,['cultivar','bearingType']);
});

test('cool-or-dry induction is supported by either climate signal',()=>{
  const m={reproductiveClimate:{fruiting:{
    seasonalInductionCue:'cool_or_dry',
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:['authority-1']
  }}};
  const cool=evaluateReproductiveClimateGate({
    meta:m,climateProfile:{coolSeasonSignal:true,drySeasonSignal:false}
  });
  assert.equal(cool.fruiting.status,'supported');
  const dry=evaluateReproductiveClimateGate({
    meta:m,climateProfile:{coolSeasonSignal:false,drySeasonSignal:true}
  });
  assert.equal(dry.fruiting.status,'supported');
});

test('cool-or-dry induction stays UNKNOWN when dry-season signal is missing',()=>{
  const m={reproductiveClimate:{fruiting:{
    seasonalInductionCue:'cool_or_dry',
    evidenceClass:'SOURCE_SUPPORTED',
    sourceIds:['authority-1']
  }}};
  const g=evaluateReproductiveClimateGate({
    meta:m,climateProfile:{coolSeasonSignal:false}
  });
  assert.equal(g.fruiting.status,'unknown');
  assert.ok(g.fruiting.missing.includes('drySeasonSignal'));
});

test('reproductive cold-event threshold does not misuse monthly mean minimum',()=>{
  const m={reproductiveClimate:{fruiting:{
    minReproductiveEventC:-2.2,
    evidenceClass:'SOURCE_SUPPORTED',
    sourceIds:['authority-1']
  }}};
  const g=evaluateReproductiveClimateGate({
    meta:m,climateProfile:{coldestMonthMeanMinC:5,isFrostFreeGrowingClimate:false}
  });
  assert.equal(g.fruiting.status,'unknown');
  assert.ok(g.fruiting.missing.includes('absoluteMinimumTemperatureC'));
});
