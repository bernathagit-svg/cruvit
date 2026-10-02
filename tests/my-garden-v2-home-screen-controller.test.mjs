import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyGardenHomeScreenController } from '../modules/my-garden-v2/home-screen-controller.js';

function queryResult(data) {
  return {
    select(){ return this; },
    eq(){ return this; },
    order(){ return this; },
    async maybeSingle(){ return { data, error: null }; },
    then(resolve){ return Promise.resolve({ data, error: null }).then(resolve); },
  };
}

function fakeSupabase(fixtures) {
  return {
    from(table) {
      const data = fixtures[table];
      if (table === 'garden_profiles') return queryResult(data);
      return queryResult(data || []);
    },
  };
}

test('Home controller renders approved DOM from one canonical snapshot', async () => {
  const gardenId='g1';
  const controller=createMyGardenHomeScreenController(fakeSupabase({
    garden_profiles:{id:gardenId,user_id:'u1',name:'My Garden'},
    garden_plants:[
      {id:'p1',garden_profile_id:gardenId,name:'Lemon tree',archived:false},
      {id:'p2',garden_profile_id:gardenId,name:'Rose',archived:false},
    ],
    garden_areas:[],
    garden_tasks:[
      {id:'t1',garden_profile_id:gardenId,garden_plant_id:'p1',title:'Fertilize',due_on:'2026-10-02',done:false},
      {id:'t2',garden_profile_id:gardenId,garden_plant_id:'p2',title:'Check leaves',due_on:'2026-10-03',done:false},
    ],
    garden_events:[],
    garden_media:[],
  }));

  const screen=await controller.load(gardenId,{today:'2026-10-02'});

  assert.equal(screen.viewModel.counts.plants,2);
  assert.equal(screen.viewModel.counts.upcoming,2);
  assert.equal(screen.viewModel.counts.attention,1);
  assert.equal(screen.gardenPhoto.kind,'system');

  assert.match(screen.html,/class="precision-shell"/);
  assert.match(screen.html,/>My Plants<\/span><small>2<\/small>/);
  assert.match(screen.html,/>Upcoming<\/span><small>2<\/small>/);
  assert.match(screen.html,/<span class="pg-badge">1<\/span>/);
  assert.match(screen.html,/Lemon tree · Fertilize/);
});

test('Home controller never selects ambiguous garden photo', async () => {
  const gardenId='g1';
  const photo=(id)=>({
    id,
    garden_profile_id:gardenId,
    garden_plant_id:null,
    purpose:'garden_overview',
    validation_state:'validated',
    storage_bucket:'user-garden-media',
    storage_path:'u/g/'+id+'/garden.jpg',
  });

  const controller=createMyGardenHomeScreenController(fakeSupabase({
    garden_profiles:{id:gardenId,user_id:'u1',name:'My Garden'},
    garden_plants:[],
    garden_areas:[],
    garden_tasks:[],
    garden_events:[],
    garden_media:[photo('m1'),photo('m2')],
  }));

  const screen=await controller.load(gardenId,{today:'2026-10-02'});
  assert.equal(screen.gardenPhoto.kind,'system');
  assert.equal(screen.gardenPhoto.reason,'multiple_garden_photos_no_current_pointer');
});
