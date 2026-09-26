import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogRowToRuntimePlant } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { architectureModesForPlant } from '../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js';

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


test('source-supported morphology preserves multi-form architecture modes',()=>{
  const p=catalogRowToRuntimePlant({
    slug:'test-multi',
    scientific_name:'Testus multiformis',
    common_names:{en:'Test multi'},
    climate_traits:{
      growthHabit:'shrub',
      traitEvidenceClasses:{growthHabit:'SOURCE_SUPPORTED'},
      designMetadata:{
        visualForm:'shrub',
        architectureModeSupport:['tree','shrub'],
        morphologyEvidenceClass:'SOURCE_SUPPORTED'
      }
    }
  });
  assert.deepEqual(architectureModesForPlant(p),['tree','shrub']);
});

test('unverified architecture mode support is ignored',()=>{
  const p=catalogRowToRuntimePlant({
    slug:'test-unverified',
    scientific_name:'Testus unverified',
    common_names:{en:'Test unverified'},
    climate_traits:{
      growthHabit:'shrub',
      traitEvidenceClasses:{growthHabit:'HEURISTIC_ASSERTION'},
      designMetadata:{
        visualForm:'shrub',
        architectureModeSupport:['tree','shrub'],
        morphologyEvidenceClass:'HEURISTIC_ASSERTION'
      }
    }
  });
  assert.deepEqual(architectureModesForPlant(p),['shrub']);
});


test('annual/biennial lifecycle derived from catalog tags does not require dormant asset', async()=>{
  const { classifyDormantState } = await import('../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js');
  for(const tag of ['annual','biennial']){
    const out=classifyDormantState({
      slug:'crop-'+tag,
      tags:['vegetable',tag],
      climateTraits:{designMetadata:{tags:['vegetable',tag]}}
    },'unknown');
    assert.equal(out.state,'NOT_REQUIRED',tag);
    assert.equal(out.reasonCode,'ANNUAL_OR_BIENNIAL_NO_DORMANT_ASSET',tag);
  }
});
