// Read-only summary for one isolated Preview garden. No task/alert/notification implementation.
export const PREVIEW_URL='https://pwgeygwafuinwkpmnzxp.supabase.co';
export const PUBLIC_KEY='sb_publishable_FqkszZTjO3XXbZBaDojCyQ_hY85Kfbo';
export const GARDEN_ID='a2b4080d-3858-4f71-b5ac-23847aa17e1d';
export const PLANT_SELECT='id,garden_profile_id,user_id,name,profile_slug,scientific,status,mark,archived';
export const TASK_SELECT='id,garden_profile_id,user_id,garden_plant_id,done';
const fail=m=>{throw Error(m)};
function scoped(rows,garden,label){if(!Array.isArray(rows))fail(label+' read is not an array');const seen=new Set();for(const r of rows){if(!r?.id||seen.has(r.id)||r.garden_profile_id!==garden.id||r.user_id!==garden.user_id)fail(label+' identity/ownership mismatch');seen.add(r.id)}return rows}
export function projectSummary(garden,plantRows,taskRows){
 if(garden?.id!==GARDEN_ID||!garden.user_id)fail('Wrong Preview garden');
 const plants=scoped(plantRows,garden,'Plant');for(const p of plants)if(typeof p.archived!=='boolean'||typeof p.name!=='string'||!p.name.trim()||typeof p.profile_slug!=='string'||!p.profile_slug)fail('Incomplete plant');
 const active=plants.filter(p=>!p.archived),allIds=new Set(plants.map(p=>p.id)),activeIds=new Set(active.map(p=>p.id));
 const tasks=scoped(taskRows,garden,'Task');for(const t of tasks)if(t.garden_plant_id&&!allIds.has(t.garden_plant_id))fail('Task references missing plant');
 const relevant=tasks.filter(t=>!t.garden_plant_id||activeIds.has(t.garden_plant_id));
 const upcomingKnown=relevant.every(t=>typeof t.done==='boolean');
 const upcoming=upcomingKnown?relevant.filter(t=>t.done===false).length:null;
 const unassessed=active.filter(p=>p.status==='unassessed');
 let description='Attention status not assessed';
 if(active.length>0&&active.length<=2&&unassessed.length===active.length)description=active.map(p=>p.name).join(' · ')+' — not assessed';
 if(active.length===0)description='No active plants; attention not assessed';
 return {gardenId:garden.id,plantCount:active.length,upcomingCount:upcoming,attentionCount:null,attentionSource:'UNKNOWN — no canonical alert/attention source connected',notificationUnreadCount:null,description,plants:active.map(p=>({id:p.id,name:p.name,profileSlug:p.profile_slug,storedScientific:p.scientific??null,status:p.status??'unknown'})),taskSource:'Existing pending garden_tasks (done=false) for active plants or garden; read-only summary, not an Upcoming screen',backgroundSource:'Unchanged approved reference artwork, not a newly loaded personal garden photo'};
}
function complete(r,label){if(!r||r.error||r.status!==200||!Array.isArray(r.data)||!Number.isInteger(r.count)||r.count!==r.data.length||r.count>1000)fail(label+' incomplete or failed');return r.data}
export async function loadLive(client){
 if(client?.supabaseUrl?.replace(/\/$/,'')!==PREVIEW_URL)fail('Preview client required');
 const counts={authReads:1,databaseReads:0,storageRequests:0,externalProviderCalls:0,paidAICalls:0};
 const auth=await client.auth.getUser();if(auth.error||auth.data?.user?.role!=='authenticated')fail('A real Preview sign-in is required');
 counts.databaseReads++;
 const g=await client.from('garden_profiles').select('id,user_id,name').eq('id',GARDEN_ID).maybeSingle();
 if(g.error||g.status!==200||g.data?.id!==GARDEN_ID||g.data.user_id!==auth.data.user.id)fail('This account cannot read the selected Preview garden');
 counts.databaseReads+=2;
 const [p,t]=await Promise.all([
  client.from('garden_plants').select(PLANT_SELECT,{count:'exact'}).eq('garden_profile_id',GARDEN_ID).order('id').range(0,999),
  client.from('garden_tasks').select(TASK_SELECT,{count:'exact'}).eq('garden_profile_id',GARDEN_ID).order('id').range(0,999)
 ]);
 const model=projectSummary(g.data,complete(p,'Plants'),complete(t,'Tasks'));
 return {...model,sourceMode:'live-authenticated',readAt:new Date().toISOString(),counts};
}
