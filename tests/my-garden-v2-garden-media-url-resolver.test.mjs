import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGardenMediaUrlResolver,
  GARDEN_MEDIA_PRIVATE_BUCKET,
} from '../modules/my-garden-v2/garden-media-url-resolver.js';

function fakeSupabase({data={signedUrl:'https://signed.example/x'},error=null}={}) {
  const calls=[];
  return {
    calls,
    storage:{
      from(bucket){
        calls.push(['from',bucket]);
        return {
          async createSignedUrl(path,ttl){
            calls.push(['createSignedUrl',path,ttl]);
            return {data,error};
          }
        };
      }
    }
  };
}

test('personal garden media resolves through short-lived signed URL only',async()=>{
  const sb=fakeSupabase();
  const resolver=createGardenMediaUrlResolver(sb,{expiresIn:300});

  const result=await resolver.resolveCover({
    kind:'personal',
    storageBucket:'user-garden-media',
    storagePath:'u1/g1/m1/lemon.jpg',
  });

  assert.equal(result.signedUrl,'https://signed.example/x');
  assert.equal(result.expiresIn,300);
  assert.deepEqual(sb.calls,[
    ['from','user-garden-media'],
    ['createSignedUrl','u1/g1/m1/lemon.jpg',300],
  ]);
});

test('system cover does not touch private storage',async()=>{
  const sb=fakeSupabase();
  const resolver=createGardenMediaUrlResolver(sb);
  assert.equal(await resolver.resolveCover({kind:'system'}),null);
  assert.deepEqual(sb.calls,[]);
});

test('unexpected bucket is rejected rather than exposed',async()=>{
  const resolver=createGardenMediaUrlResolver(fakeSupabase());
  await assert.rejects(
    ()=>resolver.resolveStorageRef({
      storageBucket:'public-assets',
      storagePath:'x.jpg',
    }),
    /garden_media_bucket_not_allowed/
  );
});

test('raw data URL and traversal paths are rejected',async()=>{
  const resolver=createGardenMediaUrlResolver(fakeSupabase());
  await assert.rejects(
    ()=>resolver.resolveStorageRef({
      storageBucket:GARDEN_MEDIA_PRIVATE_BUCKET,
      storagePath:'data:image/png;base64,abc',
    }),
    /data_url_forbidden/
  );
  await assert.rejects(
    ()=>resolver.resolveStorageRef({
      storageBucket:GARDEN_MEDIA_PRIVATE_BUCKET,
      storagePath:'u/g/../secret.jpg',
    }),
    /path_traversal_forbidden/
  );
});

test('storage errors fail closed',async()=>{
  const resolver=createGardenMediaUrlResolver(fakeSupabase({
    data:null,
    error:{code:'403',message:'not allowed'},
  }));
  await assert.rejects(
    ()=>resolver.resolveStorageRef({
      storageBucket:GARDEN_MEDIA_PRIVATE_BUCKET,
      storagePath:'u/g/m/photo.jpg',
    }),
    /garden_media_signed_url_failed:403/
  );
});

test('ttl is bounded',()=>{
  assert.throws(()=>createGardenMediaUrlResolver(fakeSupabase(),{expiresIn:10}),/invalid_signed_url_ttl/);
  assert.throws(()=>createGardenMediaUrlResolver(fakeSupabase(),{expiresIn:7200}),/invalid_signed_url_ttl/);
});
