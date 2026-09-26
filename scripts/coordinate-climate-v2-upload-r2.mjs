#!/usr/bin/env node
/**
 * CRUVIT Coordinate Climate V2 — full validated corpus R2 deployment.
 *
 * Modes:
 *   plan         — inspect local corpus + R2 readiness, no writes.
 *   upload-full  — resumable full upload + key-set verification + deployment manifest.
 *   verify-r2    — verify remote key-set/deployment manifest, no writes.
 *
 * Full upload is idempotent. A deployment manifest is written ONLY after all
 * authoritative land tiles are present remotely. Runtime must never infer
 * GLOBAL_READY merely because the R2 bucket is connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  GLOBAL_PACK_ID,
  GLOBAL_BAKE_ID_DEFAULT
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  getR2ConnectionStatus,
  buildClimateObjectKey,
  loadClimateObjectStorageContract,
  putClimateObjectBytes,
  fetchClimateObjectBytes,
  listClimateObjectsByPrefix,
  sha256Hex
} from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const GLOBAL_ROOT=path.join(ROOT,'data','coordinate-climate','v2','coverage',GLOBAL_PACK_ID);
const TILES_DIR=path.join(GLOBAL_ROOT,'tiles');
const PROGRESS_PATH=path.join(GLOBAL_ROOT,'r2-full-upload-progress.json');

function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function fileSha(p){return sha256Hex(fs.readFileSync(p));}
function parseArgs(argv){
  const out={mode:String(argv[2]||'plan'),concurrency:4,startAt:0,maxTiles:0};
  for(let i=3;i<argv.length;i++){
    if(argv[i]==='--concurrency') out.concurrency=Math.max(1,Math.min(16,Number(argv[++i])||4));
    else if(argv[i]==='--start-at') out.startAt=Math.max(0,Number(argv[++i])||0);
    else if(argv[i]==='--max-tiles') out.maxTiles=Math.max(0,Number(argv[++i])||0);
  }
  return out;
}
function corpus(){
  const manifestPath=path.join(GLOBAL_ROOT,'manifest.json');
  const indexPath=path.join(GLOBAL_ROOT,'global-index.json');
  const checksPath=path.join(GLOBAL_ROOT,'tile-checksums.json');
  const landPath=path.join(GLOBAL_ROOT,'land-tile-mask.json');
  for(const p of [manifestPath,indexPath,checksPath,landPath]){
    if(!fs.existsSync(p)) throw new Error('REQUIRED_CORPUS_METADATA_MISSING:'+p);
  }
  const manifest=readJson(manifestPath);
  const checks=readJson(checksPath);
  const land=readJson(landPath);
  const landKeys=Array.isArray(land.land)?land.land:[];
  const expectedTileCount=Number(manifest?.stats?.landTiles ?? manifest?.tileCount ?? landKeys.length);
  const files=fs.existsSync(TILES_DIR)
    ?fs.readdirSync(TILES_DIR).filter(x=>x.endsWith('.cctb.gz')).sort()
    :[];
  const totalBytes=files.reduce((s,name)=>s+fs.statSync(path.join(TILES_DIR,name)).size,0);
  return {
    manifestPath,indexPath,checksPath,landPath,
    manifest,index:readJson(indexPath),checks,land,landKeys,
    expectedTileCount,files,totalBytes,
    bake:manifest.globalBakeId||GLOBAL_BAKE_ID_DEFAULT
  };
}
function validateLocal(c){
  const errors=[];
  if(c.expectedTileCount!==c.landKeys.length) errors.push('MANIFEST_LAND_COUNT_MISMATCH');
  if(c.files.length!==c.expectedTileCount) errors.push('LOCAL_TILE_COUNT_MISMATCH');
  const checkNames=new Set(Object.keys(c.checks||{}).filter(k=>k.endsWith('.cctb.gz')));
  for(const name of c.files){
    if(!checkNames.has(name)) errors.push('CHECKSUM_MISSING:'+name);
  }
  if(errors.length) return {ok:false,errors:errors.slice(0,50)};
  return {ok:true,errors:[]};
}
function tilePrefix(bake,env=process.env){
  const one=buildClimateObjectKey({kind:'tile',fileName:'__probe__.cctb.gz',globalBakeId:bake,env});
  return one.slice(0,one.lastIndexOf('/')+1);
}
function loadProgress(bake){
  if(!fs.existsSync(PROGRESS_PATH)) return {version:1,bake,completed:{},updatedAt:null};
  try{
    const p=readJson(PROGRESS_PATH);
    return p.bake===bake?p:{version:1,bake,completed:{},updatedAt:null};
  }catch{return {version:1,bake,completed:{},updatedAt:null};}
}
function saveProgress(p){
  p.updatedAt=new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH,JSON.stringify(p,null,2)+'\n');
}
async function runPool(items,limit,fn){
  let next=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){
      const i=next++;
      if(i>=items.length) return;
      await fn(items[i],i);
    }
  });
  await Promise.all(workers);
}
async function verifyRemoteKeySet(c){
  const prefix=tilePrefix(c.bake);
  const listed=await listClimateObjectsByPrefix(prefix,{env:process.env});
  if(!listed.ok) return {ok:false,code:listed.code,error:listed.error||null};
  const expected=new Set(c.files.map(name=>prefix+name));
  const actual=new Set((listed.objects||[]).map(x=>x.key));
  const missing=[...expected].filter(k=>!actual.has(k));
  const extra=[...actual].filter(k=>!expected.has(k));
  return {
    ok:missing.length===0 && actual.size===expected.size,
    prefix,
    expectedCount:expected.size,
    remoteCount:actual.size,
    totalBytes:listed.totalBytes,
    missing:missing.slice(0,20),
    extra:extra.slice(0,20)
  };
}
async function readDeploymentManifest(c){
  const key=buildClimateObjectKey({kind:'deployment-manifest',globalBakeId:c.bake});
  const got=await fetchClimateObjectBytes(key,{forceR2:true});
  if(!got.ok) return {ok:false,code:got.code,key};
  try{return {ok:true,key,manifest:JSON.parse(got.bytes.toString('utf8'))};}
  catch{return {ok:false,code:'DEPLOYMENT_MANIFEST_INVALID_JSON',key};}
}
async function writeDeploymentManifest(c,remoteVerify){
  const localManifestBytes=fs.readFileSync(c.manifestPath);
  const localIndexBytes=fs.readFileSync(c.indexPath);
  const checksumDigest=crypto.createHash('sha256')
    .update(JSON.stringify(c.checks))
    .digest('hex');
  const deployment={
    kind:'cruvit-global-climate-r2-deployment-v1',
    globalReady:true,
    globalBakeId:c.bake,
    expectedLandTileCount:c.expectedTileCount,
    verifiedRemoteTileCount:remoteVerify.remoteCount,
    verifiedRemoteBytes:remoteVerify.totalBytes,
    sourceManifestSha256:sha256Hex(localManifestBytes),
    sourceGlobalIndexSha256:sha256Hex(localIndexBytes),
    tileChecksumSetSha256:checksumDigest,
    verification:'FULL_REMOTE_KEY_SET_MATCH',
    completedAt:new Date().toISOString(),
    runtimeExternalStructuralCallsRequired:0
  };
  const key=buildClimateObjectKey({kind:'deployment-manifest',globalBakeId:c.bake});
  const put=await putClimateObjectBytes(key,Buffer.from(JSON.stringify(deployment,null,2)+'\n'),{
    contentType:'application/json; charset=utf-8',
    cacheControl:'no-cache',
    skipIdentical:false
  });
  if(!put.ok) throw new Error('DEPLOYMENT_MANIFEST_WRITE_FAILED:'+put.code);
  return {key,deployment};
}
async function uploadMetadata(c){
  const contract=loadClimateObjectStorageContract();
  for(const [kind,p] of [['manifest',c.manifestPath],['global-index',c.indexPath]]){
    const key=buildClimateObjectKey({kind,globalBakeId:c.bake});
    const put=await putClimateObjectBytes(key,fs.readFileSync(p),{
      contentType:'application/json; charset=utf-8',
      cacheControl:contract.cacheControl,
      skipIdentical:true
    });
    if(!put.ok) throw new Error(kind.toUpperCase()+'_UPLOAD_FAILED:'+put.code);
  }
}
async function main(){
  const args=parseArgs(process.argv);
  const c=corpus();
  const local=validateLocal(c);
  const r2=getR2ConnectionStatus();
  const base={
    policyId:'global-v1-full-corpus-r2-deployment-v2',
    globalBakeId:c.bake,
    expectedTileCount:c.expectedTileCount,
    localTileCount:c.files.length,
    approximateBytes:c.totalBytes,
    approximateGiB:Number((c.totalBytes/(1024**3)).toFixed(2)),
    localCorpusReady:local.ok,
    localErrors:local.errors,
    r2
  };

  if(args.mode==='plan'){
    console.log(JSON.stringify({...base,verdict:local.ok&&r2.ready?'FULL_UPLOAD_READY':'BLOCKED'},null,2));
    return;
  }
  if(!r2.ready) throw new Error('GLOBAL_STORAGE_CONNECTION_REQUIRED');
  if(!local.ok) throw new Error('FULL_LOCAL_CORPUS_REQUIRED:'+local.errors.join(','));

  if(args.mode==='verify-r2'){
    const keys=await verifyRemoteKeySet(c);
    const deployment=await readDeploymentManifest(c);
    const ready=keys.ok && deployment.ok
      && deployment.manifest?.globalReady===true
      && Number(deployment.manifest?.verifiedRemoteTileCount)===c.expectedTileCount;
    console.log(JSON.stringify({...base,remoteKeySet:keys,deploymentManifest:deployment,globalReady:ready,verdict:ready?'GLOBAL_READY':'PARTIAL_COVERAGE'},null,2));
    process.exit(ready?0:4);
  }
  if(args.mode!=='upload-full') throw new Error('USAGE: plan|upload-full|verify-r2');

  const progress=loadProgress(c.bake);
  let files=c.files.slice(args.startAt);
  if(args.maxTiles>0) files=files.slice(0,args.maxTiles);
  let completedThisRun=0,uploadedThisRun=0,skippedThisRun=0,bytesThisRun=0;
  const failures=[];

  await runPool(files,args.concurrency,async(name)=>{
    if(progress.completed?.[name]) return;
    const abs=path.join(TILES_DIR,name);
    const bytes=fs.readFileSync(abs);
    const expected=String(c.checks[name]||'').toLowerCase();
    const actual=sha256Hex(bytes).toLowerCase();
    if(!expected||expected!==actual) throw new Error('LOCAL_CHECKSUM_MISMATCH:'+name);
    const key=buildClimateObjectKey({kind:'tile',fileName:name,globalBakeId:c.bake});
    const put=await putClimateObjectBytes(key,bytes,{
      contentType:'application/gzip',
      skipIdentical:true,
      metadata:{globalbakeid:c.bake}
    });
    if(!put.ok){
      failures.push({name,code:put.code});
      throw new Error('R2_UPLOAD_FAILED:'+name+':'+put.code);
    }
    progress.completed[name]={sha256:actual,bytes:bytes.length,at:new Date().toISOString(),result:put.code};
    completedThisRun+=1;
    if(put.skipped) skippedThisRun+=1;
    else {uploadedThisRun+=1;bytesThisRun+=bytes.length;}
    if(completedThisRun%100===0) saveProgress(progress);
  });
  saveProgress(progress);

  // Partial bounded runs never publish GLOBAL_READY.
  if(args.maxTiles>0 || args.startAt>0){
    console.log(JSON.stringify({...base,verdict:'PARTIAL_UPLOAD_CHECKPOINT',completedThisRun,uploadedThisRun,skippedThisRun,bytesThisRun,failures},null,2));
    return;
  }

  await uploadMetadata(c);
  const remoteVerify=await verifyRemoteKeySet(c);
  if(!remoteVerify.ok){
    console.log(JSON.stringify({...base,verdict:'REMOTE_KEY_SET_INCOMPLETE',remoteVerify},null,2));
    process.exit(4);
  }
  const deployment=await writeDeploymentManifest(c,remoteVerify);
  console.log(JSON.stringify({
    ...base,
    verdict:'GLOBAL_READY',
    completedThisRun,uploadedThisRun,skippedThisRun,bytesThisRun,
    remoteVerify,
    deploymentManifest:deployment
  },null,2));
}
main().catch(err=>{
  console.error(JSON.stringify({verdict:'FAILED',error:String(err?.message||err)},null,2));
  process.exit(1);
});
