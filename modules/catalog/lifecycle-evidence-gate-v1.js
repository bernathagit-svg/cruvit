/**
 * CRUVIT Lifecycle Evidence Gate V1
 * Pure text extraction. No network, no writes.
 */
export const LIFECYCLE_EVIDENCE_GATE_VERSION='lifecycle-evidence-gate-v1';

function normText(v){
  return String(v||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}
function esc(s){return String(s||'').replace(/[.*+?^\${}()|[\]\\]/g,'\\$&');}

function normalizeTaxonText(value){
  return String(value||'')
    .replace(/&times;|&#215;/gi,'×')
    .replace(/[×]/g,' x ')
    .replace(/\b(subsp|ssp|var|f)\.?\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

export function lifecycleIdentityMatches(raw,scientific){
  const text=normalizeTaxonText(normText(raw));
  const sci=normalizeTaxonText(scientific);
  if(!text||!sci) return false;
  if(text.includes(sci)) return true;
  const parts=sci.split(' ').filter(Boolean).filter(x=>x!=='x');
  if(parts.length<2) return false;
  return text.includes(parts[0]+' '+parts[1]);
}

export function extractExplicitLifecycle(raw,scientific){
  const text=normText(raw);
  const sci=String(scientific||'').trim();
  if(!text||!sci) return {ok:false,state:'UNKNOWN',code:'INPUT_REQUIRED',excerpt:null};
  if(!lifecycleIdentityMatches(text,sci)) return {ok:false,state:'UNKNOWN',code:'IDENTITY_MISMATCH',excerpt:null};

  const patterns=[
    {state:'ANNUAL',re:/\bannual\b/i},
    {state:'BIENNIAL',re:/\bbiennial\b/i},
    {state:'PERENNIAL',re:/\bperennial\b/i}
  ];
  const hits=[];
  for(const p of patterns){
    const m=p.re.exec(text);
    if(m) hits.push({state:p.state,index:m.index});
  }
  if(!hits.length) return {ok:false,state:'UNKNOWN',code:'NO_EXPLICIT_LIFECYCLE',excerpt:null};
  hits.sort((a,b)=>a.index-b.index);

  const plantTypeMatch=/Plant Type:\s*([^:]{1,180}?)(?:Leaf Characteristics:|Habit\/Form:|Growth Rate:|Maintenance:|Texture:|Cultural Conditions:)/i.exec(text);
  if(plantTypeMatch){
    const block=plantTypeMatch[1];
    const structuredStates=[
      /\bAnnual\b/i.test(block)?'ANNUAL':null,
      /\bBiennial\b/i.test(block)?'BIENNIAL':null,
      /\bPerennial\b/i.test(block)?'PERENNIAL':null
    ].filter(Boolean);
    const distinct=[...new Set(structuredStates)];
    if(distinct.length===1){
      return {
        ok:true,state:distinct[0],code:'EXPLICIT_LIFECYCLE_FOUND',
        excerpt:text.slice(Math.max(0,plantTypeMatch.index-90),Math.min(text.length,plantTypeMatch.index+280))
      };
    }
    if(distinct.length>1){
      return {
        ok:false,state:'UNKNOWN',code:'STRUCTURED_LIFECYCLE_CONFLICT',
        excerpt:text.slice(Math.max(0,plantTypeMatch.index-90),Math.min(text.length,plantTypeMatch.index+320)),
        conflictingStates:distinct
      };
    }
  }

  const first=hits[0];
  const distinct=[...new Set(hits.map(x=>x.state))];
  if(distinct.length>1){
    return {
      ok:false,state:'UNKNOWN',code:'LIFECYCLE_CONFLICT_IN_SOURCE',
      excerpt:text.slice(Math.max(0,first.index-90),Math.min(text.length,first.index+260))
    };
  }
  return {
    ok:true,state:first.state,code:'EXPLICIT_LIFECYCLE_FOUND',
    excerpt:text.slice(Math.max(0,first.index-90),Math.min(text.length,first.index+220))
  };
}

export function combineLifecycleEvidence(records=[]){
  const eligible=(records||[]).filter(r=>r?.ok===true&&r?.sourcePolicyEligible===true&&['ANNUAL','BIENNIAL','PERENNIAL'].includes(r.state));
  const states=[...new Set(eligible.map(r=>r.state))];
  if(states.length===1){
    return {
      version:LIFECYCLE_EVIDENCE_GATE_VERSION,
      state:states[0],
      evidenceClass:'SOURCE_SUPPORTED',
      ready:true,
      code:'SOURCE_SUPPORTED_LIFECYCLE_READY',
      records:eligible
    };
  }
  if(states.length>1){
    return {
      version:LIFECYCLE_EVIDENCE_GATE_VERSION,
      state:'UNKNOWN',
      evidenceClass:'CONFLICT_HOLD',
      ready:false,
      code:'CONFLICTING_LIFECYCLE_EVIDENCE',
      records:eligible
    };
  }
  return {
    version:LIFECYCLE_EVIDENCE_GATE_VERSION,
    state:'UNKNOWN',
    evidenceClass:'UNKNOWN',
    ready:false,
    code:'NO_SOURCE_SUPPORTED_LIFECYCLE',
    records:records||[]
  };
}
