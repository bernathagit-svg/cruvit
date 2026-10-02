import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyGardenReadRepository, MY_GARDEN_SELECTS } from '../modules/my-garden-v2/supabase-read-repository.js';

class Query {
  constructor(table, response, calls) { this.table=table; this.response=response; this.calls=calls; }
  select(columns) { this.calls.push([this.table,'select',columns]); return this; }
  eq(column, value) { this.calls.push([this.table,'eq',column,value]); return this; }
  order(column, options) { this.calls.push([this.table,'order',column,options]); return this; }
  async maybeSingle() { this.calls.push([this.table,'maybeSingle']); return this.response; }
  then(resolve, reject) { return Promise.resolve(this.response).then(resolve, reject); }
}

function mockSupabase(responses) {
  const calls=[];
  return {
    calls,
    from(table) {
      calls.push([table,'from']);
      if (!(table in responses)) throw new Error(`unexpected_table:${table}`);
      return new Query(table, responses[table], calls);
    }
  };
}

const G='g1';
const baseResponses = () => ({
  garden_profiles:{data:{id:G,user_id:'u1',name:'My Garden'},error:null},
  garden_plants:{data:[{id:'p1',garden_profile_id:G,archived:false,garden_area_id:'a1'}],error:null},
  garden_areas:{data:[{id:'a1',garden_profile_id:G,name:'Backyard'}],error:null},
  garden_tasks:{data:[{id:'t1',garden_profile_id:G,garden_plant_id:'p1',title:'Water',done:false}],error:null},
  garden_events:{data:[{id:'e1',garden_profile_id:G,garden_plant_id:'p1',event_type:'note_added'}],error:null},
  garden_media:{data:[{id:'m1',garden_profile_id:G,garden_plant_id:'p1',purpose:'plant_profile'}],error:null},
});

test('repository exposes read-only methods and loads one scoped snapshot', async () => {
  const sb=mockSupabase(baseResponses());
  const repo=createMyGardenReadRepository(sb);
  assert.deepEqual(Object.keys(repo).sort(), ['getGardenProfile','listAreas','listEvents','listMedia','listPlants','listTasks','loadGardenSnapshot'].sort());
  const snap=await repo.loadGardenSnapshot(G);
  assert.equal(snap.profile.id,G);
  assert.deepEqual(snap.plants.map(x=>x.id),['p1']);
  assert.deepEqual(snap.areas.map(x=>x.id),['a1']);
  assert.deepEqual(snap.tasks.map(x=>x.id),['t1']);
  assert.deepEqual(snap.events.map(x=>x.id),['e1']);
  assert.deepEqual(snap.media.map(x=>x.id),['m1']);
});

test('repository queries only canonical My Garden tables', async () => {
  const sb=mockSupabase(baseResponses());
  const repo=createMyGardenReadRepository(sb);
  await repo.loadGardenSnapshot(G);
  const tables=[...new Set(sb.calls.filter(x=>x[1]==='from').map(x=>x[0]))].sort();
  assert.deepEqual(tables,['garden_areas','garden_events','garden_media','garden_plants','garden_profiles','garden_tasks']);
});

test('explicit selects include identity columns needed by one-truth projections', () => {
  assert.match(MY_GARDEN_SELECTS.plants,/id,garden_profile_id/);
  assert.match(MY_GARDEN_SELECTS.plants,/garden_area_id/);
  assert.match(MY_GARDEN_SELECTS.plants,/cover_media_id/);
  assert.match(MY_GARDEN_SELECTS.areas,/id,garden_profile_id/);
  assert.match(MY_GARDEN_SELECTS.tasks,/garden_plant_id/);
  assert.match(MY_GARDEN_SELECTS.tasks,/due_on/);
  assert.match(MY_GARDEN_SELECTS.events,/garden_task_id/);
  assert.match(MY_GARDEN_SELECTS.media,/garden_plant_id/);
});

test('cross-garden child row fails loudly instead of being silently filtered', async () => {
  const responses=baseResponses();
  responses.garden_tasks={data:[{id:'tX',garden_profile_id:'other'}],error:null};
  const repo=createMyGardenReadRepository(mockSupabase(responses));
  await assert.rejects(repo.listTasks(G),/cross_garden_row/);
});

test('schema/query error is surfaced with table context', async () => {
  const responses=baseResponses();
  responses.garden_media={data:null,error:{code:'42703',message:'column cover does not exist'}};
  const repo=createMyGardenReadRepository(mockSupabase(responses));
  await assert.rejects(repo.listMedia(G),/garden_media_read:42703/);
});

test('missing garden fails snapshot rather than inventing a default', async () => {
  const responses=baseResponses();
  responses.garden_profiles={data:null,error:null};
  const repo=createMyGardenReadRepository(mockSupabase(responses));
  await assert.rejects(repo.loadGardenSnapshot(G),/garden_not_found/);
});

test('duplicate IDs fail loudly', async () => {
  const responses=baseResponses();
  responses.garden_plants={data:[{id:'p1',garden_profile_id:G},{id:'p1',garden_profile_id:G}],error:null};
  const repo=createMyGardenReadRepository(mockSupabase(responses));
  await assert.rejects(repo.listPlants(G),/duplicate_id/);
});
