export const BROAD_IDENTITY_AUTHORITY_VERSION='broad-runtime-identity-authority-v1';

export function applyBroadRuntimeIdentityAuthority(plants,payload){
  const rows=payload&&payload.schemaVersion===1&&payload.plants&&typeof payload.plants==='object'?payload.plants:{};
  const applied=[],skipped=[];
  for(const plant of Array.isArray(plants)?plants:[]){
    const slug=String(plant?.slug||'').trim().toLowerCase();
    if(!slug) continue;
    if(plant?.approvedPacketClimateAuthority){
      skipped.push({slug,reason:'species-or-packet-authority-present'});
      continue;
    }
    const row=rows[slug];
    if(!row){skipped.push({slug,reason:'no-broad-identity-authority'});continue;}
    const scientific=String(plant.scientific||'').trim();
    if(scientific&&String(row.scientific||'').trim()&&scientific.toLowerCase()!==String(row.scientific).trim().toLowerCase()){
      skipped.push({slug,reason:'scientific-mismatch'});
      continue;
    }
    plant.identityScope=row.identityScope||'broad';
    plant.broadIdentityAuthority={
      source:'broad-runtime-identity-authority-v1',
      authorityVersion:payload.authorityVersion||BROAD_IDENTITY_AUTHORITY_VERSION,
      resolutionState:row.resolutionState||'BROAD_IDENTITY_VALID',
      precisionRequired:row.precisionRequired||'species',
      positiveRecommendationPolicy:payload.policy||'BLOCK_POSITIVE_UNTIL_SPECIES_RESOLVED',
      scientific:row.scientific||scientific||null
    };
    plant.climateTraits={
      ...(plant.climateTraits||{}),
      needsReview:true,
      identityScope:plant.identityScope
    };
    applied.push(slug);
  }
  return {applied,skipped};
}
