import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanonicalIdentificationRuntimeOrchestrator } from '../modules/plant-identifier/canonical-identification-runtime-orchestrator-v1.js';
import { createCanonicalIdentificationResolutionAdapter } from '../modules/plant-identifier/canonical-identification-resolution-adapter-v1.js';
import { createCanonicalIdentificationCatalogReadAdapter } from '../modules/plant-identifier/canonical-identification-catalog-read-adapter-v1.js';

function signal(value='Monstera deliciosa'){
  return {source:'taxonomy_verified',kind:'scientific_name',value};
}

function monsteraRow(overrides={}){
  return {
    slug:'monstera',
    scientific_name:'Monstera deliciosa',
    common_names:{en:'Monstera'},
    provenance:[{
      sourceId:'ncsu-monstera-deliciosa',
      plantIdentity:{canonicalSlug:'monstera',acceptedScientificName:'Monstera deliciosa'},
      assertedClaims:[{claimId:'monstera-identity-scientific',field:'scientific',status:'asserted'}]
    }],
    needs_review:false,
    verification_state:'verified',
    catalog_version:'1.0.0',
    source_packet:'monstera-semantic-audit-proposal-v1',
    ...overrides
  };
}

function resolverFor(map={}){
  let calls=0;
  return {
    get calls(){return calls;},
    resolve(input){
      calls++;
      const sci=input?.scientificName;
      if(Object.prototype.hasOwnProperty.call(map,sci)){
        const value=map[sci];
        if(value instanceof Error) throw value;
        return typeof value==='function'?value(input):value;
      }
      return {status:'unresolved',matchedBy:null,warnings:['not-in-registry'],registryVersion:'test-v1'};
    },
    getRegistryVersion(){return 'test-v1';}
  };
}

function positiveResolver(slug='monstera',extras={}){
  return resolverFor({
    'Monstera deliciosa':{
      status:'resolved_canonical',
      canonicalSlug:slug,
      matchedBy:'scientificName',
      needsReview:false,
      conflict:false,
      registryVersion:'test-v1',
      ...extras
    }
  });
}

function fakeClient(responseOrFactory){
  const calls={from:0,select:0,eq:0,limit:0};
  const client={
    from(table){
      calls.from++;
      assert.equal(table,'catalog_plants');
      const q={
        select(){
          calls.select++;
          return q;
        },
        eq(column,value){
          calls.eq++;
          assert.equal(column,'slug');
          q.slug=value;
          return q;
        },
        async limit(n){
          calls.limit++;
          assert.equal(n,2);
          return typeof responseOrFactory==='function'?responseOrFactory(q.slug):responseOrFactory;
        }
      };
      return q;
    }
  };
  return {client,calls};
}

function actualChain({resolver=positiveResolver(),response={status:200,error:null,data:[monsteraRow()]}}={}){
  const resolutionAdapter=createCanonicalIdentificationResolutionAdapter({resolver});
  const fc=fakeClient(response);
  const catalogReadAdapter=createCanonicalIdentificationCatalogReadAdapter({client:fc.client});
  const orchestrator=createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter,catalogReadAdapter});
  return {orchestrator,resolver,readCalls:fc.calls};
}

function fakeResolution(result){
  let calls=0;
  return {
    get calls(){return calls;},
    resolve(){calls++;return typeof result==='function'?result():result;}
  };
}

function fakeRead(result){
  let calls=0;
  return {
    get calls(){return calls;},
    async readByCanonicalSlug(slug){
      calls++;
      if(result instanceof Error) throw result;
      return typeof result==='function'?result(slug):result;
    }
  };
}

function assertNonSaveable(out){
  assert.equal(out.result.identityConfirmed,false);
  assert.equal(out.result.saveEligible,false);
  assert.equal(out.result.canonicalSlug,null);
  assert.equal(out.result.scientificName,null);
  assert.equal(out.result.commonName,null);
}

test('1 valid taxonomy -> PI-PROV-2 -> PI-PROV-4A -> PI-PROV-3B -> PI-PROV-1 identified',async()=>{
  const {orchestrator,readCalls}=actualChain();
  const out=await orchestrator.identify({
    signals:[signal()],
    locale:'en',
    providerEvidence:{commonName:'Provider Monstera',scientificName:'Wrong provider name',confidence:'high'}
  });
  assert.equal(out.result.status,'identified');
  assert.equal(out.result.canonicalSlug,'monstera');
  assert.equal(out.result.scientificName,'Monstera deliciosa');
  assert.equal(out.result.commonName,'Monstera');
  assert.equal(out.result.identityConfirmed,true);
  assert.equal(out.result.saveEligible,true);
  assert.equal(readCalls.limit,1);
  assert.equal(out.diagnostics.stage,'complete');
});

test('2 no taxonomy signal -> non-saveable and zero catalog reads',async()=>{
  const {orchestrator,readCalls}=actualChain();
  const out=await orchestrator.identify({signals:[]});
  assertNonSaveable(out);
  assert.equal(readCalls.limit,0);
});

test('3 unauthorized provider signal namespace is rejected by PI-PROV-2',async()=>{
  const resolver=positiveResolver();
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[{source:'provider',kind:'scientific_name',value:'Monstera deliciosa'}]});
  assertNonSaveable(out);
  assert.equal(resolver.calls,0);
  assert.equal(readCalls.limit,0);
});

test('4 provider common-name signal cannot become resolver authority',async()=>{
  const resolver=positiveResolver();
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[{source:'taxonomy_verified',kind:'common_name',value:'Monstera'}]});
  assertNonSaveable(out);
  assert.equal(resolver.calls,0);
  assert.equal(readCalls.limit,0);
});

test('5 high provider confidence cannot rescue missing authoritative taxonomy',async()=>{
  const {orchestrator,readCalls}=actualChain();
  const out=await orchestrator.identify({signals:[],providerEvidence:{confidence:'high',scientificName:'Monstera deliciosa'}});
  assertNonSaveable(out);
  assert.equal(readCalls.limit,0);
});

test('6 resolver unresolved -> zero catalog reads',async()=>{
  const resolver=resolverFor({'Unknown species':{status:'unresolved',matchedBy:null,warnings:['not-in-registry']}});
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[signal('Unknown species')]});
  assertNonSaveable(out);
  assert.equal(readCalls.limit,0);
});

test('7 resolver provisional/not-in-registry collapses unresolved -> zero catalog reads',async()=>{
  const resolver=resolverFor({'Unknown species':{status:'provisional',canonicalSlug:'unknown',matchedBy:'scientificName',warnings:['not-in-registry']}});
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[signal('Unknown species')]});
  assertNonSaveable(out);
  assert.equal(out.result.resolution.status,'unresolved');
  assert.equal(readCalls.limit,0);
});

test('8 resolver ambiguous -> zero catalog reads',async()=>{
  const ra=fakeResolution({status:'ambiguous',canonicalSlug:null,needsReview:false,conflictActive:false});
  const rd=fakeRead({status:'found',rowCount:1,row:monsteraRow()});
  const out=await createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter:ra,catalogReadAdapter:rd}).identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.result.status,'ambiguous');
  assert.equal(rd.calls,0);
});

test('9 resolver conflict -> zero catalog reads',async()=>{
  const ra=fakeResolution({status:'pending_conflict',canonicalSlug:null,needsReview:true,conflictActive:true});
  const rd=fakeRead({status:'found',rowCount:1,row:monsteraRow()});
  const out=await createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter:ra,catalogReadAdapter:rd}).identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.result.status,'blocked');
  assert.equal(rd.calls,0);
});

test('10 resolved but needsReview -> zero catalog reads',async()=>{
  const ra=fakeResolution({status:'resolved_canonical',canonicalSlug:'monstera',needsReview:true,conflictActive:false});
  const rd=fakeRead({status:'found',rowCount:1,row:monsteraRow()});
  const out=await createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter:ra,catalogReadAdapter:rd}).identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.result.status,'needs_confirmation');
  assert.equal(rd.calls,0);
});

test('11 positive resolution causes exactly one catalog read',async()=>{
  const {orchestrator,readCalls}=actualChain();
  await orchestrator.identify({signals:[signal()]});
  assert.deepEqual(readCalls,{from:1,select:1,eq:1,limit:1});
});

test('12 catalog missing -> non-saveable',async()=>{
  const {orchestrator,readCalls}=actualChain({response:{status:200,error:null,data:[]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.diagnostics.stage,'catalog_read');
  assert.equal(readCalls.limit,1);
});

test('13 catalog duplicate -> non-saveable conflict/read failure',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[monsteraRow(),monsteraRow()]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.diagnostics.data.status,'duplicate');
});

test('14 catalog error -> non-saveable',async()=>{
  const {orchestrator}=actualChain({response:{status:500,error:{message:'synthetic'},data:null}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.diagnostics.data.status,'error');
});

test('15 catalog malformed response -> non-saveable',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:null}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
});

test('16 catalog slug readback mismatch through PI-PROV-4A -> non-saveable',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[monsteraRow({slug:'other'})]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.diagnostics.data.reason,'CATALOG_SLUG_READBACK_MISMATCH');
});

test('17 resolution/catalog slug mismatch from malformed injected read dependency -> blocked',async()=>{
  const ra=fakeResolution({status:'resolved_canonical',canonicalSlug:'monstera',matchedBy:'scientificName',needsReview:false,conflictActive:false});
  const rd=fakeRead({status:'found',rowCount:1,row:monsteraRow({slug:'other'})});
  const out=await createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter:ra,catalogReadAdapter:rd}).identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.ok(out.result.reasons.includes('catalog_validation_not_passed'));
});

test('18 catalog identity authority missing provenance -> blocked',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[monsteraRow({provenance:[]})]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.result.status,'blocked');
});

test('19 catalog needsReview -> blocked/non-saveable',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[monsteraRow({needs_review:true})]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
});

test('20 missing canonical common name -> blocked',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[monsteraRow({common_names:{}})]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
});

test('21 missing scientific identity authority -> blocked',async()=>{
  const row=monsteraRow({scientific_name:'',provenance:[]});
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[row]}});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
});

test('22 locale en selects catalog English name',async()=>{
  const {orchestrator}=actualChain();
  const out=await orchestrator.identify({signals:[signal()],locale:'en'});
  assert.equal(out.result.commonName,'Monstera');
  assert.equal(out.diagnostics.data.resolvedDisplayLocale,'en');
  assert.equal(out.diagnostics.data.localeFallback,false);
});

test('23 non-English locale falls back only to catalog English',async()=>{
  const {orchestrator}=actualChain();
  const out=await orchestrator.identify({signals:[signal()],locale:'he-IL'});
  assert.equal(out.result.commonName,'Monstera');
  assert.equal(out.diagnostics.data.resolvedDisplayLocale,'en');
  assert.equal(out.diagnostics.data.localeFallback,true);
});

test('24 provider confidence does not alter canonical success result',async()=>{
  const a=actualChain().orchestrator;
  const b=actualChain().orchestrator;
  const low=await a.identify({signals:[signal()],providerEvidence:{confidence:'low',scientificName:'Wrong low'}});
  const high=await b.identify({signals:[signal()],providerEvidence:{confidence:'high',scientificName:'Wrong high'}});
  for(const key of ['status','canonicalSlug','scientificName','commonName','identityConfirmed','saveEligible']){
    assert.equal(low.result[key],high.result[key]);
  }
});

test('25 provider evidence remains diagnostic-only',async()=>{
  const {orchestrator}=actualChain();
  const providerEvidence={confidence:'high',commonName:'Wrong Common',scientificName:'Wrongus providerus',slug:'wrong'};
  const out=await orchestrator.identify({signals:[signal()],providerEvidence});
  assert.equal(out.result.canonicalSlug,'monstera');
  assert.equal(out.result.scientificName,'Monstera deliciosa');
  assert.equal(out.result.commonName,'Monstera');
  assert.equal(out.result.providerEvidence.scope,'provider_evidence_only');
  assert.equal(out.result.providerEvidence.uiCertified,false);
  assert.equal(out.result.providerEvidence.canonicalAuthority,false);
  assert.equal(out.result.providerEvidence.data.scientificName,'Wrongus providerus');
});

test('26 final envelope and wrapper are immutable',async()=>{
  const {orchestrator}=actualChain();
  const out=await orchestrator.identify({signals:[signal()]});
  assert.equal(Object.isFrozen(out),true);
  assert.equal(Object.isFrozen(out.result),true);
  assert.equal(Object.isFrozen(out.result.providerEvidence),true);
  assert.equal(Object.isFrozen(out.diagnostics),true);
  assert.throws(()=>{out.result.saveEligible=false;},TypeError);
});

test('27 malformed orchestrator input fails closed',async()=>{
  const {orchestrator,readCalls}=actualChain();
  for(const value of [null,42,'bad',[]]){
    const out=await orchestrator.identify(value);
    assertNonSaveable(out);
  }
  assert.equal(readCalls.limit,0);
});

test('28 thrown injected resolver dependency fails closed through PI-PROV-2 adapter',async()=>{
  const resolver=resolverFor({'Monstera deliciosa':new Error('synthetic resolver throw')});
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(out.result.resolution.status,'unresolved');
  assert.equal(readCalls.limit,0);
});

test('29 thrown catalog/read dependency does not produce identified result',async()=>{
  const ra=fakeResolution({status:'resolved_canonical',canonicalSlug:'monstera',matchedBy:'scientificName',needsReview:false,conflictActive:false});
  const rd=fakeRead(new Error('synthetic catalog throw'));
  const out=await createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter:ra,catalogReadAdapter:rd}).identify({signals:[signal()]});
  assertNonSaveable(out);
  assert.equal(rd.calls,1);
  assert.equal(out.diagnostics.code,'CATALOG_READ_DEPENDENCY_ERROR');
});

test('30 missing-catalog resolved species does not auto-create',async()=>{
  const resolver=resolverFor({'Rosa canina':{status:'resolved_canonical',canonicalSlug:'rose-dog',matchedBy:'scientificName',needsReview:false}});
  const {orchestrator,readCalls}=actualChain({resolver,response:{status:200,error:null,data:[]}});
  const out=await orchestrator.identify({signals:[signal('Rosa canina')]});
  assertNonSaveable(out);
  assert.equal(readCalls.limit,1);
});

test('31 unknown taxonomy signal unresolved -> null canonical and zero catalog reads',async()=>{
  const resolver=resolverFor({});
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[signal('Imaginaris unknownii')]});
  assertNonSaveable(out);
  assert.equal(out.result.canonicalSlug,null);
  assert.equal(readCalls.limit,0);
});

test('32 multiple authoritative signals preserve PI-PROV-2 ambiguity',async()=>{
  const resolver=resolverFor({
    'Monstera deliciosa':{status:'resolved_canonical',canonicalSlug:'monstera',matchedBy:'scientificName',needsReview:false},
    'Rosa canina':{status:'resolved_canonical',canonicalSlug:'rose-dog',matchedBy:'scientificName',needsReview:false}
  });
  const {orchestrator,readCalls}=actualChain({resolver});
  const out=await orchestrator.identify({signals:[signal('Monstera deliciosa'),signal('Rosa canina')]});
  assertNonSaveable(out);
  assert.equal(out.result.status,'ambiguous');
  assert.equal(readCalls.limit,0);
});

test('33 malicious caller identityConfirmed/saveEligible flags cannot bypass PI-PROV-1',async()=>{
  const {orchestrator}=actualChain({response:{status:200,error:null,data:[]}});
  const out=await orchestrator.identify({signals:[signal()],identityConfirmed:true,saveEligible:true,canonicalSlug:'monstera'});
  assertNonSaveable(out);
});

test('34 saveEligible true appears only on PI-PROV-1 successful gate',async()=>{
  const success=await actualChain().orchestrator.identify({signals:[signal()]});
  const failed=await actualChain({response:{status:200,error:null,data:[]}}).orchestrator.identify({signals:[signal()]});
  assert.equal(success.result.saveEligible,true);
  assert.equal(success.result.identityConfirmed,true);
  assert.equal(failed.result.saveEligible,false);
  assert.equal(failed.result.identityConfirmed,false);
});

test('35 no network/provider/DB globals are used by orchestrator module itself',async()=>{
  const src=await import('node:fs').then(fs=>fs.readFileSync(new URL('../modules/plant-identifier/canonical-identification-runtime-orchestrator-v1.js',import.meta.url),'utf8'));
  assert.doesNotMatch(src,/\bfetch\s*\(|anthropic|gbif|supabase|createClient|process\.env|\.from\s*\(|\.rpc\s*\(/i);
});
