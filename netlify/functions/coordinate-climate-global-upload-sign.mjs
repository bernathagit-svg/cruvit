import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import authority from '../../data/coordinate-climate/v2/coverage/global-v1/upload-authority-map.json' with { type:'json' };
import manifest from '../../data/coordinate-climate/v2/coverage/global-v1/manifest.json' with { type:'json' };
import { headClimateObject } from '../../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';

const BAKE=String(manifest.globalBakeId||'');
const TILE_PREFIX='climate/global-v1/'+BAKE+'/tiles/';
function env(name){return Netlify.env.get(name)||''}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','x-robots-tag':'noindex,nofollow'}})}
function tileName(s){return /^chelsa30s-t64_\d+_\d+\.cctb\.gz$/.test(String(s||''))}
function hash(s){return /^[a-f0-9]{64}$/i.test(String(s||''))}
function client(){return new S3Client({region:'auto',endpoint:'https://'+env('R2_ACCOUNT_ID')+'.r2.cloudflarestorage.com',credentials:{accessKeyId:env('R2_ACCESS_KEY_ID'),secretAccessKey:env('R2_SECRET_ACCESS_KEY')}})}

export default async(req)=>{
  if(req.method!=='POST') return json(405,{ok:false,code:'POST_REQUIRED'});
  if(!env('R2_ACCOUNT_ID')||!env('R2_ACCESS_KEY_ID')||!env('R2_SECRET_ACCESS_KEY')||!env('R2_BUCKET')) return json(500,{ok:false,code:'R2_ENV_MISSING'});
  const names=Object.keys(authority||{});
  if(names.length!==Number(manifest.tileCount)) return json(500,{ok:false,code:'AUTHORITY_COUNT_MISMATCH',authorityCount:names.length,manifestTileCount:Number(manifest.tileCount)});
  let body={}; try{body=await req.json()}catch{return json(400,{ok:false,code:'JSON_REQUIRED'})}
  const files=Array.isArray(body.files)?body.files:[];
  if(!files.length||files.length>100) return json(400,{ok:false,code:'FILES_1_TO_100_REQUIRED'});
  const s3=client(); const results=[];
  for(const f of files){
    const name=String(f?.name||'').trim();
    const claimedHash=String(f?.sha256||'').toLowerCase();
    const bytes=Number(f?.bytes);
    const expected=String(authority?.[name]||'').toLowerCase();
    if(!tileName(name)||!hash(expected)) return json(403,{ok:false,code:'FILE_NOT_IN_AUTHORITY',name});
    if(claimedHash!==expected) return json(409,{ok:false,code:'HASH_NOT_AUTHORIZED',name});
    if(!(bytes>0)) return json(409,{ok:false,code:'BYTE_COUNT_REQUIRED',name});
    const key=TILE_PREFIX+name;
    const head=await headClimateObject(key);
    if(head.ok&&String(head.sha256||'').toLowerCase()===expected&&Number(head.contentLength)===bytes){
      results.push({name,key,action:'SKIP_IDENTICAL',bytes});
      continue;
    }
    const checksum=Buffer.from(expected,'hex').toString('base64');
    const cmd=new PutObjectCommand({
      Bucket:env('R2_BUCKET'),
      Key:key,
      ContentType:'application/gzip',
      ContentLength:bytes,
      ChecksumSHA256:checksum,
      CacheControl:'public, max-age=31536000, immutable',
      Metadata:{sha256:expected,'cruvit-global-bake-id':BAKE}
    });
    const url=await getSignedUrl(s3,cmd,{expiresIn:900});
    results.push({name,key,action:'PUT',bytes,url,headers:{
      'content-type':'application/gzip',
      'cache-control':'public, max-age=31536000, immutable',
      'x-amz-checksum-sha256':checksum,
      'x-amz-meta-sha256':expected,
      'x-amz-meta-cruvit-global-bake-id':BAKE
    }});
  }
  return json(200,{ok:true,contract:'cruvit-global-climate-upload-sign-v1',globalBakeId:BAKE,authorityCount:names.length,results});
};
export const config={path:'/.netlify/functions/coordinate-climate-global-upload-sign',timeout:20};
