import test from 'node:test';
import assert from 'node:assert/strict';
import { planEndToEndPlantBatch } from '../modules/catalog/cruvit-e2e-plant-batch-planner-v1.js';

test('owner identity conflict routes to owner lane',()=>{
  const p=planEndToEndPlantBatch([{canonicalSlug:'x',status:'OWNER_REVIEW_REQUIRED',approved:false,blockingReasons:['CANONICAL_IDENTITY_NOT_READY'],modules:{}}]);
  assert.equal(p.rows[0].lane,'OWNER_REVIEW_LANE');
});

test('climate plus visuals only routes fast lane',()=>{
  const p=planEndToEndPlantBatch([{canonicalSlug:'x',status:'ENRICHMENT_REQUIRED',approved:false,blockingReasons:['REAL_SUITABILITY_ENRICHMENT_REQUIRED','REQUIRED_VISUAL_VARIANTS_MISSING'],modules:{gardenDesign:{missingRequiredCount:2}}}]);
  assert.equal(p.rows[0].lane,'FAST_LANE');
});

test('multiple research classes route research lane',()=>{
  const p=planEndToEndPlantBatch([{canonicalSlug:'x',status:'ENRICHMENT_REQUIRED',approved:false,blockingReasons:['REAL_SUITABILITY_ENRICHMENT_REQUIRED','SEASONALITY_RESEARCH_REQUIRED','SIZE_AUTHORITY_ENRICHMENT_REQUIRED','REQUIRED_VISUAL_VARIANTS_MISSING'],modules:{}}]);
  assert.equal(p.rows[0].lane,'RESEARCH_LANE');
});
