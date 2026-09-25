function safeSlug(value){
  const s=String(value||'').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';
}

export function packetPathForCatalogRow(row){
  const slug=safeSlug(row?.slug);
  const packet=String(row?.source_packet||row?.sourcePacket||'').trim();
  if(!slug||!packet) return null;

  const bulk=packet.match(/-bulk-batch-(\d+)-v1$/);
  if(bulk){
    return `data/catalog-expansion/batches/bulk-batch-${bulk[1]}-v1/packets/${slug}.packet.json`;
  }
  if(packet==='cacao-theobroma-cacao-v1'){
    return 'data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json';
  }
  if(/wave1-selective-v1$/.test(packet)){
    return `data/catalog-expansion/batches/wave1-selective-v1/packets/${slug}.packet.json`;
  }
  return null;
}

export async function hydrateDesignMetadataFromApprovedPacket(req,row){
  if(!row) return {row:null,hydrated:false,code:'CATALOG_ROW_MISSING'};
  const existing=row?.climate_traits?.designMetadata;
  const existingComplete =
    existing
    && typeof existing==='object'
    && (
      (Array.isArray(existing.tags) && existing.tags.length>0)
      || String(existing.growth||'').trim()
    );
  if(existingComplete){
    return {row,hydrated:false,code:'DESIGN_METADATA_ALREADY_PRESENT'};
  }
  const packetPath=packetPathForCatalogRow(row);
  if(!packetPath){
    return {row,hydrated:false,code:'SOURCE_PACKET_PATH_UNRESOLVED'};
  }

  const u=new URL('/.netlify/functions/catalog-approved-packet-materialize',req.url);
  u.searchParams.set('path',packetPath);
  const res=await fetch(u,{cache:'no-store'});
  let body=null;
  try{body=await res.json();}catch{}
  const dm=body?.row?.climate_traits?.designMetadata;
  if(!res.ok||!body?.ok||!dm){
    return {
      row,
      hydrated:false,
      code:'DESIGN_METADATA_MATERIALIZE_UNAVAILABLE',
      packetPath,
      status:res.status
    };
  }

  const mergedDesignMetadata={
    ...dm,
    ...(existing && typeof existing==='object' ? existing : {}),
    tags:
      Array.isArray(existing?.tags) && existing.tags.length
        ? existing.tags
        : (Array.isArray(dm.tags) ? dm.tags : []),
    growth:
      String(existing?.growth||'').trim()
        ? existing.growth
        : (dm.growth||null),
    matureSize:
      String(existing?.matureSize||'').trim()
        ? existing.matureSize
        : (dm.matureSize||null),
    leafHabit:
      existing?.leafHabit
      && typeof existing.leafHabit==='object'
      && String(existing.leafHabit.evidenceClass||'').toUpperCase()==='SOURCE_SUPPORTED'
        ? existing.leafHabit
        : dm.leafHabit,
    seasonalityResearchRequired:
      existing?.leafHabit
      && typeof existing.leafHabit==='object'
      && String(existing.leafHabit.evidenceClass||'').toUpperCase()==='SOURCE_SUPPORTED'
        ? false
        : dm.seasonalityResearchRequired===true
  };

  return {
    row:{
      ...row,
      climate_traits:{
        ...(row.climate_traits||{}),
        designMetadata:mergedDesignMetadata
      }
    },
    hydrated:true,
    code:'DESIGN_METADATA_HYDRATED_FROM_APPROVED_PACKET',
    packetPath
  };
}
