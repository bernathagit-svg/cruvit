import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_IDENTITY_SELECT,
  CATALOG_IDENTITY_SELECT_FIELDS,
  createCanonicalIdentificationCatalogReadAdapter
} from '../modules/plant-identifier/canonical-identification-catalog-read-adapter-v1.js';
import { evaluateCanonicalIdentificationCatalogAuthority } from '../modules/plant-identifier/canonical-identification-catalog-authority-v1.js';
import { createCanonicalIdentificationResult } from '../modules/plant-identifier/canonical-identification-result-v1.js';

function canonicalRow(overrides={}){
  return {
    slug:'monstera',
    scientific_name:'Monstera deliciosa',
    common_names:{en:'Swiss cheese plant'},
    provenance:[{
      sourceId:'source-1',
      plantIdentity:{canonicalSlug:'monstera',acceptedScientificName:'Monstera deliciosa'},
      assertedClaims:[{field:'scientific',status:'asserted'}]
    }],
    needs_review:false,
    verification_state:'verified',
    catalog_version:'catalog-test-v1',
    source_packet:'packet-test-1',
    ...overrides
  };
}

function makeClient(responseOrFactory){
  const calls={
    from:0,
    select:0,
    eq:0,
    limit:0,
    insert:0,
    update:0,
    upsert:0,
    delete:0,
    rpc:0,
    storage:0,
    authMutation:0
  };
  const seen={table:null,select:null,eqColumn:null,eqValue:null,limit:null};
  const writes={
    insert(){calls.insert++;throw new Error('write forbidden');},
    update(){calls.update++;throw new Error('write forbidden');},
    upsert(){calls.upsert++;throw new Error('write forbidden');},
    delete(){calls.delete++;throw new Error('write forbidden');}
  };
  const client={
    from(table){
      calls.from++;
      seen.table=table;
      const builder={
        ...writes,
        select(fields){
          calls.select++;
          seen.select=fields;
          return builder;
        },
        eq(column,value){
          calls.eq++;
          seen.eqColumn=column;
          seen.eqValue=value;
          return builder;
        },
        async limit(n){
          calls.limit++;
          seen.limit=n;
          if(typeof responseOrFactory==='function') return responseOrFactory({calls,seen});
          return responseOrFactory;
        }
      };
      return builder;
    },
    rpc(){calls.rpc++;throw new Error('rpc forbidden');}
  };
  return {client,calls,seen};
}

function assertReadOnly(calls){
  assert.equal(calls.insert,0);
  assert.equal(calls.update,0);
  assert.equal(calls.upsert,0);
  assert.equal(calls.delete,0);
  assert.equal(calls.rpc,0);
  assert.equal(calls.storage,0);
  assert.equal(calls.authMutation,0);
}

test('1 exactly one matching row -> found',async()=>{
  const {client,calls}=makeClient({status:200,error:null,data:[canonicalRow()]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'found');
  assert.equal(out.rowCount,1);
  assert.equal(out.row.slug,'monstera');
  assert.equal(out.authority,'public.catalog_plants');
  assert.equal(out.readOnly,true);
  assertReadOnly(calls);
});

test('2 zero rows -> missing',async()=>{
  const {client}=makeClient({status:200,error:null,data:[]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'missing');
  assert.equal(out.row,null);
  assert.equal(out.rowCount,0);
});

test('3 two rows -> duplicate',async()=>{
  const {client}=makeClient({status:200,error:null,data:[canonicalRow(),canonicalRow()]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'duplicate');
  assert.equal(out.row,null);
  assert.equal(out.rowCount,2);
});

test('4 more than two simulated rows -> bounded response inconsistency fail closed',async()=>{
  const {client}=makeClient({status:200,error:null,data:[canonicalRow(),canonicalRow(),canonicalRow()]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'error');
  assert.equal(out.reason,'BOUNDED_READ_INCONSISTENT');
  assert.equal(out.row,null);
  assert.equal(out.rowCount,3);
});

test('5 query error object -> error',async()=>{
  const stale=canonicalRow();
  const {client}=makeClient({status:400,error:{message:'synthetic'},data:[stale]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'error');
  assert.equal(out.row,null);
  assert.equal(out.reason,'CATALOG_READ_ERROR');
});

test('6 thrown client error -> error',async()=>{
  const calls={from:0};
  const client={from(){calls.from++;throw new Error('synthetic transport failure');}};
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'error');
  assert.equal(out.row,null);
  assert.equal(out.reason,'CATALOG_READ_EXCEPTION');
  assert.equal(calls.from,1);
});

test('7 malformed response -> error',async()=>{
  for(const response of [null,[],{status:200,error:null,data:null},{status:206,error:null,data:[]} ]){
    const {client}=makeClient(response);
    const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
    assert.equal(out.status,'error');
    assert.equal(out.row,null);
  }
});

test('8 one row with mismatching slug -> fail closed',async()=>{
  const {client}=makeClient({status:200,error:null,data:[canonicalRow({slug:'other'})]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'error');
  assert.equal(out.reason,'CATALOG_SLUG_READBACK_MISMATCH');
  assert.equal(out.row,null);
});

test('9 empty canonicalSlug -> invalid_input and zero query calls',async()=>{
  const {client,calls}=makeClient({status:200,error:null,data:[canonicalRow()]});
  const adapter=createCanonicalIdentificationCatalogReadAdapter({client});
  for(const value of ['', '   ']){
    const out=await adapter.readByCanonicalSlug(value);
    assert.equal(out.status,'invalid_input');
  }
  assert.equal(calls.from,0);
  assert.equal(calls.select,0);
  assert.equal(calls.eq,0);
  assert.equal(calls.limit,0);
  assertReadOnly(calls);
});

test('10 malformed canonicalSlug -> invalid_input and zero query calls',async()=>{
  const {client,calls}=makeClient({status:200,error:null,data:[canonicalRow()]});
  const adapter=createCanonicalIdentificationCatalogReadAdapter({client});
  for(const value of [null,undefined,42,{},[],true]){
    const out=await adapter.readByCanonicalSlug(value);
    assert.equal(out.status,'invalid_input');
  }
  assert.equal(calls.from,0);
  assert.equal(calls.select,0);
  assert.equal(calls.eq,0);
  assert.equal(calls.limit,0);
});

test('11 query selects only approved identity fields',async()=>{
  const {client,seen}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.deepEqual([...CATALOG_IDENTITY_SELECT_FIELDS],[
    'slug','scientific_name','common_names','provenance','needs_review','verification_state','catalog_version','source_packet'
  ]);
  assert.equal(seen.select,CATALOG_IDENTITY_SELECT);
  assert.equal(seen.select,'slug,scientific_name,common_names,provenance,needs_review,verification_state,catalog_version,source_packet');
});

test('12 query table is exactly catalog_plants',async()=>{
  const {client,seen}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(seen.table,'catalog_plants');
});

test('13 exact slug filter is used',async()=>{
  const {client,seen}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(seen.eqColumn,'slug');
  assert.equal(seen.eqValue,'monstera');
});

test('14 query is bounded to max 2 rows',async()=>{
  const {client,seen}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(seen.limit,2);
});

test('15 no write-capable client method is invoked',async()=>{
  const {client,calls}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assertReadOnly(calls);
});

test('16 returned found row is deeply frozen',async()=>{
  const source=canonicalRow();
  const {client}=makeClient({status:200,error:null,data:[source]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(Object.isFrozen(out),true);
  assert.equal(Object.isFrozen(out.row),true);
  assert.equal(Object.isFrozen(out.row.common_names),true);
  assert.equal(Object.isFrozen(out.row.provenance),true);
  assert.equal(Object.isFrozen(out.row.provenance[0]),true);
});

test('17 caller mutation cannot alter returned evidence or source can no longer mutate it',async()=>{
  const source=canonicalRow();
  const {client}=makeClient({status:200,error:null,data:[source]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  source.common_names.en='Source mutated';
  assert.equal(out.row.common_names.en,'Swiss cheese plant');
  assert.throws(()=>{out.row.common_names.en='Caller mutated';},TypeError);
  assert.equal(out.row.common_names.en,'Swiss cheese plant');
});

test('18 duplicate result never exposes one duplicate row as authority',async()=>{
  const a=canonicalRow({catalog_version:'a'});
  const b=canonicalRow({catalog_version:'b'});
  const {client}=makeClient({status:200,error:null,data:[a,b]});
  const out=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(out.status,'duplicate');
  assert.equal(out.row,null);
  assert.equal(out.reason,'DUPLICATE_CANONICAL_ROWS');
});

test('19 missing/error never exposes stale/mock row data',async()=>{
  const stale=canonicalRow({catalog_version:'stale'});
  const missing=makeClient({status:200,error:null,data:[]});
  const missingOut=await createCanonicalIdentificationCatalogReadAdapter({client:missing.client}).readByCanonicalSlug('monstera');
  assert.equal(missingOut.row,null);
  const errored=makeClient({status:500,error:{message:'x'},data:[stale]});
  const errorOut=await createCanonicalIdentificationCatalogReadAdapter({client:errored.client}).readByCanonicalSlug('monstera');
  assert.equal(errorOut.row,null);
});

test('20 multiple sequential reads do not leak state between requests',async()=>{
  let n=0;
  const {client}=makeClient(()=>{
    n++;
    return n===1
      ? {status:200,error:null,data:[canonicalRow({catalog_version:'first'})]}
      : {status:200,error:null,data:[]};
  });
  const adapter=createCanonicalIdentificationCatalogReadAdapter({client});
  const first=await adapter.readByCanonicalSlug('monstera');
  const second=await adapter.readByCanonicalSlug('monstera');
  assert.equal(first.status,'found');
  assert.equal(first.row.catalog_version,'first');
  assert.equal(second.status,'missing');
  assert.equal(second.row,null);
});

test('query-call accounting is exactly from/select/eq/limit once for valid read',async()=>{
  const {client,calls}=makeClient({status:200,error:null,data:[canonicalRow()]});
  await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.deepEqual(
    {from:calls.from,select:calls.select,eq:calls.eq,limit:calls.limit},
    {from:1,select:1,eq:1,limit:1}
  );
  assertReadOnly(calls);
});

test('compatibility: found.row -> PI-PROV-3B -> PI-PROV-1 identified/saveEligible',async()=>{
  const {client}=makeClient({status:200,error:null,data:[canonicalRow()]});
  const read=await createCanonicalIdentificationCatalogReadAdapter({client}).readByCanonicalSlug('monstera');
  assert.equal(read.status,'found');

  const resolution={
    status:'resolved_canonical',
    canonicalSlug:'monstera',
    plantId:null,
    matchedBy:'scientificName',
    needsReview:false,
    conflictActive:false
  };
  const catalog=evaluateCanonicalIdentificationCatalogAuthority({
    resolution,
    catalogRow:read.row,
    locale:'en'
  });
  assert.equal(catalog.validation,'passed');

  const result=createCanonicalIdentificationResult({
    status:'identified',
    resolution,
    catalog
  });
  assert.equal(result.status,'identified');
  assert.equal(result.identityConfirmed,true);
  assert.equal(result.saveEligible,true);
  assert.equal(result.canonicalSlug,'monstera');
  assert.equal(result.scientificName,'Monstera deliciosa');
  assert.equal(result.commonName,'Swiss cheese plant');
});
