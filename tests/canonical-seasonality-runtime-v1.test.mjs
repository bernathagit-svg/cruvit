import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogRowToRuntimePlant } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

test('canonical seasonalityEvidence overrides stale/empty design leafHabit',()=>{
  const row={
    slug:'apricot',
    scientific_name:'Prunus armeniaca',
    common_names:{en:'Apricot'},
    aliases:[],
    climate_traits:{
      seasonalityEvidence:{
        state:'DECIDUOUS',
        evidenceClass:'SOURCE_SUPPORTED',
        sourceId:'ncsu-prunus-armeniaca'
      },
      designMetadata:{
        leafHabit:{state:'UNKNOWN',evidenceClass:'UNKNOWN'}
      }
    },
    provenance:[{sourceId:'ncsu-prunus-armeniaca'}],
    needs_review:false,
    verification_state:'verified',
    media:{},
    media_status:'IMAGE_PENDING',
    catalog_version:'1.0.0'
  };
  const plant=catalogRowToRuntimePlant(row);
  assert.equal(plant.growthHabit,'deciduous');
  assert.equal(plant.seasonalityEvidence.state,'DECIDUOUS');
  assert.equal(plant.seasonalityEvidence.evidenceClass,'SOURCE_SUPPORTED');
});

test('designMetadata leafHabit remains fallback when canonical seasonality evidence absent',()=>{
  const row={
    slug:'carob',
    scientific_name:'Ceratonia siliqua',
    common_names:{en:'Carob'},
    aliases:[],
    climate_traits:{
      designMetadata:{
        leafHabit:{state:'EVERGREEN',evidenceClass:'SOURCE_SUPPORTED'}
      }
    },
    provenance:[{sourceId:'ncsu-ceratonia-siliqua'}],
    needs_review:false,
    verification_state:'verified',
    media:{},
    media_status:'IMAGE_PENDING',
    catalog_version:'1.0.0'
  };
  const plant=catalogRowToRuntimePlant(row);
  assert.equal(plant.growthHabit,'evergreen');
  assert.equal(plant.seasonalityEvidence.state,'EVERGREEN');
});


test('context-dependent canonical seasonality remains visible at runtime',()=>{
  const row={
    slug:'common-jasmine',
    scientific_name:'Jasminum officinale',
    common_names:{en:'Common jasmine'},
    climate_traits:{
      seasonalityEvidence:{
        state:'CONTEXT_DEPENDENT',
        evidenceClass:'SOURCE_SUPPORTED',
        sourceIds:['ncsu-jasminum-officinale']
      },
      designMetadata:{
        leafHabit:{state:'UNKNOWN',evidenceClass:'UNKNOWN'}
      }
    },
    provenance:[{sourceId:'ncsu-jasminum-officinale'}],
    needs_review:false,
    verification_state:'verified',
    media:{},
    media_status:'IMAGE_PENDING'
  };
  const plant=catalogRowToRuntimePlant(row);
  assert.equal(plant.seasonalityEvidence.state,'CONTEXT_DEPENDENT');
  assert.equal(plant.seasonalityEvidence.evidenceClass,'SOURCE_SUPPORTED');
});
