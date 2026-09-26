import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFullCruvitPlantApproval,
  classifyFruitProductionIntent,
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
    provenance:[{sourceId:'test',source:'test'}],
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
      groupIds:['temperate-fruit-tree'],
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

test('explicit UNKNOWN humidity stays unknown but does not manufacture a suitability blocker',()=>{
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
  assert.equal(r.modules.climateAndSuitability.readinessClass,'A');
  assert.ok(!r.blockingReasons.includes('REAL_SUITABILITY_ENRICHMENT_REQUIRED'));
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


test('ornamental fruit/seed description does not require fruit-production climate',()=>{
  const cases=[
    {
      slug:'zinnia',
      tags:['ornamental','cut-flower'],
      groups:['ornamental-flowering'],
      fruiting:'Ornamental annual.'
    },
    {
      slug:'boxwood',
      tags:[],
      groups:[],
      fruiting:'Small dehiscent capsules; grown for foliage not fruit.'
    },
    {
      slug:'asparagus',
      tags:[],
      groups:[],
      fruiting:'Red berries on female plants if allowed to fruit.'
    }
  ];
  for(const row of cases){
    const out=classifyFruitProductionIntent({
      slug:row.slug,
      tags:row.tags,
      climateTraits:{
        groupIds:row.groups,
        fruitingRequirements:row.fruiting,
        traitProvenance:{
          fruitingRequirements:{status:'asserted',sourceIds:['test'],shortExcerpt:row.fruiting,evidenceClass:'SOURCE_SUPPORTED'}
        }
      }
    });
    assert.equal(out.applicable,false,row.slug);
  }
});

test('source-backed legacy fruit purpose remains applicable when structural group is missing',()=>{
  const out=classifyFruitProductionIntent({
    slug:'carob',
    tags:[],
    climateTraits:{
      groupIds:[],
      fruitingRequirements:'Pods on female plants; pods take a full year.',
      traitProvenance:{
        tags:{
          status:'asserted',
          sourceIds:['source'],
          shortExcerpt:'Catalog tags: subtropical, fruit, tree',
          evidenceClass:'SOURCE_SUPPORTED'
        },
        fruitingRequirements:{
          status:'asserted',
          sourceIds:['source'],
          shortExcerpt:'Pods on female plants; pods take a full year.',
          evidenceClass:'SOURCE_SUPPORTED'
        }
      }
    }
  });
  assert.equal(out.applicable,true);
  assert.equal(out.authority,'SOURCE_BACKED_CATALOG_TAG_PURPOSE');
});

test('source-backed edible/ripening fruit wording can recover legacy fruit purpose',()=>{
  for(const fruiting of [
    'Edible aggregate fruits; cultivar dependent.',
    'Brown fruit edible after bletting in late autumn.',
    'Red berries ripen in autumn.',
    'Harvest immature pods frequently for tenderness.'
  ]){
    const out=classifyFruitProductionIntent({
      tags:[],
      climateTraits:{
        groupIds:[],
        fruitingRequirements:fruiting,
        traitProvenance:{
          fruitingRequirements:{
            status:'asserted',
            sourceIds:['source'],
            shortExcerpt:fruiting,
            evidenceClass:'SOURCE_SUPPORTED'
          }
        }
      }
    });
    assert.equal(out.applicable,true,fruiting);
  }
});

test('edible non-fruit crop wording does not manufacture a fruit-production requirement',()=>{
  const out=classifyFruitProductionIntent({
    slug:'artichoke',
    tags:[],
    climateTraits:{
      groupIds:[],
      fruitingRequirements:'Edible immature flower buds harvested before opening (globe artichoke vegetable use).',
      traitProvenance:{
        fruitingRequirements:{
          status:'asserted',
          sourceIds:['source'],
          shortExcerpt:'Edible immature flower buds harvested before opening.',
          evidenceClass:'SOURCE_SUPPORTED'
        }
      }
    }
  });
  assert.equal(out.applicable,false);
});


test('legacy fruit group cannot override explicit leafy/root/flower-bud harvest purpose',()=>{
  const cases=[
    {slug:'broccoli',tags:['vegetable','biennial','cole'],groups:['temperate-chill-fruit'],fruiting:'Harvest immature flower heads (crowns) before open bloom.'},
    {slug:'carrot',tags:['vegetable','biennial','root'],groups:['temperate-chill-fruit'],fruiting:'Grown for edible taproots; seed in year two.'},
    {slug:'lettuce',tags:['vegetable','annual','leafy'],groups:['temperate-chill-fruit'],fruiting:'Grown for leaves; seed after bolting.'},
    {slug:'spinach',tags:['vegetable','annual','leafy'],groups:['temperate-chill-fruit'],fruiting:'Grown for leaves; seed after bolting.'}
  ];
  for(const row of cases){
    const out=classifyFruitProductionIntent({
      slug:row.slug,
      tags:row.tags,
      climateTraits:{
        groupIds:row.groups,
        fruitingRequirements:row.fruiting,
        traitProvenance:{
          fruitingRequirements:{status:'asserted',sourceIds:['source'],shortExcerpt:row.fruiting,evidenceClass:'SOURCE_SUPPORTED'}
        }
      }
    });
    assert.equal(out.applicable,false,row.slug);
    assert.equal(out.authority,'EXPLICIT_NON_REPRODUCTIVE_HARVEST_PURPOSE');
  }
});

test('legume/cucurbit/melon yield remains reproductive-climate applicable',()=>{
  const cases=[
    {slug:'garden-pea',tags:['vegetable','annual','legume'],groups:['temperate-chill-fruit'],fruiting:'Pods harvested for fresh peas or edible pods.'},
    {slug:'green-bean',tags:['vegetable','annual','legume'],groups:['subtropical-fruit'],fruiting:'Harvest immature pods as snap beans.'},
    {slug:'zucchini',tags:['vegetable','annual','cucurbit'],groups:['subtropical-fruit'],fruiting:'Harvest immature summer squash frequently.'},
    {slug:'watermelon',tags:['vegetable','annual','cucurbit','melon'],groups:['subtropical-fruit'],fruiting:'Large sweet pepoes; long warm season required.'}
  ];
  for(const row of cases){
    const out=classifyFruitProductionIntent({
      slug:row.slug,
      tags:row.tags,
      climateTraits:{
        groupIds:row.groups,
        fruitingRequirements:row.fruiting,
        traitProvenance:{
          fruitingRequirements:{status:'asserted',sourceIds:['source'],shortExcerpt:row.fruiting,evidenceClass:'SOURCE_SUPPORTED'}
        }
      }
    });
    assert.equal(out.applicable,true,row.slug);
  }
});


test('source-backed researched-unquantified reproductive state closes research blocker without claiming supported fruiting',()=>{
  const row=baseRow();
  row.provenance.push({sourceId:'authority-1',source:'authority-1'});
  row.climate_traits.reproductiveClimate={
    contractVersion:'reproductive-climate-v1',
    fruiting:{
      evidenceState:'RESEARCHED_UNQUANTIFIED',
      evidenceClass:'SOURCE_SUPPORTED',
      sourceIds:['authority-1']
    }
  };
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,true);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.evidenceState,'RESEARCHED_UNQUANTIFIED');
  assert.ok(!r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});

test('researched reproductive state without source lineage is still blocked',()=>{
  const row=baseRow();
  row.climate_traits.reproductiveClimate={
    contractVersion:'reproductive-climate-v1',
    fruiting:{
      evidenceState:'RESEARCHED_UNQUANTIFIED',
      evidenceClass:'SOURCE_SUPPORTED',
      sourceIds:[]
    }
  };
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,false);
  assert.ok(r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});

test('context-dependent reproductive state with source lineage is research-complete',()=>{
  const row=baseRow();
  row.provenance.push({sourceId:'authority-1',source:'authority-1'});
  row.climate_traits.reproductiveClimate={
    contractVersion:'reproductive-climate-v1',
    fruiting:{
      evidenceState:'CONTEXT_DEPENDENT',
      contextKeys:['cultivar'],
      evidenceClass:'SOURCE_SUPPORTED',
      sourceIds:['authority-1']
    }
  };
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,true);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.evidenceState,'CONTEXT_DEPENDENT');
  assert.ok(!r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});


test('reproductive source id must resolve to botanical provenance',()=>{
  const row=baseRow();
  row.climate_traits.reproductiveClimate.fruiting.sourceIds=['missing-authority'];
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:identity,
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.ready,false);
  assert.equal(r.modules.smartRecommendations.reproductiveClimate.sourceLineageValid,false);
  assert.deepEqual(
    r.modules.smartRecommendations.reproductiveClimate.missingSourceIds,
    ['missing-authority']
  );
  assert.ok(r.blockingReasons.includes('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED'));
});

test('verified catalog identity provenance is accepted when registry entry is absent',()=>{
  const row=baseRow();
  row.provenance=[{
    sourceId:'test',
    plantIdentity:{
      canonicalSlug:'test-plant',
      acceptedScientificName:'Testus plantus'
    },
    assertedClaims:[{field:'scientific',status:'asserted'}]
  }];
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:{canonicalIdentities:[]},
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.canonicalIdentity.ready,true);
  assert.equal(r.modules.canonicalIdentity.authority,'VERIFIED_CATALOG_IDENTITY_PROVENANCE');
  assert.equal(r.modules.plantDoctor.ready,true);
  assert.ok(!r.blockingReasons.includes('CANONICAL_IDENTITY_NOT_READY'));
  assert.ok(!r.blockingReasons.includes('PLANT_DOCTOR_CONTEXT_NOT_READY'));
});

test('explicit registry needsReview blocks catalog fallback even with verified provenance',()=>{
  const row=baseRow();
  row.provenance=[{
    sourceId:'test',
    plantIdentity:{
      canonicalSlug:'test-plant',
      acceptedScientificName:'Testus plantus'
    },
    assertedClaims:[{field:'scientific',status:'asserted'}]
  }];
  const r=evaluateFullCruvitPlantApproval({
    catalogRow:row,
    identityRegistry:{canonicalIdentities:[{
      canonicalSlug:'test-plant',
      acceptedScientificName:'Testus plantus',
      needsReview:true
    }]},
    designAssetRegistry:{sets:[]},
    sizeAuthorityRegistry:size
  });
  assert.equal(r.modules.canonicalIdentity.ready,false);
  assert.equal(r.modules.canonicalIdentity.needsReview,true);
  assert.equal(r.status,FULL_CRUVIT_PLANT_STATUS.OWNER_REVIEW_REQUIRED);
  assert.ok(r.blockingReasons.includes('CANONICAL_IDENTITY_NOT_READY'));
});

