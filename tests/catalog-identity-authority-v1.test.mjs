import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCatalogIdentityAuthority } from '../modules/catalog/catalog-identity-authority-v1.js';

function validRow(){
  return {
    slug:'rosa-rubiginosa',
    scientific_name:'Rosa rubiginosa',
    verification_state:'verified',
    needs_review:false,
    provenance:[{
      sourceId:'source-1',
      plantIdentity:{
        canonicalSlug:'rosa-rubiginosa',
        acceptedScientificName:'Rosa rubiginosa'
      },
      assertedClaims:[{field:'scientific',status:'asserted'}]
    }]
  };
}

test('valid verified source-backed identity -> ready',()=>{
  const out=evaluateCatalogIdentityAuthority(validRow());
  assert.equal(out.ready,true);
  assert.equal(out.valid,true);
  assert.equal(out.reason,null);
  assert.equal(out.authority,'VERIFIED_CATALOG_IDENTITY_PROVENANCE');
  assert.equal(out.sourceId,'source-1');
  assert.equal(out.canonicalSlug,'rosa-rubiginosa');
  assert.equal(out.acceptedScientificName,'Rosa rubiginosa');
  assert.equal(out.verificationState,'verified');
  assert.equal(out.needsReview,false);
});

test('unverified -> blocked',()=>{
  const row=validRow(); row.verification_state='pending';
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'CATALOG_IDENTITY_NOT_VERIFIED');
});

test('needsReview -> blocked',()=>{
  const row=validRow(); row.needs_review=true;
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'CATALOG_IDENTITY_NOT_VERIFIED');
});

test('missing provenance -> blocked',()=>{
  const row=validRow(); row.provenance=[];
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('slug mismatch -> blocked',()=>{
  const row=validRow(); row.provenance[0].plantIdentity.canonicalSlug='other-rose';
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('scientific mismatch -> blocked',()=>{
  const row=validRow(); row.provenance[0].plantIdentity.acceptedScientificName='Rosa canina';
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('missing asserted scientific claim -> blocked',()=>{
  const row=validRow(); row.provenance[0].assertedClaims=[{field:'scientific',status:'observed'}];
  const out=evaluateCatalogIdentityAuthority(row);
  assert.equal(out.ready,false);
  assert.equal(out.reason,'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('ambiguous scientific spp. and various -> blocked',()=>{
  for(const scientific_name of ['Rosa spp.','Various roses']){
    const row=validRow(); row.scientific_name=scientific_name;
    const out=evaluateCatalogIdentityAuthority(row);
    assert.equal(out.ready,false,scientific_name);
    assert.equal(out.reason,'SCIENTIFIC_IDENTITY_AMBIGUOUS',scientific_name);
    assert.equal(out.ambiguityState,'AMBIGUOUS_SCIENTIFIC_IDENTITY');
  }
});

test('missing canonical slug or scientific identity -> fail closed',()=>{
  const noSlug=validRow(); delete noSlug.slug;
  assert.equal(evaluateCatalogIdentityAuthority(noSlug).reason,'IDENTITY_FIELDS_MISSING');
  const noScientific=validRow(); delete noScientific.scientific_name;
  assert.equal(evaluateCatalogIdentityAuthority(noScientific).reason,'IDENTITY_FIELDS_MISSING');
});

test('malformed/null input -> safe fail-closed',()=>{
  for(const value of [null,undefined,{},'bad',42]){
    const out=evaluateCatalogIdentityAuthority(value);
    assert.equal(out.ready,false);
    assert.equal(out.valid,false);
    assert.equal(out.reason,'IDENTITY_FIELDS_MISSING');
  }
});

test('expected identity must match source-backed provenance',()=>{
  const row=validRow();
  const out=evaluateCatalogIdentityAuthority(row,{canonicalSlug:'rosa-rubiginosa',scientific:'Rosa canina'});
  assert.equal(out.ready,false);
  assert.equal(out.reason,'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('output is deeply immutable',()=>{
  const out=evaluateCatalogIdentityAuthority(validRow());
  assert.equal(Object.isFrozen(out),true);
  assert.throws(()=>{ out.ready=false; },TypeError);
});
