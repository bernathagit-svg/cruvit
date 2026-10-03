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
    if(!row||row.verificationState!=='verified'||row.needsReview===true||!row.climateTraits){
      skipped.push({slug,reason:'no-verified-approved-packet-overlay'});
      continue;
    }
    const existing=plant.climateTraits&&typeof plant.climateTraits==='object'?plant.climateTraits:{};
    plant.climateTraits={
      ...existing,
      ...clone(row.climateTraits),
      groupIds:unionStrings(existing.groupIds,row.climateTraits.groupIds)
    };
    if(row.scientific) plant.scientific=row.scientific;
    plant.approvedPacketClimateAuthority={
      source:'approved-catalog-expansion-packet',
      sourceSlug,
      packetId:row.packetId||null,
      verificationState:'verified',
      needsReview:false,
      overlayVersion:payload.overlayVersion||APPROVED_PACKET_RUNTIME_OVERLAY_VERSION
    };
    applied.push(slug);
  }
  return {applied,skipped};
}
