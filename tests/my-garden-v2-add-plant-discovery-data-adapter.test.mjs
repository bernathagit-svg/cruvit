import test from 'node:test';
import assert from 'node:assert/strict';
import { createAddPlantDiscoveryDataAdapter } from '../modules/my-garden-v2/add-plant-discovery-data-adapter.js';

class Query {
  constructor(rows) {
    this.rows=rows;
    this.slug=null;
  }
  select(){ return this; }
  eq(column,value){ if(column==='slug') this.slug=value; return this; }
  or(){ return this; }
  limit(){ return this; }
  async maybeSingle(){
    const row=this.rows.find((x)=>x.slug===this.slug) ?? null;
    return {data:row,error:null};
  }
  then(resolve){
    return Promise.resolve({data:this.rows,error:null}).then(resolve);
  }
}

function fakeSupabase(rows){
  return {
    from(table){
      if(table!=='catalog_plants') throw new Error('unexpected_table:'+table);
      return new Query(rows);
    }
  };
}

const rows=[
  {
    id:'c1',
    slug:'pineapple',
    scientific_name:'Ananas comosus',
    common_names:{en:'Pineapple'},
    verification_state:'verified',
    needs_review:false,
    media:{},
  },
  {
    id:'c2',
    slug:'mango',
    scientific_name:'Mangifera indica',
    common_names:{en:'Mango'},
    verification_state:'needsReview',
    needs_review:true,
    media:{},
  },
];

test('search returns only verified catalog candidates', async()=>{
  const adapter=createAddPlantDiscoveryDataAdapter(fakeSupabase(rows));
  const vm=await adapter.search('p');
  assert.deepEqual(vm.search.map((x)=>x.slug),['pineapple']);
});

test('suggestion slug missing from catalog is dropped, never substituted', async()=>{
  const adapter=createAddPlantDiscoveryDataAdapter(fakeSupabase(rows));
  const vm=await adapter.suggestions(['banana','pineapple']);
  assert.deepEqual(vm.suggestions.map((x)=>x.slug),['pineapple']);
});

test('needs-review catalog row cannot enter Add Plant verified discovery', async()=>{
  const adapter=createAddPlantDiscoveryDataAdapter(fakeSupabase(rows));
  const vm=await adapter.suggestions(['mango']);
  assert.deepEqual(vm.suggestions,[]);
});

test('Popular for your area is gated by location reliability before reads matter', async()=>{
  const adapter=createAddPlantDiscoveryDataAdapter(fakeSupabase(rows));
  const vm=await adapter.popularForArea(['pineapple'],{locationReliability:'unknown'});
  assert.equal(vm.popularForAreaAvailable,false);
  assert.deepEqual(vm.popularForArea,[]);
});

test('selection still requires explicit Add confirmation and has no Plant Instance ID', async()=>{
  const adapter=createAddPlantDiscoveryDataAdapter(fakeSupabase(rows));
  const vm=await adapter.suggestions(['pineapple']);
  const selection=adapter.select(vm.suggestions[0]);
  assert.equal(selection.canonicalSlug,'pineapple');
  assert.equal(selection.gardenPlantId,null);
  assert.equal(selection.requiresExplicitAddConfirmation,true);
});
