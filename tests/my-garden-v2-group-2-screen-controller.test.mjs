import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyGardenGroup2ScreenController } from '../modules/my-garden-v2/group-2-screen-controller.js';

function queryResult(data) {
  return {
    select(){ return this; },
    eq(){ return this; },
    order(){ return this; },
    async maybeSingle(){ return {data,error:null}; },
    then(resolve){ return Promise.resolve({data,error:null}).then(resolve); },
  };
}

function fakeSupabase(fixtures) {
  return {
    from(table) {
      if (!(table in fixtures)) throw new Error('unexpected_table:'+table);
      return queryResult(fixtures[table]);
    },
  };
}

const fixtures={
  garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
  garden_plants:[
    {id:'p1',garden_profile_id:'g1',name:'Lemon tree',archived:false},
    {id:'p2',garden_profile_id:'g1',name:'Rose',archived:false},
  ],
  garden_areas:[],
  garden_tasks:[
    {id:'t1',garden_profile_id:'g1',garden_plant_id:'p1',title:'Fertilize',due_on:'2026-10-01',done:false},
    {id:'t2',garden_profile_id:'g1',garden_plant_id:'p2',title:'Check leaves',due_on:'2026-10-02',done:false},
  ],
  garden_events:[
    {id:'e1',garden_profile_id:'g1',garden_plant_id:'p1',event_type:'care_logged',occurred_at:'2026-10-02T09:00:00Z',payload:{title:'Watered'}},
  ],
  garden_media:[],
};

test('Group 2 loads all four screens from canonical snapshot',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures));

  const list=await controller.loadUpcomingList('g1',{selectedDate:'2026-10-02'});
  const calendar=await controller.loadUpcomingCalendar('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
    filter:'all',
  });
  const journal=await controller.loadGardenJournal('g1');
  const notifications=await controller.loadNotifications('g1',{today:'2026-10-02'});

  assert.deepEqual(list.viewModel.rows.map((x)=>x.id),['t1','t2']);
  assert.deepEqual(calendar.viewModel.rows.map((x)=>x.id),['t1','t2']);
  assert.deepEqual(journal.viewModel.eventIds,['e1']);
  assert.deepEqual(notifications.viewModel.rows.map((x)=>x.id),['t1','t2']);

  for(const screen of [list,calendar,journal,notifications]){
    assert.equal(screen.visualAcceptance,'APPROVED_VISUAL_PENDING_COMPARISON');
    assert.match(screen.reference.sha256,/^[a-f0-9]{64}$/);
  }
});
