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
    storage:{
      from(bucket){
        assert.equal(bucket,'user-garden-media');
        return {
          async createSignedUrl(path,ttl){
            assert.equal(ttl,300);
            return {data:{signedUrl:'https://signed.example/'+encodeURIComponent(path)},error:null};
          }
        };
      }
    }
  };
}

const fixtures={
  garden_profiles:{id:'g1',user_id:'u1',name:'My Garden'},
  garden_plants:[
    {id:'p1',garden_profile_id:'g1',name:'Lemon tree',archived:false,profile_slug:'lemon',cover_media_id:'m1'},
    {id:'p2',garden_profile_id:'g1',name:'Rose',archived:false,profile_slug:'rose'},
    {id:'p3',garden_profile_id:'g1',name:'Mint',archived:false,profile_slug:'mint'},
  ],
  garden_areas:[],
  garden_tasks:[
    {id:'t1',garden_profile_id:'g1',garden_plant_id:'p1',title:'Fertilize',due_on:'2026-10-01',done:false},
    {id:'t2',garden_profile_id:'g1',garden_plant_id:'p2',title:'Check leaves',due_on:'2026-10-02',done:false},
  ],
  garden_events:[
    {id:'e1',garden_profile_id:'g1',garden_plant_id:'p1',event_type:'care_logged',occurred_at:'2026-10-02T09:00:00Z',payload:{title:'Watered'}},
  ],
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

test('Upcoming pair shares one task totals contract for same scope',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures));
  const pair=await controller.loadUpcomingPair('g1',{
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
    filter:'to_do',
  });

  assert.deepEqual(pair.list.viewModel.counts,pair.calendar.viewModel.counts);
  assert.deepEqual(pair.list.viewModel.counts,{
    toDo:2,
    completed:0,
    cancelled:0,
    all:2,
  });
  assert.equal(pair.list.visualAcceptance,'APPROVED_VISUAL_PENDING_COMPARISON');
  assert.equal(pair.calendar.visualAcceptance,'APPROVED_VISUAL_PENDING_COMPARISON');
});

test('Upcoming uses private personal photo and optional system visuals without changing identity',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures),{
    systemPlantVisualResolver:async(card)=>'/system/'+card.profileSlug+'.png',
  });
  const list=await controller.loadUpcomingList('g1',{selectedDate:'2026-10-02'});

  assert.match(list.plantVisuals.p1,/^https:\/\/signed\.example\//);
  assert.equal(list.plantVisuals.p2,'/system/rose.png');
  assert.equal(list.plantVisuals.p3,'/system/mint.png');
  assert.match(list.html,/data-task-id="t1"/);
  assert.match(list.html,/data-task-id="t2"/);
});

test('Task identity assertion uses canonical projected rows across all views',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures));
  assert.equal(
    await controller.assertTaskViews('g1',{
      plantId:'p1',
      today:'2026-10-02',
      selectedMonth:'2026-10',
      selectedDate:'2026-10-02',
    }),
    true
  );
});

test('active plant count includes plants with no tasks without forcing the count back into approved UI',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures));
  const list=await controller.loadUpcomingList('g1');
  assert.equal(list.activePlantCount,3);
  assert.doesNotMatch(list.html,/· 3 plants/);
});


test('Garden Journal and Notifications expose safe approved-template hydration plans',async()=>{
  const controller=createMyGardenGroup2ScreenController(fakeSupabase(fixtures));
  const journal=await controller.loadGardenJournal('g1');
  const notifications=await controller.loadNotifications('g1',{today:'2026-10-02'});

  assert.equal(journal.hydrationPlan.screenId,'garden-journal');
  assert.equal(notifications.hydrationPlan.screenId,'notifications');

  for(const plan of [journal.hydrationPlan,notifications.hydrationPlan]){
    assert.equal(plan.immutable.includes('bottom-navigation'),true);
    assert.equal(plan.immutable.includes('css'),true);
    for(const patch of plan.patches){
      assert.equal(/^\.bottom\b/.test(patch.selector),false);
      assert.equal(/^\.hero\b/.test(patch.selector),false);
      assert.equal(/^\.bg\b/.test(patch.selector),false);
    }
  }
});
