import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlantDetailScreenController } from '../modules/my-garden-v2/plant-detail-screen-controller.js';

class Query {
  constructor(table,data){
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
    if(Array.isArray(data)){
      for(const [column,value] of this.filters) data=data.filter((row)=>row[column]===value);
      data=data[0] ?? null;
    }
    return {data,error:null};
  }
  then(resolve){
    let data=this.data;
    if(Array.isArray(data)){
      for(const [column,value] of this.filters) data=data.filter((row)=>row[column]===value);
    }
    return Promise.resolve({data,error:null}).then(resolve);
  }
}

function fakeSupabase({signedError=null}={}){
  const fixtures={
    garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
    garden_plants:[{
      id:'p1',
      garden_profile_id:'g1',
      name:'Pineapple',
      scientific:'Ananas comosus',
      profile_slug:'pineapple',
      archived:false,
      cover_media_id:'m1',
      status:'Growing well',
    }],
    garden_areas:[],
    garden_tasks:[{
      id:'t1',
      garden_profile_id:'g1',
      garden_plant_id:'p1',
      title:'Water',
      due_on:'2026-10-02',
      done:false,
    }],
    garden_events:[{
      id:'e1',
      garden_profile_id:'g1',
      garden_plant_id:'p1',
      event_type:'task_completed',
      occurred_at:'2026-10-01T09:00:00Z',
      payload:{title:'Watered'},
    }],
    garden_media:[{
      id:'m1',
      garden_profile_id:'g1',
      garden_plant_id:'p1',
      purpose:'plant_profile',
      validation_state:'validated',
      storage_bucket:'user-garden-media',
      storage_path:'u1/g1/m1/pineapple.jpg',
    }],
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
  };

  return {
    from(table){
      if(!(table in fixtures)) throw new Error('unexpected_table:'+table);
      return new Query(table,fixtures[table]);
    },
    storage:{
      from(bucket){
        assert.equal(bucket,'user-garden-media');
        return {
          async createSignedUrl(path,ttl){
            assert.equal(path,'u1/g1/m1/pineapple.jpg');
            assert.equal(ttl,300);
            if(signedError) return {data:null,error:signedError};
            return {data:{signedUrl:'https://signed.example/pineapple'},error:null};
          }
        };
      }
    }
  };
}

test('all four Plant Detail tabs preserve exact plant identity',async()=>{
  const controller=createPlantDetailScreenController(fakeSupabase());
  for(const tab of ['overview','care','schedule','history']){
    const options={tab};
    if(tab==='schedule'){
      options.selectedDate='2026-10-02';
      options.selectedMonth='2026-10';
    }
    const screen=await controller.load('g1','p1',options);
    assert.equal(screen.renderContract.plantId,'p1');
    assert.equal(screen.renderContract.activeTab,tab);
    assert.equal(screen.visualAcceptance,'LOCKED_IMPLEMENTED');
  }
});

test('same signed personal photo is used in locked hero and card slots',async()=>{
  const controller=createPlantDetailScreenController(fakeSupabase());
  const screen=await controller.load('g1','p1',{tab:'overview'});
  assert.equal(screen.signedMedia.signedUrl,'https://signed.example/pineapple');
  assert.match(screen.personalPhotoLayerHtml,/detail-hero-user-photo/);
  assert.match(screen.personalPhotoLayerHtml,/detail-card-user-photo/);
  assert.match(screen.personalPhotoLayerHtml,/https:\/\/signed\.example\/pineapple/);
});

test('signed media failure falls back without breaking Plant Detail',async()=>{
  const controller=createPlantDetailScreenController(fakeSupabase({
    signedError:{code:'403',message:'not allowed'},
  }));
  const screen=await controller.load('g1','p1',{tab:'overview'});
  assert.equal(screen.personalPhotoLayerHtml,'');
  assert.match(screen.mediaError,/garden_media_signed_url_failed:403/);
  assert.equal(screen.visualAcceptance,'LOCKED_IMPLEMENTED');
});

test('Schedule and History are read from canonical Task/Event sources',async()=>{
  const controller=createPlantDetailScreenController(fakeSupabase());

  const schedule=await controller.load('g1','p1',{
    tab:'schedule',
    selectedDate:'2026-10-02',
    selectedMonth:'2026-10',
  });
  assert.deepEqual(schedule.viewModel.taskIds,['t1']);

  const history=await controller.load('g1','p1',{tab:'history'});
  assert.deepEqual(history.viewModel.eventIds,['e1']);
});
