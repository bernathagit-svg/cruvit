import crypto from 'node:crypto';

const FEATURE='natural_blend';
const MODEL='gpt-image-2.5-sunburst-2026-09-08';
const QUALITY='medium';
const OPENAI_EDIT_URL='https://api.openai.com/v1/images/edits';
const MEDIA_BUCKET='user-garden-media';
const MAX_IMAGE_BYTES=8*1024*1024;

function env(name){
  try{return globalThis.Netlify?.env?.get?.(name)||'';}catch{return '';}
}
function reply(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function bearer(req){
  const raw=String(req.headers.get('authorization')||'').trim();
  const m=raw.match(/^Bearer\s+(.+)$/i);
  return m?m[1].trim():'';
}
function safeId(v,max=159){
  const s=String(v||'').trim();
  return new RegExp('^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,'+(max-1)+'}$').test(s)?s:'';
}
function uuid(v){
  const s=String(v||'').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:'';
}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function decodeBase64(v,label){
  const s=String(v||'').trim();
  if(!s) throw new Error(label+'_BASE64_REQUIRED');
  let bytes;
  try{bytes=Buffer.from(s,'base64');}catch{throw new Error(label+'_BASE64_INVALID');}
  if(!bytes.length||bytes.length>MAX_IMAGE_BYTES) throw new Error(label+'_BYTES_INVALID');
  return bytes;
}
function pngSize(bytes,label){
  if(bytes.length<24||bytes[0]!==0x89||bytes[1]!==0x50||bytes[2]!==0x4e||bytes[3]!==0x47){
    throw new Error(label+'_PNG_REQUIRED');
  }
  const width=bytes.readUInt32BE(16);
  const height=bytes.readUInt32BE(20);
  if(width!==1024||height!==1024) throw new Error(label+'_MUST_BE_1024');
  return {width,height};
}
function costUsd(usage){
  if(!usage||typeof usage!=='object') return null;
  const i=usage.input_tokens_details||{};
  const o=usage.output_tokens_details||{};
  const imageInput=Number(i.image_tokens);
  const textInput=Number(i.text_tokens);
  const imageOutput=Number(o.image_tokens ?? usage.output_tokens);
  if(!Number.isFinite(imageInput)||!Number.isFinite(textInput)||!Number.isFinite(imageOutput)) return null;
  return +(imageInput*8/1_000_000 + textInput*5/1_000_000 + imageOutput*30/1_000_000).toFixed(6);
}
function supabaseBase(){
  const url=env('SUPABASE_URL').replace(/\/$/,'');
  const anon=env('SUPABASE_ANON_KEY');
  return {url,anon};
}
async function supabaseFetch(path,token,options={}){
  const {url,anon}=supabaseBase();
  if(!url||!anon) throw new Error('SUPABASE_SERVER_CONFIG_MISSING');
  const headers={
    apikey:anon,
    authorization:'Bearer '+token,
    ...(options.headers||{})
  };
  const res=await fetch(url+path,{...options,headers});
  let data=null;
  const text=await res.text();
  if(text){
    try{data=JSON.parse(text);}catch{data=text;}
  }
  return {res,data,text};
}
async function authenticatedUser(token){
  const x=await supabaseFetch('/auth/v1/user',token,{method:'GET'});
  if(!x.res.ok||!x.data?.id) return null;
  return x.data;
}
function eq(v){return encodeURIComponent(String(v));}
async function oneRest(path,token){
  const x=await supabaseFetch(path,token,{method:'GET',headers:{accept:'application/json'}});
  if(!x.res.ok) throw Object.assign(new Error('SUPABASE_READ_FAILED'),{detail:x.data,status:x.res.status});
  return Array.isArray(x.data)?(x.data[0]||null):null;
}
async function rpc(token,name,body){
  const x=await supabaseFetch('/rest/v1/rpc/'+encodeURIComponent(name),token,{
    method:'POST',
    headers:{'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(body)
  });
  if(!x.res.ok) throw Object.assign(new Error('SUPABASE_RPC_FAILED'),{detail:x.data,status:x.res.status});
  return x.data;
}
async function consume(token,idempotencyKey){
  return rpc(token,'consume_premium_action',{
    p_feature:FEATURE,
    p_idempotency_key:idempotencyKey
  });
}
async function refund(token,consumeKey,refundKey){
  try{
    return await rpc(token,'refund_premium_action',{
      p_feature:FEATURE,
      p_consume_idempotency_key:consumeKey,
      p_refund_idempotency_key:refundKey
    });
  }catch(err){
    return {ok:false,code:'REFUND_RPC_FAILED',error:String(err?.message||err)};
  }
}
async function entitlementStatus(token,userId){
  return oneRest(
    '/rest/v1/premium_action_entitlements?select=natural_blend_enabled,natural_blend_remaining,natural_blend_daily_limit,natural_blend_daily_used,natural_blend_daily_date&user_id=eq.'+eq(userId)+'&limit=1',
    token
  );
}
function sameNum(a,b,tolerance=0.0001){
  return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=tolerance;
}
function fingerprintMatches(payload,placement){
  const p=payload&&typeof payload==='object'?payload:{};
  return sameNum(p.x,placement.x)
    && sameNum(p.y,placement.y)
    && sameNum(p.scale,placement.scale)
    && sameNum(p.rotation,placement.rotation)
    && String(p.designAssetId||'')===String(placement.design_asset_id||'');
}
async function loadRegistry(req){
  const url=new URL('/modules/garden-design/assets/plants/design-asset-registry-v1.json',req.url);
  const res=await fetch(url,{headers:{'cache-control':'no-cache'}});
  if(!res.ok) throw new Error('DESIGN_ASSET_REGISTRY_UNAVAILABLE');
  return res.json();
}
function findVariant(registry,assetId){
  for(const set of registry?.sets||[]){
    for(const v of set?.variants||[]){
      if(String(v?.assetId||'')===String(assetId||'')) return {set,variant:v};
    }
  }
  return null;
}
async function fetchReferenceBytes(req,match){
  const v=match?.variant;
  if(!v||v.productionApproved!==true) throw new Error('PRODUCTION_ASSET_REQUIRED');
  let href=String(v.url||'').trim();
  if(!href&&v.file){
    href='/modules/garden-design/assets/plants/'+String(v.file).replace(/^\/+/, '');
  }
  if(!href) throw new Error('PRODUCTION_ASSET_URL_REQUIRED');
  const url=new URL(href,req.url);
  if(url.origin!==new URL(req.url).origin) throw new Error('CROSS_ORIGIN_ASSET_FORBIDDEN');
  const res=await fetch(url,{headers:{'cache-control':'no-cache'}});
  if(!res.ok) throw new Error('PRODUCTION_ASSET_FETCH_FAILED');
  const bytes=Buffer.from(await res.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_IMAGE_BYTES) throw new Error('PRODUCTION_ASSET_BYTES_INVALID');
  return bytes;
}
async function existingOutput(token,gardenProfileId,idempotencyKey){
  return oneRest(
    '/rest/v1/garden_media?select=id,garden_profile_id,storage_path,mime_type,byte_size,content_sha256,validation_state,metadata,client_instance_id'
    +'&garden_profile_id=eq.'+eq(gardenProfileId)
    +'&client_instance_id=eq.'+eq(idempotencyKey)
    +'&purpose=eq.design_output'
    +'&validation_state=eq.validated'
    +'&order=created_at.desc&limit=1',
    token
  );
}
async function insertMediaPending(token,row){
  const x=await supabaseFetch('/rest/v1/garden_media?select=id,storage_path,validation_state',token,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      accept:'application/json',
      prefer:'return=representation'
    },
    body:JSON.stringify(row)
  });
  if(!x.res.ok||!Array.isArray(x.data)||!x.data[0]){
    throw Object.assign(new Error('GARDEN_MEDIA_INSERT_FAILED'),{detail:x.data,status:x.res.status});
  }
  return x.data[0];
}
async function uploadMedia(token,storagePath,bytes){
  const {url,anon}=supabaseBase();
  const encoded=storagePath.split('/').map(encodeURIComponent).join('/');
  const res=await fetch(url+'/storage/v1/object/'+MEDIA_BUCKET+'/'+encoded,{
    method:'POST',
    headers:{
      apikey:anon,
      authorization:'Bearer '+token,
      'content-type':'image/png',
      'x-upsert':'false',
      'cache-control':'3600'
    },
    body:bytes
  });
  if(!res.ok){
    const text=await res.text();
    throw Object.assign(new Error('GARDEN_MEDIA_UPLOAD_FAILED'),{detail:text,status:res.status});
  }
}
async function validateMediaRow(token,mediaId){
  const x=await supabaseFetch('/rest/v1/garden_media?id=eq.'+eq(mediaId)+'&select=id,storage_path,validation_state',token,{
    method:'PATCH',
    headers:{
      'content-type':'application/json',
      accept:'application/json',
      prefer:'return=representation'
    },
    body:JSON.stringify({validation_state:'validated',updated_at:new Date().toISOString()})
  });
  if(!x.res.ok||!Array.isArray(x.data)||!x.data[0]){
    throw Object.assign(new Error('GARDEN_MEDIA_VALIDATE_FAILED'),{detail:x.data,status:x.res.status});
  }
  return x.data[0];
}
async function deleteMediaRow(token,mediaId){
  try{
    await supabaseFetch('/rest/v1/garden_media?id=eq.'+eq(mediaId),token,{method:'DELETE'});
  }catch{}
}
async function removeStorage(token,storagePath){
  try{
    const {url,anon}=supabaseBase();
    await fetch(url+'/storage/v1/object/'+MEDIA_BUCKET,{
      method:'DELETE',
      headers:{
        apikey:anon,
        authorization:'Bearer '+token,
        'content-type':'application/json'
      },
      body:JSON.stringify({prefixes:[storagePath]})
    });
  }catch{}
}
async function recordCost(token,userId,actualCost,usage,success,errorCode,metadata={}){
  try{
    await supabaseFetch('/rest/v1/runtime_cost_events',token,{
      method:'POST',
      headers:{'content-type':'application/json',prefer:'return=minimal'},
      body:JSON.stringify({
        user_id:userId,
        provider:'openai',
        feature:'garden_design_natural_blend',
        operation:'placement_local_edit',
        trigger_kind:'user',
        estimated_cost_usd:null,
        actual_cost_usd:actualCost,
        units:1,
        unit_kind:'image_edit',
        success:success===true,
        error_code:errorCode||null,
        metadata:{
          model:MODEL,
          quality:QUALITY,
          inputTokens:usage?.input_tokens??null,
          outputTokens:usage?.output_tokens??null,
          ...metadata
        }
      })
    });
    return true;
  }catch{
    return false;
  }
}
function fixedPrompt(placement){
  const common=String(placement.label||placement.canonical_slug||'plant').trim();
  const scientific=String(placement.scientific||'').trim();
  return [
    'Edit the first image only to make the existing '+common+' plant look naturally integrated into the photographed garden.',
    scientific?'Expected botanical identity: '+scientific+'.':'',
    'The second image is the exact CRUVIT production plant reference. Preserve the same plant identity, overall silhouette, branching structure, foliage and flowers.',
    'Do not redesign the garden. Do not add or remove plants, paths, walls, windows, irrigation, stones, furniture, or architecture.',
    'Within the editable mask only: harmonize local exposure, white balance, color temperature, edge softness, atmospheric sharpness, contact shadow, soil contact, subtle reflected ground color, and ambient light so the plant no longer looks pasted on.',
    'Make only restrained photorealistic integration changes. No stylization, no new objects, no composition changes.',
    'Pixels outside the mask are context only and must be treated as fixed.'
  ].filter(Boolean).join(' ');
}

export default async(req)=>{
  if(req.method!=='POST') return reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'});

  const token=bearer(req);
  if(!token) return reply(401,{ok:false,code:'AUTH_REQUIRED'});

  const user=await authenticatedUser(token);
  if(!user) return reply(401,{ok:false,code:'AUTH_INVALID'});

  let body={};
  try{body=await req.json();}catch{return reply(400,{ok:false,code:'JSON_BODY_REQUIRED'});}

  const idempotencyKey=safeId(body.idempotencyKey,120);
  const gardenDesignId=uuid(body.gardenDesignId);
  const placementClientInstanceId=safeId(body.placementClientInstanceId,120);
  if(!idempotencyKey) return reply(400,{ok:false,code:'IDEMPOTENCY_KEY_REQUIRED'});
  if(!gardenDesignId||!placementClientInstanceId) return reply(400,{ok:false,code:'DESIGN_AND_PLACEMENT_REQUIRED'});

  let cropBytes,maskBytes;
  try{
    cropBytes=decodeBase64(body.cropBase64,'CROP');
    maskBytes=decodeBase64(body.maskBase64,'MASK');
    pngSize(cropBytes,'CROP');
    pngSize(maskBytes,'MASK');
  }catch(err){
    return reply(400,{ok:false,code:String(err?.message||err)});
  }

  const placement=await oneRest(
    '/rest/v1/garden_design_placements?select=id,garden_design_id,garden_profile_id,garden_plant_id,garden_area_id,user_id,client_instance_id,canonical_slug,design_asset_id,growth_stage,target_growth_stage,season,phenology,x,y,scale,rotation,label,scientific,metadata'
    +'&garden_design_id=eq.'+eq(gardenDesignId)
    +'&client_instance_id=eq.'+eq(placementClientInstanceId)
    +'&limit=1',
    token
  );
  if(!placement) return reply(404,{ok:false,code:'OWNED_PLACEMENT_NOT_FOUND'});

  const design=await oneRest(
    '/rest/v1/garden_designs?select=id,garden_profile_id,user_id,source_media_id,derived_base_media_id,status,revision'
    +'&id=eq.'+eq(gardenDesignId)+'&limit=1',
    token
  );
  if(!design||String(design.garden_profile_id)!==String(placement.garden_profile_id)){
    return reply(404,{ok:false,code:'OWNED_DESIGN_NOT_FOUND'});
  }
  if(!design.source_media_id) return reply(409,{ok:false,code:'SAVED_GARDEN_SOURCE_REQUIRED'});

  if(!fingerprintMatches(body.placementFingerprint,placement)){
    return reply(409,{ok:false,code:'PLACEMENT_CHANGED_REBUILD_BLEND'});
  }

  const blend=placement.metadata?.autoBlendV3;
  if(!blend||blend.enabled!==true||String(blend.version||'')!=='garden-design-auto-blend-v3'){
    return reply(409,{ok:false,code:'AUTO_BLEND_V3_REQUIRED'});
  }

  const previous=await existingOutput(token,placement.garden_profile_id,idempotencyKey);
  if(previous){
    return reply(200,{
      ok:true,
      code:'NATURAL_BLEND_ALREADY_COMPLETED',
      feature:FEATURE,
      media:previous,
      chargedAgain:false,
      providerCalls:0
    });
  }

  if(!placement.design_asset_id){
    return reply(409,{ok:false,code:'PRODUCTION_ASSET_REQUIRED'});
  }

  let referenceBytes;
  try{
    const registry=await loadRegistry(req);
    const match=findVariant(registry,placement.design_asset_id);
    if(!match) return reply(409,{ok:false,code:'PRODUCTION_ASSET_NOT_REGISTERED'});
    referenceBytes=await fetchReferenceBytes(req,match);
  }catch(err){
    return reply(409,{ok:false,code:String(err?.message||err)});
  }

  const ent=await entitlementStatus(token,user.id);
  if(!ent||ent.natural_blend_enabled!==true||Number(ent.natural_blend_remaining||0)<1){
    return reply(403,{
      ok:false,
      code:!ent?'NOT_ENTITLED':(ent.natural_blend_enabled!==true?'FEATURE_DISABLED':'QUOTA_EXHAUSTED'),
      feature:FEATURE,
      remaining:Math.max(0,Number(ent?.natural_blend_remaining||0))
    });
  }

  let consumed;
  try{
    consumed=await consume(token,idempotencyKey);
  }catch(err){
    return reply(500,{ok:false,code:'PREMIUM_CONSUME_FAILED'});
  }
  if(!consumed?.ok){
    return reply(403,{ok:false,feature:FEATURE,...consumed});
  }
  if(consumed.code==='ALREADY_CONSUMED'){
    const existing=await existingOutput(token,placement.garden_profile_id,idempotencyKey);
    if(existing){
      return reply(200,{
        ok:true,
        code:'NATURAL_BLEND_ALREADY_COMPLETED',
        feature:FEATURE,
        media:existing,
        chargedAgain:false,
        providerCalls:0,
        remaining:consumed.remaining
      });
    }
    return reply(409,{
      ok:false,
      code:'NATURAL_BLEND_IN_PROGRESS',
      feature:FEATURE,
      chargedAgain:false,
      providerCalls:0,
      remaining:consumed.remaining
    });
  }
  if(consumed.code!=='CONSUMED'){
    return reply(409,{ok:false,feature:FEATURE,...consumed});
  }

  const refundKey='refund:'+idempotencyKey;
  let providerPayload=null;
  let providerStatus=null;
  try{
    const form=new FormData();
    form.append('model',MODEL);
    form.append('image[]',new Blob([cropBytes],{type:'image/png'}),'scene-crop.png');
    form.append('image[]',new Blob([referenceBytes],{type:'image/png'}),'plant-reference.png');
    form.append('mask',new Blob([maskBytes],{type:'image/png'}),'edit-mask.png');
    form.append('prompt',fixedPrompt(placement));
    form.append('quality',QUALITY);
    form.append('size','1024x1024');
    form.append('output_format','png');
    form.append('n','1');

    const apiKey=env('OPENAI_KEY')||env('OPENAI_API_KEY');
    if(!apiKey) throw new Error('OPENAI_KEY_MISSING');

    const response=await fetch(OPENAI_EDIT_URL,{
      method:'POST',
      headers:{authorization:'Bearer '+apiKey},
      body:form
    });
    providerStatus=response.status;
    providerPayload=await response.json();
    if(!response.ok||providerPayload?.error){
      throw Object.assign(new Error('PROVIDER_FAILURE'),{
        providerError:providerPayload?.error?.message||null,
        providerStatus
      });
    }
  }catch(err){
    const refunded=await refund(token,idempotencyKey,refundKey);
    await recordCost(token,user.id,null,providerPayload?.usage||null,false,'PROVIDER_FAILURE',{
      gardenDesignId,
      placementId:placement.id,
      canonicalSlug:placement.canonical_slug,
      idempotencyKey,
      refunded:refunded?.ok===true
    });
    return reply(502,{
      ok:false,
      code:'NATURAL_BLEND_PROVIDER_FAILURE',
      providerError:err?.providerError||String(err?.message||err),
      providerStatus:err?.providerStatus||providerStatus,
      refund:refunded,
      remaining:refunded?.remaining??consumed.remaining
    });
  }

  const b64=providerPayload?.data?.[0]?.b64_json;
  if(!b64){
    const refunded=await refund(token,idempotencyKey,refundKey);
    await recordCost(token,user.id,costUsd(providerPayload?.usage),providerPayload?.usage||null,false,'OUTPUT_MISSING',{
      gardenDesignId,
      placementId:placement.id,
      canonicalSlug:placement.canonical_slug,
      idempotencyKey,
      refunded:refunded?.ok===true
    });
    return reply(502,{ok:false,code:'NATURAL_BLEND_OUTPUT_MISSING',refund:refunded});
  }

  const outputBytes=Buffer.from(b64,'base64');
  const outputSha=sha256(outputBytes);
  const actualCost=costUsd(providerPayload?.usage);
  const mediaId=crypto.randomUUID();
  const filename='natural-blend-'+outputSha.slice(0,12)+'.png';
  const storagePath=[
    user.id,
    placement.garden_profile_id,
    mediaId,
    filename
  ].join('/');

  const metadata={
    feature:'natural_blend',
    version:'natural-blend-production-v1',
    idempotencyKey,
    gardenDesignId,
    placementId:placement.id,
    placementClientInstanceId,
    canonicalSlug:placement.canonical_slug,
    designAssetId:placement.design_asset_id,
    placementFingerprint:{
      x:placement.x,
      y:placement.y,
      scale:placement.scale,
      rotation:placement.rotation
    },
    invalidatedByMoveOrResize:true,
    sourceAutoBlendVersion:'garden-design-auto-blend-v3',
    model:MODEL,
    quality:QUALITY,
    actualCostUsd:actualCost
  };

  try{
    await insertMediaPending(token,{
      id:mediaId,
      garden_profile_id:placement.garden_profile_id,
      user_id:user.id,
      garden_plant_id:placement.garden_plant_id||null,
      garden_area_id:placement.garden_area_id||null,
      client_instance_id:idempotencyKey,
      storage_bucket:MEDIA_BUCKET,
      storage_path:storagePath,
      mime_type:'image/png',
      byte_size:outputBytes.length,
      width:1024,
      height:1024,
      source_module:'garden_design',
      purpose:'design_output',
      identity_source:placement.garden_plant_id?'inherited_from_known_plant_context':'none',
      identity_confidence:placement.garden_plant_id?'high':'none',
      validation_state:'pending',
      content_sha256:outputSha,
      captured_at:new Date().toISOString(),
      metadata
    });
    await uploadMedia(token,storagePath,outputBytes);
    await validateMediaRow(token,mediaId);
  }catch(err){
    await removeStorage(token,storagePath);
    await deleteMediaRow(token,mediaId);
    const refunded=await refund(token,idempotencyKey,refundKey);
    await recordCost(token,user.id,actualCost,providerPayload?.usage||null,false,'OUTPUT_PERSIST_FAILED',{
      gardenDesignId,
      placementId:placement.id,
      canonicalSlug:placement.canonical_slug,
      idempotencyKey,
      refunded:refunded?.ok===true
    });
    return reply(500,{
      ok:false,
      code:'NATURAL_BLEND_OUTPUT_PERSIST_FAILED',
      refund:refunded,
      actualCostUsd:actualCost
    });
  }

  const costEventRecorded=await recordCost(token,user.id,actualCost,providerPayload?.usage||null,true,null,{
    gardenDesignId,
    placementId:placement.id,
    canonicalSlug:placement.canonical_slug,
    mediaId,
    idempotencyKey
  });

  return reply(200,{
    ok:true,
    code:'NATURAL_BLEND_COMPLETED',
    feature:FEATURE,
    media:{
      id:mediaId,
      gardenProfileId:placement.garden_profile_id,
      storagePath,
      mimeType:'image/png',
      contentSha256:outputSha,
      validationState:'validated'
    },
    usage:providerPayload?.usage||null,
    actualCostUsd:actualCost,
    remaining:consumed.remaining,
    chargedAgain:false,
    providerCalls:1,
    costEventRecorded,
    invalidatedByMoveOrResize:true,
    globalPlantAssetMutation:false
  });
};

export const config={path:'/api/garden-design/natural-blend'};
