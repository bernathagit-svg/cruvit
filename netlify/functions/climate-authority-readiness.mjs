import {
  readGlobalClimateDeploymentReadiness
} from '../../modules/personal-domain/coordinate-climate-global-deployment-readiness-v1.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2Async
} from '../../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';

const json=(status,body)=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});

export default async function handler(req){
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const lat=Number(url.searchParams.get('lat'));
  const lon=Number(url.searchParams.get('lon'));
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return json(400,{ok:false,code:'COORDINATES_REQUIRED'});
  const readiness=await readGlobalClimateDeploymentReadiness({env:process.env,force:true});
  const resolved=await resolveGardenStructuralClimateFromCoordinateV2Async(lat,lon,{
    env:process.env,
    enqueuePrep:false,
    forceCoverageReadiness:true
  });
  return json(200,{
    ok:true,
    readiness:{
      state:readiness.state,
      globalReady:readiness.globalReady,
      globalBakeId:readiness.globalBakeId,
      reason:readiness.reason,
      expectedLandTileCount:readiness.expectedLandTileCount??null,
      verifiedRemoteTileCount:readiness.verifiedRemoteTileCount??null,
      completedAt:readiness.completedAt??null
    },
    lookup:{
      ok:resolved.ok,
      code:resolved.code,
      lookupSource:resolved.lookupSource||null,
      tileKey:resolved.tileKey||null,
      objectKey:resolved.objectKey||null,
      globalCoverageState:resolved.globalCoverageState||null,
      structuralStatus:resolved.structuralClimate?.status||null,
      freezingRisk:resolved.structuralClimate?.freezingRisk??null,
      thermalRegime:resolved.structuralClimate?.thermalRegime??null,
      coldestMonthMeanMinC:resolved.structuralClimate?.evidence?.coldestMonthMeanMinC??null,
      warmestMonthMeanMaxC:resolved.structuralClimate?.evidence?.warmestMonthMeanMaxC??null
    }
  });
}
export const config={path:'/.netlify/functions/climate-authority-readiness'};
