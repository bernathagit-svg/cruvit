/**
 * P0-A paid-runtime containment. All handlers run in isolated VM contexts.
 * No real credentials, environment mutation, network, or persistent writes.
 * Run: node --experimental-vm-modules --test tests/paid-runtime-containment-v1.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as nodeUrl from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(nodeUrl.fileURLToPath(import.meta.url)), '..');
const REAL_ENV_BEFORE = { ...process.env };
const PI_FLAG = 'CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER';
const BLEND_FLAG = 'CRUVIT_ALLOW_PAID_NATURAL_BLEND';
const ADMIN_FLAG = 'CRUVIT_ALLOW_PAID_ADMIN_RUNTIME';
const SECRET_SENTINEL = 'TEST_ONLY_SECRET_MUST_NOT_APPEAR_IN_RESPONSE';
const PAID_ENDPOINTS = Object.freeze([
  { name: 'plant-identify', group: 'pi', code: 'PAID_PLANT_IDENTIFIER_DISABLED' },
  { name: 'claude', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED' },
  { name: 'gd-claude', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'pd-claude', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'gd-openai-image', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'gd-replicate', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'gd-replicate-inpaint', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'gd-stability', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED', event: true },
  { name: 'plant-knowledge', group: 'legacy', code: 'PAID_LEGACY_RUNTIME_DISABLED' },
  { name: 'garden-design-natural-blend', group: 'blend', code: 'PAID_NATURAL_BLEND_DISABLED' },
  { name: 'plant-visual-generate-wave-job', group: 'admin', code: 'PAID_ADMIN_RUNTIME_HOLD' },
  { name: 'plant-visual-model-qa-job', group: 'admin', code: 'PAID_ADMIN_RUNTIME_HOLD' },
  { name: 'plant-visual-in-garden-vision-qa-job', group: 'admin', code: 'PAID_ADMIN_RUNTIME_HOLD' },
  { name: 'plant-visual-natural-blend-job', group: 'admin', code: 'PAID_ADMIN_RUNTIME_HOLD' }
]);

const FAKE_CREDENTIALS = Object.freeze({
  ANTHROPIC_API_KEY: SECRET_SENTINEL,
  ANTHROPIC_KEY: SECRET_SENTINEL,
  CLAUDE_API_KEY: SECRET_SENTINEL,
  OPENAI_API_KEY: SECRET_SENTINEL,
  OPENAI_KEY: SECRET_SENTINEL,
  REPLICATE_API_TOKEN: SECRET_SENTINEL,
  REPLICATE_API_KEY: SECRET_SENTINEL,
  STABILITY_API_KEY: SECRET_SENTINEL,
  STABILITY_KEY: SECRET_SENTINEL,
  SUPABASE_URL: 'https://database.invalid',
  SUPABASE_ANON_KEY: SECRET_SENTINEL,
  SUPABASE_SERVICE_ROLE_KEY: SECRET_SENTINEL,
  PLANT_VISUAL_R2_ACCOUNT_ID: SECRET_SENTINEL,
  PLANT_VISUAL_R2_ACCESS_KEY_ID: SECRET_SENTINEL,
  PLANT_VISUAL_R2_SECRET_ACCESS_KEY: SECRET_SENTINEL,
  PLANT_VISUAL_R2_BUCKET: 'test-candidate-bucket'
});

const HOSTILE_BODY = Object.freeze({
  mode: 'identify',
  action: 'start',
  image: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  imageBase64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  mediaType: 'image/png',
  model: 'client-must-not-select-this-model',
  messages: [{ role: 'user', content: 'test' }],
  runId: 'owner-approved-run',
  jobId: 'owner-approved-job',
  allowPaid: true,
  allowPaidRuntime: true,
  enableAnthropic: true,
  admin: true,
  role: 'admin',
  NODE_ENV: 'test',
  [PI_FLAG]: 'true',
  [BLEND_FLAG]: 'true',
  [ADMIN_FLAG]: 'true',
  env: { [PI_FLAG]: 'true', [BLEND_FLAG]: 'true', [ADMIN_FLAG]: 'true', NODE_ENV: 'test' },
  authorization: SECRET_SENTINEL
});
const HOSTILE_HEADERS = Object.freeze({
  'content-type': 'application/json',
  authorization: `Bearer ${SECRET_SENTINEL}`,
  'x-cruvit-allow-paid-plant-identifier': 'true',
  'x-cruvit-allow-paid-natural-blend': 'true',
  'x-cruvit-allow-paid-admin-runtime': 'true',
  'x-allow-paid-ai': 'true',
  'x-admin': 'true',
  'x-role': 'admin',
  [PI_FLAG]: 'true',
  [BLEND_FLAG]: 'true',
  [ADMIN_FLAG]: 'true',
  NODE_ENV: 'test'
});

// Imports remain real source modules. Only platform I/O is replaced; an unknown
// package or native module cannot escape this explicit allowlist.
async function loadContainedEndpoint(endpoint, authority = {}) {
  const counts = { fetch: 0, https: 0, storageConstruct: 0, storageSend: 0, credentialReads: 0 };
  const logs = [];
  const env = new Proxy({ ...FAKE_CREDENTIALS, ...authority }, {
    get(target, key) {
      if (Object.hasOwn(FAKE_CREDENTIALS, key)) counts.credentialReads += 1;
      return target[key];
    }
  });
  const denyNetwork = async () => {
    counts.fetch += 1;
    throw new Error('NETWORK_FORBIDDEN_IN_CONTAINMENT_TEST');
  };
  const denyHttps = () => {
    counts.https += 1;
    throw new Error('HTTPS_FORBIDDEN_IN_CONTAINMENT_TEST');
  };
  class ForbiddenS3Client {
    constructor() { counts.storageConstruct += 1; }
    async send() {
      counts.storageSend += 1;
      throw new Error('STORAGE_FORBIDDEN_IN_CONTAINMENT_TEST');
    }
  }
  class GetObjectCommand { constructor(input) { this.input = input; } }
  class PutObjectCommand { constructor(input) { this.input = input; } }
  const readOnlyFs = {
    readFileSync: fs.readFileSync,
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    readdirSync: fs.readdirSync
  };
  const context = vm.createContext({
    process: { env },
    Netlify: { env: { get: (key) => env[key] || '' } },
    fetch: denyNetwork,
    console: Object.fromEntries(['log', 'warn', 'error', 'info', 'debug'].map((level) => [level, (...args) => logs.push(args.map(String).join(' '))])),
    Buffer, Request, Response, Headers, URL, URLSearchParams,
    FormData, Blob, AbortController, TextEncoder, TextDecoder,
    setTimeout, clearTimeout
  });
  class ForbiddenAnthropic {
    constructor() {
      throw new Error('ANTHROPIC_SDK_CONSTRUCTION_FORBIDDEN_IN_CONTAINMENT_TEST');
    }
  }
  const builtinModules = new Map([
    ['@anthropic-ai/sdk', { default: ForbiddenAnthropic }],
    ['node:crypto', { default: crypto, ...crypto }],
    ['node:path', { default: path, ...path }],
    ['node:url', { ...nodeUrl }],
    ['node:zlib', { default: zlib, ...zlib }],
    ['node:fs', { default: readOnlyFs, ...readOnlyFs }],
    ['node:https', { default: { request: denyHttps, get: denyHttps }, request: denyHttps, get: denyHttps }],
    ['@aws-sdk/client-s3', { S3Client: ForbiddenS3Client, GetObjectCommand, PutObjectCommand }]
  ]);
  const modules = new Map();
  function getModule(id) {
    if (modules.has(id)) return modules.get(id);
    let module;
    if (builtinModules.has(id)) {
      const exports = builtinModules.get(id);
      module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context, identifier: id });
    } else {
      assert.ok(id.startsWith(ROOT + path.sep), `import outside repository: ${id}`);
      module = new vm.SourceTextModule(fs.readFileSync(id, 'utf8'), {
        context,
        identifier: id,
        initializeImportMeta(meta) { meta.url = nodeUrl.pathToFileURL(id).href; },
        importModuleDynamically() { throw new Error('DYNAMIC_IMPORT_FORBIDDEN_IN_CONTAINMENT_TEST'); }
      });
    }
    modules.set(id, module);
    return module;
  }
  const entry = getModule(path.join(ROOT, 'netlify/functions', endpoint.name + '.mjs'));
  await entry.link((specifier, referrer) => {
    if (builtinModules.has(specifier)) return getModule(specifier);
    assert.ok(specifier.startsWith('.'), `unmocked dependency: ${specifier}`);
    return getModule(path.resolve(path.dirname(referrer.identifier), specifier));
  });
  await entry.evaluate();
  const handler = endpoint.event ? entry.namespace.handler : entry.namespace.default;
  assert.equal(typeof handler, 'function', `${endpoint.name} exports a callable handler`);
  return { handler, counts, logs };
}

async function assertDenied(endpoint, authority = {}, hostile = true, malformed = false) {
  const runtime = await loadContainedEndpoint(endpoint, authority);
  const query = hostile ? new URLSearchParams({ [PI_FLAG]: 'true', [BLEND_FLAG]: 'true', [ADMIN_FLAG]: 'true', NODE_ENV: 'test', admin: 'true', allowPaid: 'true' }).toString() : '';
  const url = `https://offline.invalid/.netlify/functions/${endpoint.name}?${query}`;
  const body = malformed ? '{ invalid JSON' : JSON.stringify(hostile ? HOSTILE_BODY : { mode: 'identify' });
  const headers = hostile ? HOSTILE_HEADERS : { 'content-type': 'application/json' };
  const request = endpoint.event
    ? { httpMethod: 'POST', headers, body, queryStringParameters: Object.fromEntries(new URL(url).searchParams), rawUrl: url }
    : new Request(url, { method: 'POST', headers, body });
  const response = await runtime.handler(request);
  const status = endpoint.event ? response.statusCode : response.status;
  const text = endpoint.event ? response.body : await response.text();
  const payload = JSON.parse(text);
  assert.equal(status, 403, `${endpoint.name} is fail-closed`);
  assert.equal(payload.code, endpoint.code, `${endpoint.name} returns its controlled containment code`);
  assert.deepEqual(runtime.counts, { fetch: 0, https: 0, storageConstruct: 0, storageSend: 0, credentialReads: 0 }, `${endpoint.name} denies before credential-dependent or external work`);
  for (const exposed of [text, ...runtime.logs]) {
    assert.ok(!exposed.includes(SECRET_SENTINEL), `${endpoint.name}: no credential disclosure`);
    assert.ok(!exposed.includes('client-must-not-select-this-model'), `${endpoint.name}: no request echo`);
    assert.doesNotMatch(exposed, /"stack"|\bat (?:async )?\S+\s*\(|rawProvider|providerPayload/i, `${endpoint.name}: no stack or raw provider payload`);
  }
  return payload;
}

test('paid-runtime inventory covers exactly 14 SERVER_RUNTIME endpoints and all four authority groups', () => {
  assert.equal(PAID_ENDPOINTS.length, 14);
  assert.equal(new Set(PAID_ENDPOINTS.map((row) => row.name)).size, 14);
  assert.deepEqual(Object.fromEntries(['pi', 'legacy', 'blend', 'admin'].map((group) => [group, PAID_ENDPOINTS.filter((row) => row.group === group).length])), { pi: 1, legacy: 8, blend: 1, admin: 4 });
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/packaging/static-runtime-source-lock-v1.json'), 'utf8'));
  for (const row of PAID_ENDPOINTS) {
    assert.equal(lock.paths.find((item) => item.path === `netlify/functions/${row.name}.mjs`)?.classification, 'SERVER_RUNTIME', row.name);
  }
});

test('all 14 endpoints: fake credentials alone and hostile body/header/query cannot grant paid authority', async (t) => {
  for (const endpoint of PAID_ENDPOINTS) {
    await t.test(endpoint.name, async () => {
      await assertDenied(endpoint, {}, false);
      await assertDenied(endpoint, {}, true);
      await assertDenied(endpoint, {}, true, true);
    });
  }
});

test('PI enablement does not enable any of the other 13 endpoints', async (t) => {
  for (const endpoint of PAID_ENDPOINTS.filter((row) => row.group !== 'pi')) {
    await t.test(endpoint.name, () => assertDenied(endpoint, { [PI_FLAG]: 'true', NODE_ENV: 'test' }));
  }
});

test('Natural Blend enablement cannot enable PI, legacy routes, or admin jobs', async (t) => {
  for (const endpoint of PAID_ENDPOINTS.filter((row) => row.group !== 'blend')) {
    await t.test(endpoint.name, () => assertDenied(endpoint, { [BLEND_FLAG]: 'true', NODE_ENV: 'test' }));
  }
});

test('offline admin authority cannot enable PI, Natural Blend, or the eight legacy routes', async (t) => {
  for (const endpoint of PAID_ENDPOINTS.filter((row) => row.group !== 'admin')) {
    await t.test(endpoint.name, () => assertDenied(endpoint, { [ADMIN_FLAG]: 'true', NODE_ENV: 'test' }));
  }
});

test('legacy routes remain denied even when every feature authority is explicitly enabled offline', async (t) => {
  for (const endpoint of PAID_ENDPOINTS.filter((row) => row.group === 'legacy')) {
    await t.test(endpoint.name, () => assertDenied(endpoint, { [PI_FLAG]: 'true', [BLEND_FLAG]: 'true', [ADMIN_FLAG]: 'true', NODE_ENV: 'test' }));
  }
});

test('admin activation remains HOLD outside an isolated offline test context, including hosted test contexts', async (t) => {
  const deniedAuthorities = [
    { [ADMIN_FLAG]: 'true' },
    { [ADMIN_FLAG]: 'true', NODE_ENV: 'production' },
    ...['NETLIFY', 'SITE_ID', 'DEPLOY_ID', 'CONTEXT'].map((key) => ({ [ADMIN_FLAG]: 'true', NODE_ENV: 'test', [key]: 'hosted-context' }))
  ];
  for (const endpoint of PAID_ENDPOINTS.filter((row) => row.group === 'admin')) {
    await t.test(endpoint.name, async () => {
      for (const authority of deniedAuthorities) await assertDenied(endpoint, authority);
    });
  }
});

test('no generic global flag grants authority to any of the 14 endpoints', async (t) => {
  const falseAuthority = { CRUVIT_ALLOW_PAID_AI: 'true', CRUVIT_ALLOW_PAID_RUNTIME: 'true', ALLOW_PAID_AI: 'true', ADMIN: 'true', NODE_ENV: 'test' };
  for (const endpoint of PAID_ENDPOINTS) {
    await t.test(endpoint.name, () => assertDenied(endpoint, falseAuthority));
  }
});

after(() => {
  assert.deepEqual({ ...process.env }, REAL_ENV_BEFORE, 'offline tests never mutate the real process environment');
});

// Offline behavioral preservation checks for the four unchanged bounded admin jobs.
import adminFs from 'node:fs';
import adminPath from 'node:path';
import adminVm from 'node:vm';
import adminCrypto from 'node:crypto';
import adminAssert from 'node:assert/strict';
import adminTest from 'node:test';

const adminRoot = ROOT;
const adminFiles = [
  'plant-visual-generate-wave-job.mjs',
  'plant-visual-model-qa-job.mjs',
  'plant-visual-in-garden-vision-qa-job.mjs',
  'plant-visual-natural-blend-job.mjs'
];

async function adminFixture(file, options = {}) {
  const runId = 'offline-approved-run';
  const jobId = 'offline-approved-job';
  const sourceBytes = Buffer.from('offline-approved-source-pixels');
  const sourceSha = adminCrypto.createHash('sha256').update(sourceBytes).digest('hex');
  const job = { jobId, canonicalSlug:'lavender', scientific:'Lavandula angustifolia',
    phenology:'vegetative', quality:'medium', detailClass:'standard',
    objectKey:'approved-source.png', sha256:sourceSha, bytes:sourceBytes.length,
    captureObjectKey:'approved-source.png', captureSha256:sourceSha };
  const kind = file.includes('generate-wave') ? 'wave' : file.includes('in-garden-vision') ? 'vision' : file.includes('model-qa') ? 'model' : 'blend';
  const names = {
    wave:['plant-visual-production-wave-execution-manifests','plant-visual-production-wave-execution-manifest-v1','plant-visual-production-wave-spend-approvals','plant-visual-production-wave-spend-approval-v1'],
    model:['plant-visual-model-qa-plans','plant-visual-model-qa-plan-v1','plant-visual-model-qa-spend-approvals','plant-visual-model-qa-spend-approval-v1'],
    vision:['plant-visual-in-garden-vision-qa-plans','plant-visual-in-garden-vision-qa-plan-v1','plant-visual-in-garden-vision-qa-spend-approvals','plant-visual-in-garden-vision-qa-spend-approval-v1'],
    blend:['plant-visual-natural-blend-plans','plant-visual-natural-blend-plan-v1','plant-visual-natural-blend-spend-approvals','plant-visual-natural-blend-spend-approval-v1']
  }[kind];
  const plan = { contract:names[1], runId, sourceManifestId:'offline-source-manifest',
    provider:'offline-provider', model:'offline-fixed-model', jobCount:1, jobs:[job],
    executionPolicy:{provider:'offline-provider',model:'offline-fixed-model'},
    spendPreflight:{projectedMaximumSpendUsd:0.091}, sourceJobId:jobId,
    sourceCandidate:{objectKey:job.objectKey,sha256:sourceSha}, quality:'medium' };
  const approval = { contract:names[3], runId, approved:true, provider:plan.provider,
    model:plan.model, maxCalls:1, maxRetries:0, maxSpendUsd:1, perCallReserveUsd:0.01,
    jobIds:[jobId], jobId, productionWritesAllowed:false, registryWritesAllowed:false,
    sourceGardenMutationAllowed:false,candidateAssetMutationAllowed:false,
    allowedActions:['generate exact approved wave candidate jobs',
      'write generated PNGs only to candidate R2',
      'write generation and technical QA evidence only to candidate R2'],
    ...(options.approval || {}) };
  const objects = new Map([[job.objectKey, sourceBytes]]);
  const counters = {provider:0,storage:0,staticReads:0,locks:0};
  const env = { NODE_ENV:'test', CRUVIT_ALLOW_PAID_ADMIN_RUNTIME:'true',
    PLANT_VISUAL_R2_ACCOUNT_ID:'offline',PLANT_VISUAL_R2_ACCESS_KEY_ID:'offline',
    PLANT_VISUAL_R2_SECRET_ACCESS_KEY:'offline',PLANT_VISUAL_R2_CANDIDATES_BUCKET:'offline-candidates',
    OPENAI_KEY:'offline-placeholder' };
  class AdminGet { constructor(input){this.input=input;this.kind='get';} }
  class AdminPut { constructor(input){this.input=input;this.kind='put';} }
  class AdminS3 {
    async send(command) {
      counters.storage++;
      const x=command.input;
      adminAssert.equal(x.Bucket,'offline-candidates');
      if(command.kind==='get') {
        const bytes=objects.get(x.Key);
        if(!bytes)throw Object.assign(new Error('missing'),{name:'NoSuchKey'});
        return {Body:{transformToByteArray:async()=>bytes}};
      }
      if(command.kind==='put') {
        if(x.IfNoneMatch==='*') {
          if(objects.has(x.Key))throw Object.assign(new Error('claimed'),{name:'PreconditionFailed'});
          counters.locks++;
        }
        objects.set(x.Key,Buffer.from(x.Body));
        return {};
      }
      throw new Error('Unexpected storage operation');
    }
  }
  const outputBytes=Buffer.from('offline-provider-result');
  const checks=Object.fromEntries(['botanicalIdentity','architecture','growthStage','phenologyState','perspective','groundContact','stickerLook','halo','sharpnessMatch','colorTonalMatch','scaleRealism','silhouette'].map(key=>[key,{verdict:'PASS',confidence:'high',reason:'synthetic fixture'}]));
  const providerBody = options.providerFailure ? {error:{message:'offline failure'}} : {
    data:[{b64_json:outputBytes.toString('base64')}],output_text:JSON.stringify(checks),
    usage:{input_tokens:10,output_tokens:10}
  };
  async function provider() {
    counters.provider++;
    // A provider-dispatch ceiling is a test assertion, never a hidden retry mock.
    adminAssert.equal(counters.provider,1);
    return {status:options.providerFailure?500:200,body:providerBody};
  }
  const staticDocs = new Map([
    [`/data/garden-design/${names[0]}/${runId}.json`,plan],
    [`/data/garden-design/${names[2]}/${runId}.json`,approval]
  ]);
  async function fakeFetch(url) {
    const target=new URL(url);
    if(target.origin==='https://offline.invalid') {
      counters.staticReads++;
      const doc=staticDocs.get(target.pathname);
      if(!doc)throw new Error('Unstubbed static request: '+target.pathname);
      return new Response(JSON.stringify(doc),{status:200});
    }
    adminAssert.equal(target.origin,'https://api.openai.com');
    adminAssert.ok(['/v1/responses','/v1/images/edits'].includes(target.pathname));
    const r=await provider();
    return new Response(JSON.stringify(r.body),{status:r.status});
  }
  const context=adminVm.createContext({process:{env},Buffer,Response,Request,URL,Blob,FormData,
    fetch:fakeFetch,console});
  const moduleCache = new Map();
  async function synthetic(key,exports) {
    if(moduleCache.has(key))return moduleCache.get(key);
    const mod=new adminVm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:key});
    moduleCache.set(key,mod);
    return mod;
  }
  const guardPath=adminPath.join(adminRoot,'modules/runtime-guards/paid-plant-identifier-gate-v1.js');
  const guard=new adminVm.SourceTextModule(adminFs.readFileSync(guardPath,'utf8'),{context,identifier:guardPath});
  await guard.link(()=>{throw new Error('Unexpected guard import');});
  const endpointPath=adminPath.join(adminRoot,'netlify/functions',file);
  const endpoint=new adminVm.SourceTextModule(adminFs.readFileSync(endpointPath,'utf8'),{context,identifier:endpointPath});
  await endpoint.link(async(specifier)=>{
    if(specifier==='node:crypto')return synthetic(specifier,{default:adminCrypto});
    if(specifier==='@aws-sdk/client-s3')return synthetic(specifier,{S3Client:AdminS3,GetObjectCommand:AdminGet,PutObjectCommand:AdminPut});
    if(specifier.endsWith('/paid-plant-identifier-gate-v1.js'))return guard;
    if(specifier.endsWith('/openai-images-http-v1.js'))return synthetic(specifier,{postOpenAiImagesJson:provider,OPENAI_IMAGES_GENERATIONS_URL:'https://api.openai.com/v1/images/generations'});
    if(specifier.endsWith('/design-asset-quality-policy-v1.js'))return synthetic(specifier,{planDesignAssetGeneration:()=>({quality:job.quality,detailClass:job.detailClass,promptRecord:{prompt:'offline exact approved prompt'}})});
    if(specifier.endsWith('/technical-qa-v1.js'))return synthetic(specifier,{inspectTechnicalQa:()=>({pass:true})});
    if(specifier.endsWith('/production-framing-qa-v1.js'))return synthetic(specifier,{assessProductionFramingQa:()=>({pass:true})});
    if(specifier.endsWith('/total-api-cost-v1.js'))return synthetic(specifier,{actualSpendUsdFromUsage:()=>0.001});
    if(specifier.endsWith('/plant-full-onboarding-gate-v1.mjs'))return synthetic(specifier,{evaluateLiveFullPlantOnboarding:async()=>({evaluations:[{ready:true,code:'OFFLINE_READY'}]})});
    throw new Error('Unstubbed import: '+specifier);
  });
  await endpoint.evaluate();
  const request=(body={})=>new Request('https://offline.invalid/.netlify/functions/'+file.replace('.mjs',''),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId,jobId,
      cropBase64:Buffer.from('offline-crop').toString('base64'),maskBase64:Buffer.from('offline-mask').toString('base64'),...body})
  });
  return {handler:endpoint.namespace.default,request,counters,approval,objects,kind};
}

for(const file of adminFiles) {
  adminTest('bounded admin offline success + duplicate: '+file,async()=>{
    const f=await adminFixture(file);
    adminAssert.equal((await f.handler(f.request())).status,200);
    adminAssert.equal(f.counters.provider,1);
    adminAssert.equal(f.counters.locks,1);
    await f.handler(f.request());
    adminAssert.equal(f.counters.provider,1);
    adminAssert.equal(f.counters.locks,1);
  });
  adminTest('bounded admin provider failure never retries: '+file,async()=>{
    const f=await adminFixture(file,{providerFailure:true});
    adminAssert.equal((await f.handler(f.request())).status,502);
    adminAssert.equal(f.counters.provider,1);
    await f.handler(f.request());
    adminAssert.equal(f.counters.provider,1);
  });
  adminTest('bounded admin concurrent duplicate keeps atomic claim: '+file,async()=>{
    const f=await adminFixture(file);
    const results=await Promise.all([f.handler(f.request()),f.handler(f.request())]);
    adminAssert.ok(results.some(r=>r.status===200));
    adminAssert.ok(results.every(r=>[200,409].includes(r.status)));
    adminAssert.equal(f.counters.provider,1);
    adminAssert.equal(f.counters.locks,1);
  });
  adminTest('bounded admin approval and exact job remain required: '+file,async()=>{
    const denied=await adminFixture(file,{approval:{approved:false}});
    adminAssert.equal((await denied.handler(denied.request({allowPaid:true,approved:true}))).status,403);
    adminAssert.equal(denied.counters.provider,0);
    adminAssert.equal(denied.counters.storage,0);
    const wrongJob=await adminFixture(file);
    adminAssert.equal((await wrongJob.handler(wrongJob.request({jobId:'unapproved-job'}))).status,404);
    adminAssert.equal(wrongJob.counters.provider,0);
    adminAssert.equal(wrongJob.counters.storage,0);
  });
}
for(const file of adminFiles.filter(f=>/model-qa|in-garden-vision-qa/.test(f))) {
  adminTest('bounded QA existing reserve cap rejects before lock/provider: '+file,async()=>{
    const f=await adminFixture(file,{approval:{maxSpendUsd:0.005,perCallReserveUsd:0.01}});
    const r=await f.handler(f.request());
    adminAssert.equal(r.status,409);
    adminAssert.match((await r.json()).code,/SPEND_CAP_REACHED/);
    adminAssert.equal(f.counters.provider,0);
    adminAssert.equal(f.counters.locks,0);
  });
}

// Enabled Natural Blend regression tests run the actual handler with isolated local mocks.
import blendTest from 'node:test';
import blendAssert from 'node:assert/strict';
import blendFs from 'node:fs';
import blendPath from 'node:path';
import { fileURLToPath as blendFileURLToPath } from 'node:url';
import blendVm from 'node:vm';
import blendCrypto from 'node:crypto';

const blendRoot = blendPath.resolve(blendPath.dirname(blendFileURLToPath(import.meta.url)), '..');
const blendHandlerSource = blendFs.readFileSync(blendPath.join(blendRoot, 'netlify/functions/garden-design-natural-blend.mjs'), 'utf8');
const blendGuardSource = blendFs.readFileSync(blendPath.join(blendRoot, 'modules/runtime-guards/paid-plant-identifier-gate-v1.js'), 'utf8');
const blendUserId = '11111111-1111-4111-8111-111111111111';
const blendGardenId = '22222222-2222-4222-8222-222222222222';
const blendDesignId = '33333333-3333-4333-8333-333333333333';
const blendPng = Buffer.alloc(24);
blendPng.set([0x89, 0x50, 0x4e, 0x47]);
blendPng.writeUInt32BE(1024, 16);
blendPng.writeUInt32BE(1024, 20);

async function blendRun(options = {}) {
  const counts = { auth: 0, reads: 0, registry: 0, reference: 0, consume: 0, refund: 0, provider: 0, writes: 0, storage: 0, costs: 0, envReads: 0, bodyReads: 0 };
  const events = [];
  const calls = [];
  let outputReads = 0;
  const placement = {
    id: 'placement-0001', garden_design_id: blendDesignId, garden_profile_id: blendGardenId,
    user_id: blendUserId, client_instance_id: 'placement-instance-0001', canonical_slug: 'rosa-canina',
    design_asset_id: 'rose-approved-asset', x: 0.5, y: 0.6, scale: 1, rotation: 0,
    metadata: { autoBlendV3: { enabled: true, version: 'garden-design-auto-blend-v3' } }
  };
  const design = { id: blendDesignId, garden_profile_id: blendGardenId, user_id: blendUserId, source_media_id: 'source-media-0001' };
  const previous = { id: 'existing-media-0001', garden_profile_id: blendGardenId, validation_state: 'validated' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    calls.push({ url: url.href, method, init });
    if (url.origin === 'https://database.invalid') {
      blendAssert.equal(init.headers.authorization, 'Bearer offline-user-token', 'all RLS operations use authenticated user token');
      blendAssert.equal(init.headers.apikey, 'offline-anon-key', 'no service-role bypass');
      if (url.pathname === '/auth/v1/user') {
        counts.auth++;
        return options.authInvalid ? json({ message: 'invalid' }, 401) : json({ id: blendUserId });
      }
      if (method === 'GET') {
        counts.reads++;
        if (url.pathname === '/rest/v1/garden_design_placements') {
          blendAssert.equal(url.searchParams.get('garden_design_id'), 'eq.' + blendDesignId);
          blendAssert.equal(url.searchParams.get('client_instance_id'), 'eq.placement-instance-0001');
          return json(options.placementDenied ? [] : [placement]);
        }
        if (url.pathname === '/rest/v1/garden_designs') {
          return json(options.designDenied ? [] : [{ ...design, ...(options.designOverrides || {}) }]);
        }
        if (url.pathname === '/rest/v1/garden_media') {
          outputReads++;
          blendAssert.equal(url.searchParams.get('garden_profile_id'), 'eq.' + blendGardenId);
          blendAssert.equal(url.searchParams.get('client_instance_id'), 'eq.offline-action-0001');
          return json(options.previous || (options.previousOnSecondRead && outputReads > 1) ? [previous] : []);
        }
        if (url.pathname === '/rest/v1/premium_action_entitlements') {
          blendAssert.equal(url.searchParams.get('user_id'), 'eq.' + blendUserId, 'client user ID cannot select entitlement');
          return json(options.noEntitlement ? [] : [{ natural_blend_enabled: true, natural_blend_remaining: 2, ...(options.entitlement || {}) }]);
        }
      }
      if (url.pathname === '/rest/v1/rpc/consume_premium_action') {
        counts.consume++; events.push('consume');
        blendAssert.deepEqual(JSON.parse(init.body), { p_feature: 'natural_blend', p_idempotency_key: 'offline-action-0001' });
        return json(options.consumeResult || { ok: true, code: 'CONSUMED', remaining: 1 });
      }
      if (url.pathname === '/rest/v1/rpc/refund_premium_action') {
        counts.refund++; events.push('refund');
        blendAssert.deepEqual(JSON.parse(init.body), { p_feature: 'natural_blend', p_consume_idempotency_key: 'offline-action-0001', p_refund_idempotency_key: 'refund:offline-action-0001' });
        return json({ ok: true, remaining: 2 });
      }
      if (url.pathname === '/rest/v1/garden_media') {
        counts.writes++; events.push('media:' + method);
        if (method === 'DELETE') return json({});
        if (method === 'POST') {
          const row = JSON.parse(init.body);
          blendAssert.equal(row.user_id, blendUserId);
          blendAssert.equal(row.purpose, 'design_output');
          blendAssert.equal(row.validation_state, 'pending');
          return json([{ id: row.id, storage_path: row.storage_path, validation_state: 'pending' }]);
        }
        if (method === 'PATCH') {
          blendAssert.equal(JSON.parse(init.body).validation_state, 'validated');
          return json([{ id: 'media-0001', validation_state: 'validated' }]);
        }
      }
      if (url.pathname.startsWith('/storage/v1/object/')) {
        counts.storage++; events.push('storage:' + method);
        blendAssert.ok(url.pathname.startsWith('/storage/v1/object/user-garden-media'), 'only private user-media storage');
        if (method === 'POST' && options.storageFailure) return new Response('simulated-storage-failure', { status: 500 });
        return json({});
      }
      if (url.pathname === '/rest/v1/runtime_cost_events') {
        counts.costs++; events.push('cost');
        return json({});
      }
    }
    if (url.origin === 'https://app.invalid') {
      if (url.pathname.endsWith('/design-asset-registry-v1.json')) {
        counts.registry++;
        return json({ sets: [{ variants: [{ assetId: placement.design_asset_id, productionApproved: true, url: '/approved-reference.png' }] }] });
      }
      if (url.pathname === '/approved-reference.png') { counts.reference++; return new Response(blendPng); }
    }
    if (url.href === 'https://api.openai.com/v1/images/edits') {
      counts.provider++; events.push('provider');
      blendAssert.ok(counts.provider <= 1, 'no second provider dispatch');
      blendAssert.equal(counts.consume, 1, 'consume precedes provider');
      blendAssert.equal(init.headers.authorization, 'Bearer offline-openai-key');
      blendAssert.equal(init.body.get('model'), 'gpt-image-2.5-sunburst-2026-09-08');
      blendAssert.equal(init.body.get('n'), '1');
      blendAssert.equal(init.body.get('quality'), 'medium');
      blendAssert.equal(init.body.get('size'), '1024x1024');
      blendAssert.equal(init.body.getAll('image[]').length, 2);
      blendAssert.ok(!String(init.body.get('prompt')).includes('hostile client prompt'));
      if (options.providerFailure === 'reject') throw new Error('mock network failure');
      if (options.providerFailure === 'timeout') { const error = new Error('mock timeout'); error.name = 'AbortError'; throw error; }
      if (options.providerFailure === 'malformed') return new Response('{malformed', { status: 200 });
      if (options.providerFailure === 'http') return json({ error: { message: 'simulated provider failure' } }, 500);
      return json({ data: options.outputMissing ? [] : [{ b64_json: blendPng.toString('base64') }], usage: { input_tokens: 2, input_tokens_details: { image_tokens: 1, text_tokens: 1 }, output_tokens: 1, output_tokens_details: { image_tokens: 1 } } });
    }
    throw new Error('Unexpected mocked fetch route: ' + method + ' ' + url.href);
  };
  const serverEnv = { CRUVIT_ALLOW_PAID_NATURAL_BLEND: 'true', ...(options.serverEnv || {}) };
  const runtimeEnv = { SUPABASE_URL: 'https://database.invalid', SUPABASE_ANON_KEY: 'offline-anon-key', OPENAI_KEY: 'offline-openai-key' };
  const context = blendVm.createContext({
    process: { env: serverEnv }, Buffer, URL, Response, FormData, Blob, crypto: blendCrypto,
    fetch: fetchMock,
    Netlify: { env: { get(name) { counts.envReads++; return runtimeEnv[name] || ''; } } }
  });
  blendVm.runInContext(blendGuardSource.replace(/^export\s+/gm, ''), context);
  blendVm.runInContext(blendHandlerSource.replace(/^import[^\n]*\n/gm, '').replace('export default async(req)=>', 'globalThis.blendHandler=async(req)=>').replace('export const config=', 'const config='), context);
  const body = {
    idempotencyKey: 'offline-action-0001', gardenDesignId: blendDesignId,
    placementClientInstanceId: 'placement-instance-0001', cropBase64: blendPng.toString('base64'), maskBase64: blendPng.toString('base64'),
    placementFingerprint: { x: 0.5, y: 0.6, scale: 1, rotation: 0, designAssetId: placement.design_asset_id },
    userId: 'hostile-user-id', prompt: 'hostile client prompt', model: 'hostile-client-model', ...(options.body || {})
  };
  const req = {
    method: 'POST', url: 'https://app.invalid/api/garden-design/natural-blend',
    headers: new Headers(options.noToken ? {} : { authorization: 'Bearer offline-user-token' }),
    async json() { counts.bodyReads++; return body; }
  };
  const response = await context.blendHandler(req);
  return { response, result: await response.json(), counts, events, calls };
}

blendTest('Natural Blend explicit offline authority preserves auth, RLS ownership and exact saved placement checks', async () => {
  for (const [options, status, code] of [
    [{ noToken: true }, 401, 'AUTH_REQUIRED'],
    [{ authInvalid: true }, 401, 'AUTH_INVALID'],
    [{ placementDenied: true }, 404, 'OWNED_PLACEMENT_NOT_FOUND'],
    [{ designDenied: true }, 404, 'OWNED_DESIGN_NOT_FOUND'],
    [{ designOverrides: { garden_profile_id: 'other-garden' } }, 404, 'OWNED_DESIGN_NOT_FOUND'],
    [{ designOverrides: { source_media_id: null } }, 409, 'SAVED_GARDEN_SOURCE_REQUIRED'],
    [{ body: { placementFingerprint: { x: 99 } } }, 409, 'PLACEMENT_CHANGED_REBUILD_BLEND']
  ]) {
    const x = await blendRun(options);
    blendAssert.equal(x.response.status, status);
    blendAssert.equal(x.result.code, code);
    blendAssert.equal(x.counts.consume, 0);
    blendAssert.equal(x.counts.provider, 0);
    blendAssert.equal(x.counts.writes, 0);
    if (options.noToken) blendAssert.equal(x.counts.auth, 0);
  }
});

blendTest('Natural Blend explicit offline authority preserves server entitlement rejection before consume/provider', async () => {
  for (const [options, code] of [
    [{ noEntitlement: true }, 'NOT_ENTITLED'],
    [{ entitlement: { natural_blend_enabled: false } }, 'FEATURE_DISABLED'],
    [{ entitlement: { natural_blend_remaining: 0 } }, 'QUOTA_EXHAUSTED'],
    [{ consumeResult: { ok: false, code: 'QUOTA_EXHAUSTED' } }, 'QUOTA_EXHAUSTED']
  ]) {
    const x = await blendRun(options);
    blendAssert.equal(x.response.status, 403);
    blendAssert.equal(x.result.code, code);
    blendAssert.equal(x.counts.consume, options.consumeResult ? 1 : 0);
    blendAssert.equal(x.counts.provider, 0);
    blendAssert.equal(x.counts.writes, 0);
  }
});

blendTest('Natural Blend idempotency paths never dispatch another provider call or charge again', async () => {
  for (const options of [
    { previous: true },
    { consumeResult: { ok: true, code: 'ALREADY_CONSUMED', remaining: 1 } },
    { consumeResult: { ok: true, code: 'ALREADY_CONSUMED', remaining: 1 }, previousOnSecondRead: true }
  ]) {
    const x = await blendRun(options);
    blendAssert.equal(x.response.status, options.previous || options.previousOnSecondRead ? 200 : 409);
    blendAssert.equal(x.result.code, options.previous || options.previousOnSecondRead ? 'NATURAL_BLEND_ALREADY_COMPLETED' : 'NATURAL_BLEND_IN_PROGRESS');
    blendAssert.equal(x.result.chargedAgain, false);
    blendAssert.equal(x.result.providerCalls, 0);
    blendAssert.equal(x.counts.consume, options.previous ? 0 : 1);
    blendAssert.equal(x.counts.provider, 0);
    blendAssert.equal(x.counts.writes, 0);
    blendAssert.equal(x.counts.refund, 0);
  }
});

blendTest('Natural Blend success preserves one consume, one fixed provider operation and private validated output', async () => {
  const x = await blendRun();
  blendAssert.equal(x.response.status, 200);
  blendAssert.equal(x.result.code, 'NATURAL_BLEND_COMPLETED');
  blendAssert.equal(x.counts.consume, 1);
  blendAssert.equal(x.counts.provider, 1);
  blendAssert.equal(x.counts.refund, 0);
  blendAssert.equal(x.counts.writes, 2);
  blendAssert.equal(x.counts.storage, 1);
  blendAssert.equal(x.counts.costs, 1);
  blendAssert.equal(x.result.providerCalls, 1);
  blendAssert.equal(x.result.media.validationState, 'validated');
  blendAssert.equal(x.result.globalPlantAssetMutation, false);
  blendAssert.deepEqual(x.events, ['consume', 'provider', 'media:POST', 'storage:POST', 'media:PATCH', 'cost']);
});

blendTest('Natural Blend provider HTTP/rejection/timeout/malformed failures refund once without retry', async () => {
  for (const providerFailure of ['http', 'reject', 'timeout', 'malformed']) {
    const x = await blendRun({ providerFailure });
    blendAssert.equal(x.response.status, 502);
    blendAssert.equal(x.result.code, 'NATURAL_BLEND_PROVIDER_FAILURE');
    blendAssert.equal(x.counts.consume, 1);
    blendAssert.equal(x.counts.provider, 1);
    blendAssert.equal(x.counts.refund, 1);
    blendAssert.equal(x.counts.writes, 0);
    blendAssert.deepEqual(x.events, ['consume', 'provider', 'refund', 'cost']);
  }
});

blendTest('Natural Blend missing-output and persistence-failure paths preserve refund/cleanup and no second provider call', async () => {
  for (const options of [{ outputMissing: true }, { storageFailure: true }]) {
    const x = await blendRun(options);
    blendAssert.equal(x.response.status, options.outputMissing ? 502 : 500);
    blendAssert.equal(x.result.code, options.outputMissing ? 'NATURAL_BLEND_OUTPUT_MISSING' : 'NATURAL_BLEND_OUTPUT_PERSIST_FAILED');
    blendAssert.equal(x.counts.provider, 1);
    blendAssert.equal(x.counts.consume, 1);
    blendAssert.equal(x.counts.refund, 1);
    if (options.storageFailure) {
      blendAssert.deepEqual(x.events, ['consume', 'provider', 'media:POST', 'storage:POST', 'storage:DELETE', 'media:DELETE', 'refund', 'cost']);
    }
  }
});
