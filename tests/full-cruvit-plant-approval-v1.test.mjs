import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFullCruvitPlantApproval,
  FULL_CRUVIT_PLANT_STATUS
} from '../modules/catalog/full-cruvit-plant-approval-v1.js';

function baseRow(){
  return {
    slug:'test-plant',
    scientific_name:'Testus plantus',
    common_names:{en:'Test plant'},
    aliases:[],
    verification_state:'verified',
    needs_review:false,
    provenance:[{source:'test'}],
    source_packet:'test-packet',
    media_status:'IMAGE_READY',
    media:{imageStatus:'IMAGE_READY'},
    flowering_requirements:'flowers when appropriate',
    fruiting_requirements:'fruit when appropriate',
    climate_traits:{
      frostSensitivity:'low',
      coldTolerance:'medium',
      heatTolerance:'high',
      humidityTolerance:'medium',
      waterNeeds:'medium',
      sunNeeds:'full_sun',
      drainageNeeds:'high',
      needsWinterChill:false,
      floweringRequirements:'flowers when appropriate',
      fruitingRequirements:'fruit when appropriate',
      floweringOutcomeApplicable:true,
      fruitingOutcomeApplicable:true,
      reproductiveBiology:{requires_pollinator:false},
      reproductiveClimate:{
        contractVersion:'reproductive-climate-v1',
        fruiting:{
          summerHeatBand:'warm',
          evidenceClass:'SOURCE_SUPPORTED',
          sourceIds:['test']
        }
      },
      traitEvidenceClasses:{
        frostSensitivity:'SOURCE_SUPPORTED',
        coldTolerance:'SOURCE_SUPPORTED',
        heatTolerance:'SOURCE_SUPPORTED',
        humidityTolerance:'SOURCE_SUPPORTED',
        waterNeeds:'SOURCE_SUPPORTED',
        sunNeeds:'SOURCE_SUPPORTED',
        drainageNeeds:'SOURCE_SUPPORTED'
      },
      traitProvenance:{
        frostSensitivity:{status:'asserted'},
        coldTolerance:{status:'asserted'},
        heatTolerance:{status:'asserted'},
        humidityTolerance:{status:'asserted'},
        waterNeeds:{status:'asserted'},
        sunNeeds:{status:'asserted'},
        drainageNeeds:{status:'asserted'},
        needsWinterChill:{status:'asserted'}
      },
      plantKnowledge:{
        plantKnowledgeContractVersion:'1.0.0',
        sources:[{sourceId:'test'}],
        warnings:[]
      },
      designMetadata:{
        visualForm:'tree',
        architectureModeSupport:['tree'],
        lifecycle:'perennial',
        leafHabit:{state:'EVERGREEN',evidenceClass:'SOURCE_SUPPORTED'}
      },
      seasonalityEvidence:{state:'EVERGREEN',evidenceClass:'SOURCE_SUPPORTED'}
    }
  };
}

const identity={
  canonicalIdentities:[{
    canonicalSlug:'test-plant',
    acceptedScientificName:'Testus plantus',
    needsReview:false
  }]
};
const size={
  slugToBotanicalTaxonId:{'test-plant':'taxon:test'},
  records:[{
    botanicalTaxonId:'taxon:test',
    scientificName:'Testus plantus',
    growthStage:'mature',
    runtimeAuthority:'RUNTIME_AUTHORITY_READY',
    HEIGHT_SCALE_READY:true,
    SPREAD_SCALE_READY:true
  }]
};

test('full approval fails closed when visual production coverage is missing',()=>{
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:baseRow(),
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.approved,false);
  assert.ok(r.blockingReasons.includes('REQUIRED_VISUAL_VARIANTS_MISSING'));
});

test('explicit UNKNOWN climate cannot become full suitability approval',()=>{
  const row=baseRow();
  row.climate_traits.humidityTolerance=null;
  row.climate_traits.traitEvidenceClasses.humidityTolerance='UNKNOWN';
  row.climate_traits.traitProvenance.humidityTolerance={status:'unknown'};
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.approved,false);
  assert.ok(r.blockingReasons.includes('REAL_SUITABILITY_ENRICHMENT_REQUIRED'));
  assert.equal(r.modules.climateAndSuitability.readinessClass,'B');
});

test('visual factory readiness alone never equals full CRUVIT approval',()=>{
  const row=baseRow();
  row.media_status='IMAGE_PENDING';
  row.media.imageStatus='IMAGE_PENDING';
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.approved,false);
  assert.ok(r.blockingReasons.includes('CATALOG_DISPLAY_MEDIA_NOT_READY'));
});

test('shop remains outside botanical approval',()=>{
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:baseRow(),
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.shop.applicable,false);
});


test('fruit-oriented recommendation readiness requires structured reproductive climate',()=>{
  const row=baseRow();
  delete row.climate_traits.reproductiveClimate;
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.ready,false);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.applicable,true);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,false);
  assert.ok(r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});

test('fruit-oriented recommendation readiness accepts structured provenance-backed climate',()=>{
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:baseRow(),
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.applicable,true);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,true);
  assert.equal(r.modules.smartRecommendations.ready,true);
  assert.ok(!r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});
