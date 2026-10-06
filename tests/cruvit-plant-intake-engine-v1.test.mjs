import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCruvitPlantIntakeStage,
  INTAKE_STAGE
} from '../modules/catalog/cruvit-plant-intake-engine-v1.js';
import { identityLookupSlugs } from '../netlify/functions/cruvit-plant-intake-engine.mjs';
import fs from 'node:fs';

const identityRegistry=JSON.parse(fs.readFileSync('data/plant-identity.registry.json','utf8'));

test('missing catalog and packet routes to evidence packet',()=>{
  const r=resolveCruvitPlantIntakeStage({request:{canonicalSlug:'new-plant'},catalogExists:false});
  assert.equal(r.stage,INTAKE_STAGE.EVIDENCE_PACKET_REQUIRED);
  assert.equal(r.finalApproved,false);
});

test('validated but unapproved packet requires owner ingest approval',()=>{
  const r=resolveCruvitPlantIntakeStage({
    request:{canonicalSlug:'new-plant'},
    catalogExists:false,
    packet:{canonicalSlug:'new-plant',validationOk:true,approvedForIngest:false}
  });
  assert.equal(r.stage,INTAKE_STAGE.PACKET_REVIEW_REQUIRED);
  assert.equal(r.ownerActions.length,1);
});

test('catalog plant with Class A gap routes enrichment before visuals',()=>{
  const r=resolveCruvitPlantIntakeStage({
    request:{canonicalSlug:'apple'},
    catalogExists:true,
    fullApproval:{
      canonicalSlug:'apple',
      approved:false,
      status:'ENRICHMENT_REQUIRED',
      blockingReasons:['REAL_SUITABILITY_ENRICHMENT_REQUIRED','REQUIRED_VISUAL_VARIANTS_MISSING']
    }
  });
  assert.equal(r.stage,INTAKE_STAGE.DATA_ENRICHMENT_REQUIRED);
});

test('visual generation requires bounded owner spend approval action',()=>{
  const r=resolveCruvitPlantIntakeStage({
    request:{canonicalSlug:'orange'},
    catalogExists:true,
    fullApproval:{
      canonicalSlug:'orange',
      approved:false,
      status:'VISUAL_COMPLETION_REQUIRED',
      blockingReasons:['REQUIRED_VISUAL_VARIANTS_MISSING']
    },
    visualTransient:{
      requiredPlanReady:true,
      missingGenerationCount:3,
      existingCandidateReuseCount:1
    }
  });
  assert.equal(r.stage,INTAKE_STAGE.VISUAL_GENERATION_REQUIRED);
  assert.equal(r.paidActions.length,1);
});

test('full approval is the only final approved state',()=>{
  const r=resolveCruvitPlantIntakeStage({
    request:{canonicalSlug:'x'},
    catalogExists:true,
    fullApproval:{
      canonicalSlug:'x',
      approved:true,
      status:'FULL_CRUVIT_APPROVED',
      blockingReasons:[]
    }
  });
  assert.equal(r.stage,INTAKE_STAGE.FULL_CRUVIT_APPROVED);
  assert.equal(r.finalApproved,true);
});

test('identity lookup normalizes alias and canonical Hydrangea slugs to one canonical identity',()=>{
  const fromCanonical=identityLookupSlugs(identityRegistry,'hydrangea');
  const fromAlias=identityLookupSlugs(identityRegistry,'bigleaf-hydrangea');
  assert.equal(fromCanonical.canonicalSlug,'hydrangea');
  assert.equal(fromAlias.canonicalSlug,'hydrangea');
  assert.ok(fromCanonical.lookupSlugs.includes('bigleaf-hydrangea'));
  assert.ok(fromAlias.lookupSlugs.includes('hydrangea'));
  assert.deepEqual(new Set(fromCanonical.lookupSlugs),new Set(fromAlias.lookupSlugs));
});

test('identity lookup leaves an unrelated canonical slug stable',()=>{
  const r=identityLookupSlugs(identityRegistry,'mango');
  assert.equal(r.canonicalSlug,'mango');
  assert.ok(r.lookupSlugs.includes('mango'));
});
