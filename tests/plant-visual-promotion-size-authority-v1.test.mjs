import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateManifestRowPromotionReadiness
} from '../modules/garden-design/asset-factory-v1/plant-visual-promotion-readiness-v1.js';

function row(state){
  return {
    jobId:'x__mature__default__vegetative__v1',
    canonicalSlug:'x',
    scientific:'X species',
    visualForm:'shrub',
    architectureMode:'default',
    growthStage:'mature',
    phenology:'vegetative',
    objectKey:'candidates/x.png',
    bytes:1000,
    sha256:'a'.repeat(64),
    technicalQA:'PASS',
    framingQA:'PASS',
    botanicalIdentityQA:'PASS',
    architectureQA:'PASS',
    growthStageQA:'PASS',
    phenologyStateQA:'PASS',
    inGardenQA:'PASS',
    ownerVisualQA:'PASS',
    technicalMetrics:{
      width:1024,height:1536,
      bbox:{exists:true,minX:100,minY:100,maxX:900,maxY:1400}
    },
    qaRendererInput:{ok:true,baseWidthPx:300,scale:1,source:'test'},
    sizeAuthorityPlan:{state,reasonCodes:[]}
  };
}

test('declared READY and PARTIAL size authority may proceed to normal promotion gates',()=>{
  for(const state of ['SIZE_AUTHORITY_READY','SIZE_AUTHORITY_PARTIAL']){
    const result=evaluateManifestRowPromotionReadiness(row(state));
    assert.notEqual(result.code,'SIZE_AUTHORITY_PROMOTION_BLOCKED');
    assert.equal(result.sizeAuthority.ok,true);
  }
});

test('evidence gap, conflict, context-required and not-evaluated block promotion',()=>{
  for(const state of [
    'SIZE_AUTHORITY_EVIDENCE_GAP',
    'SIZE_AUTHORITY_CONFLICT_HOLD',
    'SIZE_AUTHORITY_CONTEXT_REQUIRED',
    'SIZE_AUTHORITY_NOT_EVALUATED'
  ]){
    const result=evaluateManifestRowPromotionReadiness(row(state));
    assert.equal(result.ready,false);
    assert.equal(result.code,'SIZE_AUTHORITY_PROMOTION_BLOCKED');
    assert.equal(result.sizeAuthority.ok,false);
  }
});

test('legacy pilot row without sizeAuthorityPlan remains grandfathered',()=>{
  const legacy=row('SIZE_AUTHORITY_READY');
  delete legacy.sizeAuthorityPlan;
  const result=evaluateManifestRowPromotionReadiness(legacy);
  assert.equal(result.sizeAuthority.code,'SIZE_AUTHORITY_LEGACY_MANIFEST');
  assert.notEqual(result.code,'SIZE_AUTHORITY_PROMOTION_BLOCKED');
});
