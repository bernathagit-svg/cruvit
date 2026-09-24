import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinatePlantOnboarding,
  PLANT_ONBOARDING_ROUTE
} from '../modules/catalog/plant-onboarding-coordinator-v1.js';

const verifiedRow={
  slug:'breadfruit',
  scientific_name:'Artocarpus altilis',
  common_names:{en:'Breadfruit'},
  aliases:['breadfruit'],
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
  flowering_requirements:'flowering',
  fruiting_requirements:'fruiting',
  provenance:[{sourceId:'uf-ifas-breadfruit'}],
  source_packet:'breadfruit-bulk-batch-1-v1',
  media:{},
  media_status:'IMAGE_PENDING',
  catalog_version:'1.0.0'
};

test('missing catalog row routes to catalog expansion',()=>{
  const out=coordinatePlantOnboarding({
    catalogRow:null,
    fullOnboarding:{canonicalSlug:'new-plant',ready:false,code:'CANONICAL_CATALOG_RECORD_MISSING',reasons:['canonical-catalog-record-missing']}
  });
  assert.equal(out.route,PLANT_ONBOARDING_ROUTE.CATALOG_EXPANSION_REQUIRED);
  assert.equal(out.paidVisualGenerationAllowed,false);
});

test('full onboarding ready routes to visual factory',()=>{
  const out=coordinatePlantOnboarding({
    catalogRow:verifiedRow,
    fullOnboarding:{canonicalSlug:'breadfruit',ready:true,code:'FULL_PLANT_ONBOARDING_READY',reasons:[]}
  });
  assert.equal(out.route,PLANT_ONBOARDING_ROUTE.READY_FOR_VISUAL_FACTORY);
  assert.equal(out.visualFactoryAllowed,true);
  assert.equal(out.paidVisualGenerationAllowed,true);
});

test('catalog review hold cannot start visual spend',()=>{
  const row=structuredClone(verifiedRow);
  row.needs_review=true;
  row.verification_state='needsReview';
  row.climate_traits.needsReview=true;
  const out=coordinatePlantOnboarding({
    catalogRow:row,
    fullOnboarding:{
      canonicalSlug:'breadfruit',
      ready:false,
      code:'FULL_PLANT_ONBOARDING_BLOCKED',
      reasons:['catalog-verification-not-verified','catalog-review-still-required']
    }
  });
  assert.equal(out.visualFactoryAllowed,false);
  assert.equal(out.paidVisualGenerationAllowed,false);
  assert.ok([
    PLANT_ONBOARDING_ROUTE.OWNER_REVIEW_REQUIRED,
    PLANT_ONBOARDING_ROUTE.AUTO_RESEARCH_REQUIRED
  ].includes(out.route));
});
