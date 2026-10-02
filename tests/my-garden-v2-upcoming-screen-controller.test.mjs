import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpcomingScreenController } from '../modules/my-garden-v2/upcoming-screen-controller.js';

class Query {
  constructor(data){ this.data=data; }
  select(){ return this; }
  eq(){ return this; }
  order(){ return this; }
  async maybeSingle(){ return {data:this.data,error:null}; }
  then(resolve){ return Promise.resolve({data:this.data,error:null}).then(resolve); }
}

function fakeSupabase() {
  const fixtures={
    garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
    garden_plants:[
      {
        id:'p1',
        garden_profile_id:'g1',
        name:'Lemon',
        archived:false,
        profile_slug:'lemon',
        cover_media_id:'m1',
      },
      {
        id:'p2',
        garden_profile_id:'g1',
        name:'Rose',
        archived:false,
        profile_slug:'rose',
      },
      {
        id:'p3',
        garden_profile_id:'g1',
        name:'No tasks plant',
        archived:false,
        profile_slug:'mint',
      },
    ],
    garden_areas:[],
    garden_tasks:[
      {id:'t1',garden_profile_id:'g1',garden_plant_id:'p1',title:'Water',task_type:'watering',due_on:'2026-10-02',done:false},
      {id:'t2',garden_profile_id:'g1',garden_plant_id:'p2',title:'Check leaves',task_type:'inspect',due_on:'2026-10-03',done:false},
      {id:'t3',garden_profile_id:'g1',garden_plant_id:'p1',title:'Done',task_type:'care',due_on:'2026-09-29',done:true},
    ],
    garden_events:[],
    garden_media:[
      {
        id:'m1',
        garden_profile_id:'g1',
        garden_plant_id:'p1',
        purpose:'plant_profile',
        validation_state:'validated',
        storage_bucket:'user-garden-media',
        storage_path:'u1/g1/m1/lemon.jpg',
      },
    ],
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
            return {data:{signedUrl:'https://signed.example/lemon'},error:null};
          }
        };
      }
    }
  };
}

test('Upcoming List and Calendar use one snapshot and identical totals',async()=>{
  const controller=createUpcomingScreenController(fakeSupabase(),{
    systemPlantVisualResolver:async(plant)=>'/system/'+plant.profile_slug+'.png',
  });
  const state=await controller.loadPair('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
    filter:'to_do',
  });

  assert.deepEqual(state.listViewModel.counts,state.calendarViewModel.counts);
  assert.deepEqual(state.listViewModel.counts,{
    toDo:2,
    completed:1,
    cancelled:0,
    all:3,
  });
  assert.equal(state.activePlantCount,3);
  assert.equal(state.visualAcceptance,'pending_screenshot_comparison');
});

test('same task ID appears in List and selected Calendar day',async()=>{
  const controller=createUpcomingScreenController(fakeSupabase());
  const state=await controller.loadPair('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
    filter:'to_do',
  });

  assert.equal(state.listViewModel.rows.some((row)=>row.id==='t1'),true);
  assert.deepEqual(state.calendarViewModel.selectedDayRows.map((row)=>row.id),['t1']);
  assert.match(state.listHtml,/data-task-id="t1"/);
  assert.match(state.calendarHtml,/data-task-id="t1"/);
});

test('personal and system thumbnails are resolved without changing task identity',async()=>{
  const controller=createUpcomingScreenController(fakeSupabase(),{
    systemPlantVisualResolver:async(plant)=>'/system/'+plant.profile_slug+'.png',
  });
  const state=await controller.loadPair('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
  });

  assert.equal(state.plantVisuals.p1,'https://signed.example/lemon');
  assert.equal(state.plantVisuals.p2,'/system/rose.png');
  assert.equal(state.plantVisuals.p3,'/system/mint.png');
  assert.match(state.listHtml,/https:\/\/signed\.example\/lemon/);
});

test('visual approval remains pending implementation comparison',async()=>{
  const controller=createUpcomingScreenController(fakeSupabase());
  const state=await controller.loadPair('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
  });
  assert.equal(state.references.list.sha256,'03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430');
  assert.equal(state.references.calendar.sha256,'322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db');
  assert.equal(state.visualAcceptance,'pending_screenshot_comparison');
});
