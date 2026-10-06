import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

function env(name){try{return globalThis.Netlify?.env?.get?.(name)||process.env[name]||'';}catch{return process.env[name]||'';}}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
async function probe(accountId,accessKeyId,secretAccessKey,bucket){
  if(!accountId||!accessKeyId||!secretAccessKey||!bucket)return {configured:false,ok:false,code:'CONFIG_MISSING'};
  const c=new S3Client({region:'auto',endpoint:`https://${accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey}});
  try{
    await c.send(new HeadBucketCommand({Bucket:bucket}));
    return {configured:true,ok:true,code:'HEAD_BUCKET_OK'};
  }catch(err){
    return {configured:true,ok:false,code:'HEAD_BUCKET_FAILED',errorName:String(err?.name||''),httpStatus:err?.$metadata?.httpStatusCode||null};
  }
}
export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const bucket=env('PLANT_VISUAL_R2_PRODUCTION_BUCKET');
  const [plantVisual,generic]=await Promise.all([
    probe(env('PLANT_VISUAL_R2_ACCOUNT_ID'),env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY'),bucket),
    probe(env('R2_ACCOUNT_ID'),env('R2_ACCESS_KEY_ID'),env('R2_SECRET_ACCESS_KEY'),bucket)
  ]);
  return json(200,{ok:true,bucketConfigured:Boolean(bucket),plantVisual,generic,valuesExposed:false,writeAttempted:false});
};
export const config={path:'/.netlify/functions/plant-visual-r2-production-access-diagnostic'};