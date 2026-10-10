/**
 * CRUVIT — Provider Identification Evidence Adapter V1
 *
 * Pure boundary:
 * provider/backend identification response -> diagnostic-only provider evidence
 * + taxonomy-verified PI-PROV-2 signals.
 *
 * No provider, GBIF, Supabase, catalog, resolver, network, UI, Save, env or secrets.
 */
export const PROVIDER_IDENTIFICATION_EVIDENCE_ADAPTER_VERSION='1.0.0';

function clean(value){
  return typeof value==='string' && value.trim() ? value.trim() : '';
}

function deepFreeze(value,seen=new WeakSet()){
  if(!value || typeof value!=='object' || seen.has(value)) return value;
  seen.add(value);
  for(const key of Object.keys(value)) deepFreeze(value[key],seen);
  return Object.freeze(value);
}

function safeScalar(value){
  if(value===null || typeof value==='string' || typeof value==='boolean') return value;
  if(typeof value==='number') return Number.isFinite(value) ? value : String(value);
  return undefined;
}

function boundedDiagnostic(value,depth=0,seen=new WeakSet()){
  if(depth>4) return '[depth-limit]';
  const scalar=safeScalar(value);
  if(scalar!==undefined) return scalar;
  if(!value || typeof value!=='object') return undefined;
  if(seen.has(value)) return '[circular]';
  seen.add(value);
  if(Array.isArray(value)){
    const out=value.slice(0,20).map(item=>boundedDiagnostic(item,depth+1,seen));
    seen.delete(value);
    return out;
  }
  const blockedKeys=new Set([
    'imageBase64','imageDataUrl','image','photo','file','blob','bytes','exif',
    'apiKey','key','secret','token','authorization','environment','env',
    'canonicalSlug','plantId','identityConfirmed','saveEligible'
  ]);
  const out={};
  for(const key of Object.keys(value).sort()){
    if(blockedKeys.has(key)) continue;
    const next=boundedDiagnostic(value[key],depth+1,seen);
    if(next!==undefined) out[key]=next;
  }
  seen.delete(value);
  return out;
}

function candidateDiagnostic(candidate,index){
  return {
    index,
    scientificName:clean(candidate?.scientificName) || null,
    commonName:clean(candidate?.commonName) || null,
    confidence:safeScalar(candidate?.confidence) ?? null,
    gbifVerified:candidate?.gbifVerified===true,
    gbifKey:safeScalar(candidate?.gbifKey) ?? null
  };
}

function providerEvidence(input,candidates){
  const source=input && typeof input==='object' && !Array.isArray(input) ? input : {};
  return deepFreeze({
    authority:false,
    canonicalAuthority:false,
    uiCertified:false,
    scope:'provider_evidence_only',
    data:{
      code:clean(source.code) || null,
      error:clean(source.error) || null,
      topLevel:{
        scientificName:clean(source.scientificName || source.scientific_name) || null,
        commonName:clean(source.commonName || source.common_name) || null,
        confidence:safeScalar(source.confidence) ?? null,
        gbifVerified:source.gbifVerified===true
      },
      candidates:candidates.map(candidateDiagnostic),
      identification:boundedDiagnostic(source.identification),
      visualAnalysis:boundedDiagnostic(source.visualAnalysis),
      care:boundedDiagnostic(source.care)
    }
  });
}

function blocked(reason,input,candidates=[]){
  return deepFreeze({
    adapterVersion:PROVIDER_IDENTIFICATION_EVIDENCE_ADAPTER_VERSION,
    status:'blocked',
    reason,
    signals:[],
    providerEvidence:providerEvidence(input,candidates)
  });
}

export function adaptProviderIdentificationEvidence(input){
  try{
    const source=input && typeof input==='object' && !Array.isArray(input) ? input : {};

    if(clean(source.code)==='TAXONOMY_VERIFICATION_FAILED'){
      return blocked('TAXONOMY_VERIFICATION_FAILED',source,[]);
    }

    if(!Array.isArray(source.candidates)){
      return blocked('CANDIDATE_SET_MISSING_OR_MALFORMED',source,[]);
    }

    if(source.candidates.length===0){
      return blocked('NO_VERIFIED_CANDIDATES',source,[]);
    }

    const candidates=source.candidates;
    for(const candidate of candidates){
      if(!candidate || typeof candidate!=='object' || Array.isArray(candidate)){
        return blocked('CANDIDATE_SET_CONTRACT_VIOLATION',source,candidates);
      }
      if(candidate.gbifVerified!==true){
        return blocked('CANDIDATE_SET_CONTRACT_VIOLATION',source,candidates);
      }
      if(!clean(candidate.scientificName)){
        return blocked('CANDIDATE_SET_CONTRACT_VIOLATION',source,candidates);
      }
    }

    const signals=candidates.map(candidate=>deepFreeze({
      source:'taxonomy_verified',
      kind:'scientific_name',
      value:clean(candidate.scientificName)
    }));

    return deepFreeze({
      adapterVersion:PROVIDER_IDENTIFICATION_EVIDENCE_ADAPTER_VERSION,
      status:'accepted',
      reason:null,
      signals,
      providerEvidence:providerEvidence(source,candidates)
    });
  }catch(_error){
    return blocked('ADAPTER_FAIL_CLOSED',null,[]);
  }
}
