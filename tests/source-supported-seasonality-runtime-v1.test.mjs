import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeciduousHabit,
  isEvergreenHabit
} from '../modules/garden-design/garden-design-variant-policy-v1.js';
import {
  classifyDormantState,
  REQUIREMENT
} from '../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js';

test('source-supported deciduous seasonality drives dormant requirement for perennial shrub',()=>{
  const plant={
    canonicalSlug:'hydrangea-test',
    growthHabit:'shrub',
    seasonalityEvidence:{state:'DECIDUOUS',evidenceClass:'SOURCE_SUPPORTED'},
    designMetadata:{lifecycle:'perennial'}
  };
  assert.equal(isDeciduousHabit(plant),true);
  assert.equal(isEvergreenHabit(plant),false);
  assert.equal(classifyDormantState(plant,'shrub').state,REQUIREMENT.REQUIRED);
});

test('source-supported evergreen seasonality suppresses fake dormant asset',()=>{
  const plant={
    canonicalSlug:'lavender-test',
    growthHabit:'shrub',
    seasonalityEvidence:{state:'EVERGREEN',evidenceClass:'SOURCE_SUPPORTED'},
    designMetadata:{lifecycle:'perennial'}
  };
  assert.equal(isEvergreenHabit(plant),true);
  assert.equal(classifyDormantState(plant,'shrub').state,REQUIREMENT.NOT_REQUIRED);
});

test('heuristic seasonality is not promoted into leaf-habit truth',()=>{
  const plant={
    canonicalSlug:'unknown-test',
    growthHabit:'shrub',
    seasonalityEvidence:{state:'DECIDUOUS',evidenceClass:'HEURISTIC_ASSERTION'},
    designMetadata:{lifecycle:'perennial'}
  };
  assert.equal(isDeciduousHabit(plant),false);
  assert.equal(isEvergreenHabit(plant),false);
  assert.equal(classifyDormantState(plant,'shrub').state,REQUIREMENT.UNKNOWN);
});

test('annual lifecycle still overrides source-supported deciduous leaf habit',()=>{
  const plant={
    canonicalSlug:'zinnia-test',
    growthHabit:'herbaceous-upright',
    seasonalityEvidence:{state:'DECIDUOUS',evidenceClass:'SOURCE_SUPPORTED'},
    designMetadata:{lifecycle:'annual'}
  };
  assert.equal(isDeciduousHabit(plant),true);
  assert.equal(classifyDormantState(plant,'herbaceous-upright').state,REQUIREMENT.NOT_REQUIRED);
});
