// Offline contract checks. These test values are not user sessions or live RLS evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {judgePlantReads,judgeAnonRead} from '../../core-v1/my-garden/shared/plant-rls.mjs';
import {isPreviewOrigin,metricDelta,GARDEN_ID,PREVIEW_URL} from '../../core-v1/my-garden/shared/preview-session.mjs';
import {loadLive} from '../../core-v1/my-garden/plants/data.mjs';
const goodRows=[
 {id:'079827a3-732d-4a16-acd0-b9949bc7bc53',profile_slug:'apple',name:'Apple',scientific:'Malus domestica',garden_profile_id:GARDEN_ID,user_id:'unit-a',archived:false},
 {id:'f82ded5a-8b6f-4093-be98-6972c12e4520',profile_slug:'monstera',name:'Monstera',scientific:'Monstera deliciosa',garden_profile_id:GARDEN_ID,user_id:'unit-a',archived:false}
];
const response=data=>({status:200,error:null,count:data.length,data});
const input=()=>({ownerId:'unit-a',otherId:'unit-b',owner:response(goodRows),other:response([]),anon:response([])});
test('exact owned IDs with completed zero-row reads',()=>assert.equal(judgePlantReads(input()).pass,true));
const invalidCases=[
 ['same user',i=>{i.otherId=i.ownerId}],
 ['network',i=>{i.other={status:0,error:{message:'offline'},data:null,count:null}}],
 ['expired',i=>{i.other={status:401,error:{message:'expired'},data:null,count:null}}],
 ['server',i=>{i.anon={status:500,error:{message:'offline'},data:null,count:null}}],
 ['partial',i=>{i.owner.count=3}],
 ['wrong instance',i=>{i.owner=response([{...goodRows[0],id:'wrong'},goodRows[1]])}],
 ['wrong canonical',i=>{i.owner=response([{...goodRows[0],profile_slug:'other'},goodRows[1]])}],
 ['wrong owner',i=>{i.owner=response(goodRows.map(p=>({...p,user_id:'unit-b'})))}],
 ['user leak',i=>{i.other=response(goodRows)}],
 ['anon leak',i=>{i.anon=response(goodRows)}]
];
for(const [name,change] of invalidCases)test(name+' cannot pass',()=>{const i=input();change(i);assert.equal(judgePlantReads(i).pass,false)});
test('Preview origin restriction',()=>{
 assert(isPreviewOrigin('https://cruvit-core-v1-e2e-preview.netlify.app'));
 assert(isPreviewOrigin('https://commit4-integration--cruvit-core-v1-e2e-preview.netlify.app'));
 assert(!isPreviewOrigin('https://friendly-taiyaki-64aacb.netlify.app'));
 assert(!isPreviewOrigin('http://localhost:3000'));
});
test('per-operation counter delta',()=>assert.deepEqual(metricDelta({authRequests:3,databaseReads:6},{authRequests:2,databaseReads:3}),{authRequests:1,databaseReads:3}));
function unitClient(number,personal){
 const garden={id:GARDEN_ID,user_id:'unit-owner',name:'Unit garden'},calls=[];
 const media={imageStatus:'IMAGE_READY',sourceAssetId:'unit-catalog',primaryUrl:'https://example.invalid/catalog.jpg'};
 const plants=Array.from({length:number},(_,i)=>({
  id:'unit-'+i,garden_profile_id:GARDEN_ID,user_id:garden.user_id,profile_slug:'unit-plant',name:'Unit '+i,
  scientific:'Unit species',status:'unassessed',archived:false,cover_media_id:personal?'media-'+i:null,garden_area_id:null,area:null,
  cover:personal?{id:'media-'+i,user_id:garden.user_id,garden_profile_id:GARDEN_ID,garden_plant_id:'unit-'+i,validation_state:'validated',purpose:'plant_profile',storage_bucket:'user-garden-media',storage_path:'unit/cover-'+i+'.jpg'}:null
 }));
 const results={garden_profiles:{status:200,error:null,data:garden},garden_plants:response(plants),catalog_plants:response([{slug:'unit-plant',scientific_name:'Unit species',verification_state:'verified',media_status:'IMAGE_READY',media}])};
 const storage={from(bucket){
  assert.equal(bucket,'user-garden-media');
  return {async createSignedUrls(paths){
   calls.push('batch-sign');
   return {error:null,data:paths.map(p=>({path:p,signedUrl:PREVIEW_URL+'/storage/v1/object/sign/user-garden-media/'+p}))};
  }};
 }};
 return {
  calls,supabaseUrl:PREVIEW_URL,storage,
  auth:{async getUser(){calls.push('auth');return {data:{user:{id:garden.user_id,role:'authenticated'}},error:null}}},
  from(table){calls.push(table);const query={select(){return query},eq(){return query},order(){return query},range(){return query},in(){return query},async maybeSingle(){return results[table]},then(resolve,reject){return Promise.resolve(results[table]).then(resolve,reject)}};return query}
 };
}
for(const number of [1,2,9,120])test('fixed batch count for '+number+' covers',async()=>{
 const c=unitClient(number,true),m=await loadLive(c);assert.equal(m.cards.length,number);assert.equal(m.counts.databaseReads,3);assert.equal(m.counts.storageSignRequests,1);assert.equal(c.calls.filter(x=>x==='batch-sign').length,1);
});
test('catalog-only fixtures do not sign storage paths',async()=>{const c=unitClient(2,false),m=await loadLive(c);assert.equal(m.counts.storageSignRequests,0);assert(!c.calls.includes('batch-sign'))});

for(const status of [401,403])test('Supervisor: known '+status+' permission denial with no rows passes anon only',()=>{
 const denied={status,error:{code:'42501',message:'permission denied for table garden_plants'},data:null,count:null};
 assert.equal(judgeAnonRead(denied).pass,true);const i=input();i.anon=denied;assert.equal(judgePlantReads(i).pass,true);
 i.other=denied;assert.equal(judgePlantReads(i).pass,false);
});
test('Supervisor: 200 empty remains valid',()=>assert.equal(judgeAnonRead(response([])).pass,true));
test('Supervisor: arbitrary invalid JWT is not a permissions proof',()=>assert.equal(judgeAnonRead({status:401,error:{code:'PGRST301'},data:null}).pass,false));
test('Supervisor: permission error carrying rows is a FAIL',()=>assert.equal(judgeAnonRead({status:401,error:{code:'42501'},data:goodRows}).status,'FAIL'));
test('Supervisor: 500 is never a PASS',()=>assert.equal(judgeAnonRead({status:500,error:{code:'42501'},data:null}).pass,false));
test('Supervisor: wrong display names fail fixture proof',()=>{const i=input();i.owner=response(goodRows.map(p=>({...p,name:'Lemon'})));assert.equal(judgePlantReads(i).pass,false)});
test('Supervisor: wrong scientific identity fails fixture proof',()=>{const i=input();i.owner=response(goodRows.map(p=>({...p,scientific:'Other species'})));assert.equal(judgePlantReads(i).pass,false)});
