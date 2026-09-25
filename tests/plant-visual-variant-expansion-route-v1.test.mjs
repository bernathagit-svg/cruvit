import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeVariantExpansion,
  VARIANT_EXPANSION_ACTION
} from '../modules/garden-design/asset-factory-v1/plant-visual-variant-expansion-route-v1.js';

function registry(runtime='RUNTIME_AUTHORITY_READY'){
  return {
    slugToBotanicalTaxonId:{apple:'taxon:apple'},
    records:[{
      botanicalTaxonId:'taxon:apple',
      scientificName:'Malus domestica',
      growthStage:'mature',
      runtimeAuthority:runtime,
      HEIGHT_SCALE_READY:runtime==='RUNTIME_AUTHORITY_READY',
      SPREAD_SCALE_READY:runtime==='RUNTIME_AUTHORITY_READY'
    }]
  };
}

test('existing technical+framing pass candidate routes to QA repair instead of regeneration',()=>{
  const out=routeVariantExpansion({
    gapPlan:{
      canonicalSlug:'apple',
      missingRequired:[{
        variantKey:'young__tree__vegetative',
        growthStage:'young',
        architectureMode:'tree',
        visualForm:'tree',
        phenology:'vegetative'
      }]
    },
    sizeAuthorityRegistry:registry(),
    candidateRows:[{
      jobId:'apple__young__tree__vegetative__v1',
      canonicalSlug:'apple',
      growthStage:'young',
      architectureMode:'tree',
      visualForm:'tree',
      phenology:'vegetative',
      objectKey:'candidates/x.png',
      technicalQA:'PASS',
      framingQA:'PASS'
    }]
  });
  assert.equal(out.rows[0].action,VARIANT_EXPANSION_ACTION.QA_REPAIR);
  assert.equal(out.paidGenerationReady,0);
  assert.equal(out.qaRepairReady,1);
});

test('user context size authority allows visual generation but holds meter-accurate scale',()=>{
  const out=routeVariantExpansion({
    gapPlan:{
      canonicalSlug:'apple',
      missingRequired:[{
        variantKey:'mature__tree__fruiting',
        growthStage:'mature',
        architectureMode:'tree',
        visualForm:'tree',
        phenology:'fruiting'
      }]
    },
    sizeAuthorityRegistry:registry('RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED'),
    candidateRows:[]
  });
  assert.equal(out.rows[0].action,VARIANT_EXPANSION_ACTION.GENERATE_READY_SCALE_CONTEXT_REQUIRED);
  assert.equal(out.paidGenerationReady,1);
  assert.equal(out.placementScaleHold,1);
  assert.equal(out.blockedBeforeGeneration,0);
});

test('ready size authority routes genuine missing variant to generation',()=>{
  const out=routeVariantExpansion({
    gapPlan:{
      canonicalSlug:'apple',
      missingRequired:[{
        variantKey:'mature__tree__vegetative',
        growthStage:'mature',
        architectureMode:'tree',
        visualForm:'tree',
        phenology:'vegetative'
      }]
    },
    sizeAuthorityRegistry:registry('RUNTIME_AUTHORITY_READY'),
    candidateRows:[]
  });
  assert.equal(out.rows[0].action,VARIANT_EXPANSION_ACTION.GENERATE_READY);
  assert.equal(out.paidGenerationReady,1);
});


test('size evidence gap allows visual generation but holds in-garden scale authority',()=>{
  const out=routeVariantExpansion({
    gapPlan:{
      canonicalSlug:'apple',
      missingRequired:[{
        variantKey:'mature__tree__vegetative',
        growthStage:'mature',
        architectureMode:'tree',
        visualForm:'tree',
        phenology:'vegetative'
      }]
    },
    sizeAuthorityRegistry:registry('RUNTIME_AUTHORITY_EVIDENCE_GAP'),
    candidateRows:[]
  });
  assert.equal(out.rows[0].action,VARIANT_EXPANSION_ACTION.GENERATE_READY_SCALE_RESEARCH_REQUIRED);
  assert.equal(out.paidGenerationReady,1);
  assert.equal(out.placementScaleHold,1);
  assert.equal(out.blockedBeforeGeneration,0);
});
