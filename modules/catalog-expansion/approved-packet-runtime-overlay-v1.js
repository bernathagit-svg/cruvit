export const APPROVED_PACKET_RUNTIME_OVERLAY_VERSION = '1.0.0';

function clone(value){
  if(value==null) return value;
  try{return JSON.parse(JSON.stringify(value));}catch{return value;}
}
function unionStrings(a,b){
  return [...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].map(String))];
}
export function applyApprovedPacketRuntimeClimateOverlay(plants,payload,{
  aliasToCanonical={},
  preserveVerifiedCanonical=true
}={}){
  const rows=payload&&payload.schemaVersion===1&&payload.plants&&typeof payload.plants==='object'
    ?payload.plants:{};
  const applied=[],skipped=[];
  for(const plant of Array.isArray(plants)?plants:[]){
    const slug=String(plant?.slug||'').trim().toLowerCase();
    if(!slug) continue;
    if(
      preserveVerifiedCanonical &&
      plant?.canonicalClimateAuthority?.verificationState==='verified' &&
      plant?.canonicalClimateAuthority?.needsReview!==true
    ){
      skipped.push({slug,reason:'verified-canonical-authority'});
      continue;
    }
    const packetAlias=Object.keys(aliasToCanonical).find(
      alias=>aliasToCanonical[alias]===slug&&rows[alias]
    );
    const sourceSlug=rows[slug]?slug:(packetAlias||null), row=sourceSlug?rows[sourceSlug]:null;
    if(!row||row.packetVerificationState!=='verified'||row.needsReview===true||!row.climateTraits){
      skipped.push({slug,reason:'no-verified-approved-packet-overlay'});
      continue;
    }
    const existing=plant.climateTraits&&typeof plant.climateTraits==='object'?plant.climateTraits:{};
    const mergedTraits={
      ...existing,
      ...clone(row.climateTraits),
      groupIds:unionStrings(existing.groupIds,row.climateTraits.groupIds)
    };
    // A field explicitly absent from the approved packet must not silently fall back
    // to an unproven legacy ordinal. Preserve an existing value only when its own
    // field-level evidence is already SOURCE_SUPPORTED.
    const existingEvidence=existing.traitEvidenceClasses&&typeof existing.traitEvidenceClasses==='object'
      ?existing.traitEvidenceClasses:{};
    const authorityUnknownFields=[];
    for(const field of Array.isArray(row.missingFields)?row.missingFields:[]){
      if(String(existingEvidence[field]||'').toUpperCase()!=='SOURCE_SUPPORTED'){
        delete mergedTraits[field];
        authorityUnknownFields.push(field);
      }
    }
    mergedTraits.authorityUnknownFields=authorityUnknownFields;
    plant.climateTraits=mergedTraits;
    if(row.scientific) plant.scientific=row.scientific;
    plant.approvedPacketClimateAuthority={
      source:'approved-catalog-expansion-packet',
      sourceSlug,
      packetId:row.packetId||null,
      verificationState:'verified_packet',
      verificationScope:row.verificationScope||'packet-acceptance-only',
      coverageState:row.coverageState||'unknown',
      trackedFields:Array.isArray(row.trackedFields)?[...row.trackedFields]:[],
      missingFields:Array.isArray(row.missingFields)?[...row.missingFields]:[],
      fieldCoverage:clone(row.fieldCoverage||{}),
      needsReview:false,
      overlayVersion:payload.overlayVersion||APPROVED_PACKET_RUNTIME_OVERLAY_VERSION
    };
    applied.push(slug);
  }
  return {applied,skipped};
}
