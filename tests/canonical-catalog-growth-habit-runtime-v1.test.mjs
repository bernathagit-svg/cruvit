import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogRowToRuntimePlant } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

test('runtime growthHabit comes from source-supported morphology, not leaf habit',()=>{
  const p=catalogRowToRuntimePlant({
    slug:'english-lavender',
    scientific_name:'Lavandula angustifolia',
    common_names:{en:'English lavender'},
    climate_traits:{
      growthHabit:'shrub',
      traitEvidenceClasses:{growthHabit:'SOURCE_SUPPORTED'},
      seasonalityEvidence:{state:'EVERGREEN',evidenceClass:'SOURCE_SUPPORTED'}
    }
  });
  assert.equal(p.growthHabit,'shrub');
  assert.equal(p.seasonalityEvidence.state,'EVERGREEN');
});

test('runtime does not promote unverified morphology',()=>{
  const p=catalogRowToRuntimePlant({
    slug:'x',
    scientific_name:'X species',
    climate_traits:{
      growthHabit:'tree',
      traitEvidenceClasses:{growthHabit:'HEURISTIC_ASSERTION'},
      seasonalityEvidence:{state:'DECIDUOUS',evidenceClass:'SOURCE_SUPPORTED'}
    }
  });
  assert.equal(p.growthHabit,null);
  assert.equal(p.seasonalityEvidence.state,'DECIDUOUS');
});
