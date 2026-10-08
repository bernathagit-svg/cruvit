// Supervisor-approved contract: anon must expose NO DATA; no database grants are changed.
import {GARDEN_ID} from './preview-session.mjs';
const FIXTURES=Object.freeze([
 {id:'079827a3-732d-4a16-acd0-b9949bc7bc53',profile_slug:'apple',name:'Apple',scientific:'Malus domestica'},
 {id:'f82ded5a-8b6f-4093-be98-6972c12e4520',profile_slug:'monstera',name:'Monstera',scientific:'Monstera deliciosa'}
]);
const SELECT='id,garden_profile_id,user_id,name,profile_slug,scientific,archived,cover_media_id';
function complete(r){return !!r&&!r.error&&r.status===200&&Array.isArray(r.data)&&r.count===r.data.length;}
export function judgeAnonRead(r){
 const empty=complete(r)&&r.data.length===0;
 // A known Postgres access denial with no row payload is evidence; arbitrary network/server failures are not.
 const denied=!!r&&[401,403].includes(r.status)&&r.error?.code==='42501'&&(r.data===null||(Array.isArray(r.data)&&r.data.length===0));
 if(empty||denied)return {pass:true,status:'PASS',httpStatus:r.status,mode:empty?'EMPTY_RESULT':'ACCESS_DENIED_BEFORE_RLS',exposedRows:0,errorCode:denied?r.error.code:null};
 if(r?.data&&(Array.isArray(r.data)?r.data.length>0:typeof r.data==='object'))return {pass:false,status:'FAIL',reason:'Unexpected data payload returned to anon.',httpStatus:r.status};
 return {pass:false,status:'INCONCLUSIVE',reason:'No completed empty read or verified access-denial response.',httpStatus:r?.status??null};
}
export function judgePlantReads({ownerId,otherId,owner,other,anon}){
 if(!ownerId||!otherId||ownerId===otherId)return {pass:false,status:'BLOCKED',reason:'Two distinct authenticated users are required.'};
 const anonymous=judgeAnonRead(anon);
 if(!complete(owner)||!complete(other)||anonymous.status==='INCONCLUSIVE')return {pass:false,status:'INCONCLUSIVE',reason:'A failed or incomplete authenticated read is not cross-user RLS proof.',anon:anonymous};
 const identity=owner.data.length===2&&new Set(owner.data.map(p=>p.id)).size===2&&FIXTURES.every(f=>owner.data.some(p=>p.id===f.id&&p.profile_slug===f.profile_slug&&p.name===f.name&&p.scientific===f.scientific&&p.user_id===ownerId&&p.garden_profile_id===GARDEN_ID&&p.archived===false));
 const checks={ownerReadsExactTwo:identity,otherReadsZero:other.data.length===0,anonNoDataExposure:anonymous.pass};
 const pass=Object.values(checks).every(Boolean);
 return {pass,status:pass?'PASS':'FAIL',checks,rowCounts:{owner:owner.data.length,other:other.data.length,anon:anonymous.pass?0:null},httpStatus:{owner:owner.status,other:other.status,anon:anon.status},anon:anonymous};
}
export async function runPlantRls(ownerClient,otherClient,anonClient){
 let authReads=0,tableReads=0;
 const output=value=>({...value,gardenId:GARDEN_ID,serverAuthReads:authReads,supabaseReadCount:tableReads,externalProviderCalls:0,paidAICalls:0});
 try{
  authReads=2;const [a,b]=await Promise.all([ownerClient.auth.getUser(),otherClient.auth.getUser()]);const ua=a.data?.user,ub=b.data?.user;
  if(a.error||b.error||ua?.role!=='authenticated'||ub?.role!=='authenticated'||ua.id===ub.id)return output({pass:false,status:'BLOCKED',reason:'Two distinct server-validated users required.'});
  const session=await anonClient.auth.getSession();if(session.error||session.data?.session!==null)return output({pass:false,status:'BLOCKED',reason:'Anonymous client must have no session.'});
  const read=client=>{tableReads++;return client.from('garden_plants').select(SELECT,{count:'exact'}).eq('garden_profile_id',GARDEN_ID).order('id').range(0,999);};
  const [owner,other,anon]=await Promise.all([read(ownerClient),read(otherClient),read(anonClient)]);
  const result=judgePlantReads({ownerId:ua.id,otherId:ub.id,owner,other,anon});
  return output({...result,userAId:ua.id,userBId:ub.id,ownerPlants:result.checks?.ownerReadsExactTwo?owner.data.map(p=>({id:p.id,profileSlug:p.profile_slug,name:p.name,scientific:p.scientific})):undefined,checkedAt:new Date().toISOString()});
 }catch{return output({pass:false,status:'INCONCLUSIVE',reason:'Request failed; no PASS issued.'});}
}
