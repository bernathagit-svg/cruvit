import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyPlantsScreenController } from '../modules/my-garden-v2/my-plants-screen-controller.js';

class Query {
  constructor(data){ this.data=data; }
  select(){ return this; }
  eq(){ return this; }
  order(){ return this; }
  async maybeSingle(){ return {data:this.data,error:null}; }
  then(resolve){ return Promise.resolve({data:this.data,error:null}).then(resolve); }
}

function fakeSupabase({signedError=null}={}){
  const fixtures={
    garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
    garden_plants:[{
      id:'p1',
      garden_profile_id:'g1',
      name:'Lemon tree',
      profile_slug:'lemon',
      archived:false,
      cover_media_id:'m1',
    }],
    garden_areas:[],
    garden_tasks:[],
    garden_events:[],
    garden_media:[{
      id:'m1',
      garden_profile_id:'g1',
      garden_plant_id:'p1',
      purpose:'plant_profile',
      validation_state:'validated',
      storage_bucket:'user-garden-media',
      storage_path:'u1/g1/m1/lemon.jpg',
    }],
  };

  return {
    from(table){
      if(!(table in fixtures)) throw new Error('unexpected_table:'+table);
      return new Query(fixtures[table]);
    },
    storage:{
      from(bucket){
        assert.equal(bucket,'user-garden-media');
        return {
          async createSignedUrl(path,ttl){
            assert.equal(path,'u1/g1/m1/lemon.jpg');
            assert.equal(ttl,300);
            if(signedError) return {data:null,error:signedError};
            return {data:{signedUrl:'https://signed.example/lemon'},error:null};
          }
        };
      }
    }
  };
}

test('locked My Plants screen resolves private personal photo and exact interaction layer',async()=>{
  const controller=createMyPlantsScreenController(fakeSupabase());
  const screen=await controller.load('g1');

  assert.equal(screen.visualAcceptance,'LOCKED_IMPLEMENTED');
  assert.match(screen.personalPhotoLayerHtml,/https:\/\/signed\.example\/lemon/);
  assert.match(screen.personalPhotoLayerHtml,/left:5\.207226%;top:24\.401914%/);
  assert.match(screen.interactionLayerHtml,/left:28\.374070%;top:25\.000000%/);
  assert.equal(screen.mediaErrorsByPlantId.size,0);
});

test('signed URL failure keeps approved system artwork instead of breaking screen',async()=>{
  const controller=createMyPlantsScreenController(fakeSupabase({
    signedError:{code:'403',message:'not allowed'},
  }));
  const screen=await controller.load('g1');

  assert.equal(screen.personalPhotoLayerHtml,'');
  assert.equal(screen.mediaErrorsByPlantId.has('p1'),true);
  assert.match(screen.mediaErrorsByPlantId.get('p1'),/garden_media_signed_url_failed:403/);
  assert.equal(screen.visualAcceptance,'LOCKED_IMPLEMENTED');
});
