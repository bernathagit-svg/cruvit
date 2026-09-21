import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const TARGETS = Object.freeze([
  'cruvit-plant-visual-candidates',
  'cruvit-plant-visual-production'
]);

function env(name) {
  return typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function'
    ? Netlify.env.get(name)
    : process.env[name];
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}
function endpoint(accountId) {
  return 'https://' + accountId + '.r2.cloudflarestorage.com';
}
export default async (req) => {
  const url = new URL(req.url);
  const nonce = String(env('CRUVIT_R2_BOOTSTRAP_NONCE') || '');
  if (!nonce || String(url.searchParams.get('nonce') || '') !== nonce) {
    return json(403,{ok:false,code:'NONCE_DENIED'});
  }
  const accountId = String(env('R2_ACCOUNT_ID') || '');
  const accessKeyId = String(env('R2_ACCESS_KEY_ID') || '');
  const secretAccessKey = String(env('R2_SECRET_ACCESS_KEY') || '');
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return json(500,{ok:false,code:'EXISTING_R2_CREDENTIALS_MISSING'});
  }
  const client = new S3Client({
    region:'auto',
    endpoint:endpoint(accountId),
    credentials:{accessKeyId,secretAccessKey}
  });
  const results=[];
  for (const bucket of TARGETS) {
    let exists=false;
    try {
      await client.send(new HeadBucketCommand({Bucket:bucket}));
      exists=true;
      results.push({bucket,status:'EXISTS'});
      continue;
    } catch (headErr) {
      const hs = headErr?.$metadata?.httpStatusCode || null;
      if (hs && hs !== 404 && hs !== 403) {
        results.push({bucket,status:'HEAD_FAILED',httpStatus:hs,errorName:headErr?.name||null});
        continue;
      }
    }
    try {
      await client.send(new CreateBucketCommand({Bucket:bucket}));
      results.push({bucket,status:'CREATED'});
    } catch (err) {
      results.push({
        bucket,
        status:'CREATE_FAILED',
        httpStatus:err?.$metadata?.httpStatusCode || null,
        errorName:err?.name || null,
        code:err?.Code || err?.code || null
      });
    }
  }
  return json(200,{ok:true,results,secretsExposed:false});
};
