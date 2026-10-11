// Explicitly injected domain; the reviewed command is constructed ONCE and is the sole writer.
import {prepareAddPlantIntent} from './add-plant-contract.js';
import {createAtomicAddPlantCommand} from './add-plant-write-repository.js';
export const SAVE_KEY='identifier:core-v1-commit5-20261008-monstera-01';
export const GARDEN='a2b4080d-3858-4f71-b5ac-23847aa17e1d';
export const OWNER='f9df38ad-7f91-41cf-b7ce-ee87a692be86';
export const FIXTURE=Object.freeze({name:'Monstera',scientific:'Monstera deliciosa',profileSlug:'monstera'});
export function createIdentifierSaveController({domain,stateStore,record=()=>{}}={}){
 if(!domain||!stateStore||typeof domain.verify!=='function'||typeof domain.hydrate!=='function'||typeof domain.getSupabaseClient!=='function')throw Error('Explicit authenticated Preview domain required');
 const command=createAtomicAddPlantCommand(domain.getSupabaseClient());
 const intent=prepareAddPlantIntent({mode:'scan',gardenProfileId:GARDEN,clientInstanceId:SAVE_KEY,displayName:FIXTURE.name,identityConfirmed:true,canonicalSlug:FIXTURE.profileSlug,scientificName:FIXTURE.scientific,gardenAreaId:null});
 let inFlight=null;
 async function execute(){
  const before=domain.metrics();const prior=stateStore.read();
  if(prior.attempts>=2)throw Error('Bounded Commit 5 save and retry already attempted; stop for Supervisor.');
  await domain.verify({gardenId:GARDEN,ownerId:OWNER,fixture:FIXTURE});
  const attempt=prior.attempts+1;stateStore.write({...prior,attempts:attempt});
  let result;
  try{result=await command.execute(intent);}catch(e){record({kind:'RPC_UNCONFIRMED',attempt,clientInstanceId:SAVE_KEY,error:e.code??'RPC_FAILED',counts:domain.delta(before)});throw e;}
  const p=result.plant,h=result.history;
  if(!p.id||p.user_id!==OWNER||p.garden_profile_id!==GARDEN||p.client_instance_id!==SAVE_KEY||p.profile_slug!==FIXTURE.profileSlug||p.scientific!==FIXTURE.scientific||h.source_module!=='plant_identifier'||!h.id||h.garden_plant_id!==p.id||h.event_type!=='plant_added')throw Error('Authoritative response identity mismatch');
  if(result.created&&(p.status!=='unassessed'||p.mark!=='unknown'))throw Error('New plant health inferred');
  if(prior.plantId&&prior.plantId!==p.id)throw Error('Retry returned different Plant identity');
  const receipt={kind:attempt===1?'first-save':'retry',attempt,clientInstanceId:SAVE_KEY,created:result.created,historyCreated:result.historyCreated,plant:p,history:h,at:new Date().toISOString(),counts:domain.delta(before),hydration:'PENDING'};
  stateStore.write({attempts:attempt,plantId:p.id,historyId:h.id});record(receipt);
  // No local success stand-in: read the authoritative Plant and History back before navigation.
  const readback=await domain.hydrate({plantId:p.id,historyId:h.id,clientInstanceId:SAVE_KEY});
  receipt.readback=readback;receipt.hydration='VERIFIED';receipt.counts=domain.delta(before);record(receipt);
  if(receipt.counts.rpcCalls!==1||receipt.counts.supabaseWrites!==1)throw Error('Save must use exactly one RPC');
  if(attempt===1&&(!receipt.created||!receipt.historyCreated))throw Error('Expected first create; row already existed. Receipt retained for review.');
  if(attempt===2&&(receipt.created||receipt.historyCreated))throw Error('Retry unexpectedly created data');
  return receipt;
 }
 return Object.freeze({save(){if(inFlight)return inFlight;inFlight=execute().finally(()=>{inFlight=null});return inFlight;},intent});
}
