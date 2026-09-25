import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';
import { extractStructuredMorphologyAndSize } from '../../modules/catalog/morphology-size-evidence-gate-v1.js';
import { evaluateSourceSupportedEligibility, normalizeCatalogSourceType } from '../../modules/personal-domain/catalog-source-policy-v1.js';

function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeSlug(v){const s=String(v||'').trim().toLowerCase();return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';}
function dedupeSources(row){
  const ct=row?.climate_traits||{},pk=ct?.plantKnowledge||{};
  const list=[...(Array.isArray(pk.sources)?pk.sources:[]),...(Array.isArray(row?.provenance)?row.provenance:[])];
  const seen=new Set(),out=[];
  for(const s of list){
    const url=String(s?.url||'').trim(); if(!url||seen.has(url)) continue; seen.add(url);
    out.push({sourceId:String(s?.sourceId||'').trim()||null,url,title:s?.title||null,institution:s?.institution||s?.publisher||null,sourceType:normalizeCatalogSourceType(s?.sourceType||s?.authorityTier)||null,authorityTier:s?.authorityTier||null});
  }
  return out.slice(0,3);
}
async function fetchBounded(url){
  const res=await fetch(url,{headers:{'user-agent':'CRUVIT-MorphologySizeResearch/1.0 (+https://github.com/bernathagit-svg/cruvit)',accept:'text/html,text/plain,application/xhtml+xml'},redirect:'follow'});
  const contentType=res.headers.get('content-type')||'';
  const buf=Buffer.from(await res.arrayBuffer()),max=1_500_000;
  return {ok:res.ok&&/html|text|xml/i.test(contentType||'text/html'),status:res.status,body:buf.slice(0,max).toString('utf8'),truncated:buf.length>max};
}
function identityMatches(body,scientific){
  const raw=String(body||'').replace(/<[^>]+>/g,' ').replace(/&times;|&#215;/gi,'×').replace(/\s+/g,' ').toLowerCase();
  const sci=String(scientific||'').toLowerCase().replace(/×/g,'x').replace(/\s+/g,' ').trim();
  const parts=sci.split(' ').filter(Boolean).filter(x=>x!=='x');
  return parts.length>=2 && (raw.includes(parts[0]+' '+parts[1]) || raw.includes(parts[0]+' × '+parts[1]) || raw.includes(parts[0]+' x '+parts[1]));
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const slug=safeSlug(new URL(req.url).searchParams.get('slug'));
  if(!slug) return json(400,{ok:false,code:'SLUG_REQUIRED'});
  let row=null; try{row=await fetchCanonicalCatalogRow(slug);}catch(err){return json(503,{ok:false,code:'CANONICAL_CATALOG_READ_FAILED',errorName:err?.message||null});}
  if(!row) return json(404,{ok:false,code:'CANONICAL_CATALOG_RECORD_MISSING'});
  const scientific=String(row.scientific_name||'').trim(),sources=dedupeSources(row),records=[]; let externalRequests=0;
  for(const source of sources){
    let fetched; try{fetched=await fetchBounded(source.url);externalRequests+=1;}catch(err){records.push({...source,ok:false,code:'SOURCE_FETCH_FAILED'});continue;}
    if(!fetched.ok){records.push({...source,ok:false,code:'SOURCE_FETCH_UNUSABLE',httpStatus:fetched.status});continue;}
    if(!identityMatches(fetched.body,scientific)){records.push({...source,ok:false,code:'IDENTITY_MISMATCH'});continue;}
    const evidence=extractStructuredMorphologyAndSize(fetched.body);
    const morphPolicy=evidence.morphologyReady ? evaluateSourceSupportedEligibility({
      field:'growthHabit',value:evidence.visualForm,sourceId:source.sourceId,sourceType:source.sourceType||source.authorityTier,authorityTier:source.authorityTier,
      excerpt:[evidence.plantType,evidence.habitForm].filter(Boolean).join(' | '),url:source.url,sourceTitle:source.title,sourceInstitution:source.institution,
      declaredScientificName:scientific,expectedIdentity:{acceptedScientificName:scientific,scientific,canonicalSlug:slug,slug},provenanceRetained:true
    }) : {mayBeSourceSupported:false,evidenceClass:'UNKNOWN',reasons:['morphology_not_resolved']};
    records.push({...source,ok:true,httpStatus:fetched.status,truncated:fetched.truncated,evidence,morphologySourceSupported:morphPolicy.mayBeSourceSupported===true,morphologyPolicyReasons:morphPolicy.reasons||[]});
  }
  const usable=records.find(x=>x.ok&&x.morphologySourceSupported&&x.evidence?.morphologyReady)
    || records.find(x=>x.ok&&x.evidence?.matureSize?.ready)
    || null;
  return json(200,{ok:true,version:'morphology-size-research-v1',canonicalSlug:slug,scientific,externalRequests,maxExternalRequests:3,paidCalls:0,catalogWrites:0,result:usable?usable.evidence:null,selectedSource:usable?{sourceId:usable.sourceId,url:usable.url,title:usable.title,institution:usable.institution}:null,records});
};
export const config={path:'/.netlify/functions/morphology-size-research'};