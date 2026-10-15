// Offline contract tests only. No network, real session, migration, or database write.
import test from 'node:test';import assert from 'node:assert/strict';
import {createIdentifierSaveController,createCanonicalIdentifierSaveController,SAVE_KEY,GARDEN,OWNER,FIXTURE} from '../../core-v1/plant-identification/atomic/save-controller.mjs';
import {createPreviewSaveDomain,createIdentifierSaveDomain} from '../../core-v1/plant-identification/atomic/preview-domain.mjs';
function setup(options={}){
 let state={attempts:0},getters=0,calls=[],receipts=[],rows=new Map(),histories=new Map();
 const metrics={rpcCalls:0,supabaseWrites:0,databaseReads:0,authRequests:0,externalProviderCalls:0,paidAICalls:0,storageSignRequests:0};
 const client={async rpc(name,args){calls.push({name,args});metrics.rpcCalls++;metrics.supabaseWrites++;if(options.rpcError)return {error:{code:'UNIT_ERROR'},data:null};
  const created=!rows.has(args.p_client_instance_id);if(created)rows.set(args.p_client_instance_id,{id:'unit-authoritative-plant',user_id:OWNER,garden_profile_id:GARDEN,client_instance_id:args.p_client_instance_id,name:'Monstera',scientific:'Monstera deliciosa',profile_slug:'monstera',status:'unassessed',mark:'unknown'});
  const plant={...rows.get(args.p_client_instance_id),...options.patchPlant},historyCreated=!histories.has(plant.id);if(historyCreated)histories.set(plant.id,{id:'unit-history',garden_plant_id:plant.id,event_type:'plant_added',source_module:'plant_identifier'});
  return {error:null,data:{ok:true,created,historyCreated,plant,history:{...histories.get(plant.id),...options.patchHistory}}};
 }};
 const domain={getSupabaseClient(){getters++;return client},metrics:()=>({...metrics}),delta:before=>Object.fromEntries(Object.keys(metrics).map(k=>[k,metrics[k]-before[k]])),async verify(){metrics.authRequests++;metrics.databaseReads+=2;if(options.authError)throw Error('Owner verification failed')},async hydrate(){metrics.databaseReads+=2;if(options.readError)throw Error('readback failed');return {gardenId:GARDEN,plant:[...rows.values()][0],history:{...[...histories.values()][0],user_id:OWNER,garden_profile_id:GARDEN,payload:{client_instance_id:SAVE_KEY}},plantKeyCount:rows.size,plantAddedHistoryCount:histories.size,totalGardenPlants:rows.size,allPlants:[...rows.values()]}}};
 const stateStore={read:()=>({...state}),write:s=>{state=s}};
 const c=createIdentifierSaveController({domain,stateStore,record:r=>receipts.push(structuredClone(r))});
 return {c,calls,receipts,rows,histories,metrics,getters:()=>getters,state:()=>state};
}
test('requires explicit domain; no implicit fallback',()=>assert.throws(()=>createIdentifierSaveController()));
test('prepare intent uses exact canonical slug and unknown initial health',()=>{const t=setup();assert.equal(t.c.intent.identity.profileSlug,'monstera');assert.equal(t.c.intent.identity.scientific,'Monstera deliciosa');assert.equal(t.c.intent.initialHealth.status,'unassessed');assert.equal(t.c.intent.initialHealth.mark,'unknown');assert.equal(t.c.intent.clientInstanceId,SAVE_KEY)});
test('first save: one command instance, one RPC, one plant, one event, then hydrate',async()=>{const t=setup(),r=await t.c.save();assert.equal(t.getters(),1);assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,'add_garden_plant_once_v1');assert.equal(r.created,true);assert.equal(r.historyCreated,true);assert.equal(r.hydration,'VERIFIED');assert.equal(r.plant.id,'unit-authoritative-plant');assert.equal(r.counts.rpcCalls,1);assert.equal(r.counts.databaseReads,4);assert.equal(r.counts.authRequests,1);});
test('retry uses same deterministic key and authoritative identities with false creation flags',async()=>{const t=setup(),first=await t.c.save(),retry=await t.c.save();assert.equal(retry.created,false);assert.equal(retry.historyCreated,false);assert.equal(retry.plant.id,first.plant.id);assert.equal(retry.history.id,first.history.id);assert.deepEqual(t.calls[0].args,t.calls[1].args);assert.equal(t.rows.size,1);assert.equal(t.histories.size,1);assert.equal(t.getters(),1)});
test('no third attempt in bounded Preview wave',async()=>{const t=setup();await t.c.save();await t.c.save();await assert.rejects(()=>t.c.save(),/already attempted/);assert.equal(t.calls.length,2)});
test('parallel double click coalesces to one RPC',async()=>{const t=setup();const [a,b]=await Promise.all([t.c.save(),t.c.save()]);assert.equal(t.calls.length,1);assert.equal(a.plant.id,b.plant.id)});
test('auth failure makes no RPC call',async()=>{const t=setup({authError:true});await assert.rejects(()=>t.c.save());assert.equal(t.calls.length,0);assert.equal(t.state().attempts,0)});
test('RPC failure never automatically retries and retains attempt accounting',async()=>{const t=setup({rpcError:true});await assert.rejects(()=>t.c.save());assert.equal(t.calls.length,1);assert.equal(t.state().attempts,1);assert.equal(t.receipts[0].kind,'RPC_UNCONFIRMED')});
test('failed hydration cannot be presented as successful navigation',async()=>{const t=setup({readError:true});await assert.rejects(()=>t.c.save());assert.equal(t.calls.length,1);assert.equal(t.receipts.at(-1).hydration,'PENDING')});
for(const [field,value] of [['id',null],['user_id','other'],['profile_slug','monstera-deliciosa'],['scientific','Other species'],['status','healthy'],['mark','green']])test('wrong first-save '+field+' rejected',async()=>{const t=setup({patchPlant:{[field]:value}});await assert.rejects(()=>t.c.save());assert.equal(t.calls.length,1)});
for(const [field,value]of [['id',null],['garden_plant_id','other'],['event_type','plant_changed'],['source_module','other']])test('wrong history '+field+' rejected',async()=>{const t=setup({patchHistory:{[field]:value}});await assert.rejects(()=>t.c.save());assert.equal(t.calls.length,1)});
test('retry never resets existing health',async()=>{const t=setup();await t.c.save();const old=t.rows.get(SAVE_KEY);old.status='healthy';old.mark='owner-assessed';const result=await t.c.save();assert.equal(result.plant.status,'healthy');assert.equal(result.plant.mark,'owner-assessed');assert.equal(result.created,false)});
test('domain rejects foreign Supabase client',()=>assert.throws(()=>createPreviewSaveDomain({client:{supabaseUrl:'https://foreign.invalid'},metrics(){},delta(){}})));


// PI-08 foundation qualification: the real shared controller/domain with an in-memory
// Supabase-shaped dependency. No SDK, network, session persistence, or real RPC is used.
const originalFetch = globalThis.fetch;
let attemptedNetwork = 0;
test.before(() => { globalThis.fetch = () => { attemptedNetwork++; throw Error('Network prohibited in offline qualification'); }; });
test.after(() => { globalThis.fetch = originalFetch; assert.equal(attemptedNetwork, 0); });
const witnessRows = [
  {canonicalSlug: 'lemon', displayName: 'Lemon', scientificName: 'Citrus × limon'},
  {canonicalSlug: 'pomegranate', displayName: 'Pomegranate', scientificName: 'Punica granatum'},
  {canonicalSlug: 'raspberry', displayName: 'Raspberry', scientificName: 'Rubus idaeus'}
];
const contextFor = (index = 0) => ({...witnessRows[index], gardenId: 'owned-garden-' + index,
  ownerId: 'authenticated-owner-' + index, clientInstanceId: 'explicit:intent:' + index});
const memoryState = (initial = {attempts: 0}) => {
  let value = structuredClone(initial);
  return {read: () => structuredClone(value), write: next => { value = structuredClone(next); }};
};
const copy = value => structuredClone(value);

function offline(context = contextFor(), options = {}) {
  const plants = new Map(), histories = new Map(), calls = [], queries = [], receipts = [];
  const totals = {rpcCalls: 0, supabaseWrites: 0, databaseReads: 0, authRequests: 0};
  const gardens = [{id: context.gardenId, user_id: context.ownerId}];
  const catalog = [...witnessRows, {canonicalSlug: FIXTURE.profileSlug, scientificName: FIXTURE.scientific}].map(row =>
    ({slug: row.canonicalSlug, scientific_name: row.scientificName, verification_state: 'verified', media_status: 'IMAGE_READY'}));
  let user = {id: context.ownerId, role: 'authenticated'};
  const client = {
    supabaseUrl: options.preview ? 'https://pwgeygwafuinwkpmnzxp.supabase.co' : 'https://controlled.invalid',
    auth: {async getUser() { totals.authRequests++; return copy(options.authResponse || {data: {user}, error: null}); }},
    from(table) {
      const query = {table, filters: [], columns: null, selectOptions: null, range: null};
      const builder = {
        select(columns, selectOptions) { query.columns = columns; query.selectOptions = selectOptions; return this; },
        eq(field, value) { query.filters.push([field, value]); return this; },
        order() { return this; },
        range(from, to) { query.range = [from, to]; return this; },
        async single() { return read(true); },
        then(resolve, reject) { return Promise.resolve().then(() => read(false)).then(resolve, reject); }
      };
      function read(single) {
        totals.databaseReads++; queries.push(copy(query));
        const tableRows = {garden_profiles: gardens, catalog_plants: catalog,
          garden_plants: [...plants.values()], garden_events: [...histories.values()]}[table];
        assert.ok(tableRows, 'Only the existing four read tables are allowed');
        let rows = tableRows.filter(row => query.filters.every(([field, value]) => row[field] === value));
        const count = rows.length;
        if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
        let response = {status: 200, error: null, count, data: copy(single ? rows[0] ?? null : rows)};
        if (options.patchRead) response = options.patchRead(table, response, query) ?? response;
        return response;
      }
      return builder;
    },
    async rpc(name, args) {
      assert.equal(name, 'add_garden_plant_once_v1');
      calls.push({name, args: copy(args)}); totals.rpcCalls++; totals.supabaseWrites++;
      if (options.rpcBefore) return options.rpcBefore(name, args);
      if (options.rpcGate) await options.rpcGate;
      const key = JSON.stringify([args.p_garden_profile_id, args.p_client_instance_id]);
      let plant = plants.get(key);
      if (plant && plant.profile_slug !== args.p_profile_slug) {
        return {error: {code: '22023', message: 'idempotency_payload_mismatch'}, data: null};
      }
      const created = !plant;
      if (!plant) {
        const owner = gardens.find(row => row.id === args.p_garden_profile_id)?.user_id;
        plant = {id: 'authoritative-plant-' + (plants.size + 1), user_id: owner,
          garden_profile_id: args.p_garden_profile_id, client_instance_id: args.p_client_instance_id,
          name: args.p_display_name, profile_slug: args.p_profile_slug, scientific: args.p_scientific,
          status: 'unassessed', mark: 'unknown', archived: false};
        plants.set(key, plant);
      }
      const historyKey = JSON.stringify([plant.garden_profile_id, plant.id]);
      const historyCreated = !histories.has(historyKey);
      if (historyCreated) histories.set(historyKey, {id: 'authoritative-history-' + (histories.size + 1),
        garden_profile_id: plant.garden_profile_id, user_id: plant.user_id, garden_plant_id: plant.id,
        event_type: 'plant_added', source_module: 'plant_identifier',
        payload: {client_instance_id: plant.client_instance_id}});
      const history = histories.get(historyKey);
      // Match the existing RPC's intentionally smaller history projection.
      const result = {error: null, data: {ok: true, created, historyCreated, plant: copy(plant),
        history: {id: history.id, garden_plant_id: history.garden_plant_id,
          event_type: history.event_type, source_module: history.source_module}}};
      return options.patchRpc ? options.patchRpc(result) : result;
    }
  };
  if (options.preview) {
    for (const id of ['079827a3-732d-4a16-acd0-b9949bc7bc53', 'f82ded5a-8b6f-4093-be98-6972c12e4520']) {
      plants.set('historical-' + id, {id, garden_profile_id: GARDEN, user_id: OWNER, client_instance_id: 'historical-' + id});
    }
  }
  const domain = (options.preview ? createPreviewSaveDomain : createIdentifierSaveDomain)({client,
    metrics: () => copy(totals), delta: before => Object.fromEntries(Object.keys(totals).map(key => [key, totals[key] - before[key]]))});
  const stateStore = memoryState();
  function controller(input = context, state = stateStore, dependency = domain) {
    const args = {domain: dependency, stateStore: state, record: receipt => receipts.push(copy(receipt))};
    return options.preview ? createIdentifierSaveController(args)
      : createCanonicalIdentifierSaveController({...args, context: input});
  }
  return {client, domain, context, controller, stateStore, plants, histories, calls, queries, receipts,
    gardens, catalog, totals, options, setUser(value) { user = value; }};
}

for (let index = 0; index < witnessRows.length; index++) {
  const witness = witnessRows[index];
  test('generic canonical controller preserves ' + witness.canonicalSlug + ' through intent, RPC, receipt and readback', async () => {
    const t = offline(contextFor(index)), c = t.controller(), receipt = await c.save();
    assert.equal(c.intent.identity.profileSlug, witness.canonicalSlug);
    assert.equal(c.intent.identity.scientific, witness.scientificName);
    assert.equal(t.calls[0].args.p_profile_slug, witness.canonicalSlug);
    assert.equal(t.calls[0].args.p_scientific, witness.scientificName);
    assert.equal(t.calls[0].args.p_display_name, witness.displayName);
    for (const plant of [receipt.plant, receipt.readback.plant]) {
      assert.equal(plant.profile_slug, witness.canonicalSlug);
      assert.equal(plant.scientific, witness.scientificName);
      assert.equal(plant.user_id, t.context.ownerId);
      assert.equal(plant.garden_profile_id, t.context.gardenId);
      assert.equal(plant.client_instance_id, t.context.clientInstanceId);
    }
    assert.equal(receipt.hydration, 'VERIFIED');
    assert.equal(receipt.readback.source, 'authenticated-atomic-readback');
    assert.equal(receipt.readback.totalGardenPlants, 1, 'No historical fixture rows required');
    assert.equal(receipt.counts.rpcCalls, 1);
    assert.equal(receipt.counts.databaseReads, 4);
    assert.equal(receipt.counts.authRequests, 1);
    assert.deepEqual(t.calls[0].args, {p_garden_profile_id: t.context.gardenId,
      p_client_instance_id: t.context.clientInstanceId, p_display_name: witness.displayName, p_mode: 'scan',
      p_profile_slug: witness.canonicalSlug, p_scientific: witness.scientificName, p_garden_area_id: null});
    assert.deepEqual(t.queries.filter(query => query.table.startsWith('garden_')).map(query => query.filters[0]),
      [['id', t.context.gardenId], ['garden_profile_id', t.context.gardenId], ['garden_profile_id', t.context.gardenId]]);
  });
}

test('generic context is explicit and cannot inherit Preview defaults or change after controller creation', async () => {
  const t = offline();
  assert.throws(() => createCanonicalIdentifierSaveController({domain: t.domain, stateStore: t.stateStore}));
  const c = t.controller();
  t.context.canonicalSlug = 'monstera'; t.context.ownerId = 'changed'; t.context.gardenId = GARDEN;
  const r = await c.save();
  assert.equal(r.plant.profile_slug, 'lemon');
  assert.equal(r.plant.user_id, 'authenticated-owner-0');
  assert.equal(r.plant.garden_profile_id, 'owned-garden-0');
  assert.throws(() => { c.intent.identity.profileSlug = 'monstera'; }, TypeError);
});
for (const field of ['gardenId', 'ownerId', 'clientInstanceId', 'canonicalSlug', 'scientificName', 'displayName']) {
  test('missing canonical binding ' + field + ' fails before I/O', () => {
    const t = offline(), context = {...t.context, [field]: null};
    assert.throws(() => t.controller(context), /Explicit canonical/);
    assert.equal(t.calls.length + t.queries.length + t.totals.authRequests, 0);
  });
}
for (const user of [null, {id: 'other-owner', role: 'authenticated'}, {id: 'authenticated-owner-0', role: 'anon'}]) {
  test('fresh authenticated owner verification rejects ' + JSON.stringify(user), async () => {
    const t = offline(); t.setUser(user);
    await assert.rejects(() => t.controller().save(), /owner verification/);
    assert.equal(t.calls.length, 0); assert.equal(t.stateStore.read().attempts, 0);
  });
}
for (const [table, field, value] of [
  ['garden_profiles', 'id', 'other-garden'], ['garden_profiles', 'user_id', 'other-owner'],
  ['catalog_plants', 'slug', 'monstera'], ['catalog_plants', 'scientific_name', 'Monstera deliciosa'],
  ['catalog_plants', 'verification_state', 'unverified'], ['catalog_plants', 'media_status', 'MISSING']
]) {
  test('pre-command authoritative ' + table + '.' + field + ' mismatch fails', async () => {
    const t = offline(contextFor(), {patchRead(name, result) { if (name === table) result.data[field] = value; }});
    await assert.rejects(() => t.controller().save());
    assert.equal(t.calls.length, 0); assert.equal(t.stateStore.read().attempts, 0);
  });
}

for (const [field, value] of [
  ['id', null], ['id', '  '], ['id', {}], ['garden_profile_id', 'other-garden'],
  ['user_id', 'other-owner'], ['profile_slug', null], ['profile_slug', 'monstera'],
  ['scientific', 'Monstera deliciosa'], ['client_instance_id', 'other-intent'],
  ['status', 'healthy'], ['mark', 'green']
]) {
  test('generic receipt rejects plant ' + field + '=' + JSON.stringify(value), async () => {
    const t = offline(contextFor(), {patchRpc(result) { result.data.plant[field] = value; return result; }});
    await assert.rejects(() => t.controller().save());
    assert.equal(t.calls.length, 1);
    assert.equal(t.queries.some(query => query.table === 'garden_plants'), false);
    assert.equal(t.receipts.some(receipt => receipt.hydration === 'VERIFIED'), false);
  });
}
for (const [field, value] of [['id', null], ['id', {}], ['garden_plant_id', 'other-plant'],
  ['event_type', 'plant_changed'], ['source_module', 'other-module'],
  ['user_id', 'other-owner'], ['garden_profile_id', 'other-garden']]) {
  test('generic receipt rejects history ' + field + '=' + JSON.stringify(value), async () => {
    const t = offline(contextFor(), {patchRpc(result) { result.data.history[field] = value; return result; }});
    await assert.rejects(() => t.controller().save());
    assert.equal(t.calls.length, 1);
    assert.equal(t.receipts.some(receipt => receipt.hydration === 'VERIFIED'), false);
  });
}
for (const [label, patch] of [
  ['null response', () => null], ['missing envelope', () => ({})],
  ['not ok', result => ({...result, data: {...result.data, ok: false}})],
  ['missing plant', result => ({...result, data: {...result.data, plant: null}})],
  ['missing history', result => ({...result, data: {...result.data, history: null}})]
]) {
  test('malformed command: ' + label + ' fails without retry or success', async () => {
    const t = offline(contextFor(), {patchRpc: patch});
    await assert.rejects(() => t.controller().save());
    assert.equal(t.calls.length, 1);
    assert.equal(t.receipts.some(receipt => receipt.hydration === 'VERIFIED'), false);
  });
}
for (const [table, field, value] of [
  ['garden_plants', 'id', null], ['garden_plants', 'id', 'wrong-plant'],
  ['garden_plants', 'profile_slug', 'monstera'], ['garden_plants', 'profile_slug', null],
  ['garden_plants', 'scientific', 'Monstera deliciosa'], ['garden_plants', 'garden_profile_id', 'other-garden'],
  ['garden_plants', 'user_id', 'other-owner'], ['garden_plants', 'client_instance_id', 'other-intent'],
  ['garden_events', 'id', null], ['garden_events', 'id', 'wrong-history'],
  ['garden_events', 'garden_plant_id', 'wrong-plant'], ['garden_events', 'garden_profile_id', 'other-garden'],
  ['garden_events', 'user_id', 'other-owner'], ['garden_events', 'source_module', 'other-module'],
  ['garden_events', 'event_type', 'plant_changed'], ['garden_events', 'payload', {client_instance_id: 'other-intent'}]
]) {
  test('authoritative readback rejects ' + table + '.' + field + '=' + JSON.stringify(value), async () => {
    const t = offline(contextFor(), {patchRead(name, result) { if (name === table) result.data[0][field] = value; }});
    await assert.rejects(() => t.controller().save());
    assert.equal(t.calls.length, 1);
    assert.equal(t.receipts.at(-1).hydration, 'PENDING');
  });
}
for (const table of ['garden_plants', 'garden_events']) {
  for (const [label, patch] of [
    ['missing row', result => ({...result, data: [], count: 0})],
    ['duplicate row', result => ({...result, data: [...result.data, ...result.data], count: 2})],
    ['incomplete count', result => ({...result, count: 2})],
    ['partial response', result => ({...result, status: 206})],
    ['read error', result => ({...result, error: {message: 'read failed'}})],
    ['malformed data', result => ({...result, data: null})]
  ]) {
    test(table + ' ' + label + ' cannot become save success', async () => {
      const t = offline(contextFor(), {patchRead(name, result) { return name === table ? patch(result) : result; }});
      await assert.rejects(() => t.controller().save());
      assert.equal(t.calls.length, 1);
      assert.equal(t.receipts.at(-1).hydration, 'PENDING');
    });
  }
}
test('controller itself requires complete readback even with an injected domain', async () => {
  const t = offline();
  const c = t.controller(t.context, t.stateStore, {...t.domain, async hydrate() { return {verified: true}; }});
  await assert.rejects(() => c.save(), /Incomplete authoritative readback/);
  assert.equal(t.receipts.at(-1).hydration, 'PENDING');
});
test('same explicit intent keeps one logical plant/history across repeated explicit saves', async () => {
  const t = offline(), c = t.controller(), first = await c.save();
  const second = await c.save(), third = await c.save();
  for (const retry of [second, third]) {
    assert.equal(retry.created, false); assert.equal(retry.historyCreated, false);
    assert.equal(retry.plant.id, first.plant.id); assert.equal(retry.history.id, first.history.id);
    assert.equal(retry.clientInstanceId, first.clientInstanceId);
  }
  assert.equal(t.plants.size, 1); assert.equal(t.histories.size, 1); assert.equal(t.calls.length, 3);
  assert.deepEqual(t.calls.map(call => call.args), [t.calls[0].args, t.calls[0].args, t.calls[0].args]);
});
test('same key + conflicting canonical slug is blocked by the existing intent state before command execution', async () => {
  const t = offline(); await t.controller().save();
  await assert.rejects(() => t.controller({...t.context, ...witnessRows[1]}).save(), /Conflicting intent identity/);
  assert.equal(t.calls.length, 1); assert.equal(t.plants.size, 1);
});
test('same key conflict with a fresh injected state still fails through unchanged RPC semantics', async () => {
  const t = offline(); await t.controller().save();
  await assert.rejects(() => t.controller({...t.context, ...witnessRows[1]}, memoryState()).save(), /idempotency_payload_mismatch/);
  assert.equal(t.calls.length, 2); assert.equal(t.plants.size, 1); assert.equal(t.histories.size, 1);
});
test('separate explicit keys allow two instances of the same canonical species', async () => {
  const t = offline(), first = await t.controller().save();
  const second = await t.controller({...t.context, clientInstanceId: 'another:explicit:intent'}, memoryState()).save();
  assert.notEqual(second.plant.id, first.plant.id);
  assert.equal(second.plant.profile_slug, first.plant.profile_slug);
  assert.equal(t.plants.size, 2); assert.equal(t.histories.size, 2);
});
test('idempotency remains garden + intent, not a global intent or species lock', async () => {
  const t = offline(), first = await t.controller().save();
  t.gardens.push({id: 'second-owned-garden', user_id: t.context.ownerId});
  const second = await t.controller({...t.context, gardenId: 'second-owned-garden'}, memoryState()).save();
  assert.equal(second.clientInstanceId, first.clientInstanceId);
  assert.notEqual(second.plant.id, first.plant.id);
  assert.equal(second.plant.garden_profile_id, 'second-owned-garden');
  assert.equal(t.plants.size, 2);
});
test('same existing key can be explicitly resumed without a durable PI-specific store', async () => {
  const t = offline(), first = await t.controller().save();
  const resumed = await t.controller(t.context, memoryState()).save();
  assert.equal(resumed.hydration, 'VERIFIED'); assert.equal(resumed.created, false);
  assert.equal(resumed.plant.id, first.plant.id); assert.equal(t.plants.size, 1);
});
test('concurrent saves on one intent coalesce to exactly one command', async () => {
  const t = offline(), c = t.controller(), a = c.save(), b = c.save();
  assert.equal(a, b);
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first.plant.id, second.plant.id); assert.equal(t.calls.length, 1);
});
test('failed RPC does not retry; a later explicit retry uses exactly the same key', async () => {
  const t = offline(contextFor(), {rpcBefore: () => ({error: {code: 'OFFLINE_TEST', message: 'failed'}})});
  const c = t.controller(); await assert.rejects(() => c.save());
  assert.equal(t.calls.length, 1); assert.equal(t.plants.size, 0);
  delete t.options.rpcBefore;
  const receipt = await c.save();
  assert.equal(receipt.hydration, 'VERIFIED'); assert.equal(t.calls.length, 2);
  assert.deepEqual(t.calls[0].args, t.calls[1].args);
});
test('lost response after simulated commit resumes the same plant with no automatic retry', async () => {
  const t = offline(contextFor(), {patchRpc: () => ({error: {message: 'response lost'}})});
  const c = t.controller(); await assert.rejects(() => c.save());
  assert.equal(t.calls.length, 1); assert.equal(t.plants.size, 1);
  delete t.options.patchRpc;
  const receipt = await c.save();
  assert.equal(receipt.hydration, 'VERIFIED'); assert.equal(receipt.created, false);
  assert.equal(t.plants.size, 1); assert.equal(t.histories.size, 1);
  assert.deepEqual(t.calls[0].args, t.calls[1].args);
});
test('failed authoritative readback stays pending and can only resume on explicit retry', async () => {
  const t = offline(contextFor(), {patchRead(table, result) {
    return table === 'garden_events' ? {...result, error: {message: 'unavailable'}} : result;
  }});
  const c = t.controller(); await assert.rejects(() => c.save());
  assert.equal(t.calls.length, 1); assert.equal(t.receipts.at(-1).hydration, 'PENDING');
  delete t.options.patchRead;
  const receipt = await c.save();
  assert.equal(receipt.hydration, 'VERIFIED'); assert.equal(receipt.created, false);
  assert.equal(t.plants.size, 1); assert.equal(t.histories.size, 1);
});
test('fresh auth failure on retry blocks before command execution', async () => {
  const t = offline(), c = t.controller(); await c.save(); t.setUser(null);
  await assert.rejects(() => c.save(), /owner verification/);
  assert.equal(t.calls.length, 1); assert.equal(t.stateStore.read().attempts, 1);
});
test('retry retains existing owner-assessed health', async () => {
  const t = offline(), c = t.controller(); await c.save();
  const plant = [...t.plants.values()][0]; plant.status = 'healthy'; plant.mark = 'owner-assessed';
  const retry = await c.save();
  assert.equal(retry.created, false);
  assert.equal(retry.plant.status, 'healthy'); assert.equal(retry.plant.mark, 'owner-assessed');
});
test('retry rejects a different authoritative plant or history identity', async () => {
  for (const field of ['plantId', 'historyId']) {
    const t = offline(), c = t.controller(); await c.save();
    t.stateStore.write({...t.stateStore.read(), [field]: 'different-authoritative-id'});
    await assert.rejects(() => c.save(), /Retry returned different/);
    assert.equal(t.receipts.filter(receipt => receipt.hydration === 'VERIFIED').length, 1);
  }
});
test('generic controller rejects unbound old attempt state instead of assuming a fixture', async () => {
  const t = offline();
  await assert.rejects(() => t.controller(t.context, memoryState({attempts: 1})).save(), /Missing intent identity/);
  assert.equal(t.calls.length + t.totals.authRequests, 0);
});

const previewContext = {gardenId: GARDEN, ownerId: OWNER, clientInstanceId: SAVE_KEY,
  canonicalSlug: FIXTURE.profileSlug, scientificName: FIXTURE.scientific, displayName: FIXTURE.name};
test('historical Preview is a fixed caller of the shared query/controller path, including its two-attempt limit', async () => {
  const t = offline(previewContext, {preview: true}), c = t.controller();
  const first = await c.save(), retry = await c.save();
  assert.equal(first.created, true); assert.equal(retry.created, false);
  assert.equal(first.readback.source, 'authenticated-preview-readback');
  assert.equal(first.readback.totalGardenPlants, 3);
  assert.equal(retry.plant.profile_slug, 'monstera');
  assert.deepEqual(t.calls[0].args, t.calls[1].args);
  await assert.rejects(() => c.save(), /already attempted/);
  assert.equal(t.calls.length, 2);
});
test('Preview still requires the original historical garden rows', async () => {
  const t = offline(previewContext, {preview: true});
  t.plants.delete('historical-079827a3-732d-4a16-acd0-b9949bc7bc53');
  await assert.rejects(() => t.controller().save(), /Original fixture disappeared/);
  assert.equal(t.receipts.at(-1).hydration, 'PENDING');
});
test('Preview still rejects an already-existing first save and unexpected creation on retry', async () => {
  const t = offline(previewContext, {preview: true}), c = t.controller(); await c.save();
  await assert.rejects(() => t.controller(previewContext, memoryState()).save(), /Expected first create/);
  t.options.patchRpc = result => { result.data.created = true; return result; };
  await assert.rejects(() => c.save(), /Retry unexpectedly created/);
});
test('historical Preview attempt records without new binding metadata remain readable', async () => {
  const t = offline(previewContext, {preview: true}), first = await t.controller().save();
  const oldState = memoryState({attempts: 1, plantId: first.plant.id, historyId: first.history.id});
  const retry = await t.controller(previewContext, oldState).save();
  assert.equal(retry.created, false); assert.equal(retry.plant.id, first.plant.id);
});
test('the fixed Preview domain cannot silently override a generic canonical intent', async () => {
  const t = offline(previewContext, {preview: true});
  const c = createCanonicalIdentifierSaveController({context: contextFor(), domain: t.domain, stateStore: memoryState()});
  await assert.rejects(() => c.save(), /Bounded Preview fixture mismatch/);
  assert.equal(t.calls.length + t.queries.length + t.totals.authRequests, 0);
});
