// The caller injects its authenticated Preview client and meter. No global domain, inserts or event writer.
import {GARDEN,OWNER,SAVE_KEY,FIXTURE} from './save-controller.mjs';
const PREVIEW='https://pwgeygwafuinwkpmnzxp.supabase.co';
const PSELECT='id,user_id,garden_profile_id,client_instance_id,name,profile_slug,scientific,status,mark,archived';
function full(r,label){if(r.error||r.status!==200||!Array.isArray(r.data)||r.count!==r.data.length)throw Error(label+' read failed or incomplete');return r.data;}
export function createPreviewSaveDomain({client,metrics,delta}={}){
 if(client?.supabaseUrl?.replace(/\/$/,'')!==PREVIEW||typeof metrics!=='function'||typeof delta!=='function')throw Error('Explicit Preview client and meter required');
 return Object.freeze({getSupabaseClient:()=>client,metrics,delta,
 async verify({gardenId,ownerId,fixture}){
  if(gardenId!==GARDEN||ownerId!==OWNER||fixture.profileSlug!==FIXTURE.profileSlug||fixture.scientific!==FIXTURE.scientific)throw Error('Bounded Preview fixture mismatch');
  const auth=await client.auth.getUser();if(auth.error||auth.data?.user?.id!==OWNER||auth.data.user.role!=='authenticated')throw Error('Sign in as the existing Preview User A first');
  const [garden,catalog]=await Promise.all([
   client.from('garden_profiles').select('id,user_id').eq('id',GARDEN).single(),
   client.from('catalog_plants').select('slug,scientific_name,verification_state,media_status').eq('slug','monstera').single()
  ]);
  if(garden.error||garden.status!==200||garden.data.id!==GARDEN||garden.data.user_id!==OWNER)throw Error('Garden owner read failed');
  if(catalog.error||catalog.status!==200||catalog.data.slug!=='monstera'||catalog.data.scientific_name!=='Monstera deliciosa'||catalog.data.verification_state!=='verified'||catalog.data.media_status!=='IMAGE_READY')throw Error('Exact approved canonical Monstera missing');
 },
 async hydrate({plantId,historyId,clientInstanceId}){
  if(clientInstanceId!==SAVE_KEY)throw Error('Unapproved save key');
  const [p,h]=await Promise.all([
   client.from('garden_plants').select(PSELECT,{count:'exact'}).eq('garden_profile_id',GARDEN).order('id').range(0,999),
   client.from('garden_events').select('id,user_id,garden_profile_id,garden_plant_id,event_type,source_module,client_event_id,payload',{count:'exact'}).eq('garden_profile_id',GARDEN).eq('garden_plant_id',plantId).eq('event_type','plant_added').order('id')
  ]);
  const plants=full(p,'Plant'),history=full(h,'History');
  const exact=plants.filter(r=>r.client_instance_id===SAVE_KEY);
  if(exact.length!==1||exact[0].id!==plantId||exact[0].profile_slug!=='monstera'||exact[0].scientific!=='Monstera deliciosa'||exact[0].user_id!==OWNER)throw Error('Authoritative Plant readback mismatch');
  if(history.length!==1||history[0].id!==historyId||history[0].garden_plant_id!==plantId||history[0].source_module!=='plant_identifier'||history[0].user_id!==OWNER||history[0].payload?.client_instance_id!==SAVE_KEY)throw Error('Authoritative History readback mismatch');
  for(const id of ['079827a3-732d-4a16-acd0-b9949bc7bc53','f82ded5a-8b6f-4093-be98-6972c12e4520'])if(!plants.some(p=>p.id===id))throw Error('Original fixture disappeared');
  return {source:'authenticated-preview-readback',gardenId:GARDEN,plant:exact[0],history:history[0],plantKeyCount:exact.length,plantAddedHistoryCount:history.length,totalGardenPlants:plants.length,allPlants:plants,readAt:new Date().toISOString()};
 }});
}
