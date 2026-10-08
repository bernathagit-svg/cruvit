// Offline contract tests only. No network, real session, migration, or database write.
import test from 'node:test';import assert from 'node:assert/strict';
import {createIdentifierSaveController,SAVE_KEY,GARDEN,OWNER,FIXTURE} from '../../core-v1/plant-identification/atomic/save-controller.mjs';
import {createPreviewSaveDomain} from '../../core-v1/plant-identification/atomic/preview-domain.mjs';
function setup(options={}){
 let state={attempts:0},getters=0,calls=[],receipts=[],rows=new Map(),histories=new Map();
 const metrics={rpcCalls:0,supabaseWrites:0,databaseReads:0,authRequests:0,externalProviderCalls:0,paidAICalls:0,storageSignRequests:0};
 const client={async rpc(name,args){calls.push({name,args});metrics.rpcCalls++;metrics.supabaseWrites++;if(options.rpcError)return {error:{code:'UNIT_ERROR'},data:null};
  const created=!rows.has(args.p_client_instance_id);if(created)rows.set(args.p_client_instance_id,{id:'unit-authoritative-plant',user_id:OWNER,garden_profile_id:GARDEN,client_instance_id:args.p_client_instance_id,name:'Monstera',scientific:'Monstera deliciosa',profile_slug:'monstera',status:'unassessed',mark:'unknown'});
  const plant={...rows.get(args.p_client_instance_id),...options.patchPlant},historyCreated=!histories.has(plant.id);if(historyCreated)histories.set(plant.id,{id:'unit-history',garden_plant_id:plant.id,event_type:'plant_added',source_module:'plant_identifier'});
  return {error:null,data:{ok:true,created,historyCreated,plant,history:{...histories.get(plant.id),...options.patchHistory}}};
 }};
 const domain={getSupabaseClient(){getters++;return client},metrics:()=>({...metrics}),delta:before=>Object.fromEntries(Object.keys(metrics).map(k=>[k,metrics[k]-before[k]])),async verify(){metrics.authRequests++;metrics.databaseReads+=2;if(options.authError)throw Error('Owner verification failed')},async hydrate(){metrics.databaseReads+=2;if(options.readError)throw Error('readback failed');return {plantKeyCount:rows.size,historyCount:histories.size,verified:true}}};
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
