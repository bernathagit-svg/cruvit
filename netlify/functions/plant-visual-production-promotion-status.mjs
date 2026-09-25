import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeManifestId(value){const id=String(value||'').trim().toLowerCase();return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id)?id:'';}
function safe(value){return String(value==null?'':value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function loadManifest(req,id){const res=await fetch(new URL('/data/garden-design/plant-visual-qa-manifests/'+id+'.json',req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;return res.json();}
function productionKey(row){const assetId=row.assetId||(row.jobId+'__'+String(row.sha256||'').slice(0,12));return ['production',safe(row.canonicalSlug),[safe(row.growthStage),safe(row.architectureMode||row.visualForm||'default'),safe(row.phenology)].join('__'),safe(assetId)+'__'+safe(row.sha256)+'.png'].join('/');}
async function readBytes(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}

export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const id=safeManifestId(new URL(req.url).searchParams.get('manifest'));
  if(!id)return json(400,{ok:false,code:'MANIFEST_REQUIRED'});
  const manifest=await loadManifest(req,id);
  if(!manifest||manifest.contract!=='plant-visual-qa-manifest-v1'||manifest.manifestId!==id)return json(404,{ok:false,code:'QA_MANIFEST_NOT_FOUND'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_PRODUCTION_BUCKET'];
  const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_PRODUCTION_BUCKET');
  const rows=[];
  for(const row of manifest.rows||[]){
    const key=productionKey(row);
    const b=await readBytes(c,bucket,key);
    if(!b){rows.push({jobId:row.jobId,status:'MISSING',productionKey:key});continue;}
    const actualSha=sha256(b);
    const ok=b.length===Number(row.bytes)&&actualSha===String(row.sha256).toLowerCase();
    rows.push({jobId:row.jobId,status:ok?'VERIFIED':'INTEGRITY_MISMATCH',productionKey:key,bytes:b.length,sha256:actualSha});
  }
  return json(200,{ok:true,manifestId:id,totalJobs:rows.length,verified:rows.filter(x=>x.status==='VERIFIED').length,missing:rows.filter(x=>x.status==='MISSING').length,mismatch:rows.filter(x=>x.status==='INTEGRITY_MISMATCH').length,rows});
};
export const config={path:'/.netlify/functions/plant-visual-production-promotion-status'};