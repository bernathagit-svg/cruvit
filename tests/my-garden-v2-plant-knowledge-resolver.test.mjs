import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePlantKnowledge,
  knowledgeCanDriveVerifiedUI,
} from '../modules/my-garden-v2/plant-knowledge-resolver.js';

test('exact slug resolves verified catalog knowledge', () => {
  const result=resolvePlantKnowledge(
    {id:'p1',profileSlug:'pineapple'},
    {
      id:'c1',
      slug:'pineapple',
      scientific_name:'Ananas comosus',
      verification_state:'verified',
      needs_review:false,
    }
  );
  assert.equal(result.available,true);
  assert.equal(result.knowledge.slug,'pineapple');
  assert.equal(knowledgeCanDriveVerifiedUI(result),true);
});

test('missing catalog row remains unavailable without substitution', () => {
  const result=resolvePlantKnowledge(
    {id:'p1',profileSlug:'mango'},
    null
  );
  assert.deepEqual(result,{
    available:false,
    reason:'catalog_slug_not_found',
    slug:'mango',
    knowledge:null,
  });
});

test('plant without canonical slug remains unknown', () => {
  const result=resolvePlantKnowledge({id:'p1'},null);
  assert.equal(result.available,false);
  assert.equal(result.reason,'plant_instance_has_no_canonical_slug');
});

test('different catalog slug is rejected instead of silently aliasing', () => {
  assert.throws(
    ()=>resolvePlantKnowledge(
      {id:'p1',profileSlug:'mango'},
      {slug:'mangosteen'}
    ),
    /catalog_slug_mismatch/
  );
});

test('needs-review catalog row cannot drive verified UI claims', () => {
  const result=resolvePlantKnowledge(
    {id:'p1',profileSlug:'pineapple'},
    {
      slug:'pineapple',
      verification_state:'needsReview',
      needs_review:true,
    }
  );
  assert.equal(knowledgeCanDriveVerifiedUI(result),false);
});
