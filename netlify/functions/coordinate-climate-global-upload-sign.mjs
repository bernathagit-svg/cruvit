import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import authority from '../../data/coordinate-climate/v2/coverage/global-v1/upload-authority-map.json' with { type:'json' };
import manifest from '../../data/coordinate-climate/v2/coverage/global-v1/manifest.json' with { type:'json' };
import crypto from 'node:crypto';
import { headClimateObject, fetchClimateObjectBytes } from '../../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const BAKE=String(manifest.globalBakeId||'');
const TILE_PREFIX='climate/global-v1/'+BAKE+'/tiles/';
function env(name){return Netlify.env.get(name)||''}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','x-robots-tag':'noindex,nofollow'}})}
function tileName(s){return /^chelsa30s-t64_\d+_\d+\.cctb\.gz$/.test(String(s||''))}
function hash(s){return /^[a-f0-9]{64}$/i.test(String(s||''))}
function client(){return new S3Client({region:'auto',endpoint:'https://'+env('R2_ACCOUNT_ID')+'.r2.cloudflarestorage.com',credentials:{accessKeyId:env('R2_ACCESS_KEY_ID'),secretAccessKey:env('R2_SECRET_ACCESS_KEY')}})}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i)}
  });
  await Promise.all(workers);return out;
}

export default async(req)=>{
  if(req.method!=='POST') return json(405,{ok:false,code:'POST_REQUIRED'});
  if(!env('R2_ACCOUNT_ID')||!env('R2_ACCESS_KEY_ID')||!env('R2_SECRET_ACCESS_KEY')||!env('R2_BUCKET')) return json(500,{ok:false,code:'R2_ENV_MISSING'});
  const names=Object.keys(authority||{});
  if(names.length!==Number(manifest.tileCount)) return json(500,{ok:false,code:'AUTHORITY_COUNT_MISMATCH',authorityCount:names.length,manifestTileCount:Number(manifest.tileCount)});
  let body={}; try{body=await req.json()}catch{return json(400,{ok:false,code:'JSON_REQUIRED'})}
  const files=Array.isArray(body.files)?body.files:[];
  const assumeMissing=body.assumeMissing===true;
  if(!files.length||files.length>100) return json(400,{ok:false,code:'FILES_1_TO_100_REQUIRED'});
  const s3=client();
  let results;
  try{
    results=await mapLimit(files,80,async(f)=>{
    const name=String(f?.name||'').trim();
    const claimedHash=String(f?.sha256||'').toLowerCase();
    const bytes=Number(f?.bytes);
    const record=authority?.[name];
    const expected=String(typeof record==='string'?record:record?.sha256||'').toLowerCase();
    const expectedMd5=String(record?.md5||'').toLowerCase();
    const expectedBytes=Number(record?.bytes);
    const claimedMd5=String(f?.md5||'').toLowerCase();
    if(!tileName(name)||!hash(expected)||!(/^[a-f0-9]{32}$/i.test(expectedMd5))){
      const e=new Error('FILE_NOT_IN_AUTHORITY');e.http=403;e.payload={name};throw e;
    }
    if(claimedHash!==expected){const e=new Error('HASH_NOT_AUTHORIZED');e.http=409;e.payload={name};throw e;}
    if(claimedMd5!==expectedMd5){const e=new Error('MD5_NOT_AUTHORIZED');e.http=409;e.payload={name};throw e;}
    if(!(bytes>0)||bytes!==expectedBytes){const e=new Error('BYTE_COUNT_MISMATCH');e.http=409;e.payload={name,expectedBytes};throw e;}
    const key=TILE_PREFIX+name;
    const head=assumeMissing?{ok:false,code:'ASSUME_MISSING_FASTPATH'}:await headClimateObject(key);
    if(head.ok){
      if(Number(head.contentLength)!==bytes){const e=new Error('REMOTE_OBJECT_SIZE_CONFLICT');e.http=409;e.payload={name,expectedBytes:bytes,remoteBytes:Number(head.contentLength)};throw e;}
      let remoteMatches=false;
      const metadataHash=String(head?.sha256||'').toLowerCase();
      let nativeChecksumHex='';
      try{nativeChecksumHex=head?.checksumSHA256?Buffer.from(String(head.checksumSHA256),'base64').toString('hex'):'';}catch{}
      if(metadataHash===expected||nativeChecksumHex===expected){
        remoteMatches=true;
      }else{
        const remote=await fetchClimateObjectBytes(key,{env:process.env,forceR2:true,timeoutMs:12000});
        if(!remote.ok){const e=new Error('REMOTE_VERIFY_FETCH_FAILED');e.http=502;e.payload={name,remoteCode:remote.code};throw e;}
        const remoteHash=crypto.createHash('sha256').update(remote.bytes).digest('hex');
        remoteMatches=remoteHash===expected;
      }
      if(remoteMatches) return {name,key,action:'SKIP_IDENTICAL',bytes};
      const e=new Error('REMOTE_OBJECT_HASH_CONFLICT');e.http=409;e.payload={name};throw e;
    }
    const contentMd5=Buffer.from(expectedMd5,'hex').toString('base64');
    const cmd=new PutObjectCommand({
      Bucket:env('R2_BUCKET'),
      Key:key,
      ContentType:'application/gzip',
      ContentLength:bytes,
      ContentMD5:contentMd5,
      IfNoneMatch:'*',
      CacheControl:'public, max-age=31536000, immutable',
      Metadata:{sha256:expected,md5:expectedMd5,'cruvit-global-bake-id':BAKE}
    });
    const url=await getSignedUrl(s3,cmd,{expiresIn:900});
    return {name,key,action:'PUT',bytes,url,headers:{
      'content-type':'application/gzip',
      'cache-control':'public, max-age=31536000, immutable',
      'content-md5':contentMd5,
      'if-none-match':'*'
    }};
    });
  }catch(err){
    return json(Number(err?.http)||500,{ok:false,code:String(err?.message||'SIGNER_FAILED'),...(err?.payload||{})});
  }
  return json(200,{ok:true,contract:'cruvit-global-climate-upload-sign-v1.2',globalBakeId:BAKE,authorityCount:names.length,assumeMissing,results});
};
export const config={path:'/.netlify/functions/coordinate-climate-global-upload-sign',timeout:20};
