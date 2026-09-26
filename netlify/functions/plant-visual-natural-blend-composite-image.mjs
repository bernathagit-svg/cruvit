import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function safeId(v){const s=String(v||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readBytes(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}
async function readJson(c,bucket,key){const b=await readBytes(c,bucket,key);if(!b)return null;try{return JSON.parse(b.toString('utf8'));}catch{return null;}}
async function loadPlan(req,runId){const res=await fetch(new URL('/data/garden-design/plant-visual-natural-blend-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;return res.json();}

export default async(req)=>{
  if(req.method!=='GET')return new Response('METHOD_NOT_ALLOWED',{status:405});
  const url=new URL(req.url);
  const runId=safeId(url.searchParams.get('runId'));
  if(!runId)return new Response('RUN_ID_REQUIRED',{status:400});
  const plan=await loadPlan(req,runId);
  if(!plan||plan.runId!==runId)return new Response('NATURAL_BLEND_PLAN_NOT_FOUND',{status:404});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  if(required.some(k=>!env(k)))return new Response('ENV_MISSING',{status:500});

  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const prefix=`candidates/${safeSegment(plan.sourceManifestId)}/natural-blend/${safeSegment(plan.runId)}`;
  const evidence=await readJson(c,bucket,prefix+'/composite-evidence.json');
  const key=evidence?.finalCompositeObjectKey;
  if(!key)return new Response('FINAL_COMPOSITE_NOT_FOUND',{status:404});
  const bytes=await readBytes(c,bucket,key);
  if(!bytes)return new Response('FINAL_COMPOSITE_NOT_FOUND',{status:404});

  return new Response(bytes,{status:200,headers:{
    'content-type':'image/jpeg',
    'cache-control':'private, no-store',
    'x-robots-tag':'noindex, nofollow'
  }});
};
export const config={path:'/.netlify/functions/plant-visual-natural-blend-composite-image'};
