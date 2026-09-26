/**
 * CRUVIT Reproductive Climate Gate V1
 *
 * One systemic authority for climate-dependent flowering / fruiting capability.
 * Reads structured climateTraits.reproductiveClimate only.
 * Never parses free-form prose as runtime authority.
 */

export const REPRODUCTIVE_CLIMATE_GATE_VERSION='reproductive-climate-gate-v1';

export const REPRODUCTIVE_CLIMATE_STATUS=Object.freeze({
  SUPPORTED:'supported',
  CONSTRAINED:'constrained',
  UNRELIABLE:'unreliable',
  UNKNOWN:'unknown'
});

export const SUMMER_HEAT_BAND_MIN_C=Object.freeze({
  cool:18,
  mild:21,
  warm:24,
  hot:27,
  very_hot:30
});

function finite(v){
  if(v==null||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function norm(v){return String(v||'').trim().toLowerCase().replace(/-/g,'_');}
function phaseReq(meta,phase){
  const rc=meta&&typeof meta==='object'?meta.reproductiveClimate:null;
  const p=rc&&typeof rc==='object'?rc[phase]:null;
  return p&&typeof p==='object'?p:null;
}
function warmest(env={}){
  const vals=[
    env.warmestMonthMeanMaxC,
    env.structuralClimate?.evidence?.warmestMonthMeanMaxC,
    env.coordinateClimateV2?.evidence?.warmestMonthMeanMaxC
  ];
  for(const v of vals){const n=finite(v);if(n!=null)return n;}
  return null;
}
function result(status,reason=null,evidence=null,extra={}){
  return Object.freeze({status,reason,evidence,...extra});
}

export function evaluateReproductiveClimatePhase({
  meta=null,
  climateProfile={},
  phase='fruiting',
  protectedGrowing=false
}={}){
  const req=phaseReq(meta,phase);
  if(!req){
    return result(REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,null,'missing:reproductiveClimate.'+phase,{
      missing:['reproductiveClimate.'+phase]
    });
  }

  const evidenceClass=String(req.evidenceClass||'UNKNOWN').toUpperCase();
  const frostFree=climateProfile.isFrostFreeGrowingClimate===true || protectedGrowing===true;
  if(req.requiresFrostFree===true && !frostFree){
    return result(
      evidenceClass==='SOURCE_SUPPORTED'
        ? REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE
        : REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED,
      'Reliable '+phase+' requires frost-free growing conditions.',
      'negative:requires-frost-free',
      {evidenceClass}
    );
  }

  if(req.requiresCoolSeason===true && climateProfile.coolSeasonSignal!==true){
    return result(
      evidenceClass==='SOURCE_SUPPORTED'
        ? REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE
        : REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED,
      'Reliable '+phase+' requires a cool season / winter signal.',
      'negative:requires-cool-season',
      {evidenceClass}
    );
  }

  const explicitMin=finite(req.minWarmestMonthMeanMaxC);
  const band=norm(req.summerHeatBand);
  const bandMin=SUMMER_HEAT_BAND_MIN_C[band]??null;
  const minSummer=explicitMin??bandMin;
  if(minSummer!=null){
    const siteWarmest=warmest(climateProfile);
    if(siteWarmest==null){
      return result(REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,null,'incomplete:warmest-month-mean-max',{
        missing:['warmestMonthMeanMaxC'],
        requiredMinC:minSummer,
        evidenceClass,
        summerHeatBand:band||null
      });
    }
    if(siteWarmest<minSummer){
      const gap=minSummer-siteWarmest;
      const hardEvidence=evidenceClass==='SOURCE_SUPPORTED' && explicitMin!=null;
      return result(
        hardEvidence && gap>=4
          ? REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE
          : REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED,
        'Summer warmth is below the structured '+phase+' requirement.',
        'negative:summer-heat-deficit',
        {
          observedWarmestMonthMeanMaxC:siteWarmest,
          requiredMinC:minSummer,
          deficitC:Number(gap.toFixed(2)),
          summerHeatBand:band||null,
          evidenceClass
        }
      );
    }
  }

  return result(REPRODUCTIVE_CLIMATE_STATUS.SUPPORTED,null,'positive:structured-reproductive-climate-match',{
    evidenceClass,
    observedWarmestMonthMeanMaxC:warmest(climateProfile),
    summerHeatBand:band||null,
    requiredMinC:minSummer
  });
}

export function evaluateReproductiveClimateGate({
  meta=null,
  climateProfile={},
  protectedGrowing=false
}={}){
  const flowering=evaluateReproductiveClimatePhase({
    meta,climateProfile,phase:'flowering',protectedGrowing
  });
  const fruiting=evaluateReproductiveClimatePhase({
    meta,climateProfile,phase:'fruiting',protectedGrowing
  });
  return Object.freeze({
    version:REPRODUCTIVE_CLIMATE_GATE_VERSION,
    flowering,
    fruiting
  });
}

export function applyReproductiveClimateToFits(state={},gate={}){
  const next={...state};
  const apply=(key,res)=>{
    if(!res||!key)return;
    if(res.status===REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE){
      next[key]=Math.min(Number(next[key])||100,20);
    }else if(res.status===REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED){
      next[key]=Math.min(Number(next[key])||100,45);
    }else if(res.status===REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN){
      next[key]=Math.min(Number(next[key])||100,50);
    }
  };
  apply('floweringFit',gate.flowering);
  apply('fruitingFit',gate.fruiting);
  next.reproductiveClimateGate=gate;
  return next;
}

const api={
  REPRODUCTIVE_CLIMATE_GATE_VERSION,
  REPRODUCTIVE_CLIMATE_STATUS,
  SUMMER_HEAT_BAND_MIN_C,
  evaluateReproductiveClimatePhase,
  evaluateReproductiveClimateGate,
  applyReproductiveClimateToFits
};
export default api;
if(typeof globalThis!=='undefined') globalThis.CruvitReproductiveClimateGate=api;
