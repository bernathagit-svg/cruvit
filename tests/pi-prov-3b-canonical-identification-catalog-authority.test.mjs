import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlantIdentityResolver } from '../modules/identity/plant-identity-resolver.js';
import { createCanonicalIdentificationResolutionAdapter } from '../modules/plant-identifier/canonical-identification-resolution-adapter-v1.js';
import { evaluateCanonicalIdentificationCatalogAuthority } from '../modules/plant-identifier/canonical-identification-catalog-authority-v1.js';
import { createCanonicalIdentificationResult } from '../modules/plant-identifier/canonical-identification-result-v1.js';

function registryFixture(){
  return {
    schemaVersion:1,
    registryVersion:'pi-prov-3b-test-v1',
    canonicalIdentities:[
      {canonicalSlug:'monstera',acceptedScientificName:'Monstera deliciosa',needsReview:false},
      {canonicalSlug:'needs-review-plant',acceptedScientificName:'Reviewus pendingii',needsReview:true},
      {canonicalSlug:'collision-a',acceptedScientificName:'Ambigua plantus',needsReview:false},
      {canonicalSlug:'collision-b',acceptedScientificName:'Ambigua plantus',needsReview:false}
    ],
    duplicateConflicts:[{
      slug:'conflicted-plant',
      needsReview:true,
      conflictType:'same_slug_multiple_scientific',
      resolutionStatus:'pending',
      observedRecords:[
        {scientificName:'Conflicta plantus'},
        {scientificName:'Conflicta altera'}
      ]
    }]
  };
}

function chain(){
  const resolver=createPlantIdentityResolver(registryFixture());
  assert.equal(resolver.valid,true);
  const adapter=createCanonicalIdentificationResolutionAdapter({resolver});
  return {resolver,adapter};
}

function resolutionForMonstera(diagnostics=null){
  return chain().adapter.resolve({
    signals:[{source:'taxonomy_verified',kind:'scientific_name',value:'Monstera deliciosa'}],
    diagnostics
  });
}

function row(overrides={}){
  const base={
    slug:'monstera',
    scientific_name:'Monstera deliciosa',
    common_names:{en:'Swiss cheese plant'},
    verification_state:'verified',
    needs_review:false,
    catalog_version:'catalog-test-v7',
    source_packet:'packet-test-1',
    media_status:'IMAGE_READY',
    climate_traits:{humidity:'UNKNOWN'},
    provenance:[{
      sourceId:'source-1',
      plantIdentity:{
        canonicalSlug:'monstera',
        acceptedScientificName:'Monstera deliciosa'
      },
      assertedClaims:[{field:'scientific',status:'asserted'}]
    }]
  };
  return Object.assign(base,overrides);
}

function evaluate(catalogRow=row(), locale='en', resolution=resolutionForMonstera()){
  return evaluateCanonicalIdentificationCatalogAuthority({resolution,catalogRow,locale});
}

function assertFailed(out, reason){
  assert.notEqual(out.validation,'passed');
  assert.equal(out.canonicalSlug,null);
  assert.equal(out.scientificName,null);
  assert.equal(out.commonName,null);
  if(reason) assert.ok(out.reasons.includes(reason),JSON.stringify(out.reasons));
}

test('1 full synthetic chain -> catalog passed -> PI-PROV-1 identified/saveEligible',()=>{
  const resolution=resolutionForMonstera({providerCommonName:'DO NOT USE',providerScientificName:'DO NOT USE'});
  const catalog=evaluate(row(),'en',resolution);
  assert.equal(catalog.validation,'passed');
  const result=createCanonicalIdentificationResult({
    status:'identified',
    resolution,
    catalog,
    providerEvidence:{commonName:'Provider monster',scientificName:'Provider scientific'}
  });
  assert.equal(result.status,'identified');
  assert.equal(result.identityConfirmed,true);
  assert.equal(result.saveEligible,true);
  assert.equal(result.canonicalSlug,'monstera');
  assert.equal(result.scientificName,'Monstera deliciosa');
  assert.equal(result.commonName,'Swiss cheese plant');
});

test('2 requested locale exact string -> selected',()=>{
  const out=evaluate(row({common_names:{en:'Swiss cheese plant',he:'מונסטרה'}}),'he-IL');
  assert.equal(out.commonName,'מונסטרה');
  assert.equal(out.resolvedDisplayLocale,'he');
  assert.equal(out.localeFallback,false);
});

test('3 requested locale array with one distinct non-empty name -> selected',()=>{
  const out=evaluate(row({common_names:{en:'Swiss cheese plant',he:[' ','מונסטרה',7]}}),'he');
  assert.equal(out.validation,'passed');
  assert.equal(out.commonName,'מונסטרה');
});

test('4 duplicate identical array values -> deduplicated and selected',()=>{
  const out=evaluate(row({common_names:{en:'Swiss cheese plant',he:['מונסטרה','מונסטרה',' ']}}),'he');
  assert.equal(out.validation,'passed');
  assert.equal(out.commonName,'מונסטרה');
});

test('5 requested locale with >1 distinct name -> ambiguous failed',()=>{
  assertFailed(evaluate(row({common_names:{en:'English fallback',he:['מונסטרה','פילודנדרון']}}),'he'),'CANONICAL_COMMON_NAME_AMBIGUOUS');
});

test('6 requested locale missing + one unambiguous English name -> English fallback',()=>{
  const out=evaluate(row({common_names:{en:'Swiss cheese plant'}}),'he');
  assert.equal(out.validation,'passed');
  assert.equal(out.commonName,'Swiss cheese plant');
  assert.equal(out.resolvedDisplayLocale,'en');
  assert.equal(out.localeFallback,true);
});

test('7 requested locale missing + ambiguous English names -> failed',()=>{
  assertFailed(evaluate(row({common_names:{en:['Swiss cheese plant','Monstera']}}),'he'),'CANONICAL_COMMON_NAME_AMBIGUOUS');
});

test('8 no usable requested/English common name -> failed',()=>{
  assertFailed(evaluate(row({common_names:{he:[],fr:'Monstera'}}),'he'),'CANONICAL_COMMON_NAME_MISSING');
});

test('9 slug is never common-name fallback',()=>{
  const out=evaluate(row({common_names:{}}),'en');
  assertFailed(out,'CANONICAL_COMMON_NAME_MISSING');
  assert.notEqual(out.commonName,'monstera');
});

test('10 scientific name is never common-name fallback',()=>{
  const out=evaluate(row({common_names:{}}),'en');
  assertFailed(out,'CANONICAL_COMMON_NAME_MISSING');
  assert.notEqual(out.commonName,'Monstera deliciosa');
});

test('11 provider names in diagnostics cannot affect selected names',()=>{
  const resolution=resolutionForMonstera({commonName:'Provider Name',scientificName:'Provider scientific'});
  const out=evaluate(row({common_names:{en:'Catalog Name'}}),'en',resolution);
  assert.equal(out.commonName,'Catalog Name');
  assert.equal(out.scientificName,'Monstera deliciosa');
});

test('12 missing catalog row -> validation missing -> not identified',()=>{
  const resolution=resolutionForMonstera();
  const catalog=evaluate(null,'en',resolution);
  assert.equal(catalog.validation,'missing');
  assertFailed(catalog,'CATALOG_ROW_MISSING');
  const result=createCanonicalIdentificationResult({status:'identified',resolution,catalog});
  assert.notEqual(result.status,'identified');
  assert.equal(result.saveEligible,false);
});

test('13 catalog slug mismatch -> failed',()=>{
  assertFailed(evaluate(row({slug:'other-plant'})),'CATALOG_SLUG_MISMATCH');
});

test('14 shared authority unverified row -> failed',()=>{
  const out=evaluate(row({verification_state:'pending'}));
  assertFailed(out,'CATALOG_IDENTITY_NOT_VERIFIED');
  assert.ok(out.reasons.includes('CATALOG_IDENTITY_AUTHORITY_FAILED'));
});

test('15 shared authority needsReview row -> failed',()=>{
  assertFailed(evaluate(row({needs_review:true})),'CATALOG_IDENTITY_NOT_VERIFIED');
});

test('16 missing source-backed provenance -> failed',()=>{
  assertFailed(evaluate(row({provenance:[]})),'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('17 provenance slug mismatch -> failed',()=>{
  const r=row();
  r.provenance[0].plantIdentity.canonicalSlug='other';
  assertFailed(evaluate(r),'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('18 provenance scientific mismatch -> failed',()=>{
  const r=row();
  r.provenance[0].plantIdentity.acceptedScientificName='Monstera adansonii';
  assertFailed(evaluate(r),'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('19 missing asserted scientific claim -> failed',()=>{
  const r=row();
  r.provenance[0].assertedClaims=[{field:'scientific',status:'observed'}];
  assertFailed(evaluate(r),'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED');
});

test('20 ambiguous scientific identity -> failed',()=>{
  const r=row({scientific_name:'Monstera spp.'});
  r.provenance[0].plantIdentity.acceptedScientificName='Monstera spp.';
  assertFailed(evaluate(r),'SCIENTIFIC_IDENTITY_AMBIGUOUS');
});

test('21 PI-PROV-2 ambiguous resolution -> failed before positive catalog authority',()=>{
  const resolution={status:'ambiguous',canonicalSlug:null,needsReview:false,conflictActive:false};
  assertFailed(evaluate(row(),'en',resolution),'RESOLUTION_NOT_AUTHORITATIVE');
});

test('22 PI-PROV-2 pending_conflict -> failed',()=>{
  const resolution={status:'pending_conflict',canonicalSlug:null,needsReview:true,conflictActive:true};
  assertFailed(evaluate(row(),'en',resolution),'RESOLUTION_NOT_AUTHORITATIVE');
});

test('23 PI-PROV-2 provisional -> failed',()=>{
  const resolution={status:'provisional',canonicalSlug:null,needsReview:true,conflictActive:false};
  assertFailed(evaluate(row(),'en',resolution),'RESOLUTION_NOT_AUTHORITATIVE');
});

test('24 PI-PROV-2 unresolved -> failed',()=>{
  const resolution={status:'unresolved',canonicalSlug:null,needsReview:false,conflictActive:false};
  assertFailed(evaluate(row(),'en',resolution),'RESOLUTION_NOT_AUTHORITATIVE');
});

test('25 PI-PROV-2 needsReview -> no clean positive',()=>{
  const resolution={status:'resolved_canonical',canonicalSlug:'monstera',needsReview:true,conflictActive:false};
  assertFailed(evaluate(row(),'en',resolution),'RESOLUTION_NEEDS_REVIEW');
});

test('26 IMAGE_PENDING does not block textual identity',()=>{
  const out=evaluate(row({media_status:'IMAGE_PENDING'}));
  assert.equal(out.validation,'passed');
});

test('27 explicit UNKNOWN climate data does not block textual identity',()=>{
  const out=evaluate(row({climate_traits:{humidity:'UNKNOWN',winter:'UNKNOWN'}}));
  assert.equal(out.validation,'passed');
});

test('28 absent source_packet does not invent stricter identity failure',()=>{
  const out=evaluate(row({source_packet:null}));
  assert.equal(out.validation,'passed');
  assert.equal(out.sourcePacket,null);
});

test('29 malformed/null input -> safe fail closed, no escaping throw',()=>{
  for(const input of [undefined,null,{},42,'bad']){
    const out=input===undefined
      ? evaluateCanonicalIdentificationCatalogAuthority()
      : evaluateCanonicalIdentificationCatalogAuthority(input);
    assertFailed(out);
  }
});

test('30 output is deeply immutable',()=>{
  const out=evaluate();
  assert.equal(Object.isFrozen(out),true);
  assert.equal(Object.isFrozen(out.reasons),true);
  assert.throws(()=>{out.commonName='changed';},TypeError);
  assert.throws(()=>{out.reasons.push('x');},TypeError);
});

test('lineage preserves catalog_version source_packet and shared provenance sourceId',()=>{
  const out=evaluate();
  assert.equal(out.catalogVersion,'catalog-test-v7');
  assert.equal(out.sourcePacket,'packet-test-1');
  assert.equal(out.provenanceSourceId,'source-1');
});

test('positive scientific display name comes exactly from catalog scientific_name',()=>{
  const resolution=resolutionForMonstera({scientificName:'Wrong diagnostics'});
  const out=evaluate(row({scientific_name:'Monstera deliciosa'}),'en',resolution);
  assert.equal(out.scientificName,'Monstera deliciosa');
});

test('invalid requested locale token falls back only to unambiguous English',()=>{
  const out=evaluate(row({common_names:{en:'Swiss cheese plant'}}),'***');
  assert.equal(out.validation,'passed');
  assert.equal(out.requestedLocale,null);
  assert.equal(out.resolvedDisplayLocale,'en');
  assert.equal(out.localeFallback,true);
});
