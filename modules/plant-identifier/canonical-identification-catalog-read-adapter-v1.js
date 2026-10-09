/**
 * CRUVIT — Canonical Identification Catalog Read Adapter V1
 *
 * Pure read-boundary adapter over an explicitly injected Supabase-compatible client.
 * Performs one exact, bounded, read-only query against public.catalog_plants.
 * No client creation, auth mutation, storage, provider, telemetry, or writes.
 */
export const CANONICAL_IDENTIFICATION_CATALOG_READ_ADAPTER_VERSION='1.0.0';

export const CATALOG_IDENTITY_SELECT_FIELDS=Object.freeze([
  'slug',
  'scientific_name',
  'common_names',
  'provenance',
  'needs_review',
  'verification_state',
  'catalog_version',
  'source_packet'
]);

export const CATALOG_IDENTITY_SELECT=CATALOG_IDENTITY_SELECT_FIELDS.join(',');

function cleanSlug(value){
  return typeof value==='string' && value.trim() ? value.trim() : '';
}

function clonePlain(value,seen=new WeakMap()){
  if(value===null || typeof value==='string' || typeof value==='boolean') return value;
  if(typeof value==='number') return Number.isFinite(value) ? value : null;
  if(Array.isArray(value)){
    if(seen.has(value)) return null;
    const out=[];
    seen.set(value,out);
    for(const item of value) out.push(clonePlain(item,seen));
    return out;
  }
  if(value && typeof value==='object'){
    if(seen.has(value)) return null;
    const out={};
    seen.set(value,out);
    for(const key of Object.keys(value)) out[key]=clonePlain(value[key],seen);
    return out;
  }
  return null;
}

function deepFreeze(value,seen=new WeakSet()){
  if(!value || typeof value!=='object' || seen.has(value)) return value;
  seen.add(value);
  for(const key of Object.keys(value)) deepFreeze(value[key],seen);
  return Object.freeze(value);
}

function envelope({
  status,
  canonicalSlug,
  row=null,
  rowCount=0,
  reason=null
}){
  return deepFreeze({
    adapterVersion:CANONICAL_IDENTIFICATION_CATALOG_READ_ADAPTER_VERSION,
    status,
    canonicalSlug:canonicalSlug || null,
    row,
    rowCount:Number.isInteger(rowCount) && rowCount>=0 ? rowCount : 0,
    authority:'public.catalog_plants',
    readOnly:true,
    reason
  });
}

function invalidInput(){
  return envelope({
    status:'invalid_input',
    canonicalSlug:null,
    row:null,
    rowCount:0,
    reason:'CANONICAL_SLUG_INVALID'
  });
}

export function createCanonicalIdentificationCatalogReadAdapter({client}={}){
  if(!client || typeof client.from!=='function'){
    throw new TypeError('Explicit Supabase-compatible client dependency is required');
  }

  return Object.freeze({
    async readByCanonicalSlug(canonicalSlug){
      const slug=cleanSlug(canonicalSlug);
      if(!slug) return invalidInput();

      try{
        const response=await client
          .from('catalog_plants')
          .select(CATALOG_IDENTITY_SELECT)
          .eq('slug',slug)
          .limit(2);

        if(!response || typeof response!=='object' || Array.isArray(response)){
          return envelope({status:'error',canonicalSlug:slug,reason:'MALFORMED_READ_RESPONSE'});
        }
        if(response.error){
          return envelope({status:'error',canonicalSlug:slug,reason:'CATALOG_READ_ERROR'});
        }
        if(response.status!=null && response.status!==200){
          return envelope({status:'error',canonicalSlug:slug,reason:'UNEXPECTED_READ_STATUS'});
        }
        if(!Array.isArray(response.data)){
          return envelope({status:'error',canonicalSlug:slug,reason:'MALFORMED_READ_RESPONSE'});
        }

        const rows=response.data;
        if(rows.length>2){
          return envelope({
            status:'error',
            canonicalSlug:slug,
            row:null,
            rowCount:rows.length,
            reason:'BOUNDED_READ_INCONSISTENT'
          });
        }
        if(rows.length===0){
          return envelope({
            status:'missing',
            canonicalSlug:slug,
            row:null,
            rowCount:0,
            reason:'CATALOG_ROW_MISSING'
          });
        }
        if(rows.length>1){
          return envelope({
            status:'duplicate',
            canonicalSlug:slug,
            row:null,
            rowCount:rows.length,
            reason:'DUPLICATE_CANONICAL_ROWS'
          });
        }

        const raw=rows[0];
        if(!raw || typeof raw!=='object' || Array.isArray(raw)){
          return envelope({
            status:'error',
            canonicalSlug:slug,
            row:null,
            rowCount:1,
            reason:'MALFORMED_CATALOG_ROW'
          });
        }
        if(cleanSlug(raw.slug)!==slug){
          return envelope({
            status:'error',
            canonicalSlug:slug,
            row:null,
            rowCount:1,
            reason:'CATALOG_SLUG_READBACK_MISMATCH'
          });
        }

        const row=deepFreeze(clonePlain(raw));
        return envelope({
          status:'found',
          canonicalSlug:slug,
          row,
          rowCount:1,
          reason:null
        });
      }catch(_error){
        return envelope({
          status:'error',
          canonicalSlug:slug,
          row:null,
          rowCount:0,
          reason:'CATALOG_READ_EXCEPTION'
        });
      }
    }
  });
}
