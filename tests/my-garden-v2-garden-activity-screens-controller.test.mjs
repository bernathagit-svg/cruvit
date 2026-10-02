import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenActivityScreensController } from '../modules/my-garden-v2/garden-activity-screens-controller.js';

class Query {
  constructor(data){ this.data=data; }
  select(){ return this; }
  eq(){ return this; }
  order(){ return this; }
  async maybeSingle(){ return {data:this.data,error:null}; }
  then(resolve){ return Promise.resolve({data:this.data,error:null}).then(resolve); }
}

function fakeSupabase(){
  const fixtures={
    garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
    garden_plants:[
      {id:'p1',garden_profile_id:'g1',name:'Lemon',archived:false},
      {id:'p2',garden_profile_id:'g1',name:'Rose',archived:false},
    ],
    garden_areas:[],
    garden_tasks:[
      {id:'t1',garden_profile_id:'g1',garden_plant_id:'p1',title:'Fertilize',due_on:'2026-10-01',done:false},
      {id:'t2',garden_profile_id:'g1',garden_plant_id:'p2',title:'Check leaves',due_on:'2026-10-02',done:false},
    ],
    garden_events:[
      {id:'e1',garden_profile_id:'g1',garden_plant_id:'p1',event_type:'task_completed',occurred_at:'2026-10-02T09:00:00Z',payload:{title:'Watered'}},
      {id:'e2',garden_profile_id:'g1',garden_plant_id:'p2',event_type:'plant_health_changed',occurred_at:'2026-10-01T09:00:00Z',payload:{title:'Health updated'}},
    ],
    garden_media:[],
  };
  return {
    from(table){
      if(!(table in fixtures)) throw new Error('unexpected_table:'+table);
      return new Query(fixtures[table]);
    }
  };
}

test('Garden Journal loads canonical events from one garden snapshot',async()=>{
  const controller=createGardenActivityScreensController(fakeSupabase());
  const screen=await controller.loadJournal('g1');

  assert.deepEqual(screen.viewModel.eventIds,['e1','e2']);
  assert.deepEqual(screen.renderModel.rows.map((row)=>row.eventId),['e1','e2']);
  assert.equal(screen.visualAcceptance,'pending_screenshot_comparison');
});

test('Journal plant filter changes scope but not event identity',async()=>{
  const controller=createGardenActivityScreensController(fakeSupabase());
  const screen=await controller.loadJournal('g1',{plantId:'p1'});
  assert.deepEqual(screen.viewModel.eventIds,['e1']);
  assert.deepEqual(screen.renderModel.rows.map((row)=>row.eventId),['e1']);
});

test('Notifications derive from canonical pending due tasks',async()=>{
  const controller=createGardenActivityScreensController(fakeSupabase());
  const screen=await controller.loadNotifications('g1',{today:'2026-10-02'});

  assert.deepEqual(screen.viewModel.rows.map((row)=>row.id),['t1','t2']);
  assert.deepEqual(screen.renderModel.rows.map((row)=>row.taskId),['t1','t2']);
  assert.deepEqual(screen.renderModel.counts,{
    attention:2,
    today:1,
    overdue:1,
    plants:2,
  });
  assert.equal(screen.visualAcceptance,'pending_screenshot_comparison');
});

test('Notifications filter does not create another task record set',async()=>{
  const controller=createGardenActivityScreensController(fakeSupabase());
  const overdue=await controller.loadNotifications('g1',{
    today:'2026-10-02',
    filter:'overdue',
  });
  assert.deepEqual(overdue.viewModel.rows.map((row)=>row.id),['t1']);
  assert.deepEqual(overdue.renderModel.rows.map((row)=>row.taskId),['t1']);
});

test('approved visual state remains pending implementation comparison',async()=>{
  const controller=createGardenActivityScreensController(fakeSupabase());
  const journal=await controller.loadJournal('g1');
  const notifications=await controller.loadNotifications('g1',{today:'2026-10-02'});
  assert.equal(journal.visualAcceptance,'pending_screenshot_comparison');
  assert.equal(notifications.visualAcceptance,'pending_screenshot_comparison');
});
