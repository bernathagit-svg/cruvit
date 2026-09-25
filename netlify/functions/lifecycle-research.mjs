import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';
import { extractExplicitLifecycle, combineLifecycleEvidence } from '../../modules/catalog/lifecycle-evidence-gate-v1.js';
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
  const res=await fetch(url,{headers:{'user-agent':'CRUVIT-LifecycleResearch/1.0 (+https://github.com/bernathagit-svg/cruvit)',accept:'text/html,text/plain,application/xhtml+xml'},redirect:'follow'});
  const contentType=res.headers.get('content-type')||'';
  const buf=Buffer.from(await res.arrayBuffer()),max=1_500_000;
  return {ok:res.ok&&/html|text|xml/i.test(contentType||'text/html'),status:res.status,body:buf.slice(0,max).toString('utf8'),truncated:buf.length>max};
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const slug=safeSlug(new URL(req.url).searchParams.get('slug'));
  if(!slug) return json(400,{ok:false,code:'SLUG_REQUIRED'});
  let row=null; try{row=await fetchCanonicalCatalogRow(slug);}catch(err){return json(503,{ok:false,code:'CANONICAL_CATALOG_READ_FAILED',errorName:err?.message||null});}
  if(!row) return json(404,{ok:false,code:'CANONICAL_CATALOG_RECORD_MISSING'});
  const scientific=String(row.scientific_name||'').trim();
  const sources=dedupeSources(row),records=[]; let externalRequests=0;
  for(const source of sources){
    let fetched; try{fetched=await fetchBounded(source.url);externalRequests+=1;}catch(err){records.push({sourceId:source.sourceId,url:source.url,ok:false,state:'UNKNOWN',sourcePolicyEligible:false,code:'SOURCE_FETCH_FAILED'});continue;}
    if(!fetched.ok){records.push({sourceId:source.sourceId,url:source.url,ok:false,state:'UNKNOWN',sourcePolicyEligible:false,code:'SOURCE_FETCH_UNUSABLE',httpStatus:fetched.status});continue;}
    const extracted=extractExplicitLifecycle(fetched.body,scientific);
    let policy={mayBeSourceSupported:false,evidenceClass:'UNKNOWN',reasons:['no_explicit_lifecycle']};
    if(extracted.ok){
      policy=evaluateSourceSupportedEligibility({
        field:'lifecycle',value:String(extracted.state||'').toLowerCase(),
        sourceId:source.sourceId,sourceType:source.sourceType||source.authorityTier,authorityTier:source.authorityTier,
        excerpt:extracted.excerpt,url:source.url,sourceTitle:source.title,sourceInstitution:source.institution,
        declaredScientificName:scientific,expectedIdentity:{acceptedScientificName:scientific,scientific,canonicalSlug:slug,slug},provenanceRetained:true
      });
    }
    records.push({...source,ok:extracted.ok===true,state:extracted.state,code:extracted.code,excerpt:extracted.excerpt,sourcePolicyEligible:policy.mayBeSourceSupported===true,evidenceClass:policy.evidenceClass||'UNKNOWN',policyReasons:policy.reasons||[],httpStatus:fetched.status,truncated:fetched.truncated});
  }
  const result=combineLifecycleEvidence(records);
  return json(200,{ok:true,version:'lifecycle-research-v1',canonicalSlug:slug,scientific,externalRequests,maxExternalRequests:3,catalogWrites:0,paidCalls:0,result,records});
};
export const config={path:'/.netlify/functions/lifecycle-research'};