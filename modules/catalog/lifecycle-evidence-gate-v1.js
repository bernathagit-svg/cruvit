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

export function extractExplicitLifecycle(raw,scientific){
  const text=normText(raw);
  const sci=String(scientific||'').trim();
  if(!text||!sci) return {ok:false,state:'UNKNOWN',code:'INPUT_REQUIRED',excerpt:null};
  const identityRe=new RegExp(esc(sci).replace(/\s+/g,'\\s+'),'i');
  if(!identityRe.test(text)) return {ok:false,state:'UNKNOWN',code:'IDENTITY_MISMATCH',excerpt:null};

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

  const structured=[
    {state:'ANNUAL',re:/Plant Type:\s*Annual\b/i},
    {state:'BIENNIAL',re:/Plant Type:\s*Biennial\b/i},
    {state:'PERENNIAL',re:/Plant Type:[^\n]{0,80}\bPerennial\b/i}
  ];
  for(const p of structured){
    const m=p.re.exec(text);
    if(m){
      return {
        ok:true,state:p.state,code:'EXPLICIT_LIFECYCLE_FOUND',
        excerpt:text.slice(Math.max(0,m.index-90),Math.min(text.length,m.index+220))
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
