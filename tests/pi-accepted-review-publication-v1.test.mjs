import {withoutSaveUi} from './helpers/pi-save-ui-source-compat.mjs';
import {withoutTargetBinding} from './helpers/pi-target-binding-source-compat.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createPiAcceptedReviewPublication} from '../modules/plant-identifier/accepted-review-publication-v1.js';
import {createPiSuitabilityHost} from '../modules/plant-identifier/suitability-context-handoff-v1.js';
import {withoutAcceptedReview} from './helpers/pi-accepted-review-source-compat.mjs';
const origin='https://offline.invalid', route='/core-v1/plant-identification/';
function emitter(url){const listeners=new Map();return {location:new URL(url),addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener(n,f){listeners.get(n)?.delete(f);},fire(n,e={}){for(const f of listeners.get(n)||[])f(e);}};}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
const scientific={lemon:'Citrus × limon',pomegranate:'Punica granatum',raspberry:'Rubus idaeus'};
function fixture(){
 const window=emitter(origin+'/app.html'),child=emitter(origin+route),frame=Object.assign(emitter(origin+route),{src:origin+route,isConnected:true,contentWindow:child});
 let accepted=null,current=true,publications=[];const listeners=new Set();
 Object.defineProperty(child,'cruvitCorePiReviewSurface',{value:Object.freeze({read:()=>accepted,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}})});
 const publication=createPiAcceptedReviewPublication({window,onPublish:r=>publications.push(r)});assert.equal(publication.bind(frame),true);
 const result=(slug='lemon',garden='garden-a')=>({ok:true,identity:{canonicalSlug:slug,scientific:scientific[slug],actionId:'identify-'+slug},context:{readiness:{status:'READY',authenticated:true,gardenProfileId:garden},location:{gardenProfileId:garden}},evaluation:{gardenProfileId:garden}});
 const start=(r=result(),operationId='evaluation-1')=>{publication.observer.pending({child,operationId});publication.observer.validated({child,operationId,result:structuredClone(r),isCurrent:()=>current});return r;};
 const accept=r=>{accepted=r===null?null:freeze(structuredClone(r));for(const f of listeners)f();};
 return {window,child,frame,publication,publications,result,start,accept,stale(){current=false;},read:()=>publication.read()};
}
for(const slug of Object.keys(scientific))test(slug+': host result plus immutable accepted PI review publishes once',()=>{
 const f=fixture(),r=f.start(f.result(slug));assert.equal(f.read().valid,false);f.accept(r);
 assert.deepEqual(f.read(),{valid:true,canonicalSlug:slug,scientific:scientific[slug],actionId:'identify-'+slug,reviewedGardenProfileId:'garden-a',operationId:'evaluation-1'});
 for(let i=0;i<20;i++)assert.equal(f.read().valid,true);assert.equal(f.publications.length,1);
 assert.ok(Object.isFrozen(f.read()));assert.throws(()=>{f.read().reviewedGardenProfileId='evil';});f.publication.dispose();
});
for(const field of ['garden','canonical','scientific','action','evaluation'])test('child cannot forge '+field,()=>{
 const f=fixture(),r=f.start();if(field==='garden')r.context.readiness.gardenProfileId='evil';if(field==='canonical')r.identity.canonicalSlug='pomegranate';if(field==='scientific')r.identity.scientific='wrong';if(field==='action')r.identity.actionId='wrong';if(field==='evaluation')r.evaluation.gardenProfileId='evil';
 f.accept(r);assert.equal(f.read().valid,false);assert.equal(f.publications.length,0);f.publication.dispose();
});
test('unaccepted and unsolicited child review cannot publish',()=>{const f=fixture();f.accept(f.result());assert.equal(f.read().valid,false);assert.equal(f.publications.length,0);f.publication.dispose();});
test('new evaluation cannot republish the previous accepted object',()=>{const f=fixture(),r=f.start();f.accept(r);f.start(r,'evaluation-2');assert.equal(f.read().valid,false);assert.equal(f.publications.length,1);f.accept(r);assert.equal(f.read().operationId,'evaluation-2');assert.equal(f.publications.length,2);f.publication.dispose();});
for(const event of ['cruvit:garden-context-ready','cruvit:auth-session-changed','pagehide'])test(event+' invalidates and late acceptance cannot restore',()=>{const f=fixture(),r=f.start();f.accept(r);f.window.fire(event);f.accept(r);assert.equal(f.read().valid,false);assert.equal(f.publications.length,1);});
test('same-garden authoritative selection change invalidates without new revision system',()=>{const f=fixture(),r=f.start();f.accept(r);f.stale();assert.equal(f.read().valid,false);assert.equal(f.read().reason,'HOST_CONTEXT_CHANGED');f.publication.dispose();});
test('stale result never publishes',()=>{const f=fixture(),r=f.start();f.stale();f.accept(r);assert.equal(f.read().valid,false);assert.equal(f.publications.length,0);f.publication.dispose();});
test('canonical switch clears private acceptance and invalidates host review',()=>{const f=fixture();f.accept(f.start());f.accept(null);assert.equal(f.read().valid,false);f.publication.dispose();});
test('fresh Garden B review replaces invalid Garden A',()=>{const f=fixture();f.accept(f.start());f.window.fire('cruvit:garden-context-ready');assert.equal(f.read().valid,false);f.accept(f.start(f.result('raspberry','garden-b'),'evaluation-b'));assert.equal(f.read().reviewedGardenProfileId,'garden-b');assert.equal(f.read().canonicalSlug,'raspberry');assert.equal(f.publications.length,2);f.publication.dispose();});
for(const mutation of ['origin','route','query','hash','disconnect','frame'])test('frame lifecycle '+mutation+' invalidates',()=>{const f=fixture();f.accept(f.start());if(mutation==='origin')f.child.location=new URL('https://evil.invalid'+route);if(mutation==='route')f.child.location=new URL(origin+'/other');if(mutation==='query')f.child.location.search='?garden=evil';if(mutation==='hash')f.child.location.hash='#evil';if(mutation==='disconnect')f.frame.isConnected=false;if(mutation==='frame')f.frame.contentWindow={};assert.equal(f.read().valid,false);f.publication.dispose();});
test('unbind invalidates accepted and queued callbacks',()=>{const f=fixture(),r=f.start();f.accept(r);f.publication.unbind();f.accept(r);assert.equal(f.read().valid,false);f.publication.dispose();});
const root=new URL('../',import.meta.url);
test('legacy source preservation excludes only exact observer additions; every other byte identical',()=>{for(const p of ['app.html','core-v1/plant-identification/index.html','modules/plant-identifier/pi-suitability-view-v1.js','modules/plant-identifier/suitability-context-handoff-v1.js'])assert.equal(withoutAcceptedReview(withoutTargetBinding(withoutSaveUi(readFileSync(new URL(p,root),'utf8')))),execFileSync('git',['show','9117a0b0161c68ccb75239f2e31bf232e5aa69b5:'+p],{cwd:root,encoding:'utf8',maxBuffer:1e7}));});
// Compare real original/current host replies, including malicious messages and failed authority.
const oldSource=execFileSync('git',['show','9117a0b0161c68ccb75239f2e31bf232e5aa69b5:modules/plant-identifier/suitability-context-handoff-v1.js'],{cwd:root,encoding:'utf8'});
const {createPiSuitabilityHost:oldHost}=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
function hostTrace(factory,status='READY',probe='valid',observer={}){
 const window=emitter(origin+'/app.html'),child=emitter(origin+route),replies=[],calls=[];child.postMessage=(r,o)=>replies.push([r,o]);
 const frame={src:origin+route,isConnected:true,contentWindow:child};const host=factory({window,reviewObserver:observer,getReadiness:()=>({status,authenticated:status!=='SIGNED_OUT',gardenProfileId:status==='NO_ACTIVE_GARDEN'?null:'garden-a'}),getLocationContext:()=>({gardenProfileId:'garden-a',useForSuitability:true}),hasTrustedLocation:()=>true,getClimateProfile:()=>({status:'known'}),getSiteContext:()=>({irrigationReliability:'known'}),resolveCanonicalPlant:({slug,scientific:s})=>scientific[slug]===s?{slug,scientific:s}:null,evaluateSuitability:slug=>{calls.push(slug);return {ok:true,engine:'smartRecEvaluateSuitability',paidAiCalls:0,gardenProfileId:'garden-a'};}});
 host.bind(frame);replies.length=0;
 for(const operation of ['context','evaluate']){const event={origin,source:child,data:{type:'cruvit:core-pi-suitability-request',requestId:'operation-'+operation,operation,identity:{canonicalSlug:'lemon',scientific:scientific.lemon,actionId:'identify-a'}}};if(probe==='origin')event.origin='https://evil.invalid';if(probe==='frame')event.source={};if(probe==='operation')event.data.operation='publish';window.fire('message',event);}
 host.dispose();return {replies,calls};
}
for(const status of ['READY','RESTORING','SIGNED_OUT','NO_ACTIVE_GARDEN'])for(const probe of ['valid','origin','frame','operation'])test('Slice6A wire compatibility '+status+'/'+probe,()=>{const observed=[];assert.deepEqual(hostTrace(createPiSuitabilityHost,status,probe,{pending:r=>observed.push(r),validated:r=>observed.push(r),invalidate:()=>{}}),hostTrace(oldHost,status,probe));if(probe!=='valid')assert.equal(observed.length,0);});
test('throwing observer cannot change original context/evaluate semantics',()=>{const fail=()=>{throw Error('Observer failed');};assert.deepEqual(hostTrace(createPiSuitabilityHost,'READY','valid',{pending:fail,validated:fail,invalidate:fail}),hostTrace(oldHost));});

test('initial about:blank frame binds, attaches only after approved route load',()=>{const f=fixture();f.publication.unbind();f.child.location=new URL('about:blank');assert.equal(f.publication.bind(f.frame),true);f.child.location=new URL(origin+route);f.frame.fire('load');f.accept(f.start());assert.equal(f.read().valid,true);f.publication.dispose();});
