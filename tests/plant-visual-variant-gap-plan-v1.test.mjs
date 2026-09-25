import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlantVisualVariantGapPlan } from '../modules/garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js';

const plan={
  canonicalSlug:'apple',
  scientific:'Malus domestica',
  generationAllowed:true,
  code:'VARIANT_PLAN_READY',
  visualForm:'tree',
  requiredVariants:[
    {growthStage:'mature',architectureMode:'tree',phenology:'vegetative',phenologyState:'vegetative'},
    {growthStage:'young',architectureMode:'tree',phenology:'vegetative',phenologyState:'vegetative'},
    {growthStage:'mature',architectureMode:'tree',phenology:'fruiting',phenologyState:'fruiting'},
    {growthStage:'mature',architectureMode:'tree',phenology:'dormant',phenologyState:'dormant'}
  ],
  optionalVariants:[],
  seasonalityResearchRequired:false,
  unknownStates:['flowering']
};

test('gap plan only lists required variants not covered by approved production registry',()=>{
  const registry={sets:[{
    canonicalSlug:'apple',
    variants:[{
      canonicalSlug:'apple',
      growthStage:'young',
      architectureMode:'tree',
      phenology:'vegetative',
      productionApproved:true,
      approvalState:'APPROVED',
      approvalStatus:'approved',
      status:'ready',
      transparencyReady:true
    }]
  }]};
  const out=buildPlantVisualVariantGapPlan({variantPlan:plan,registry});
  assert.equal(out.requiredVariantCount,4);
  assert.equal(out.coveredRequiredCount,1);
  assert.equal(out.missingRequiredCount,3);
  assert.equal(out.status,'MISSING_REQUIRED_VARIANTS');
});

test('no generation demand when all required variants are covered',()=>{
  const variants=plan.requiredVariants.map(v=>({
    ...v,
    canonicalSlug:'apple',
    productionApproved:true,
    approvalState:'APPROVED',
    approvalStatus:'approved',
    status:'ready',
    transparencyReady:true
  }));
  const out=buildPlantVisualVariantGapPlan({
    variantPlan:plan,
    registry:{sets:[{canonicalSlug:'apple',variants}]}
  });
  assert.equal(out.missingRequiredCount,0);
  assert.equal(out.generationAllowed,false);
  assert.equal(out.status,'REQUIRED_VARIANTS_COVERED');
});
