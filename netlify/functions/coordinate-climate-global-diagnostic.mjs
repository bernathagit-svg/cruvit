import {
  resolveGardenStructuralClimateFromCoordinateV2Async
} from '../../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import {
  listClimateObjectsByPrefix,
  buildClimateObjectKey
} from '../../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';
import { GLOBAL_BAKE_ID_DEFAULT } from '../../modules/personal-domain/coordinate-climate-global-lookup-v2.js';

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
  const mode=String(u.searchParams.get('mode')||'resolve');
  if(mode==='inventory'){
    const bake=String(u.searchParams.get('bake')||GLOBAL_BAKE_ID_DEFAULT);
    const probeTile=buildClimateObjectKey({kind:'tile',fileName:'__probe__.cctb.gz',globalBakeId:bake,env:process.env});
    const tilePrefix=probeTile.slice(0,probeTile.lastIndexOf('/')+1);
    const macroPrefix=tilePrefix.replace(/\/tiles\/$/,'/macros/');
    const [tiles,macros]=await Promise.all([
      listClimateObjectsByPrefix(tilePrefix,{env:process.env}),
      listClimateObjectsByPrefix(macroPrefix,{env:process.env})
    ]);
    return json(200,{
      ok:tiles.ok===true&&macros.ok===true,
      code:'GLOBAL_CLIMATE_R2_INVENTORY',
      globalBakeId:bake,
      tiles:{prefix:tilePrefix,count:tiles.objectCount||0,totalBytes:tiles.totalBytes||0},
      macros:{prefix:macroPrefix,count:macros.objectCount||0,totalBytes:macros.totalBytes||0}
    });
  }

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
    globalCoverageState:result.globalCoverageState||null,
    globalCoverage:result.globalCoverage||null,
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
