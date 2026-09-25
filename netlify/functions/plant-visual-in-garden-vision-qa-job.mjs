import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const PLAN_CONTRACT='plant-visual-in-garden-vision-qa-plan-v1';
const APPROVAL_CONTRACT='plant-visual-in-garden-vision-qa-spend-approval-v1';
const RESPONSES_URL='https://api.openai.com/v1/responses';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readBytes(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}
async function readJson(c,bucket,key){const b=await readBytes(c,bucket,key);if(!b)return null;try{return JSON.parse(b.toString('utf8'));}catch{return null;}}
async function putJson(c,bucket,key,body,ifNone){await c.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:Buffer.from(JSON.stringify(body,null,2)),ContentType:'application/json; charset=utf-8',CacheControl:'private, no-store',...(ifNone?{IfNoneMatch:'*'}:{})}));}
async function loadStaticJson(req,path){const res=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;return res.json();}
async function loadPlan(req,runId){const p=await loadStaticJson(req,'/data/garden-design/plant-visual-in-garden-vision-qa-plans/'+runId+'.json');if(!p||p.contract!==PLAN_CONTRACT||p.runId!==runId||!Array.isArray(p.jobs)||p.jobs.length!==Number(p.jobCount))return null;return p;}
async function loadApproval(req,runId){const a=await loadStaticJson(req,'/data/garden-design/plant-visual-in-garden-vision-qa-spend-approvals/'+runId+'.json');if(!a||a.contract!==APPROVAL_CONTRACT||a.runId!==runId)return null;return a;}
function approvalOk(a,p){if(!a||a.approved!==true)return false;if(a.provider!==p.provider||a.model!==p.model)return false;if(Number(a.maxCalls)!==Number(p.jobCount)||Number(a.maxRetries)!==0)return false;if(!(Number(a.maxSpendUsd)>0)||!(Number(a.perCallReserveUsd)>0))return false;if(a.productionWritesAllowed!==false||a.registryWritesAllowed!==false)return false;const set=new Set(a.jobIds||[]);return set.size===p.jobs.length&&p.jobs.every(j=>set.has(j.jobId));}
function evidenceKey(plan,jobId){return `candidates/${safeSegment(plan.sourceManifestId)}/in-garden-vision-qa/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;}
function lockKey(plan,jobId){return `candidates/${safeSegment(plan.sourceManifestId)}/in-garden-vision-qa-locks/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;}
async function recordedSpend(c,bucket,plan){let total=0;for(const j of plan.jobs){const e=await readJson(c,bucket,evidenceKey(plan,j.jobId));const s=Number(e?.actualSpendUsd);if(Number.isFinite(s))total+=s;}return +total.toFixed(6);}
function outputText(body){const d=String(body?.output_text||'').trim();if(d)return d;const parts=[];for(const item of body?.output||[])for(const x of item?.content||[])if(typeof x?.text==='string')parts.push(x.text);return parts.join('\n').trim();}
function cleanJsonText(raw){const s=String(raw||'').trim();if(s.startsWith('{')&&s.endsWith('}'))return s;const m=s.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);return m?m[1].trim():s;}
function norm(v){const x=String(v||'').trim().toUpperCase();return ['PASS','FAIL','UNCERTAIN'].includes(x)?x:'UNCERTAIN';}
function validate(parsed){const keys=['perspective','groundContact','stickerLook','halo','sharpnessMatch','colorTonalMatch','scaleRealism','silhouette'];const checks={};for(const k of keys){const r=parsed[k]||{};checks[k]={verdict:norm(r.verdict),confidence:String(r.confidence||'unknown').toLowerCase(),reason:String(r.reason||'').slice(0,400)};}const anyFail=keys.some(k=>checks[k].verdict==='FAIL');const allPass=keys.every(k=>checks[k].verdict==='PASS');return {overall:anyFail?'FAIL':allPass?'PASS':'UNCERTAIN',checks,autoPassEligible:allPass&&keys.every(k=>['high','very-high'].includes(checks[k].confidence))};}
function spendFromUsage(u={}){const input=Number(u.input_tokens||0),output=Number(u.output_tokens||0);if(!Number.isFinite(input+output))return null;return +((input*0.20+output*1.20)/1_000_000).toFixed(6);}

export default async(req)=>{
  if(req.method!=='POST')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  let body={};try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
  const runId=safeId(body.runId),jobId=safeId(body.jobId);
  if(!runId||!jobId)return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);if(!plan)return json(404,{ok:false,code:'IN_GARDEN_VISION_PLAN_NOT_FOUND'});
  const job=plan.jobs.find(j=>j.jobId===jobId);if(!job)return json(404,{ok:false,code:'JOB_NOT_IN_PLAN'});
  const approval=await loadApproval(req,runId);if(!approvalOk(approval,plan))return json(403,{ok:false,code:'IN_GARDEN_VISION_SPEND_OWNER_APPROVAL_REQUIRED'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));const apiKey=env('OPENAI_KEY')||env('OPENAI_API_KEY');if(!apiKey)missing.push('OPENAI_KEY_OR_OPENAI_API_KEY');if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const existing=await readJson(c,bucket,evidenceKey(plan,jobId));if(existing)return json(200,{ok:true,code:'IN_GARDEN_VISION_ALREADY_HAS_EVIDENCE',evidence:existing});
  const spent=await recordedSpend(c,bucket,plan);if(spent+Number(approval.perCallReserveUsd)>Number(approval.maxSpendUsd)+1e-9)return json(409,{ok:false,code:'IN_GARDEN_VISION_SPEND_CAP_REACHED',recordedSpendUsd:spent,maxSpendUsd:Number(approval.maxSpendUsd)});
  try{await putJson(c,bucket,lockKey(plan,jobId),{contract:'plant-visual-in-garden-vision-qa-lock-v1',runId,jobId,claimedAt:new Date().toISOString(),retriesAllowed:false},true);}catch(err){if(err?.name==='PreconditionFailed'||err?.$metadata?.httpStatusCode===412)return json(409,{ok:false,code:'IN_GARDEN_VISION_JOB_ALREADY_CLAIMED'});throw err;}
  const img=await readBytes(c,bucket,job.captureObjectKey);if(!img)return json(409,{ok:false,code:'IN_GARDEN_CAPTURE_NOT_FOUND'});
  if(sha256(img)!==String(job.captureSha256).toLowerCase())return json(409,{ok:false,code:'IN_GARDEN_CAPTURE_INTEGRITY_MISMATCH'});
  const prompt=[
    'You are a visual QA reviewer for a plant cutout composited by the real production Garden Design renderer onto a real saved garden photo.',
    'Evaluate ONLY visible integration defects in the rendered scene. Do not re-identify the botanical species.',
    'Expected plant: '+job.canonicalSlug+' ('+job.scientific+').',
    'Expected stage/state: '+job.growthStage+' / '+job.phenology+'.',
    'Checks: perspective, groundContact, stickerLook, halo, sharpnessMatch, colorTonalMatch, scaleRealism, silhouette.',
    'Verdict calibration is strict:',
    '- PASS = the check is visibly acceptable in this image and there is no visible defect that would justify HOLD. PASS does not require proof of perfection.',
    '- FAIL = a visible, material defect is present, such as crop, floating, implausible scale, obvious pasted-on look, halo, tonal mismatch, malformed silhouette, or perspective mismatch.',
    '- UNCERTAIN = the image itself does not contain enough visible information to judge the check because of occlusion, insufficient resolution, ambiguous framing, or another concrete observability limit.',
    'Do NOT use UNCERTAIN merely because a visual judgment is probabilistic. If the feature is visible and looks plausible/natural with no defect, use PASS.',
    'Give confidence high, medium, or low and a short reason grounded only in the image.'
  ].join('\n');

  const checkSchema={
    type:'object',
    additionalProperties:false,
    required:['verdict','confidence','reason'],
    properties:{
      verdict:{type:'string',enum:['PASS','FAIL','UNCERTAIN']},
      confidence:{type:'string',enum:['high','medium','low']},
      reason:{type:'string',minLength:1,maxLength:400}
    }
  };
  const outputSchema={
    type:'object',
    additionalProperties:false,
    required:['perspective','groundContact','stickerLook','halo','sharpnessMatch','colorTonalMatch','scaleRealism','silhouette'],
    properties:{
      perspective:checkSchema,
      groundContact:checkSchema,
      stickerLook:checkSchema,
      halo:checkSchema,
      sharpnessMatch:checkSchema,
      colorTonalMatch:checkSchema,
      scaleRealism:checkSchema,
      silhouette:checkSchema
    }
  };

  const res=await fetch(RESPONSES_URL,{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({
    model:plan.model,
    reasoning:{effort:plan.reasoningEffort||'low'},
    max_output_tokens:700,
    text:{format:{type:'json_schema',name:'cruvit_in_garden_vision_qa',strict:true,schema:outputSchema}},
    input:[{role:'user',content:[
      {type:'input_text',text:prompt},
      {type:'input_image',image_url:'data:image/jpeg;base64,'+img.toString('base64'),detail:plan.imageDetail||'high'}
    ]}]
  })});
  const pb=await res.json();
  if(!res.ok){const evidence={contract:'plant-visual-in-garden-vision-qa-evidence-v1',runId,jobId,code:'PROVIDER_FAILURE',overall:'UNCERTAIN',httpStatus:res.status,actualSpendUsd:spendFromUsage(pb.usage),productionWrites:0,registryWrites:0,recordedAt:new Date().toISOString()};await putJson(c,bucket,evidenceKey(plan,jobId),evidence);return json(502,{ok:false,...evidence});}
  let parsed=null;const raw=outputText(pb);try{parsed=JSON.parse(cleanJsonText(raw));}catch{}
  const assessment=parsed?validate(parsed):{overall:'UNCERTAIN',checks:null,autoPassEligible:false};
  const evidence={contract:'plant-visual-in-garden-vision-qa-evidence-v1',runId,jobId,canonicalSlug:job.canonicalSlug,captureObjectKey:job.captureObjectKey,captureSha256:job.captureSha256,realSavedGardenPhotoUsed:true,model:plan.model,...assessment,code:parsed?'IN_GARDEN_VISION_QA_RECORDED':'INVALID_JSON_UNCERTAIN',actualSpendUsd:spendFromUsage(pb.usage),usage:pb.usage||null,productionWrites:0,registryWrites:0,recordedAt:new Date().toISOString()};
  await putJson(c,bucket,evidenceKey(plan,jobId),evidence);
  return json(200,{ok:true,evidence});
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-vision-qa-job'};
