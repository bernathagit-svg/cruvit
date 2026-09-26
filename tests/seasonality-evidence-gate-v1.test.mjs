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


test('structured Leaf Characteristics outranks incidental prose elsewhere',()=>{
  const body='<h1>Fragaria x ananassa</h1><p>Some cultivars may lose leaves in stress.</p><div>Leaf Characteristics: Broadleaf Evergreen Habit/Form: Clumping Growth Rate: Medium</div><p>deciduous trees nearby</p>';
  const out=extractExplicitLeafHabit(body,'Fragaria × ananassa');
  assert.equal(out.ok,true);
  assert.equal(out.state,'EVERGREEN');
  assert.equal(out.scope,'leaf-characteristics');
});

test('deciduous plus semi-evergreen is source-backed context-dependent seasonality',()=>{
  const body='<h1>Jasminum officinale</h1><div>Leaf Characteristics: Deciduous Semi-evergreen Growth Rate: Rapid</div>';
  const out=extractExplicitLeafHabit(body,'Jasminum officinale');
  assert.equal(out.ok,true);
  assert.equal(out.state,'CONTEXT_DEPENDENT');
  assert.equal(out.code,'EXPLICIT_CONTEXT_DEPENDENT_LEAF_HABIT');
  const combined=combineLeafHabitEvidence([{
    ...out,identityMatch:true,sourcePolicyEligible:true
  }]);
  assert.equal(combined.ready,true);
  assert.equal(combined.state,'CONTEXT_DEPENDENT');
  assert.equal(combined.evidenceClass,'SOURCE_SUPPORTED');
});
