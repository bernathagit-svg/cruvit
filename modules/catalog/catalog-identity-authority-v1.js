/**
 * Shared canonical catalog identity authority.
 *
 * Pure/local authority extraction from Full CRUVIT approval.
 * Canonical catalog source of truth remains public.catalog_plants.
 * No I/O, provider, registry, network, storage, telemetry, or writes.
 */
export const CATALOG_IDENTITY_AUTHORITY_VERSION='catalog-identity-authority-v1';

function text(v){ return String(v == null ? '' : v).trim(); }
function norm(v){ return text(v).toLowerCase().replace(/\s+/g,' '); }

function freezeEvidence(value){
  if(!value || typeof value!=='object' || Object.isFrozen(value)) return value;
  for(const key of Object.keys(value)) freezeEvidence(value[key]);
  return Object.freeze(value);
}

export function evaluateCatalogIdentityAuthority(catalogRow=null, expectedIdentity=null){
  const slug=norm(expectedIdentity?.canonicalSlug || catalogRow?.slug);
  const scientific=norm(expectedIdentity?.scientific || expectedIdentity?.acceptedScientificName || catalogRow?.scientific_name);
  const verificationState=norm(catalogRow?.verification_state);
  const needsReview=catalogRow?.needs_review===true;

  if(!slug || !scientific){
    return freezeEvidence({ready:false,valid:false,reason:'IDENTITY_FIELDS_MISSING',authority:null,sourceId:null,canonicalSlug:null,acceptedScientificName:null,verificationState:verificationState||null,needsReview,ambiguityState:null});
  }

  if(needsReview || verificationState!=='verified'){
    return freezeEvidence({ready:false,valid:false,reason:'CATALOG_IDENTITY_NOT_VERIFIED',authority:null,sourceId:null,canonicalSlug:null,acceptedScientificName:null,verificationState:verificationState||null,needsReview,ambiguityState:null});
  }

  if(/\bspp\.?\b/i.test(scientific) || /^various\b/i.test(scientific)){
    return freezeEvidence({ready:false,valid:false,reason:'SCIENTIFIC_IDENTITY_AMBIGUOUS',authority:null,sourceId:null,canonicalSlug:null,acceptedScientificName:null,verificationState,needsReview,ambiguityState:'AMBIGUOUS_SCIENTIFIC_IDENTITY'});
  }

  const provenance=Array.isArray(catalogRow?.provenance)?catalogRow.provenance:[];
  const source=provenance.find(row=>{
    const pi=row?.plantIdentity||{};
    const claims=Array.isArray(row?.assertedClaims)?row.assertedClaims:[];
    return Boolean(
      text(row?.sourceId)
      && norm(pi.canonicalSlug)===slug
      && norm(pi.acceptedScientificName)===scientific
      && claims.some(c=>norm(c?.field)==='scientific' && norm(c?.status)==='asserted')
    );
  })||null;

  return freezeEvidence({
    ready:Boolean(source),
    valid:Boolean(source),
    reason:source?null:'SOURCE_BACKED_IDENTITY_PROVENANCE_REQUIRED',
    authority:source?'VERIFIED_CATALOG_IDENTITY_PROVENANCE':null,
    sourceId:source?.sourceId||null,
    canonicalSlug:source?.plantIdentity?.canonicalSlug||null,
    acceptedScientificName:source?.plantIdentity?.acceptedScientificName||null,
    verificationState,
    needsReview,
    ambiguityState:null
  });
}