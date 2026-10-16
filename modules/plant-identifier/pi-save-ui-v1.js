// PI-08 interaction only. No authority, persistence, retry loop or navigation.
import {canonicalPiResult} from './real-pi-runtime-v1.js';
const blockedReasons = new Set(['REVIEW_REQUIRED','REVIEW_CHANGED','REVIEW_IDENTITY_MISMATCH','TARGET_GARDEN_CHANGED','HOST_NOT_READY','PI_RESULT_CHANGED']);
const messages = {
 READY:'Only the basic plant record will be saved now.', SAVING:'Saving… Waiting for verified garden readback.',
 SUCCESS:'Saved to your garden. Your garden has been refreshed.',
 UNKNOWN:'Save outcome unknown. Check save status using the same intent.',
 BLOCKED:'Your garden or review changed. Return to suitability and check again.',
 SIGNED_OUT:'Sign in before saving.', RESTORING:'Your garden is still loading.',
 NO_ACTIVE_GARDEN:'Select an active garden before saving.', UNAVAILABLE:'Save is unavailable. Return to suitability and try again.'
};
export function createPiSaveUi({readState,readContext,getClient,onChange=()=>{}}) {
 let current=null,reviewId=null,intent=null,pending=false,status='UNAVAILABLE',receipt=null,epoch=0;
 function context(state=readState()) {
  try {
   const plant=canonicalPiResult(state),c=readContext(),r=c?.review,ready=c?.readiness;
   if(!plant.available)return {reason:'UNAVAILABLE'};
   if(ready?.status==='SIGNED_OUT'||ready?.authenticated===false)return {reason:'SIGNED_OUT'};
   if(ready?.status==='RESTORING')return {reason:'RESTORING'};
   if(ready?.status==='NO_ACTIVE_GARDEN'||ready&& !ready.gardenProfileId)return {reason:'NO_ACTIVE_GARDEN'};
   if(ready?.status!=='READY'||ready.authenticated!==true||ready.profilesHydrated!==true)return {reason:'UNAVAILABLE'};
   if(r?.valid!==true||r.canonicalSlug!==plant.canonicalSlug||r.scientific!==plant.scientific||r.actionId!==state.actionId
    ||!r.operationId||r.reviewedGardenProfileId!==ready.gardenProfileId)return {reason:'BLOCKED'};
   return {plant,review:r,id:JSON.stringify([r.operationId,r.reviewedGardenProfileId,r.actionId]),gardenId:r.reviewedGardenProfileId};
  }catch{return {reason:'UNAVAILABLE'};}
 }
 function snapshot(){
  const c=context();
  const live=current===readState()&&!c.reason&&c.id===reviewId;
  return Object.freeze({status:pending?'SAVING':!live?c.reason||'BLOCKED':status,
   message:messages[pending?'SAVING':!live?c.reason||'BLOCKED':status],
   enabled:live&&!pending&&['READY','UNKNOWN'].includes(status),receipt:status==='SUCCESS'&&live?receipt:null});
 }
 const notify=()=>onChange(snapshot());
 return Object.freeze({
  canOpen:()=>!context().reason,
  open(){
   const c=context();if(c.reason||pending)return false;
   if(current!==readState()||reviewId!==c.id){
    // An unresolved operation is never replaced merely by reopening the screen.
    if(intent&&status==='UNKNOWN')return false;
    current=readState();reviewId=c.id;intent=null;receipt=null;status='READY';epoch++;
   }
   notify();return true;
  },
  async activate({explicitUserAction=false}={}){
   if(explicitUserAction!==true||!snapshot().enabled)return null;
   const client=getClient();if(!client?.beginIntent||!client?.saveCurrent){status='UNAVAILABLE';notify();return null;}
   pending=true;const generation=epoch;notify();
   try{
    if(!intent)intent=await client.beginIntent({explicitUserAction:true});
    if(!intent){status='BLOCKED';return null;}
    const c=context();if(generation!==epoch||current!==readState()||c.reason||c.id!==reviewId){status='BLOCKED';return null;}
    const result=await client.saveCurrent({explicitUserAction:true});
    const after=context();
    if(generation!==epoch||current!==readState()||after.reason||after.id!==reviewId){status='BLOCKED';return result;}
    const r=result?.receipt;
    if(result?.ok===true&&client.getState?.().status==='SAVED'&&r?.canonicalSlug===c.plant.canonicalSlug
      &&r.clientInstanceId===intent.clientInstanceId&&r.gardenId===c.gardenId
      &&typeof r.plantId==='string'&&r.plantId&&typeof r.historyId==='string'&&r.historyId){
     receipt=r;status='SUCCESS';
    }else status=blockedReasons.has(result?.reason)?'BLOCKED':'UNKNOWN';
    return result;
   }catch{status=intent?'UNKNOWN':'UNAVAILABLE';return null;}
   finally{pending=false;notify();}
  },
  getState:snapshot,
  refresh:notify
 });
}
