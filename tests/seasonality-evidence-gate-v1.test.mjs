import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExplicitLeafHabit,
  combineLeafHabitEvidence
} from '../modules/catalog/seasonality-evidence-gate-v1.js';

test('extracts explicit deciduous only when scientific identity is present',()=>{
  const body='<html><h1>Malus domestica</h1><p>A deciduous tree grown for fruit.</p></html>';
  const out=extractExplicitLeafHabit(body,'Malus domestica');
  assert.equal(out.ok,true);
  assert.equal(out.state,'DECIDUOUS');
});

test('hardiness wording alone does not infer leaf habit',()=>{
  const body='<html><h1>Malus domestica</h1><p>Hardy in USDA zones 4 to 8 and requires winter chill.</p></html>';
  const out=extractExplicitLeafHabit(body,'Malus domestica');
  assert.equal(out.ok,false);
  assert.equal(out.state,'UNKNOWN');
});

test('combiner requires source-policy eligibility',()=>{
  const out=combineLeafHabitEvidence([{
    ok:true,state:'DECIDUOUS',identityMatch:true,sourcePolicyEligible:false
  }]);
  assert.equal(out.ready,false);
  assert.equal(out.state,'UNKNOWN');
});

test('conflicting source-supported habits never auto-resolve',()=>{
  const out=combineLeafHabitEvidence([
    {ok:true,state:'DECIDUOUS',identityMatch:true,sourcePolicyEligible:true},
    {ok:true,state:'EVERGREEN',identityMatch:true,sourcePolicyEligible:true}
  ]);
  assert.equal(out.ready,false);
  assert.equal(out.state,'CONFLICT');
});


test('structured Leaf Characteristics outranks unrelated page-wide evergreen wording',()=>{
  const body='<html><h1>Rubus idaeus</h1><p>Related evergreen species are also discussed.</p><div>Leaf Characteristics: Deciduous Habit/Form: Arching Erect</div></html>';
  const out=extractExplicitLeafHabit(body,'Rubus idaeus');
  assert.equal(out.ok,true);
  assert.equal(out.state,'DECIDUOUS');
  assert.equal(out.authority,'STRUCTURED_LEAF_CHARACTERISTICS');
});

test('structured Leaf Characteristics conflict remains fail-closed',()=>{
  const body='<html><h1>Testus plantus</h1><div>Leaf Characteristics: Deciduous Evergreen Habit/Form: Erect</div></html>';
  const out=extractExplicitLeafHabit(body,'Testus plantus');
  assert.equal(out.ok,false);
  assert.equal(out.state,'CONFLICT');
  assert.equal(out.authority,'STRUCTURED_LEAF_CHARACTERISTICS');
});
