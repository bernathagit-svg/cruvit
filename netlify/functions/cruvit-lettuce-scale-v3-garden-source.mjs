function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
export default async(req)=>{
  if(req.method!=='GET') return new Response('METHOD_NOT_ALLOWED',{status:405});
  const cap=env('CRUVIT_QA_LETTUCE_SCALE_V3_CAP');
  if(!cap) return new Response('CAP_MISSING',{status:500});
  const runId='cruvit-e2e-batch-b-lettuce-scale-v3-2026-09-26-v1';
  const url='https://saiuscqbszafszpdmzfl.supabase.co/functions/v1/cruvit-qa-garden-source-v1?runId='+encodeURIComponent(runId);
  const upstream=await fetch(url,{headers:{authorization:'Bearer '+cap},cache:'no-store'});
  if(!upstream.ok) return new Response(await upstream.text(),{status:upstream.status,headers:{'cache-control':'private, no-store'}});
  const bytes=await upstream.arrayBuffer();
  return new Response(bytes,{status:200,headers:{
    'content-type':upstream.headers.get('content-type')||'image/jpeg',
    'cache-control':'private, no-store',
    'x-robots-tag':'noindex, nofollow'
  }});
};
export const config={path:'/.netlify/functions/cruvit-lettuce-scale-v3-garden-source'};
