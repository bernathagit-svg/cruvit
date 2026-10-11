// Read-only, isolated Preview. No fabricated session, provider lookup or write operation.
export const PREVIEW_URL='https://pwgeygwafuinwkpmnzxp.supabase.co';
export const PUBLIC_KEY='sb_publishable_FqkszZTjO3XXbZBaDojCyQ_hY85Kfbo';
export const GARDEN_ID='a2b4080d-3858-4f71-b5ac-23847aa17e1d';
export const SELECT='id,garden_profile_id,user_id,name,profile_slug,scientific,status,mark,archived,cover_media_id,garden_area_id,cover:garden_media!garden_plants_cover_media_id_fkey(id,user_id,garden_profile_id,garden_plant_id,purpose,validation_state,storage_bucket,storage_path),area:garden_areas!garden_plants_garden_area_id_fkey(id,user_id,garden_profile_id,name)';
const fail=m=>{throw Error(m)};
const https=u=>{const p=new URL(u);if(p.protocol!=='https:'||p.username||p.password)fail('Unsafe image URL');return u};
export function projectRows(garden,plants,catalog){
 if(garden?.id!==GARDEN_ID||!garden.user_id||!Array.isArray(plants)||!Array.isArray(catalog))fail('Invalid Preview readback');
 const bySlug=new Map(catalog.map(c=>[c.slug,c]));if(bySlug.size!==catalog.length)fail('Duplicate canonical rows');const seen=new Set();
 const all=plants.map(p=>{
  if(!p.id||seen.has(p.id)||p.garden_profile_id!==garden.id||p.user_id!==garden.user_id)fail('Plant ownership or identity mismatch');seen.add(p.id);
  if(typeof p.archived!=='boolean'||typeof p.profile_slug!=='string'||!p.profile_slug||typeof p.name!=='string'||!p.name)fail('Incomplete plant record');
  const c=bySlug.get(p.profile_slug);if(!c||c.slug!==p.profile_slug||!c.scientific_name)fail('Exact canonical plant missing');
  if(p.scientific&&p.scientific!==c.scientific_name)fail('Scientific identity conflict');
  const m=c.media;if(c.verification_state!=='verified'||c.media_status!=='IMAGE_READY'||m?.imageStatus!=='IMAGE_READY'||!m.sourceAssetId)fail('Catalog image not approved');
  if(m.canonicalPlantIdentity&&m.canonicalPlantIdentity!==p.profile_slug)fail('Catalog media identity mismatch');
  if(m.kind==='design_cutout'||m.sourceProvider==='garden-design')fail('Design cutouts forbidden');
  const systemImage={kind:'catalog',url:https(m.primaryUrl??m.url),sourceAssetId:m.sourceAssetId,attribution:m.attribution??null,licenseUrl:m.licenseUrl??null,sourcePageUrl:m.sourcePageUrl??null};
  if(m.attributionRequired&&!systemImage.attribution)fail('Image attribution missing');
  let personal=null;
  if(p.cover_media_id!=null){const a=p.cover;if(!a||a.id!==p.cover_media_id||a.user_id!==p.user_id||a.garden_profile_id!==p.garden_profile_id||a.garden_plant_id!==p.id)fail('Personal image association mismatch');if(a.validation_state!=='validated'||a.purpose!=='plant_profile'||a.storage_bucket!=='user-garden-media')fail('Personal image not validated');if(!a.storage_path||a.storage_path.includes('..')||a.storage_path.startsWith('/')||a.storage_path.includes('\\')||a.storage_path.includes('://'))fail('Unsafe media path');personal={id:a.id,path:a.storage_path};}
  if(p.garden_area_id!=null&&(!p.area||p.area.id!==p.garden_area_id||p.area.user_id!==p.user_id||p.area.garden_profile_id!==p.garden_profile_id))fail('Garden area association mismatch');
  return {id:p.id,profileSlug:p.profile_slug,name:p.name,scientificName:c.scientific_name,status:p.status??'unknown',mark:p.mark??'unknown',areaName:p.garden_area_id?p.area.name:null,archived:p.archived,personal,image:systemImage,systemImage};
 });
 return {garden,cards:all.filter(p=>!p.archived),activeCount:all.filter(p=>!p.archived).length,archivedCount:all.filter(p=>p.archived).length};
}
function rows(r,label){if(!r||r.error||r.status!==200||!Array.isArray(r.data))fail(label);return r.data;}
export async function loadLive(client){
 if(client?.supabaseUrl?.replace(/\/$/,'')!==PREVIEW_URL)fail('Preview client required');
 const counts={authReads:1,databaseReads:0,storageSignRequests:0,externalProviderCalls:0,paidAICalls:0};
 const a=await client.auth.getUser();if(a.error||a.data?.user?.role!=='authenticated')fail('Sign in with a real Preview account');
 counts.databaseReads++;
 const g=await client.from('garden_profiles').select('id,user_id,name').eq('id',GARDEN_ID).maybeSingle();
 if(g.error||g.status!==200||g.data?.id!==GARDEN_ID||g.data?.user_id!==a.data.user.id)fail('This account cannot read the selected Preview garden');
 counts.databaseReads++;
 const p=await client.from('garden_plants').select(SELECT,{count:'exact'}).eq('garden_profile_id',GARDEN_ID).order('id').range(0,999);const plants=rows(p,'Plant read failed');if(!Number.isInteger(p.count)||p.count!==plants.length||p.count>1000)fail('Plant batch incomplete');
 const slugs=[...new Set(plants.map(x=>x.profile_slug))];let catalog=[];
 if(slugs.length){counts.databaseReads++;catalog=rows(await client.from('catalog_plants').select('slug,scientific_name,verification_state,media_status,media').in('slug',slugs),'Catalog read failed');}
 const model=projectRows(g.data,plants,catalog);const paths=[...new Set(model.cards.flatMap(p=>p.personal?[p.personal.path]:[]))];
 if(paths.length){counts.storageSignRequests++;const s=await client.storage.from('user-garden-media').createSignedUrls(paths,300);if(s.error||!Array.isArray(s.data))fail('Personal image batch signing failed');const map=new Map(s.data.map(x=>[x.path,x]));for(const p of model.cards)if(p.personal){const v=map.get(p.personal.path);if(!v?.signedUrl||v.error){p.imageWarning='Personal image unavailable; exact catalog fallback';continue}const u=new URL(v.signedUrl);if(u.origin!==PREVIEW_URL||!u.pathname.startsWith('/storage/v1/object/sign/user-garden-media/'))fail('Wrong image storage project');p.image={kind:'personal',url:v.signedUrl,mediaId:p.personal.id};}}
 return {...model,sourceMode:'live-authenticated',readAt:new Date().toISOString(),counts};
}
