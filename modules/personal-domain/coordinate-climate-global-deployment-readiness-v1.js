/**
 * CRUVIT Global Coordinate Climate Deployment Readiness V1.
 *
 * R2 connectivity is NOT equivalent to global coverage.
 * GLOBAL_READY requires a post-upload deployment-manifest written only after
 * full remote key-set verification.
 */
import {
  buildClimateObjectKey,
  fetchClimateObjectBytes,
  isClimateRemoteTransportAvailable
} from './coordinate-climate-global-object-storage-v1.js';
import { GLOBAL_BAKE_ID_DEFAULT } from './coordinate-climate-global-lookup-v2.js';

export const GLOBAL_CLIMATE_DEPLOYMENT_READINESS_VERSION='global-climate-deployment-readiness-v1.1';
export const GLOBAL_CLIMATE_AUTHORITATIVE_BAKE_CONTRACT=Object.freeze({
  globalBakeId:'bake-2026-09-01-global-v1-vpd-scale',
  manifestSha256:'a5994b1184cf3fd62eefbd764a7362a234d40db762345124f967773732a3a5b1',
  expectedLandTileCount:61964
});
export const GLOBAL_CLIMATE_COVERAGE_STATE=Object.freeze({
  GLOBAL_READY:'GLOBAL_READY',
  PARTIAL_COVERAGE:'PARTIAL_COVERAGE',
  UNAVAILABLE:'UNAVAILABLE'
});

let cache=null;
let cacheAt=0;
const CACHE_MS=5*60*1000;

export function clearGlobalClimateDeploymentReadinessCache(){
  cache=null; cacheAt=0;
}

export async function readGlobalClimateDeploymentReadiness({
  env=process.env,
  globalBakeId=GLOBAL_BAKE_ID_DEFAULT,
  force=false
}={}){
  const now=Date.now();
  if(!force&&cache&&now-cacheAt<CACHE_MS&&cache.globalBakeId===globalBakeId) return cache;

  if(!isClimateRemoteTransportAvailable(env)){
    const out={
      version:GLOBAL_CLIMATE_DEPLOYMENT_READINESS_VERSION,
      state:GLOBAL_CLIMATE_COVERAGE_STATE.UNAVAILABLE,
      globalReady:false,
      globalBakeId,
      reason:'REMOTE_TRANSPORT_UNAVAILABLE'
    };
    cache=out;cacheAt=now;return out;
  }

  const key=buildClimateObjectKey({kind:'deployment-manifest',globalBakeId,env});
  const got=await fetchClimateObjectBytes(key,{env,forceR2:true,timeoutMs:8000});
  if(!got.ok){
    const out={
      version:GLOBAL_CLIMATE_DEPLOYMENT_READINESS_VERSION,
      state:GLOBAL_CLIMATE_COVERAGE_STATE.PARTIAL_COVERAGE,
      globalReady:false,
      globalBakeId,
      reason:got.code==='REMOTE_TILE_NOT_FOUND'?'DEPLOYMENT_MANIFEST_MISSING':got.code,
      deploymentManifestKey:key
    };
    cache=out;cacheAt=now;return out;
  }

  let manifest;
  try{manifest=JSON.parse(got.bytes.toString('utf8'));}
  catch{
    const out={
      version:GLOBAL_CLIMATE_DEPLOYMENT_READINESS_VERSION,
      state:GLOBAL_CLIMATE_COVERAGE_STATE.PARTIAL_COVERAGE,
      globalReady:false,
      globalBakeId,
      reason:'DEPLOYMENT_MANIFEST_INVALID_JSON',
      deploymentManifestKey:key
    };
    cache=out;cacheAt=now;return out;
  }

  const expected=Number(manifest.expectedLandTileCount);
  const verified=Number(manifest.verifiedRemoteTileCount);
  const bakeContract=GLOBAL_CLIMATE_AUTHORITATIVE_BAKE_CONTRACT;
  const authoritativeBakeMatches=
    String(globalBakeId)===bakeContract.globalBakeId
    &&String(manifest.globalBakeId||'')===bakeContract.globalBakeId
    &&String(manifest.manifestSha256||'')===bakeContract.manifestSha256
    &&expected===bakeContract.expectedLandTileCount
    &&verified===bakeContract.expectedLandTileCount;
  const ready=
    manifest.kind==='cruvit-global-climate-r2-deployment-v1'
    &&manifest.globalReady===true
    &&authoritativeBakeMatches
    &&Number.isInteger(expected)&&expected===bakeContract.expectedLandTileCount
    &&verified===expected
    &&manifest.verification==='FULL_REMOTE_KEY_SET_MATCH';

  const out={
    version:GLOBAL_CLIMATE_DEPLOYMENT_READINESS_VERSION,
    state:ready?GLOBAL_CLIMATE_COVERAGE_STATE.GLOBAL_READY:GLOBAL_CLIMATE_COVERAGE_STATE.PARTIAL_COVERAGE,
    globalReady:ready,
    globalBakeId,
    reason:ready?null:'DEPLOYMENT_MANIFEST_INCOMPLETE',
    deploymentManifestKey:key,
    expectedLandTileCount:Number.isFinite(expected)?expected:null,
    verifiedRemoteTileCount:Number.isFinite(verified)?verified:null,
    authoritativeBakeContract:bakeContract,
    authoritativeBakeMatches,
    completedAt:manifest.completedAt||null
  };
  cache=out;cacheAt=now;return out;
}
