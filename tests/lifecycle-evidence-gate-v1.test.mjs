import test from 'node:test';
import assert from 'node:assert/strict';
import {extractExplicitLifecycle,combineLifecycleEvidence} from '../modules/catalog/lifecycle-evidence-gate-v1.js';

test('extracts structured annual lifecycle',()=>{
  const r=extractExplicitLifecycle('Zinnia elegans Whole Plant Traits: Plant Type: Annual Growth Rate: Rapid','Zinnia elegans');
  assert.equal(r.ok,true); assert.equal(r.state,'ANNUAL');
});

test('extracts explicit perennial lifecycle',()=>{
  const r=extractExplicitLifecycle('Lavandula angustifolia is an evergreen perennial shrub in the mint family.','Lavandula angustifolia');
  assert.equal(r.ok,true); assert.equal(r.state,'PERENNIAL');
});

test('conflicting eligible lifecycle evidence holds',()=>{
  const r=combineLifecycleEvidence([
    {ok:true,sourcePolicyEligible:true,state:'ANNUAL'},
    {ok:true,sourcePolicyEligible:true,state:'PERENNIAL'}
  ]);
  assert.equal(r.ready,false); assert.equal(r.code,'CONFLICTING_LIFECYCLE_EVIDENCE');
});


test('structured Annual + Perennial source block is held as conflict',()=>{
  const r=extractExplicitLifecycle(
    'Bougainvillea glabra Whole Plant Traits: Plant Type: Annual Perennial Shrub Vine Woody Plant Leaf Characteristics: Broadleaf Evergreen',
    'Bougainvillea glabra'
  );
  assert.equal(r.ok,false);
  assert.equal(r.state,'UNKNOWN');
  assert.equal(r.code,'STRUCTURED_LIFECYCLE_CONFLICT');
});
