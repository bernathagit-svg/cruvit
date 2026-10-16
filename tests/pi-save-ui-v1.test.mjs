import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createPiSaveUi} from '../modules/plant-identifier/pi-save-ui-v1.js';
// The same verified canonical fixture used by the retained PI controller tests.
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const scientific={lemon:'Citrus × limon',pomegranate:'Punica granatum',raspberry:'Rubus idaeus'};
function fixture(slug='lemon'){
 let state={evidence:{candidates:[{gbifVerified:true,confidence:'high'}]},status:'CANONICAL_READY',readyForResult:true,actionId:'display-'+slug,identity:{canonicalSlug:slug},
  catalogRow:{slug,scientific_name:scientific[slug],common_names:{en:slug},verification_state:'verified',needs_review:false,media_status:'IMAGE_READY',
   media:JSON.parse(read('data/catalog-media/cache/'+({lemon:'lemon__citrus___limon__v1.0.0.json',pomegranate:'pomegranate__punica_granatum__v1.0.0.json',raspberry:'raspberry__rubus_idaeus__v1.0.0.json'}[slug]))).media}};
 const review={valid:true,canonicalSlug:slug,scientific:scientific[slug],actionId:state.actionId,reviewedGardenProfileId:'garden-a',operationId:'op-a'};
 const context={review,readiness:{status:'READY',authenticated:true,profilesHydrated:true,gardenProfileId:'garden-a'}};
 const counts={begin:0,save:0};let result,release,saved=false;
 const receipt={canonicalSlug:slug,clientInstanceId:'key-a',gardenId:'garden-a',plantId:'plant-a',historyId:'history-a'};
 const client={beginIntent:async()=>{counts.begin++;return {clientInstanceId:'key-a'};},
  saveCurrent:async()=>{counts.save++;if(release)await new Promise(r=>{release.resolve=r;});saved=true;return result||{ok:true,receipt};},getState:()=>({status:saved?'SAVED':'SAVING'})};
 const ui=createPiSaveUi({readState:()=>state,readContext:()=>context,getClient:()=>client});
 return {ui,context,counts,client,receipt,changeState(){state={...state,actionId:'other'};},setResult:r=>result=r,hold(){release={};return release;}};
}
for(const slug of Object.keys(scientific))test('PI08 UI '+slug+' exact canonical success, one intent and one explicit save',async()=>{
 const f=fixture(slug);assert.equal(f.ui.open(),true);assert.equal(f.ui.getState().status,'READY');
 await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:1});assert.equal(f.ui.getState().status,'SUCCESS');assert.equal(f.ui.getState().receipt.canonicalSlug,slug);
 await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:1});
});
test('pending rapid activation shares no new intent or save; no optimistic success',async()=>{
 const f=fixture();f.ui.open();const latch=f.hold(),p=f.ui.activate({explicitUserAction:true});await Promise.resolve();await Promise.resolve();
 assert.equal(f.ui.getState().status,'SAVING');assert.equal(f.ui.getState().receipt,null);await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:1});latch.resolve();await p;assert.equal(f.ui.getState().status,'SUCCESS');
});
for(const reason of ['REVIEW_REQUIRED','REVIEW_CHANGED','TARGET_GARDEN_CHANGED','HOST_NOT_READY'])test('known '+reason+' blocks with no replacement intent',async()=>{
 const f=fixture();f.ui.open();f.setResult({ok:false,reason});await f.ui.activate({explicitUserAction:true});assert.equal(f.ui.getState().status,'BLOCKED');await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:1});
});
for(const bad of [{ok:false,reason:'SAVE_UNCONFIRMED'},{ok:true,receipt:{}},{ok:true,receipt:{plantId:'wrong'}}])test('unconfirmed/incomplete receipt preserves intent for explicit status check '+JSON.stringify(bad),async()=>{
 const f=fixture();f.ui.open();f.setResult(bad);await f.ui.activate({explicitUserAction:true});assert.equal(f.ui.getState().status,'UNKNOWN');assert.equal(f.ui.getState().receipt,null);assert.deepEqual(f.counts,{begin:1,save:1});
 f.setResult({ok:true,receipt:f.receipt});await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:2});assert.equal(f.ui.getState().status,'SUCCESS');
});
for(const status of ['SIGNED_OUT','RESTORING','NO_ACTIVE_GARDEN'])test(status+' prevents UI entry and dispatch',async()=>{
 const f=fixture();f.context.readiness.status=status;assert.equal(f.ui.open(),false);await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:0,save:0});
});
for(const mutate of [f=>f.context.readiness.gardenProfileId='garden-b',f=>f.context.review.valid=false,f=>f.context.review.operationId='new',f=>f.changeState()])test('fresh context/canonical change blocks before Save '+mutate.toString(),async()=>{
 const f=fixture();f.ui.open();mutate(f);await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:0,save:0});
});
test('no explicit user action never dispatches',async()=>{const f=fixture();f.ui.open();await f.ui.activate();assert.deepEqual(f.counts,{begin:0,save:0});});
test('garden race after begin blocks before saveCurrent',async()=>{const f=fixture();f.ui.open();f.client.beginIntent=async()=>{f.counts.begin++;f.context.readiness.gardenProfileId='garden-b';return {clientInstanceId:'key-a'};};await f.ui.activate({explicitUserAction:true});assert.deepEqual(f.counts,{begin:1,save:0});});
test('late successful reply cannot restore stale UI success',async()=>{const f=fixture();f.ui.open();const latch=f.hold(),p=f.ui.activate({explicitUserAction:true});await Promise.resolve();await Promise.resolve();f.context.review.valid=false;latch.resolve();await p;assert.equal(f.ui.getState().receipt,null);assert.equal(f.ui.getState().status,'BLOCKED');});
test('locked authorities byte-identical to approved parent',()=>{
 for(const p of ['modules/plant-identifier/atomic-save-handoff-v1.js','modules/plant-identifier/accepted-review-publication-v1.js','modules/plant-identifier/suitability-context-handoff-v1.js','modules/plant-identifier/pi-suitability-view-v1.js','modules/plant-identifier/real-pi-runtime-v1.js','core-v1/plant-identification/atomic/save-controller.mjs','core-v1/plant-identification/atomic/preview-domain.mjs'])assert.equal(read(p),execFileSync('git',['show','810125a43b0902aecde7d0af8ada4e5aa4f0f7d6:'+p],{cwd:root,encoding:'utf8',maxBuffer:10000000}));
 const s=read('modules/plant-identifier/pi-save-ui-v1.js');assert.doesNotMatch(s,/fetch\(|\.rpc\(|\.insert\(|\.upsert\(|localStorage|sessionStorage|savePlantFromLibrary|setTimeout|location\.assign/);
 const html=read('core-v1/plant-identification/index.html');assert.doesNotMatch(html,/await saveAction|location.assign/);assert.match(html,/saveUi.activate\(\{explicitUserAction:true\}\)/);
});
