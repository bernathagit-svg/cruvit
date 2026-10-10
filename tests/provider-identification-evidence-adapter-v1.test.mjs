import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptProviderIdentificationEvidence } from '../modules/plant-identifier/provider-identification-evidence-adapter-v1.js';
import { createCanonicalIdentificationRuntimeOrchestrator } from '../modules/plant-identifier/canonical-identification-runtime-orchestrator-v1.js';
import { createCanonicalIdentificationResolutionAdapter } from '../modules/plant-identifier/canonical-identification-resolution-adapter-v1.js';
import { createCanonicalIdentificationCatalogReadAdapter } from '../modules/plant-identifier/canonical-identification-catalog-read-adapter-v1.js';

function verifiedCandidate(overrides={}){
  return {
    commonName:'Monstera',
    scientificName:'Monstera deliciosa',
    confidence:'medium',
    gbifVerified:true,
    gbifKey:'2877951',
    ...overrides
  };
}

function rawResponse(overrides={}){
  return {
    candidates:[verifiedCandidate()],
    identification:{scientificName:'Monstera deliciosa',commonName:'Monstera'},
    visualAnalysis:{leaf:'split'},
    care:{water:'moderate'},
    commonName:'Monstera',
    scientificName:'Monstera deliciosa',
    confidence:'medium',
    gbifVerified:true,
    ...overrides
  };
}

function monsteraRow(){
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
    source_packet:'monstera-semantic-audit-proposal-v1'
  };
}

function syntheticOrchestrator(){
  const resolver={
    resolve(input){
      if(input?.scientificName==='Monstera deliciosa'){
        return {
          status:'resolved_canonical',
          canonicalSlug:'monstera',
          matchedBy:'scientificName',
          needsReview:false,
          conflict:false,
          registryVersion:'test-v1'
        };
      }
      return {status:'unresolved',warnings:['not-in-registry'],registryVersion:'test-v1'};
    },
    getRegistryVersion(){return 'test-v1';}
  };
  const resolutionAdapter=createCanonicalIdentificationResolutionAdapter({resolver});
  const client={
    from(table){
      assert.equal(table,'catalog_plants');
      const q={
        select(){return q;},
        eq(column,value){assert.equal(column,'slug');q.slug=value;return q;},
        async limit(n){
          assert.equal(n,2);
          return q.slug==='monstera'
            ? {status:200,error:null,data:[monsteraRow()]}
            : {status:200,error:null,data:[]};
        }
      };
      return q;
    }
  };
  const catalogReadAdapter=createCanonicalIdentificationCatalogReadAdapter({client});
  return createCanonicalIdentificationRuntimeOrchestrator({resolutionAdapter,catalogReadAdapter});
}

function assertBlocked(out){
  assert.equal(out.status,'blocked');
  assert.deepEqual(out.signals,[]);
}

test('1 one verified candidate -> one taxonomy signal',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse());
  assert.equal(out.status,'accepted');
  assert.deepEqual(out.signals,[{source:'taxonomy_verified',kind:'scientific_name',value:'Monstera deliciosa'}]);
});

test('2 multiple verified candidates -> multiple signals in input order',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    candidates:[
      verifiedCandidate({scientificName:'Rosa canina'}),
      verifiedCandidate({scientificName:'Rosa gallica'})
    ]
  }));
  assert.deepEqual(out.signals,[
    {source:'taxonomy_verified',kind:'scientific_name',value:'Rosa canina'},
    {source:'taxonomy_verified',kind:'scientific_name',value:'Rosa gallica'}
  ]);
});

test('3 zero candidates -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({candidates:[]})));
});

test('4 missing candidate set -> blocked',()=>{
  const input=rawResponse();
  delete input.candidates;
  assertBlocked(adaptProviderIdentificationEvidence(input));
});

test('5 malformed candidate set -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({candidates:'bad'})));
});

test('6 malformed candidate object -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({candidates:[null]})));
});

test('7 candidate gbifVerified=false -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({
    candidates:[verifiedCandidate({gbifVerified:false})]
  })));
});

test('8 mixed verified + unverified set -> whole response blocked',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    candidates:[verifiedCandidate(),verifiedCandidate({scientificName:'Wrongus one',gbifVerified:false})]
  }));
  assertBlocked(out);
});

test('9 missing candidate scientificName -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({
    candidates:[verifiedCandidate({scientificName:''})]
  })));
});

test('10 common-name-only candidate -> blocked',()=>{
  assertBlocked(adaptProviderIdentificationEvidence(rawResponse({
    candidates:[{commonName:'Monstera',gbifVerified:true}]
  })));
});

test('11 top-level scientificName cannot become authority',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    scientificName:'Wrongus ficticius',
    candidates:[verifiedCandidate({scientificName:'Monstera deliciosa'})]
  }));
  assert.equal(out.signals[0].value,'Monstera deliciosa');
  assert.notEqual(out.signals[0].value,'Wrongus ficticius');
});

test('12 top-level commonName cannot become authority',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({commonName:'Wrong top-level'}));
  assert.equal(out.signals[0].value,'Monstera deliciosa');
});

test('13 top-level gbifVerified=true cannot rescue unverified candidate',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    gbifVerified:true,
    candidates:[verifiedCandidate({gbifVerified:false})]
  }));
  assertBlocked(out);
});

test('14 high top-level confidence cannot create authority without verified candidate',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({confidence:'high',candidates:[]}));
  assertBlocked(out);
});

test('15 confidence low/high produces identical authority signals',()=>{
  const low=adaptProviderIdentificationEvidence(rawResponse({
    confidence:'low',
    candidates:[verifiedCandidate({confidence:'low'})]
  }));
  const high=adaptProviderIdentificationEvidence(rawResponse({
    confidence:'high',
    candidates:[verifiedCandidate({confidence:'high'})]
  }));
  assert.deepEqual(low.signals,high.signals);
});

test('16 caller canonicalSlug ignored',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({canonicalSlug:'monstera',candidates:[]}));
  assertBlocked(out);
  assert.equal('canonicalSlug' in out,false);
});

test('17 caller identityConfirmed ignored',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({identityConfirmed:true,candidates:[]}));
  assertBlocked(out);
  assert.equal('identityConfirmed' in out,false);
});

test('18 caller saveEligible ignored',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({saveEligible:true,candidates:[]}));
  assertBlocked(out);
  assert.equal('saveEligible' in out,false);
});

test('19 raw identification identity fields remain diagnostic only',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    identification:{scientificName:'Wrongus providerus',commonName:'Wrong Common'}
  }));
  assert.equal(out.signals[0].value,'Monstera deliciosa');
  assert.equal(out.providerEvidence.data.identification.scientificName,'Wrongus providerus');
});

test('20 visualAnalysis retained only under diagnostic provider evidence',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({visualAnalysis:{leafShape:'lobed'}}));
  assert.equal(out.providerEvidence.canonicalAuthority,false);
  assert.deepEqual(out.providerEvidence.data.visualAnalysis,{leafShape:'lobed'});
  assert.equal('visualAnalysis' in out,false);
});

test('21 care retained only under diagnostic provider evidence',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({care:{water:'weekly'}}));
  assert.equal(out.providerEvidence.uiCertified,false);
  assert.deepEqual(out.providerEvidence.data.care,{water:'weekly'});
  assert.equal('care' in out,false);
});

test('22 imageBase64 excluded from diagnostics',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({imageBase64:'SECRET_IMAGE_BYTES'}));
  assert.equal(JSON.stringify(out).includes('SECRET_IMAGE_BYTES'),false);
});

test('23 imageDataUrl excluded from diagnostics',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({imageDataUrl:'data:image/jpeg;base64,SECRET'}));
  assert.equal(JSON.stringify(out).includes('data:image/jpeg'),false);
});

test('24 photo/blob/file-like nested fields excluded',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    visualAnalysis:{photo:'PHOTO',nested:{blob:'BLOB',file:'FILE',bytes:'BYTES',exif:{gps:'x'}}}
  }));
  const json=JSON.stringify(out);
  for(const secret of ['PHOTO','BLOB','FILE','BYTES','gps']) assert.equal(json.includes(secret),false);
});

test('25 failure response -> zero signals',()=>{
  const out=adaptProviderIdentificationEvidence({error:'failed',candidates:[]});
  assertBlocked(out);
});

test('26 TAXONOMY_VERIFICATION_FAILED -> zero signals',()=>{
  const out=adaptProviderIdentificationEvidence({
    code:'TAXONOMY_VERIFICATION_FAILED',
    error:'Taxonomy verification failed.',
    candidates:[verifiedCandidate()]
  });
  assertBlocked(out);
  assert.equal(out.reason,'TAXONOMY_VERIFICATION_FAILED');
});

test('27 non-verified top-level identity data never emits a signal',()=>{
  const out=adaptProviderIdentificationEvidence({
    scientificName:'Monstera deliciosa',
    commonName:'Monstera',
    gbifVerified:true,
    confidence:'high',
    candidates:[]
  });
  assertBlocked(out);
});

test('28 duplicate verified scientific names are preserved for PI-PROV-2 dedupe',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    candidates:[verifiedCandidate(),verifiedCandidate()]
  }));
  assert.equal(out.signals.length,2);
  assert.equal(out.signals[0].value,out.signals[1].value);
});

test('29 provider evidence carries explicit non-authority markers',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse());
  assert.equal(out.providerEvidence.authority,false);
  assert.equal(out.providerEvidence.canonicalAuthority,false);
  assert.equal(out.providerEvidence.uiCertified,false);
  assert.equal(out.providerEvidence.scope,'provider_evidence_only');
});

test('30 output has no direct canonical fields',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    canonicalSlug:'monstera',
    plantId:'p1',
    identityConfirmed:true,
    saveEligible:true
  }));
  for(const key of ['canonicalSlug','plantId','identityConfirmed','saveEligible','commonName','scientificName']){
    assert.equal(Object.prototype.hasOwnProperty.call(out,key),false);
  }
});

test('31 anti-bypass fields are removed from nested diagnostic objects',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse({
    identification:{canonicalSlug:'monstera',plantId:'p1',identityConfirmed:true,saveEligible:true,scientificName:'Provider sci'}
  }));
  assert.equal(out.providerEvidence.data.identification.canonicalSlug,undefined);
  assert.equal(out.providerEvidence.data.identification.plantId,undefined);
  assert.equal(out.providerEvidence.data.identification.identityConfirmed,undefined);
  assert.equal(out.providerEvidence.data.identification.saveEligible,undefined);
  assert.equal(out.providerEvidence.data.identification.scientificName,'Provider sci');
});

test('32 output deeply immutable',()=>{
  const out=adaptProviderIdentificationEvidence(rawResponse());
  assert.equal(Object.isFrozen(out),true);
  assert.equal(Object.isFrozen(out.signals),true);
  assert.equal(Object.isFrozen(out.signals[0]),true);
  assert.equal(Object.isFrozen(out.providerEvidence),true);
  assert.throws(()=>{out.signals.push({});},TypeError);
});

test('33 adapter does not mutate caller input',()=>{
  const input=rawResponse();
  const before=JSON.stringify(input);
  adaptProviderIdentificationEvidence(input);
  assert.equal(JSON.stringify(input),before);
});

test('34 malformed top-level input fails closed',()=>{
  for(const input of [null,undefined,42,'bad',[]]) assertBlocked(adaptProviderIdentificationEvidence(input));
});

test('35 no network/provider/DB APIs in module',async()=>{
  const fs=await import('node:fs');
  const src=fs.readFileSync(new URL('../modules/plant-identifier/provider-identification-evidence-adapter-v1.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\bfetch\s*\(|\bcreateClient\b|process\.env|\.from\s*\(|\.rpc\s*\(|api\.anthropic\.com|api\.gbif\.org|supabase\.co/i);
  assert.doesNotMatch(src,/^\s*import\s+/m);
});

test('36 synthetic 5D -> 5C success composition identifies Monstera',async()=>{
  const adapted=adaptProviderIdentificationEvidence(rawResponse({
    scientificName:'Wrongus top-level',
    candidates:[verifiedCandidate({scientificName:'Monstera deliciosa'})]
  }));
  const result=await syntheticOrchestrator().identify({
    signals:adapted.signals,
    locale:'en',
    providerEvidence:adapted.providerEvidence
  });
  assert.equal(result.result.status,'identified');
  assert.equal(result.result.canonicalSlug,'monstera');
  assert.equal(result.result.scientificName,'Monstera deliciosa');
  assert.equal(result.result.commonName,'Monstera');
  assert.equal(result.result.identityConfirmed,true);
  assert.equal(result.result.saveEligible,true);
});

test('37 synthetic anti-bypass 5D -> 5C remains non-saveable',async()=>{
  const adapted=adaptProviderIdentificationEvidence({
    canonicalSlug:'monstera',
    identityConfirmed:true,
    saveEligible:true,
    scientificName:'Monstera deliciosa',
    gbifVerified:true,
    confidence:'high',
    candidates:[verifiedCandidate({gbifVerified:false})]
  });
  assertBlocked(adapted);
  const result=await syntheticOrchestrator().identify({
    signals:adapted.signals,
    providerEvidence:adapted.providerEvidence
  });
  assert.equal(result.result.identityConfirmed,false);
  assert.equal(result.result.saveEligible,false);
  assert.equal(result.result.canonicalSlug,null);
});

test('38 confidence isolation holds through downstream 5C result',async()=>{
  const low=adaptProviderIdentificationEvidence(rawResponse({
    confidence:'low',
    candidates:[verifiedCandidate({confidence:'low'})]
  }));
  const high=adaptProviderIdentificationEvidence(rawResponse({
    confidence:'high',
    candidates:[verifiedCandidate({confidence:'high'})]
  }));
  const lowResult=await syntheticOrchestrator().identify({signals:low.signals,providerEvidence:low.providerEvidence});
  const highResult=await syntheticOrchestrator().identify({signals:high.signals,providerEvidence:high.providerEvidence});
  for(const key of ['status','canonicalSlug','scientificName','commonName','identityConfirmed','saveEligible']){
    assert.equal(lowResult.result[key],highResult.result[key]);
  }
});
