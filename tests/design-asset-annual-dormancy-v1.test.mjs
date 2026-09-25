import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDormantState,
  REQUIREMENT,
  VARIANT_REASON
} from '../modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js';

test('annual deciduous herbaceous plant does not require fake dormant asset',()=>{
  const r=classifyDormantState({
    canonicalSlug:'zinnia',
    designMetadata:{lifecycle:'annual'},
    climateTraits:{leafHabit:{state:'DECIDUOUS'}}
  },'herbaceous_upright');
  assert.equal(r.state,REQUIREMENT.NOT_REQUIRED);
  assert.equal(r.reasonCode,VARIANT_REASON.ANNUAL_OR_BIENNIAL_NO_DORMANT_ASSET);
});

test('biennial deciduous herbaceous plant does not require fake dormant asset',()=>{
  const r=classifyDormantState({
    canonicalSlug:'carrot',
    designMetadata:{lifecycle:'biennial'},
    climateTraits:{leafHabit:{state:'DECIDUOUS'}}
  },'herbaceous_upright');
  assert.equal(r.state,REQUIREMENT.NOT_REQUIRED);
});
