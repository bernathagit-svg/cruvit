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

export const REPRODUCTIVE_CLIMATE_EVIDENCE_STATE=Object.freeze({
  CONTEXT_DEPENDENT:'CONTEXT_DEPENDENT',
  RESEARCHED_UNQUANTIFIED:'RESEARCHED_UNQUANTIFIED'
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
function drySeasonSignal(env={}){
  const vals=[
    env.drySeasonSignal,
    env.structuralClimate?.drySeasonSignal,
    env.structuralPersistencePreview?.drySeasonSignal,
    env.coordinateClimateV2?.structuralPersistencePreview?.drySeasonSignal
  ];
  for(const v of vals) if(v===true||v===false) return v;
  return null;
}
function absoluteMinimumTemperatureC(env={}){
  const vals=[
    env.absoluteMinimumTemperatureC,
    env.extremeMinimumTemperatureC,
    env.structuralClimate?.evidence?.absoluteMinimumTemperatureC,
    env.coordinateClimateV2?.evidence?.absoluteMinimumTemperatureC
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
  const evidenceState=String(req.evidenceState||'').toUpperCase();
  const contextKeys=Array.isArray(req.contextKeys)
    ? req.contextKeys.map(x=>String(x||'').trim()).filter(Boolean)
    : [];
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

  if(norm(req.seasonalInductionCue)==='cool_or_dry'){
    const cool=climateProfile.coolSeasonSignal;
    const dry=drySeasonSignal(climateProfile);
    if(cool!==true && dry!==true){
      if(cool===false && dry===false){
        return result(
          evidenceClass==='SOURCE_SUPPORTED'
            ? REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE
            : REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED,
          'Reliable '+phase+' requires a cool or dry seasonal induction signal.',
          'negative:seasonal-induction-cool-or-dry',
          {evidenceClass,seasonalInductionCue:'cool_or_dry'}
        );
      }
      return result(
        REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,
        'A cool-or-dry reproductive induction requirement is known, but the site signal is incomplete.',
        'incomplete:seasonal-induction-cool-or-dry',
        {
          evidenceClass,
          seasonalInductionCue:'cool_or_dry',
          missing:[
            ...(cool==null?['coolSeasonSignal']:[]),
            ...(dry==null?['drySeasonSignal']:[])
          ]
        }
      );
    }
  }

  const minEvent=finite(req.minReproductiveEventC);
  if(minEvent!=null){
    const absoluteMin=absoluteMinimumTemperatureC(climateProfile);
    if(absoluteMin==null){
      if(!(frostFree && minEvent<=0)){
        return result(
          REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,
          'A reproductive cold-event threshold is known, but site extreme-minimum evidence is unavailable.',
          'incomplete:absolute-minimum-temperature',
          {evidenceClass,requiredMinReproductiveEventC:minEvent,missing:['absoluteMinimumTemperatureC']}
        );
      }
    }else if(absoluteMin<minEvent){
      return result(
        evidenceClass==='SOURCE_SUPPORTED'
          ? REPRODUCTIVE_CLIMATE_STATUS.UNRELIABLE
          : REPRODUCTIVE_CLIMATE_STATUS.CONSTRAINED,
        'Cold events fall below the structured '+phase+' reproductive threshold.',
        'negative:reproductive-cold-event',
        {evidenceClass,observedAbsoluteMinimumTemperatureC:absoluteMin,requiredMinReproductiveEventC:minEvent}
      );
    }
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

  const hasEvaluableRequirement=Boolean(
    req.requiresFrostFree===true
    || req.requiresCoolSeason===true
    || norm(req.seasonalInductionCue)==='cool_or_dry'
    || minEvent!=null
    || minSummer!=null
  );

  if(!hasEvaluableRequirement){
    if(evidenceState===REPRODUCTIVE_CLIMATE_EVIDENCE_STATE.CONTEXT_DEPENDENT){
      return result(
        REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,
        'Reproductive climate evidence is source-backed but depends on unresolved plant context.',
        'researched:context-dependent',
        {evidenceClass,evidenceState,missingContext:contextKeys}
      );
    }
    if(evidenceState===REPRODUCTIVE_CLIMATE_EVIDENCE_STATE.RESEARCHED_UNQUANTIFIED){
      return result(
        REPRODUCTIVE_CLIMATE_STATUS.UNKNOWN,
        'Reproductive climate research is complete, but no defensible universal threshold is quantified.',
        'researched:unquantified',
        {evidenceClass,evidenceState}
      );
    }
  }

  return result(REPRODUCTIVE_CLIMATE_STATUS.SUPPORTED,null,'positive:structured-reproductive-climate-match',{
    evidenceClass,
    observedWarmestMonthMeanMaxC:warmest(climateProfile),
    summerHeatBand:band||null,
    requiredMinC:minSummer,
    evidenceState:evidenceState||null
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
  REPRODUCTIVE_CLIMATE_EVIDENCE_STATE,
  SUMMER_HEAT_BAND_MIN_C,
  evaluateReproductiveClimatePhase,
  evaluateReproductiveClimateGate,
  applyReproductiveClimateToFits
};
export default api;
if(typeof globalThis!=='undefined') globalThis.CruvitReproductiveClimateGate=api;
