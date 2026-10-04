import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlantOverviewDataAdapter } from '../modules/my-garden-v2/plant-overview-data-adapter.js';

class Query {
  constructor(table, data) {
    this.table=table;
    this.data=data;
    this.filters=[];
  }
  select(){ return this; }
  eq(column,value){ this.filters.push([column,value]); return this; }
  order(){ return this; }
  or(){ return this; }
  limit(){ return this; }
  async maybeSingle(){
    let data=this.data;
    if (Array.isArray(data)) {
      for (const [column,value] of this.filters) data=data.filter((row)=>row[column]===value);
      data=data[0] ?? null;
    }
    return {data,error:null};
  }
  then(resolve){
    let data=this.data;
    if (Array.isArray(data)) {
      for (const [column,value] of this.filters) data=data.filter((row)=>row[column]===value);
    }
    return Promise.resolve({data,error:null}).then(resolve);
  }
}

function fakeSupabase(fixtures){
  return {
    from(table){
      if (!(table in fixtures)) throw new Error('unexpected_table:'+table);
      return new Query(table,fixtures[table]);
    }
  };
}

const baseFixtures = () => ({
  garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
  garden_plants:[{
    id:'p1',
    garden_profile_id:'g1',
    name:'Pineapple',
    scientific:'Ananas comosus',
    profile_slug:'pineapple',
    archived:false,
  }],
  garden_areas:[],
  garden_tasks:[],
  garden_events:[],
  garden_media:[],
  catalog_plants:[{
    id:'c1',
    slug:'pineapple',
    scientific_name:'Ananas comosus',
    common_names:{en:'Pineapple'},
    aliases:[],
    climate_traits:{plantType:'Fruit plant',evergreen:true},
    flowering_requirements:null,
    fruiting_requirements:null,
    provenance:[],
    needs_review:false,
    verification_state:'verified',
    media:{},
    media_status:'IMAGE_READY',
    catalog_version:'1.0.0',
    source_packet:'pineapple-p1-review-closure-wave-a-v1',
  }],
});

test('Overview adapter uses exact verified catalog slug only', async () => {
  const adapter=createPlantOverviewDataAdapter(fakeSupabase(baseFixtures()));
  const result=await adapter.loadOverview('g1','p1');

  assert.equal(result.knowledgeResolution.available,true);
  assert.equal(result.knowledgeResolution.slug,'pineapple');
  assert.deepEqual(result.viewModel.tags,['Fruit plant','Evergreen']);
  assert.equal(result.viewModel.plant.id,'p1');
});

test('missing catalog slug keeps Overview truthful and usable', async () => {
  const fixtures=baseFixtures();
  fixtures.garden_plants[0].profile_slug='mango';
  fixtures.garden_plants[0].scientific='Mangifera indica';
  fixtures.catalog_plants=[];

  const adapter=createPlantOverviewDataAdapter(fakeSupabase(fixtures));
  const result=await adapter.loadOverview('g1','p1');

  assert.equal(result.knowledgeResolution.available,false);
  assert.equal(result.knowledgeResolution.reason,'catalog_slug_not_found');
  assert.deepEqual(result.viewModel.tags,[]);
  assert.equal(result.viewModel.measurements.heightM,null);
  assert.equal(result.viewModel.phenology.currentPhase,null);
});

test('catalog row for another slug is never substituted', async () => {
  const fixtures=baseFixtures();
  fixtures.garden_plants[0].profile_slug='mango';
  fixtures.catalog_plants=[{
    ...fixtures.catalog_plants[0],
    slug:'mangosteen',
    scientific_name:'Garcinia mangostana',
  }];

  const adapter=createPlantOverviewDataAdapter(fakeSupabase(fixtures));
  const result=await adapter.loadOverview('g1','p1');
  assert.equal(result.knowledgeResolution.available,false);
  assert.equal(result.knowledgeResolution.reason,'catalog_slug_not_found');
});
