/**
 * CRUVIT — Plant Identification Catalog Authority Adapter V1
 *
 * Pure foundation adapter:
 * PI-PROV-2 resolution + explicitly supplied public.catalog_plants row
 * -> PI-PROV-1-compatible canonical catalog evidence.
 *
 * No I/O, provider, network, database, registry loading, UI, Save, or telemetry.
 */
import { evaluateCatalogIdentityAuthority } from '../catalog/catalog-identity-authority-v1.js';

export const CANONICAL_IDENTIFICATION_CATALOG_AUTHORITY_VERSION='1.0.0';

const POSITIVE_RESOLUTION_STATUSES=new Set(['resolved_id','resolved_canonical']);

function text(value){ return typeof value==='string' && value.trim() ? value.trim() : ''; }
function norm(value){ return text(value).toLowerCase().replace(/\s+/g,' '); }

function deepFreeze(value,seen=new WeakSet()){
  if(!value || typeof value!=='object' || seen.has(value)) return value;
  seen.add(value);
  for(const key of Object.keys(value)) deepFreeze(value[key],seen);
  return Object.freeze(value);
}

function normalizeLocale(value){
  const raw=text(value).toLowerCase().replace(/_/g,'-');
  if(!raw) return null;
  const primary=raw.split('-')[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}

function lineage(catalogRow){
  return {
    catalogVersion: text(catalogRow?.catalog_version) || null,
    sourcePacket: text(catalogRow?.source_packet) || null
  };
}

function baseFailure({
  validation='failed',
  reasons=[],
  resolution=null,
  catalogRow=null,
  provenanceSourceId=null,
  requestedLocale=null
}={}){
  const line=lineage(catalogRow);
  return deepFreeze({
    authority: validation==='missing' ? null : 'catalog_plants',
    validation,
    canonicalSlug:null,
    scientificName:null,
    commonName:null,
    needsReview: resolution?.needsReview===true,
    conflictActive: resolution?.conflictActive===true,
    catalogVersion:line.catalogVersion,
    sourcePacket:line.sourcePacket,
    provenanceSourceId:provenanceSourceId || null,
    requestedLocale,
    resolvedDisplayLocale:null,
    localeFallback:false,
    reasons:[...new Set(reasons)]
  });
}

function normalizeLocaleValue(value){
  if(typeof value==='string'){
    const one=text(value);
    return {state:one?'one':'missing',value:one||null};
  }
  if(Array.isArray(value)){
    const values=[];
    const seen=new Set();
    for(const item of value){
      if(typeof item!=='string') continue;
      const cleaned=text(item);
      if(!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      values.push(cleaned);
    }
    if(values.length===1) return {state:'one',value:values[0]};
    if(values.length>1) return {state:'ambiguous',value:null};
    return {state:'missing',value:null};
  }
  return {state:'missing',value:null};
}

function selectCanonicalCommonName(commonNames,requestedLocale){
  const names=commonNames && typeof commonNames==='object' && !Array.isArray(commonNames)
    ? commonNames
    : {};
  if(requestedLocale){
    const requested=normalizeLocaleValue(names[requestedLocale]);
    if(requested.state==='ambiguous'){
      return {ok:false,reason:'CANONICAL_COMMON_NAME_AMBIGUOUS',resolvedDisplayLocale:null,localeFallback:false,commonName:null};
    }
    if(requested.state==='one'){
      return {ok:true,reason:null,resolvedDisplayLocale:requestedLocale,localeFallback:false,commonName:requested.value};
    }
  }
  if(requestedLocale!=='en'){
    const english=normalizeLocaleValue(names.en);
    if(english.state==='ambiguous'){
      return {ok:false,reason:'CANONICAL_COMMON_NAME_AMBIGUOUS',resolvedDisplayLocale:null,localeFallback:false,commonName:null};
    }
    if(english.state==='one'){
      return {ok:true,reason:null,resolvedDisplayLocale:'en',localeFallback:true,commonName:english.value};
    }
  }
  return {ok:false,reason:'CANONICAL_COMMON_NAME_MISSING',resolvedDisplayLocale:null,localeFallback:false,commonName:null};
}

export function evaluateCanonicalIdentificationCatalogAuthority(input={}){
  try{
    const source=input && typeof input==='object' && !Array.isArray(input) ? input : {};
    const resolution=source.resolution ?? null;
    const catalogRow=source.catalogRow ?? null;
    const locale=source.locale ?? null;
    const requestedLocale=normalizeLocale(locale);
    const r=resolution && typeof resolution==='object' && !Array.isArray(resolution) ? resolution : null;

    if(!r){
      return baseFailure({reasons:['RESOLUTION_MISSING_OR_MALFORMED'],requestedLocale});
    }
    if(!POSITIVE_RESOLUTION_STATUSES.has(text(r.status))){
      return baseFailure({reasons:['RESOLUTION_NOT_AUTHORITATIVE'],resolution:r,catalogRow,requestedLocale});
    }
    if(!text(r.canonicalSlug)){
      return baseFailure({reasons:['RESOLUTION_CANONICAL_SLUG_MISSING'],resolution:r,catalogRow,requestedLocale});
    }
    if(r.needsReview===true){
      return baseFailure({reasons:['RESOLUTION_NEEDS_REVIEW'],resolution:r,catalogRow,requestedLocale});
    }
    if(r.conflictActive===true || r.conflict){
      return baseFailure({reasons:['RESOLUTION_CONFLICT_ACTIVE'],resolution:{...r,conflictActive:true},catalogRow,requestedLocale});
    }
    if(!catalogRow || typeof catalogRow!=='object' || Array.isArray(catalogRow)){
      return baseFailure({validation:'missing',reasons:['CATALOG_ROW_MISSING'],resolution:r,requestedLocale});
    }

    const catalogSlug=text(catalogRow.slug);
    if(!catalogSlug || norm(catalogSlug)!==norm(r.canonicalSlug)){
      return baseFailure({reasons:['CATALOG_SLUG_MISMATCH'],resolution:r,catalogRow,requestedLocale});
    }

    const authority=evaluateCatalogIdentityAuthority(catalogRow,{
      canonicalSlug:r.canonicalSlug,
      scientific:catalogRow.scientific_name
    });

    if(authority?.ready!==true || authority?.valid!==true){
      return baseFailure({
        reasons:['CATALOG_IDENTITY_AUTHORITY_FAILED',authority?.reason || 'CATALOG_IDENTITY_AUTHORITY_FAILED'],
        resolution:r,
        catalogRow,
        provenanceSourceId:authority?.sourceId||null,
        requestedLocale
      });
    }

    const scientificName=text(catalogRow.scientific_name);
    if(!scientificName){
      return baseFailure({
        reasons:['CANONICAL_SCIENTIFIC_NAME_MISSING'],
        resolution:r,
        catalogRow,
        provenanceSourceId:authority.sourceId,
        requestedLocale
      });
    }

    const display=selectCanonicalCommonName(catalogRow.common_names,requestedLocale);
    if(!display.ok){
      return baseFailure({
        reasons:[display.reason],
        resolution:r,
        catalogRow,
        provenanceSourceId:authority.sourceId,
        requestedLocale
      });
    }

    const line=lineage(catalogRow);
    return deepFreeze({
      authority:'catalog_plants',
      validation:'passed',
      canonicalSlug:catalogSlug,
      scientificName,
      commonName:display.commonName,
      needsReview:false,
      conflictActive:false,
      catalogVersion:line.catalogVersion,
      sourcePacket:line.sourcePacket,
      provenanceSourceId:authority.sourceId||null,
      requestedLocale,
      resolvedDisplayLocale:display.resolvedDisplayLocale,
      localeFallback:display.localeFallback,
      reasons:[]
    });
  }catch(_error){
    const requestedLocale=normalizeLocale(input && typeof input==='object' && !Array.isArray(input) ? input.locale : null);
    return baseFailure({
      validation:'failed',
      reasons:['ADAPTER_FAIL_CLOSED'],
      requestedLocale
    });
  }
}
