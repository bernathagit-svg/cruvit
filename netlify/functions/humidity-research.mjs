import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';
import { extractHumidityEvidence, deriveHumidityTrait } from '../../modules/catalog/humidity-evidence-gate-v1.js';
import { normalizeCatalogSourceType } from '../../modules/personal-domain/catalog-source-policy-v1.js';

function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeSlug(v){const s=String(v||'').trim().toLowerCase();return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';}
export function generatedNcsuSpeciesSource(scientific,slug){
  const raw=String(scientific||'').trim();
  const parts=raw.split(/\s+/).filter(Boolean);
  if(parts.length!==2 || /×|\bvar\.?\b|\bsubsp\.?\b|\bcv\.?\b/i.test(raw)) return null;
  if(!parts.every(x=>/^[A-Za-z][A-Za-z-]*$/.test(x))) return null;
  const path=parts.map(x=>x.toLowerCase()).join('-');
  return {
    sourceId:'ncsu-auto-'+String(slug||'').trim().toLowerCase(),
    url:'https://plants.ces.ncsu.edu/plants/'+path+'/',
    title:raw+' (NC State Extension candidate)',
    institution:'North Carolina State University Extension Gardener',
    sourceType:'university_extension',
    authorityTier:'university_extension',
    generatedDiscovery:true
  };
}
function dedupeSources(row){
  const ct=row?.climate_traits||{},pk=ct?.plantKnowledge||{};
  const generated=generatedNcsuSpeciesSource(row?.scientific_name,row?.slug);
  const list=[...(Array.isArray(pk.sources)?pk.sources:[]),...(Array.isArray(row?.provenance)?row.provenance:[]),...(generated?[generated]:[])];
  const seen=new Set(),out=[];
  for(const s of list){
    const url=String(s?.url||'').trim(); if(!url||seen.has(url)) continue; seen.add(url);
    out.push({sourceId:String(s?.sourceId||'').trim()||null,url,title:s?.title||null,institution:s?.institution||s?.publisher||null,sourceType:normalizeCatalogSourceType(s?.sourceType||s?.authorityTier)||null,authorityTier:s?.authorityTier||null});
  }
  return out.slice(0,4);
}
async function fetchBounded(url){
  const res=await fetch(url,{headers:{'user-agent':'CRUVIT-HumidityResearch/1.0 (+https://github.com/bernathagit-svg/cruvit)',accept:'text/html,text/plain,application/xhtml+xml'},redirect:'follow'});
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
    const evidence=extractHumidityEvidence(fetched.body);
    const trait=deriveHumidityTrait(evidence);
    records.push({...source,ok:evidence.ok===true,httpStatus:fetched.status,truncated:fetched.truncated,evidence,trait});
  }
  const ranked=records.filter(x=>x?.trait?.value).sort((a,b)=>{
    const rank=x=>x?.trait?.evidenceClass==='SOURCE_SUPPORTED'?2:x?.trait?.evidenceClass==='HEURISTIC_ASSERTION'?1:0;
    return rank(b)-rank(a);
  });
  const selected=ranked[0]||null;
  return json(200,{
    ok:true,version:'humidity-research-v1',canonicalSlug:slug,scientific,
    externalRequests,maxExternalRequests:4,paidCalls:0,catalogWrites:0,
    result:selected?selected.trait:{value:null,evidenceClass:'UNKNOWN',transformRef:null,rationale:'No source-supported humidity evidence found.'},
    selectedEvidence:selected?{sourceId:selected.sourceId,url:selected.url,title:selected.title,institution:selected.institution,kind:selected.evidence.kind,excerpt:selected.evidence.excerpt}:null,
    records
  });
};
export const config={path:'/.netlify/functions/humidity-research'};