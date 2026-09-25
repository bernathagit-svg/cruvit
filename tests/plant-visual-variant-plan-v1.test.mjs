import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlantVisualVariantPlan } from '../modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';

function row(overrides={}) {
  return {
    slug:'apple',
    scientific_name:'Malus domestica',
    common_names:{en:'Apple'},
    aliases:['apple'],
    needs_review:false,
    verification_state:'verified',
    climate_traits:{
      frostSensitivity:'medium',
      coldTolerance:'high',
      heatTolerance:'medium',
      humidityTolerance:'medium',
      waterNeeds:'medium',
      sunNeeds:'full_sun',
      drainageNeeds:'high',
      needsWinterChill:true,
      needsReview:false,
      floweringRequirements:'spring flowers',
      fruitingRequirements:'summer to fall fruit',
      groupIds:['temperate-chill-fruit-tree'],
      designMetadata:{
        contractVersion:'design-metadata-v1',
        tags:['temperate','fruit','tree','chill'],
        growth:'Tree',
        matureSize:null,
        leafHabit:{state:'UNKNOWN',evidenceClass:'UNKNOWN',evidence:[]},
        seasonalityResearchRequired:true,
        sourcePacket:'apple-bulk-batch-3-v1'
      },
      plantKnowledge:{
        plantKnowledgeContractVersion:'1.0.0',
        sources:[{sourceId:'ncsu-malus-domestica'}],
        warnings:[]
      }
    },
    flowering_requirements:'spring flowers',
    fruiting_requirements:'summer to fall fruit',
    provenance:[{sourceId:'ncsu-malus-domestica'}],
    media:{},
    media_status:'IMAGE_PENDING',
    catalog_version:'1.0.0',
    source_packet:'apple-bulk-batch-3-v1',
    ...overrides
  };
}

test('tree with unknown leaf habit plans baseline + young/fruit and requests seasonality research',()=>{
  const out=buildPlantVisualVariantPlan({
    catalogRow:row(),
    fullOnboarding:{ready:true,canonicalSlug:'apple'}
  });
  assert.equal(out.visualForm,'tree');
  assert.equal(out.youngRequired,'REQUIRED');
  assert.equal(out.seasonalityResearchRequired,true);
  assert.equal(out.calendarContextPolicy.winter.mode,'SEASONAL_RESEARCH_REQUIRED');
  assert.ok(out.requiredVariants.some(v=>v.growthStage==='mature'&&v.phenologyState==='vegetative'));
  assert.ok(out.requiredVariants.some(v=>v.growthStage==='young'&&v.phenologyState==='vegetative'));
});

test('source-supported deciduous habit requires dormant asset',()=>{
  const r=row();
  r.climate_traits.designMetadata.leafHabit={
    state:'DECIDUOUS',
    evidenceClass:'SOURCE_SUPPORTED',
    evidence:[{sourceIds:['ncsu-malus-domestica']}]
  };
  r.climate_traits.designMetadata.seasonalityResearchRequired=false;
  const out=buildPlantVisualVariantPlan({
    catalogRow:r,
    fullOnboarding:{ready:true,canonicalSlug:'apple'}
  });
  assert.equal(out.dormantRequired,'REQUIRED');
  assert.equal(out.calendarContextPolicy.winter.mode,'DISTINCT_DORMANT_ASSET');
  assert.equal(out.seasonalityResearchRequired,false);
});

test('full onboarding block prevents variant generation',()=>{
  const out=buildPlantVisualVariantPlan({
    catalogRow:row(),
    fullOnboarding:{ready:false,canonicalSlug:'apple'}
  });
  assert.equal(out.generationAllowed,false);
  assert.equal(out.code,'FULL_PLANT_ONBOARDING_REQUIRED');
});
