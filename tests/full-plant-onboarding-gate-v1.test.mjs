import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFullPlantOnboarding,
  evaluateFullPlantOnboardingBatch
} from '../modules/catalog/full-plant-onboarding-gate-v1.js';

function readyRow(overrides={}) {
  return {
    slug:'breadfruit',
    scientific_name:'Artocarpus altilis',
    needs_review:false,
    verification_state:'verified',
    climate_traits:{
      frostSensitivity:'high',
      coldTolerance:'low',
      heatTolerance:'high',
      humidityTolerance:'high',
      waterNeeds:'high',
      sunNeeds:'full_sun',
      drainageNeeds:'medium',
      needsWinterChill:false,
      needsReview:false,
      plantKnowledge:{
        plantKnowledgeContractVersion:'1.0.0',
        sources:[{sourceId:'uf-ifas-breadfruit'}],
        warnings:[]
      }
    },
    flowering_requirements:'flowering guidance',
    fruiting_requirements:'fruiting guidance',
    provenance:[{sourceId:'uf-ifas-breadfruit'}],
    source_packet:'breadfruit-bulk-batch-1-v1',
    ...overrides
  };
}

test('full onboarding READY for verified canonical climate-backed record',()=>{
  const out=evaluateFullPlantOnboarding(readyRow(),{
    canonicalSlug:'breadfruit',
    scientific:'Artocarpus altilis',
    phenology:'vegetative'
  });
  assert.equal(out.ready,true);
  assert.equal(out.code,'FULL_PLANT_ONBOARDING_READY');
});

test('missing canonical record blocks',()=>{
  const out=evaluateFullPlantOnboarding(null,{canonicalSlug:'cacao',scientific:'Theobroma cacao',phenology:'fruiting'});
  assert.equal(out.ready,false);
  assert.equal(out.code,'CANONICAL_CATALOG_RECORD_MISSING');
});

test('needsReview blocks even when traits exist',()=>{
  const out=evaluateFullPlantOnboarding(readyRow({needs_review:true,verification_state:'needsReview'}),{
    canonicalSlug:'breadfruit',
    scientific:'Artocarpus altilis',
    phenology:'vegetative'
  });
  assert.equal(out.ready,false);
  assert.ok(out.reasons.includes('catalog-review-still-required'));
});

test('fruiting asset requires fruiting requirements',()=>{
  const out=evaluateFullPlantOnboarding(readyRow({fruiting_requirements:null}),{
    canonicalSlug:'breadfruit',
    scientific:'Artocarpus altilis',
    phenology:'fruiting'
  });
  assert.equal(out.ready,false);
  assert.ok(out.reasons.includes('fruiting_requirements_missing'));
});

test('missing core climate trait blocks',()=>{
  const row=readyRow();
  delete row.climate_traits.coldTolerance;
  const out=evaluateFullPlantOnboarding(row,{
    canonicalSlug:'breadfruit',
    scientific:'Artocarpus altilis',
    phenology:'vegetative'
  });
  assert.equal(out.ready,false);
  assert.equal(out.gates.climate,'FAIL');
});

test('batch is fail-closed when any expected slug is absent',()=>{
  const out=evaluateFullPlantOnboardingBatch(
    [readyRow()],
    [
      {canonicalSlug:'breadfruit',scientific:'Artocarpus altilis',phenology:'vegetative'},
      {canonicalSlug:'cacao',scientific:'Theobroma cacao',phenology:'fruiting'}
    ]
  );
  assert.equal(out.allReady,false);
  assert.equal(out.ready,1);
  assert.equal(out.blocked,1);
});
