import crypto from 'node:crypto';
import authority from '../../data/coordinate-climate/v2/coverage/global-v1/upload-authority-map.json' with { type:'json' };
import manifest from '../../data/coordinate-climate/v2/coverage/global-v1/manifest.json' with { type:'json' };
import globalIndex from '../../data/coordinate-climate/v2/coverage/global-v1/global-index.json' with { type:'json' };
import {
  putClimateObjectBytes,
  listClimateObjectsByPrefix,
  listClimateObjectsPage,
  headClimateObject,
  buildClimateObjectKey
} from '../../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';
import {
  readGlobalClimateDeploymentReadiness,
  clearGlobalClimateDeploymentReadinessCache
} from '../../modules/personal-domain/coordinate-climate-global-deployment-readiness-v1.js';

const BAKE=String(manifest.globalBakeId||'');
const TILE_PREFIX='climate/global-v1/'+BAKE+'/tiles/';
const ROOT_PREFIX='climate/global-v1/'+BAKE+'/';

function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','x-robots-tag':'noindex,nofollow'}})}
function hex(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
function tileName(s){return /^chelsa30s-t64_\d+_\d+\.cctb\.gz$/.test(String(s||''))}
function isHash(s){return /^[a-f0-9]{64}$/i.test(String(s||''))}

function buildMap(root){
  const out=new Map(); const seen=new Set();
  function add(name,h,b){
    const n=String(name||'').split(/[\\/]/).pop();
    const hh=String(h||'').replace(/^sha256:/i,'').toLowerCase();
    const bb=Number(b);
    if(tileName(n)&&isHash(hh)) out.set(n,{sha256:hh,bytes:Number.isFinite(bb)&&bb>0?bb:null});
  }
  function walk(v,key=''){
    if(v==null) return;
    if(typeof v==='string'){if(tileName(key)&&isHash(v)) add(key,v,null);return}
    if(Array.isArray(v)){for(const x of v) walk(x,'');return}
    if(typeof v!=='object'||seen.has(v)) return; seen.add(v);
    add(v.fileName||v.filename||v.tileFileName||v.name||v.file||v.path||key,v.sha256||v.hash||v.checksum||v.digest,v.bytes??v.size??v.length);
    for(const [k,val] of Object.entries(v)){
      if(tileName(k)){
        if(typeof val==='string') add(k,val,null);
        else if(val&&typeof val==='object') add(k,val.sha256||val.hash||val.checksum||val.digest,val.bytes??val.size??val.length);
      }
      if(!['sha256','hash','checksum','digest'].includes(k)) walk(val,k);
    }
  }
  walk(root); return out;
}
const AUTH=buildMap(authority);

function specialBytes(name){
  if(name==='manifest.json') return Buffer.from(JSON.stringify(manifest));
  if(name==='global-index.json') return Buffer.from(JSON.stringify(globalIndex));
  return null;
}

async function uploadBatch(body){
  const items=Array.isArray(body?.items)?body.items:[];
  if(!items.length||items.length>32) return {status:400,body:{ok:false,code:'ITEMS_1_TO_32_REQUIRED'}};
  if(AUTH.size!==Number(manifest.tileCount)) return {status:500,body:{ok:false,code:'AUTHORITY_COUNT_MISMATCH',authority:AUTH.size,manifest:Number(manifest.tileCount)}};
  const results=[];
  for(const item of items){
    const name=String(item?.name||'');
    const expected=AUTH.get(name);
    if(!expected) return {status:403,body:{ok:false,code:'NOT_IN_AUTHORITY',name}};
    let bytes;
    try{bytes=Buffer.from(String(item?.data||''),'base64')}catch{return {status:400,body:{ok:false,code:'BAD_BASE64',name}}}
    const actualHash=hex(bytes);
    if(actualHash!==expected.sha256) return {status:409,body:{ok:false,code:'INTEGRITY_MISMATCH',name}};
    if(expected.bytes!=null&&bytes.length!==expected.bytes) return {status:409,body:{ok:false,code:'SIZE_MISMATCH',name}};
    const key=TILE_PREFIX+name;
    const out=await putClimateObjectBytes(key,bytes,{contentType:'application/gzip',cacheControl:'public, max-age=31536000, immutable',skipIdentical:false,metadata:{sha256:expected.sha256||expected,'cruvit-global-bake-id':BAKE}});
    if(!out.ok) return {status:502,body:{ok:false,code:'R2_WRITE_FAILED',name,r2Code:out.code}};
    results.push({name,ok:true,code:out.code,skipped:out.skipped===true,bytes:bytes.length});
  }
  return {status:200,body:{ok:true,globalBakeId:BAKE,count:results.length,results}};
}

async function uploadSpecials(){
  const results=[];
  for(const name of ['manifest.json','global-index.json']){
    const bytes=specialBytes(name);
    const key=ROOT_PREFIX+name;
    const out=await putClimateObjectBytes(key,bytes,{contentType:'application/json',cacheControl:'public, max-age=31536000, immutable',skipIdentical:true,metadata:{'cruvit-global-bake-id':BAKE}});
    if(!out.ok) return {status:502,body:{ok:false,code:'SPECIAL_WRITE_FAILED',name,r2Code:out.code}};
    results.push({name,ok:true,code:out.code,bytes:bytes.length});
  }
  return {status:200,body:{ok:true,results}};
}

async function finalizeStep(body){
  if(AUTH.size!==Number(manifest.tileCount)) return {status:500,body:{ok:false,code:'AUTHORITY_COUNT_MISMATCH',authority:AUTH.size,manifest:Number(manifest.tileCount)}};
  const verifiedSoFar=Number(body?.verifiedSoFar)||0;
  if(!Number.isInteger(verifiedSoFar)||verifiedSoFar<0||verifiedSoFar>AUTH.size) return {status:400,body:{ok:false,code:'BAD_VERIFIED_COUNT'}};
  const page=await listClimateObjectsPage(TILE_PREFIX,{continuationToken:body?.continuationToken||undefined,maxKeys:1000});
  if(!page.ok) return {status:502,body:{ok:false,code:'REMOTE_LIST_FAILED',remoteCode:page.code,error:page.error||null}};
  const unexpected=[];
  const sizeMismatch=[];
  let validCount=0;
  for(const row of page.objects||[]){
    const name=String(row.key||'').slice(TILE_PREFIX.length);
    if(!tileName(name)){unexpected.push(name||row.key);continue}
    const expected=AUTH.get(name);
    if(!expected){unexpected.push(name);continue}
    if(expected.bytes!=null&&Number(row.bytes)!==Number(expected.bytes)){sizeMismatch.push({name,expected:expected.bytes,actual:Number(row.bytes)});continue}
    validCount++;
  }
  const verified=verifiedSoFar+validCount;
  if(unexpected.length||sizeMismatch.length){
    return {status:409,body:{ok:false,code:'REMOTE_SET_MISMATCH',verifiedSoFar,validCount,verified,unexpectedCount:unexpected.length,sizeMismatchCount:sizeMismatch.length,unexpectedSample:unexpected.slice(0,20),sizeMismatchSample:sizeMismatch.slice(0,20)}};
  }
  if(page.isTruncated){
    return {status:200,body:{ok:true,code:'FINALIZE_CONTINUE',globalBakeId:BAKE,pageCount:(page.objects||[]).length,validCount,verified,expected:AUTH.size,continuationToken:page.nextContinuationToken}};
  }
  if(verified!==AUTH.size){
    return {status:409,body:{ok:false,code:'FULL_KEY_SET_NOT_READY',expected:AUTH.size,actual:verified,missingCount:Math.max(0,AUTH.size-verified),unexpectedCount:0}};
  }
  const [mh,ih]=await Promise.all([headClimateObject(ROOT_PREFIX+'manifest.json'),headClimateObject(ROOT_PREFIX+'global-index.json')]);
  if(!mh.ok||!ih.ok) return {status:409,body:{ok:false,code:'SPECIAL_OBJECTS_MISSING',manifest:mh.ok,index:ih.ok}};
  const deployment={
    kind:'cruvit-global-climate-r2-deployment-v1',
    version:'1.0.0',
    globalReady:true,
    globalBakeId:BAKE,
    manifestSha256:manifest.manifestSha256||null,
    expectedLandTileCount:AUTH.size,
    verifiedRemoteTileCount:verified,
    expectedRemoteObjectCount:AUTH.size+2,
    verifiedRemoteObjectCount:verified+2,
    verification:'FULL_REMOTE_KEY_SET_AND_SIZE_MATCH',
    manifestObjectKey:ROOT_PREFIX+'manifest.json',
    globalIndexObjectKey:ROOT_PREFIX+'global-index.json',
    completedAt:new Date().toISOString(),
    source:'coordinate-climate-global-deploy-v1-paged-finalize'
  };
  const key=buildClimateObjectKey({kind:'deployment-manifest',globalBakeId:BAKE});
  const wrote=await putClimateObjectBytes(key,Buffer.from(JSON.stringify(deployment,null,2)),{contentType:'application/json',cacheControl:'no-cache',skipIdentical:false,metadata:{'cruvit-global-bake-id':BAKE}});
  if(!wrote.ok) return {status:502,body:{ok:false,code:'DEPLOYMENT_MANIFEST_WRITE_FAILED',remoteCode:wrote.code}};
  clearGlobalClimateDeploymentReadinessCache();
  const readiness=await readGlobalClimateDeploymentReadiness({force:true,globalBakeId:BAKE});
  return {status:readiness.globalReady?200:409,body:{ok:readiness.globalReady===true,code:readiness.globalReady?'GLOBAL_READY':'READINESS_NOT_GLOBAL',verified,expected:AUTH.size,deployment,readiness}};
}

async function finalize(){
  if(AUTH.size!==Number(manifest.tileCount)) return {status:500,body:{ok:false,code:'AUTHORITY_COUNT_MISMATCH'}};
  const listing=await listClimateObjectsByPrefix(TILE_PREFIX);
  if(!listing.ok) return {status:502,body:{ok:false,code:'REMOTE_LIST_FAILED',remoteCode:listing.code}};
  const actualNames=new Set((listing.objects||[]).map(x=>String(x.key||'').slice(TILE_PREFIX.length)).filter(tileName));
  const missing=[];
  for(const name of AUTH.keys()) if(!actualNames.has(name)) missing.push(name);
  const unexpected=[...actualNames].filter(n=>!AUTH.has(n));
  if(missing.length||unexpected.length||actualNames.size!==AUTH.size){
    return {status:409,body:{ok:false,code:'FULL_KEY_SET_NOT_READY',expected:AUTH.size,actual:actualNames.size,missingCount:missing.length,unexpectedCount:unexpected.length,missingSample:missing.slice(0,20),unexpectedSample:unexpected.slice(0,20)}};
  }
  const mh=await headClimateObject(ROOT_PREFIX+'manifest.json');
  const ih=await headClimateObject(ROOT_PREFIX+'global-index.json');
  if(!mh.ok||!ih.ok) return {status:409,body:{ok:false,code:'SPECIAL_OBJECTS_MISSING',manifest:mh.ok,index:ih.ok}};
  const deployment={
    kind:'cruvit-global-climate-r2-deployment-v1',
    version:'1.0.0',
    globalReady:true,
    globalBakeId:BAKE,
    manifestSha256:manifest.manifestSha256||null,
    expectedLandTileCount:AUTH.size,
    verifiedRemoteTileCount:actualNames.size,
    expectedRemoteObjectCount:AUTH.size+2,
    verifiedRemoteObjectCount:actualNames.size+2,
    verification:'FULL_REMOTE_KEY_SET_MATCH',
    manifestObjectKey:ROOT_PREFIX+'manifest.json',
    globalIndexObjectKey:ROOT_PREFIX+'global-index.json',
    completedAt:new Date().toISOString(),
    source:'coordinate-climate-global-deploy-v1'
  };
  const key=buildClimateObjectKey({kind:'deployment-manifest',globalBakeId:BAKE});
  const wrote=await putClimateObjectBytes(key,Buffer.from(JSON.stringify(deployment,null,2)),{contentType:'application/json',cacheControl:'no-cache',skipIdentical:false,metadata:{'cruvit-global-bake-id':BAKE}});
  if(!wrote.ok) return {status:502,body:{ok:false,code:'DEPLOYMENT_MANIFEST_WRITE_FAILED',remoteCode:wrote.code}};
  clearGlobalClimateDeploymentReadinessCache();
  const readiness=await readGlobalClimateDeploymentReadiness({force:true,globalBakeId:BAKE});
  return {status:readiness.globalReady?200:409,body:{ok:readiness.globalReady===true,code:readiness.globalReady?'GLOBAL_READY':'READINESS_NOT_GLOBAL',deployment,readiness}};
}

export default async(req)=>{
  if(req.method!=='POST') return json(405,{ok:false,code:'POST_REQUIRED'});
  let body={}; try{body=await req.json()}catch{}
  const action=String(body?.action||'');
  let out;
  if(action==='upload-batch') out=await uploadBatch(body);
  else if(action==='upload-specials') out=await uploadSpecials();
  else if(action==='finalize-step') out=await finalizeStep(body);
  else if(action==='finalize') out=await finalize();
  else return json(400,{ok:false,code:'UNKNOWN_ACTION'});
  return json(out.status,out.body);
};
export const config={path:'/.netlify/functions/coordinate-climate-global-deploy',timeout:60};
