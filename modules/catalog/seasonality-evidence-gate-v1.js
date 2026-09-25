/**
 * Seasonality Evidence Gate V1.
 *
 * Evidence-only extraction for Design visual states.
 * It may classify leaf habit only from explicit authoritative wording.
 * needsWinterChill, hardiness zone, latitude, or climate group MUST NOT imply deciduous.
 */

export const SEASONALITY_EVIDENCE_GATE_VERSION = 'seasonality-evidence-gate-v1';

export const LEAF_HABIT_STATE = Object.freeze({
  DECIDUOUS:'DECIDUOUS',
  EVERGREEN:'EVERGREEN',
  SEMI_DECIDUOUS:'SEMI_DECIDUOUS',
  SEMI_EVERGREEN:'SEMI_EVERGREEN',
  CONFLICT:'CONFLICT',
  UNKNOWN:'UNKNOWN'
});

function text(v){ return String(v == null ? '' : v).trim(); }

function stripHtml(html=''){
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}

function normalized(s){
  return text(s).toLowerCase().replace(/×/g,'x').replace(/\s+/g,' ');
}

export function sourceIdentityMatches(body, scientificName){
  const hay=normalized(stripHtml(body));
  const sci=normalized(scientificName);
  if(!sci) return false;
  const parts=sci.split(' ').filter(Boolean).filter(x=>x!=='x');
  if(parts.length<2) return false;
  return hay.includes(parts[0]+' '+parts[1]) || hay.includes(parts[0]+' x '+parts[1]);
}

function excerptAround(raw, index, radius=150){
  const start=Math.max(0,index-radius);
  const end=Math.min(raw.length,index+radius);
  return raw.slice(start,end).replace(/\s+/g,' ').trim();
}

export function extractExplicitLeafHabit(body, scientificName){
  const raw=stripHtml(body);
  if(!sourceIdentityMatches(raw, scientificName)){
    return {ok:false,state:LEAF_HABIT_STATE.UNKNOWN,code:'IDENTITY_MISMATCH',excerpt:null};
  }
  const lower=raw.toLowerCase();
  const hits=[];
  const patterns=[
    {state:LEAF_HABIT_STATE.SEMI_DECIDUOUS,re:/\bsemi[- ]?deciduous\b/g},
    {state:LEAF_HABIT_STATE.SEMI_EVERGREEN,re:/\bsemi[- ]?evergreen\b/g},
    {state:LEAF_HABIT_STATE.DECIDUOUS,re:/\bdeciduous\b/g},
    {state:LEAF_HABIT_STATE.EVERGREEN,re:/\bevergreen\b/g}
  ];
  for(const p of patterns){
    for(const match of lower.matchAll(p.re)){
      hits.push({state:p.state,index:match.index,excerpt:excerptAround(raw,match.index)});
    }
  }

  // Avoid double-counting "semi-deciduous" also as "deciduous".
  const normalizedHits=hits.filter(h=>{
    if(h.state===LEAF_HABIT_STATE.DECIDUOUS){
      return !hits.some(x=>x.state===LEAF_HABIT_STATE.SEMI_DECIDUOUS && Math.abs(x.index-h.index)<12);
    }
    if(h.state===LEAF_HABIT_STATE.EVERGREEN){
      return !hits.some(x=>x.state===LEAF_HABIT_STATE.SEMI_EVERGREEN && Math.abs(x.index-h.index)<12);
    }
    return true;
  });

  const states=[...new Set(normalizedHits.map(x=>x.state))];
  if(states.length===0){
    return {ok:false,state:LEAF_HABIT_STATE.UNKNOWN,code:'EXPLICIT_LEAF_HABIT_NOT_FOUND',excerpt:null,hits:[]};
  }

  const deciduousFamily=states.filter(x=>[LEAF_HABIT_STATE.DECIDUOUS,LEAF_HABIT_STATE.SEMI_DECIDUOUS].includes(x));
  const evergreenFamily=states.filter(x=>[LEAF_HABIT_STATE.EVERGREEN,LEAF_HABIT_STATE.SEMI_EVERGREEN].includes(x));
  if(deciduousFamily.length && evergreenFamily.length){
    return {ok:false,state:LEAF_HABIT_STATE.CONFLICT,code:'LEAF_HABIT_CONFLICT',excerpt:null,hits:normalizedHits};
  }

  // Prefer the more specific semi-* state if present.
  const state=states.includes(LEAF_HABIT_STATE.SEMI_DECIDUOUS)
    ? LEAF_HABIT_STATE.SEMI_DECIDUOUS
    : states.includes(LEAF_HABIT_STATE.SEMI_EVERGREEN)
      ? LEAF_HABIT_STATE.SEMI_EVERGREEN
      : states[0];

  const hit=normalizedHits.find(x=>x.state===state);
  return {ok:true,state,code:'EXPLICIT_LEAF_HABIT_FOUND',excerpt:hit?.excerpt||null,hits:normalizedHits};
}

export function combineLeafHabitEvidence(records=[]){
  const accepted=(records||[]).filter(r=>r?.ok===true && r?.identityMatch===true && r?.sourcePolicyEligible===true);
  if(!accepted.length){
    return {
      version:SEASONALITY_EVIDENCE_GATE_VERSION,
      state:LEAF_HABIT_STATE.UNKNOWN,
      evidenceClass:'UNKNOWN',
      ready:false,
      code:'NO_SOURCE_SUPPORTED_LEAF_HABIT',
      records:records||[]
    };
  }
  const normalized=accepted.map(r=>{
    if(r.state===LEAF_HABIT_STATE.SEMI_DECIDUOUS) return LEAF_HABIT_STATE.DECIDUOUS;
    if(r.state===LEAF_HABIT_STATE.SEMI_EVERGREEN) return LEAF_HABIT_STATE.EVERGREEN;
    return r.state;
  });
  const unique=[...new Set(normalized)];
  if(unique.length>1){
    return {
      version:SEASONALITY_EVIDENCE_GATE_VERSION,
      state:LEAF_HABIT_STATE.CONFLICT,
      evidenceClass:'UNKNOWN',
      ready:false,
      code:'SOURCE_SUPPORTED_LEAF_HABIT_CONFLICT',
      records
    };
  }
  return {
    version:SEASONALITY_EVIDENCE_GATE_VERSION,
    state:unique[0],
    evidenceClass:'SOURCE_SUPPORTED',
    ready:true,
    code:'SOURCE_SUPPORTED_LEAF_HABIT_READY',
    records:accepted
  };
}

export const SEASONALITY_GOVERNANCE = Object.freeze({
  hardinessZoneMayInferLeafHabit:false,
  needsWinterChillMayInferLeafHabit:false,
  climateGroupMayInferLeafHabit:false,
  explicitSourceWordingRequired:true,
  canonicalSpeciesIdentityMatchRequired:true,
  conflictNeverAutoResolves:true,
  unknownAllowed:true,
  visualWinterAssetOnlyAfterEvidence:true
});
