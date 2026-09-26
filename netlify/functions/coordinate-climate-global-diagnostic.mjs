import {
  resolveGardenStructuralClimateFromCoordinateV2Async
} from '../../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';

function json(status,body){
  return new Response(JSON.stringify(body,null,2),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function num(v){
  if(v==null||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const u=new URL(req.url);
  const lat=num(u.searchParams.get('lat'));
  const lon=num(u.searchParams.get('lon'));
  const label=String(u.searchParams.get('label')||'diagnostic').slice(0,120);
  if(lat==null||lon==null) return json(400,{ok:false,code:'LAT_LON_REQUIRED'});

  const result=await resolveGardenStructuralClimateFromCoordinateV2Async(lat,lon,{
    label,
    enqueuePrep:false,
    allowRemote:true,
    env:process.env
  });
  const s=result.structuralClimate||{};
  return json(200,{
    ok:result.ok===true,
    code:result.code,
    lookupSource:result.lookupSource||null,
    tileKey:result.tileKey||null,
    objectKey:result.objectKey||null,
    globalBakeId:result.globalBakeId||null,
    structuralClimate:{
      status:s.status||null,
      broadClimateOverride:s.broadClimateOverride||null,
      freezingRisk:s.freezingRisk??null,
      structuralColdRisk:s.structuralColdRisk??null,
      thermalRegime:s.thermalRegime??null,
      humiditySignal:s.humiditySignal??null,
      moistureRegime:s.moistureRegime??null,
      coldestMonthMeanMinC:s.evidence?.coldestMonthMeanMinC??null,
      warmestMonthMeanMaxC:s.evidence?.warmestMonthMeanMaxC??null,
      annualPrecipitationMm:s.evidence?.annualPrecipitationMm??null
    },
    provenance:{
      provider:s.provenance?.provider||null,
      lookupPath:s.coordinateClimateV2?.provenance?.lookupPath||s.provenance?.lookupPath||null,
      reason:s.provenance?.reason||null
    },
    cost:{
      chelsaExternalCalls:result.cost?.chelsaExternalCalls??null,
      openMeteoStructuralCalls:result.cost?.openMeteoStructuralCalls??null,
      terrainProviderExternalCalls:result.cost?.terrainProviderExternalCalls??null
    }
  });
};
export const config={path:'/.netlify/functions/coordinate-climate-global-diagnostic'};
