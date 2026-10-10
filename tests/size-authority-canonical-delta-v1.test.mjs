import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SourceTextModule,createContext} from 'node:vm';
import {CONTRACT,GENESIS,sha256,fingerprint,sortedJson,canonicalBytes,parseProfile,toolIdentity,inspectGenesis,inspectRegistry,verifyIsolation,syntheticHarness,prepareDelta,verifyDelta,verifyChain,validateScratchPaths,runScratch} from '../tools/size-authority/canonical-delta-v1.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tool=path.join(root,'tools/size-authority/canonical-delta-v1.mjs');
const canonicalPath=path.join(root,'data/catalog/botanical-size-authority-v1.json');
const currentCanonicalBefore=fs.readFileSync(canonicalPath), currentRegistry=parseProfile(currentCanonicalBefore);
// Genesis is immutable history, not whichever canonical is currently tracked.
// Fail closed on missing local history; never fetch or fall back to current.
const realBytes=cp.execFileSync('git',['cat-file','blob','92cb4282970a6aac75e0ab88d13b2a110bbd393d:data/catalog/botanical-size-authority-v1.json'],{
  cwd:root,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}
});
assert.equal(sha256(realBytes),'86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b');
const P='RUNTIME_AUTHORITY_', states=['READY','PARTIAL','USER_CONTEXT_REQUIRED','CONFLICT_HOLD','EVIDENCE_GAP'].map(s=>P+s);
const revision='1'.repeat(40), evidencePath='data/synthetic-evidence.json';
const clone=structuredClone;
const accounting=records=>Object.fromEntries([...states.map(s=>[s,records.filter(r=>r.runtimeAuthority===s).length]),['TOTAL',records.length]]);
function fixture({invalid=true,edit=()=>{},count=3,extraLookups=0}={}){
  const records=Array.from({length:count},(_,i)=>['alpha','beta','gamma'][i]??'fixture-'+i).map((name,i)=>({botanicalTaxonId:'synthetic:'+name,canonicalSlugAliases:[name],scientificName:'Synthetic '+name,growthStage:'mature',runtimeAuthority:P+'PARTIAL',defaultPreviewScenario:'LANDSCAPE_MATURE',selectedHeightEvidenceRef:'evidence-'+name,selectedSpreadEvidenceRef:null,selectedSource:null,normalizedRange:{heightM:i===0&&invalid?{min:null,max:null}:{min:2,max:4},spreadM:null},partialAnchor:'HEIGHT_ANCHORED_ESTIMATE',HEIGHT_SCALE_READY:true,SPREAD_SCALE_READY:false,spreadSourceSupported:false,provenanceEvidenceIds:['evidence-'+name],sensitivity:{notFinalPersonalGardenSize:false},runtimeWired:false}));
  const registry={contract:'botanical-size-authority-v1',authorityVersion:'botanical-size-authority-v1',runtimeWired:false,immutableFromUserActions:true,universalDefaultPreviewScenario:null,mergeCanonicalSlugsNow:false,records,slugToBotanicalTaxonId:Object.fromEntries(records.map(r=>[r.canonicalSlugAliases[0],r.botanicalTaxonId])),expectedAccounting:accounting(records)};
  for(let i=0;i<extraLookups;i++){const slug='extra-alias-'+i;records[i].canonicalSlugAliases.push(slug);registry.slugToBotanicalTaxonId[slug]=records[i].botanicalTaxonId;}
  edit(registry);
  const evidence={records:records.map(r=>({recordId:r.selectedHeightEvidenceRef,botanicalTaxonId:r.botanicalTaxonId,growthStage:'mature',conditions:'separate synthetic mature contexts',heightMinM:2,heightMaxM:4,sourceUrl:'https://evidence.invalid/'+r.canonicalSlugAliases[0]}))};
  const bytes=canonicalBytes(registry), sourceBytes=canonicalBytes(evidence), sources=new Map([[revision+':'+evidencePath,sourceBytes]]), harness=syntheticHarness(bytes,sources);
  return {registry,bytes,evidence,sourceBytes,sources,harness};
}
function draft(f,{input=f.bytes,id='delta-one',target='synthetic:alpha',link=null}={}){
  const registry=parseProfile(input),r=registry.records.find(r=>r.botanicalTaxonId===target),i=f.evidence.records.findIndex(e=>e.botanicalTaxonId===target);
  const values={'/runtimeAuthority':P+'USER_CONTEXT_REQUIRED','/defaultPreviewScenario':null,'/selectedHeightEvidenceRef':null,'/selectedSpreadEvidenceRef':null,'/selectedSource':null,'/normalizedRange':null,'/partialAnchor':null,'/HEIGHT_SCALE_READY':false,'/SPREAD_SCALE_READY':false,'/spreadSourceSupported':false,'/sensitivity/notFinalPersonalGardenSize':true};
  const get=(v,p)=>p.slice(1).split('/').reduce((a,k)=>a[k],v);
  const replacements=Object.entries(values).filter(([p,v])=>get(r,p)!==undefined&&sortedJson(get(r,p))!==sortedJson(v)).map(([p,v])=>({path:p,before:{present:true,value:get(r,p)},after:{present:true,value:v}}));
  const fields=replacements.map(o=>o.path), meta=[r.runtimeAuthority,P+'USER_CONTEXT_REQUIRED'].map((state,i)=>({path:'/expectedAccounting/'+state,before:{present:true,value:registry.expectedAccounting[state]},after:{present:true,value:registry.expectedAccounting[state]+(i===0?-1:1)}}));
  const decisionText='Synthetic fixture decision; no authority to mutate real canonical data.';
  return {contract:CONTRACT,schemaVersion:1,deltaId:id,genesis:clone(f.harness.genesis),parent:{canonicalSha256:sha256(input),acceptedDelta:link},profile:{recordFingerprint:'sorted-json-v1',canonicalBytes:'json-pretty-2-lf-preserve-order-v1'},scope:{taxa:[target],recordFields:{[target]:fields},lookupKeys:[],metadataFields:meta.map(o=>o.path),recordOrderChange:false},records:[{botanicalTaxonId:target,beforeRecordSha256:fingerprint(r),afterRecordSha256:null,replacements}],lookups:[],metadata:meta,result:{canonicalSha256:null,recordCount:registry.records.length,lookupCount:Object.keys(registry.slugToBotanicalTaxonId).length},provenance:{sourceEvidence:[{refId:f.evidence.records[i].recordId,artifact:{repoPath:evidencePath,revision,sha256:sha256(f.sourceBytes)},entryPointer:'/records/'+i,entrySha256:fingerprint(f.evidence.records[i]),taxon:target,dimension:'height',context:f.evidence.records[i].conditions}],decision:{gateId:'synthetic-review',ownerApprovalId:'synthetic-owner-record',supervisorApprovalId:'synthetic-supervisor-record',record:{reference:'synthetic://review/one',text:decisionText,sha256:sha256(decisionText)}},rule:toolIdentity(),reason:'Synthetic demotion with contextual source evidence preserved.',valueStatus:{height:'context-required',spread:'unknown'}}};
}
const prepare=(f,m,input=f.bytes,chain=[],tip=null)=>f.harness.prepare({inputBytes:input,manifestBytes:canonicalBytes(m),chain,acceptedTipReceiptSha256:tip});
function sealed(f,m,input=f.bytes,chain=[],tip=null){
  const prepared=prepare(f,m,input,chain,tip), manifest=clone(m);
  manifest.result.canonicalSha256=prepared.receipt.afterCanonicalSha256;
  manifest.records.forEach(r=>r.afterRecordSha256=prepared.receipt.records.find(x=>x.botanicalTaxonId===r.botanicalTaxonId).afterRecordSha256);
  const manifestBytes=canonicalBytes(manifest);
  const verified=f.harness.verify({inputBytes:input,manifestBytes,chain,acceptedTipReceiptSha256:tip,expectedManifestSha256:sha256(manifestBytes)});
  return {manifest,manifestBytes,...verified,chainRow:{manifestBytes,receiptBytes:verified.receiptBytes},link:{id:manifest.deltaId,manifestSha256:sha256(manifestBytes),receiptSha256:sha256(verified.receiptBytes)}};
}
function chainFixture(){
  const f=fixture(), first=sealed(f,draft(f)), secondDraft=draft(f,{input:first.outputBytes,id:'delta-two',target:'synthetic:beta',link:first.link});
  const second=sealed(f,secondDraft,first.outputBytes,[first.chainRow],first.link.receiptSha256);
  return {f,first,second,secondDraft};
}

test('exact real genesis is pinned integrity with one known defect, never semantic approval',()=>{
  const result=inspectGenesis(realBytes);assert.equal(result.status,'GENESIS_INTEGRITY_ACCEPTED_WITH_KNOWN_DEFECT');assert.equal(result.semantic.ok,false);assert.equal(result.semantic.recordCount,117);assert.equal(result.semantic.lookupCount,119);assert.deepEqual(result.semantic.errors,[{code:'INVALID_RUNTIME_HEIGHT',taxon:'taxon:plinia-cauliflora'}]);
  assert.throws(()=>inspectGenesis(Buffer.concat([realBytes,Buffer.from('\n')])),/GENESIS_SHA/);
  assert.deepEqual(verifyChain({chain:[],acceptedTipReceiptSha256:null}),{canonicalSha256:GENESIS.canonicalSha256,acceptedDelta:null,deltaCount:0});
});
test('real APIs reject synthetic genesis and never produce a real repaired registry',()=>{
  const f=fixture(),m=draft(f);assert.throws(()=>prepareDelta({inputBytes:f.bytes,manifestBytes:canonicalBytes(m)}),/INPUT_NOT_ACCEPTED_CHAIN_TIP/);
  assert.throws(()=>syntheticHarness(realBytes,new Map()),/SYNTHETIC_TAXA_ONLY/);
  assert.throws(()=>verifyDelta({inputBytes:realBytes,manifestBytes:canonicalBytes(m)}),/REVIEWED_MANIFEST_SHA_REQUIRED/);
});

test('qualified scratch B passes forward semantics but never becomes genesis',()=>{
  const manifestBytes=fs.readFileSync(path.join(root,'config/size-authority/canonical-deltas/000001-jaboticaba-context-state-v1.json'));
  const result=verifyDelta({inputBytes:realBytes,manifestBytes,expectedManifestSha256:'3e7e109af3758db5e0dcd14635a3141f557c63b97fa8f446496b767af0725810'});
  assert.equal(sha256(result.receiptBytes),'10e969fbcc1cfde3b920b45bf3249f9d0104367247c74bf0a4e42e9e3ecb0d27');
  assert.equal(sha256(result.outputBytes),'e59a63abad28a269e2ac9e1c12e72a0eb12b680cd89222c586bdf9f63c5864b6');
  const inspection=inspectRegistry(parseProfile(result.outputBytes));
  assert.equal(inspection.ok,true);assert.deepEqual(inspection.errors,[]);
  assert.equal(inspection.recordCount,117);assert.equal(inspection.lookupCount,119);
  assert.deepEqual(inspection.accounting,{RUNTIME_AUTHORITY_READY:79,RUNTIME_AUTHORITY_PARTIAL:15,RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED:17,RUNTIME_AUTHORITY_CONFLICT_HOLD:2,RUNTIME_AUTHORITY_EVIDENCE_GAP:4,TOTAL:117});
  assert.throws(()=>inspectGenesis(result.outputBytes),/GENESIS_SHA/);
  assert.ok(fs.readFileSync(canonicalPath).equals(currentCanonicalBefore));
});
test('equivalent synthetic invalid claim removed by demotion; exact unrelated bytes preserved',()=>{
  const f=fixture(),m=draft(f),before=canonicalBytes(m),r=prepare(f,m),next=parseProfile(r.outputBytes);
  assert.equal(inspectRegistry(f.registry).ok,false);assert.equal(r.receipt.semantic.ok,true);assert.equal(next.records[0].normalizedRange,null);assert.equal(next.records[0].HEIGHT_SCALE_READY,false);
  assert.deepEqual(next.records.slice(1),f.registry.records.slice(1));assert.deepEqual(next.slugToBotanicalTaxonId,f.registry.slugToBotanicalTaxonId);
  assert.deepEqual(r.receipt.diff.changedTaxa,['synthetic:alpha']);assert.equal(r.receipt.diff.unexpectedDeltaCount,0);assert.equal(r.receipt.diff.unchangedRecords,2);
  assert.ok(before.equals(canonicalBytes(m)));assert.equal(m.result.canonicalSha256,null);assert.equal(r.receipt.status,'DRAFT_NOT_AUTHORIZED');assert.equal(r.receipt.synthetic,true);
});
test('different first synthetic delta leaving equivalent genesis defect active is blocked',()=>{
  const f=fixture();assert.throws(()=>prepare(f,draft(f,{target:'synthetic:beta'})),/POST_GENESIS_SEMANTIC_FAILURE.*INVALID_RUNTIME_HEIGHT/);
});
test('preparation and sealed verification are independently deterministic',()=>{
  const f=fixture(),m=draft(f),a=prepare(f,m),b=prepare(f,m);assert.deepEqual(a,b);
  const x=sealed(f,m),y=sealed(f,m);assert.deepEqual(x,y);assert.equal(x.receipt.status,'SEALED_SCRATCH_VERIFIED');assert.equal(x.receipt.canonicalWritePerformed,false);assert.equal(x.receipt.executionAuthorization,'EXTERNAL_OWNER_SUPERVISOR_REQUIRED');
});
test('117 synthetic records preserve all 116 non-target serializations and all 119 lookups',()=>{
  const f=fixture({count:117,extraLookups:2}),r=sealed(f,draft(f)),after=parseProfile(r.outputBytes);
  assert.equal(r.receipt.diff.unchangedRecords,116);assert.equal(r.receipt.semantic.lookupCount,119);
  for(let i=1;i<117;i++){assert.ok(canonicalBytes(after.records[i]).equals(canonicalBytes(f.registry.records[i])));assert.equal(fingerprint(after.records[i]),fingerprint(f.registry.records[i]));}
  assert.ok(canonicalBytes(after.slugToBotanicalTaxonId).equals(canonicalBytes(f.registry.slugToBotanicalTaxonId)));assert.equal(r.receipt.diff.unexpectedDeltaCount,0);
});
test('two independently valid sibling deltas cannot be supplied as a linear accepted chain',()=>{
  const f=fixture({invalid:false}),a=sealed(f,draft(f)),b=sealed(f,draft(f,{id:'other-child',target:'synthetic:beta'}));
  assert.throws(()=>f.harness.replay([a.chainRow,b.chainRow],b.link.receiptSha256),/PARENT_SHA_MISMATCH/);
});
test('valid A -> B -> C chain replays exact hashes with explicit accepted tip',()=>{
  const {f,first,second}=chainFixture();const r=f.harness.replay([first.chainRow,second.chainRow],second.link.receiptSha256);assert.ok(r.bytes.equals(second.outputBytes));assert.equal(r.ids.size,2);
  assert.throws(()=>f.harness.replay([first.chainRow],null),/ACCEPTED_TIP_REQUIRED/);
  assert.throws(()=>f.harness.replay([first.chainRow],sha256('wrong')),/ACCEPTED_TIP_MISMATCH/);
});
test('B-bound delta refuses A and C; stale parent cannot rebase',()=>{
  const {f,first,second,secondDraft}=chainFixture();
  for(const input of [f.bytes,second.outputBytes])assert.throws(()=>prepare(f,secondDraft,input,[first.chainRow],first.link.receiptSha256),/INPUT_NOT_ACCEPTED_CHAIN_TIP/);
  const stale=clone(secondDraft);stale.parent.canonicalSha256=sha256(f.bytes);assert.throws(()=>prepare(f,stale,first.outputBytes,[first.chainRow],first.link.receiptSha256),/PARENT_SHA_MISMATCH/);
});
test('fork, gap, reversed and cyclic supplied chains refuse',()=>{
  const {f,first,second}=chainFixture();
  for(const chain of [[second.chainRow],[second.chainRow,first.chainRow],[first.chainRow,first.chainRow],[first.chainRow,second.chainRow,first.chainRow]])assert.throws(()=>f.harness.replay(chain,first.link.receiptSha256));
  const fork=clone(second.manifest);fork.parent.acceptedDelta.receiptSha256=sha256('fork');assert.throws(()=>prepare(f,fork,first.outputBytes,[first.chainRow],first.link.receiptSha256),/PARENT_LINK_MISMATCH/);
});
test('duplicate delta IDs and self/prior cycles refuse',()=>{
  const {f,first,secondDraft}=chainFixture();secondDraft.deltaId=first.manifest.deltaId;assert.throws(()=>prepare(f,secondDraft,first.outputBytes,[first.chainRow],first.link.receiptSha256),/DUPLICATE_DELTA_ID/);
  secondDraft.deltaId='self';secondDraft.parent.acceptedDelta.id='self';assert.throws(()=>prepare(f,secondDraft,first.outputBytes,[first.chainRow],first.link.receiptSha256),/PARENT_LINK_MISMATCH/);
});
test('altered prior manifest and prior receipt refuse, even after recomputing tip hash',()=>{
  const {f,first,secondDraft}=chainFixture();
  const altered=clone(first.manifest);altered.provenance.reason+=' altered';
  assert.throws(()=>prepare(f,secondDraft,first.outputBytes,[{manifestBytes:canonicalBytes(altered),receiptBytes:first.receiptBytes}],first.link.receiptSha256),/PRIOR_RECEIPT_MISMATCH/);
  const receipt=clone(first.receipt);receipt.diff.unexpectedDeltaCount=1;const receiptBytes=canonicalBytes(receipt);
  assert.throws(()=>f.harness.replay([{manifestBytes:first.manifestBytes,receiptBytes}],sha256(receiptBytes)),/PRIOR_RECEIPT_MISMATCH/);
});

const badManifests=[
  ['unknown manifest key',m=>m.promote=true,/MANIFEST_SCHEMA/],
  ['unresolved placeholder',m=>m.deltaId='<future-id>',/DELTA_ID/],
  ['wrong version',m=>m.schemaVersion=2,/CONTRACT_VERSION/],
  ['wrong genesis identity',m=>m.genesis.canonicalSha256=sha256('other'),/GENESIS_IDENTITY/],
  ['null parent only genesis',m=>m.parent.canonicalSha256=sha256('not genesis'),/NULL_PARENT_ONLY_GENESIS/],
  ['missing target',m=>{m.scope.taxa=['synthetic:absent'];m.scope.recordFields={'synthetic:absent':m.records[0].replacements.map(r=>r.path)};m.records[0].botanicalTaxonId='synthetic:absent';m.provenance.sourceEvidence[0].taxon='synthetic:absent';},/TARGET_NOT_FOUND/],
  ['duplicate target',m=>m.scope.taxa.push(m.scope.taxa[0]),/DUPLICATE_TARGET/],
  ['wrong before fingerprint',m=>m.records[0].beforeRecordSha256=sha256('wrong'),/BEFORE_FINGERPRINT_MISMATCH/],
  ['wrong typed before value',m=>m.records[0].replacements[0].before.value='wrong',/BEFORE_VALUE_MISMATCH/],
  ['missing versus null',m=>m.records[0].replacements[1].before.present=false,/EXISTING_FIELDS_ONLY/],
  ['type mismatch',m=>m.records[0].replacements.find(r=>r.path==='/HEIGHT_SCALE_READY').before.value=1,/BEFORE_VALUE_MISMATCH/],
  ['duplicate paths',m=>m.records[0].replacements.push(clone(m.records[0].replacements[0])),/DUPLICATE_PATH/],
  ['overlapping ancestor path',m=>m.records[0].replacements.push({path:'/sensitivity',before:{present:true,value:{}},after:{present:true,value:{x:1}}}),/UNAUTHORIZED_PATH|OVERLAPPING_PATHS/],
  ['no-op',m=>m.records[0].replacements[0].after.value=m.records[0].replacements[0].before.value,/NO_OP/],
  ['unauthorized alias path',m=>m.records[0].replacements[0].path='/canonicalSlugAliases',/UNAUTHORIZED_PATH/],
  ['lookup mutation',m=>m.lookups.push({slug:'extra'}),/LOOKUP_FORBIDDEN/],
  ['record-order mutation',m=>m.scope.recordOrderChange=true,/ORDER_FORBIDDEN/],
  ['wrong count',m=>m.result.recordCount=117,/RESULT_COUNTS/],
  ['accounting mismatch',m=>m.metadata[0].after.value=0,/POST_GENESIS_SEMANTIC_FAILURE.*ACCOUNTING/],
  ['broad metadata',m=>m.metadata[0].path='/runtimeWired',/UNAUTHORIZED_PATH/],
  ['result hash mismatch',m=>m.result.canonicalSha256=sha256('wrong'),/RESULT_HASH_MISMATCH/],
  ['after record hash mismatch',m=>m.records[0].afterRecordSha256=sha256('wrong'),/AFTER_FINGERPRINT_MISMATCH/],
  ['evidence hash mismatch',m=>m.provenance.sourceEvidence[0].artifact.sha256=sha256('wrong'),/EVIDENCE_HASH_MISMATCH/],
  ['evidence entry hash mismatch',m=>m.provenance.sourceEvidence[0].entrySha256=sha256('wrong'),/ENTRY_HASH_MISMATCH/],
  ['evidence context mismatch',m=>m.provenance.sourceEvidence[0].context='wrong context',/EVIDENCE_CONTEXT_MISMATCH/],
  ['evidence taxon mismatch',m=>{m.provenance.sourceEvidence[0].entryPointer='/records/1';},/ENTRY_HASH_MISMATCH/],
  ['evidence revision absent',m=>m.provenance.sourceEvidence[0].artifact.revision='2'.repeat(40),/SYNTHETIC_EVIDENCE_MISSING/],
  ['evidence path escape',m=>m.provenance.sourceEvidence[0].artifact.repoPath='../secrets',/UNSAFE_REPO_PATH/],
  ['missing approval',m=>delete m.provenance.decision.ownerApprovalId,/DECISION_SCHEMA/],
  ['forged decision digest',m=>m.provenance.decision.record.text+=' forged',/DECISION_HASH_MISMATCH/],
  ['missing bounded decision record',m=>delete m.provenance.decision.record.text,/DECISION_RECORD/],
  ['wrong engine',m=>m.provenance.rule.engineSha256=sha256('other'),/TOOL_RULE_VALIDATOR_IDENTITY/],
  ['wrong validator',m=>m.provenance.rule.rangeValidatorSourceSha256=sha256('other'),/TOOL_RULE_VALIDATOR_IDENTITY/],
  ['bad value status',m=>m.provenance.valueStatus.height='inferred',/VALUE_STATUS/],
  ['new selected meter range forbidden',m=>m.records[0].replacements.find(r=>r.path==='/normalizedRange').after.value={heightM:{min:6,max:9},spreadM:null},/DEMOTION_MUST_CLEAR_SELECTION/],
  ['selected ref not cleared',m=>m.records[0].replacements.find(r=>r.path==='/selectedHeightEvidenceRef').after.value='other-ref',/DEMOTION_MUST_CLEAR_SELECTION/],
  ['false runtime flag required on changed demotion',m=>m.records[0].replacements=m.records[0].replacements.filter(r=>r.path!=='/HEIGHT_SCALE_READY'),/RECORD_PATH_SCOPE/]
];
for(const [name,edit,pattern] of badManifests)test('manifest refuses '+name,()=>{const f=fixture(),m=draft(f);edit(m);assert.throws(()=>prepare(f,m),pattern);});

for(const p of ['/__proto__/x','/prototype/x','/constructor/x','/../runtimeAuthority','/*','/sensitivity/~2bad'])test('unsafe pointer '+p,()=>{const f=fixture(),m=draft(f);m.records[0].replacements[0].path=p;assert.throws(()=>prepare(f,m),/UNSAFE_POINTER|INVALID_POINTER/);});
test('sealed mode requires preexisting output and independently pinned manifest digests',()=>{
  const f=fixture(),m=draft(f),manifestBytes=canonicalBytes(m);
  assert.throws(()=>f.harness.verify({inputBytes:f.bytes,manifestBytes}),/REVIEWED_MANIFEST_SHA_REQUIRED/);
  assert.throws(()=>f.harness.verify({inputBytes:f.bytes,manifestBytes,expectedManifestSha256:sha256('other')}),/REVIEWED_MANIFEST_SHA_MISMATCH/);
  assert.throws(()=>f.harness.verify({inputBytes:f.bytes,manifestBytes,expectedManifestSha256:sha256(manifestBytes)}),/AFTER_FINGERPRINT/);
});
test('source taxon, dimension and growth-stage are verified from pinned entry contents',()=>{
  for(const [field,value,pattern] of [['botanicalTaxonId','synthetic:beta',/EVIDENCE_TAXON_MISMATCH/],['growthStage','juvenile',/EVIDENCE_STAGE_MISMATCH/]]){
    const f=fixture(),m=draft(f),entry=f.evidence.records[0];entry[field]=value;const source=canonicalBytes(f.evidence);f.sources.set(revision+':'+evidencePath,source);m.provenance.sourceEvidence[0].artifact.sha256=sha256(source);m.provenance.sourceEvidence[0].entrySha256=fingerprint(entry);assert.throws(()=>prepare(f,m),pattern);
  }
  const f=fixture(),m=draft(f);m.provenance.sourceEvidence[0].dimension='spread';assert.throws(()=>prepare(f,m),/EVIDENCE_DIMENSION_MISMATCH/);
});
test('touching unresolved inherited provenance blocks even a privilege-reducing demotion',()=>{
  const f=fixture({edit:r=>r.records[0].provenanceEvidenceIds=['https://unresolved.invalid/source']}),m=draft(f);assert.throws(()=>prepare(f,m),/UNRESOLVED_CHANGED_PROVENANCE/);
});
test('missing field cannot be treated as null',()=>{
  const f=fixture({edit:r=>delete r.records[0].selectedSource}),m=draft(f); // build only from existing paths below
  m.records[0].replacements.push({path:'/selectedSource',before:{present:true,value:null},after:{present:true,value:'illegal'}});m.scope.recordFields['synthetic:alpha'].push('/selectedSource');assert.throws(()=>prepare(f,m),/FIELD_ABSENT/);
});

test('sorted-json-v1 preserves lexicographic numeric-key ordering',()=>{
  const value={'2':'two','10':'ten'};assert.equal(sortedJson(value),'{"10":"ten","2":"two"}');assert.notEqual(sortedJson(value),JSON.stringify(value));assert.equal(fingerprint(value),sha256('{"10":"ten","2":"two"}'));
});
for(const [name,bytes] of [['duplicate key',Buffer.from('{\n  "x": 1,\n  "x": 2\n}\n')],['CRLF',Buffer.from('{\r\n  "x": 1\r\n}\r\n')],['BOM',Buffer.from('\ufeff{\n  "x": 1\n}\n')],['lossy number',Buffer.from('{\n  "x": 9007199254740993\n}\n')],['negative zero',Buffer.from('{\n  "x": -0\n}\n')],['nonfinite',Buffer.from('{\n  "x": 1e999\n}\n')],['malformed',Buffer.from('{')],['invalid UTF8',Buffer.from([0xff])]])test('strict JSON rejects '+name,()=>assert.throws(()=>parseProfile(bytes)));
test('objects cannot smuggle non-JSON or dangerous own values into encoding',()=>{
  for(const value of [NaN,Infinity,-0,undefined,{x:undefined},new Date(),[,1],JSON.parse('{"__proto__":{"polluted":true}}')])assert.throws(()=>canonicalBytes(value));assert.equal({}.polluted,undefined);
});

for(const bad of [null,{min:null,max:null},{min:'2',max:4},{min:true,max:4},{min:0,max:4},{min:-1,max:4},{min:4,max:2},{max:4},{min:1,max:Infinity}])test('B2 runtime range contract refuses '+String(JSON.stringify(bad)),()=>{
  const f=fixture({invalid:false});f.registry.records[1].normalizedRange.heightM=bad;assert.ok(inspectRegistry(f.registry).errors.some(e=>e.taxon==='synthetic:beta'&&e.code==='INVALID_RUNTIME_HEIGHT'));
});
test('false readiness cannot hide selected malformed height or spread',()=>{
  const f=fixture();f.registry.records[0].HEIGHT_SCALE_READY=false;assert.ok(inspectRegistry(f.registry).errors.some(e=>e.code==='INVALID_RUNTIME_HEIGHT'));
  f.registry.records[1].selectedSpreadEvidenceRef='selected';f.registry.records[1].SPREAD_SCALE_READY=false;assert.ok(inspectRegistry(f.registry).errors.some(e=>e.code==='INVALID_RUNTIME_SPREAD'));
});
test('held readiness flags are evidence completeness and never runtime meters',()=>{
  const f=fixture({invalid:false});const r=f.registry.records[0];Object.assign(r,{runtimeAuthority:P+'USER_CONTEXT_REQUIRED',defaultPreviewScenario:null,selectedHeightEvidenceRef:null,normalizedRange:null,partialAnchor:null,HEIGHT_SCALE_READY:true,SPREAD_SCALE_READY:true});f.registry.expectedAccounting=accounting(f.registry.records);assert.equal(inspectRegistry(f.registry).ok,true);
  r.selectedHeightEvidenceRef='forbidden';assert.ok(inspectRegistry(f.registry).errors.some(e=>e.code==='HELD_SELECTION'));
});
test('all observed PARTIAL variants and descriptive held source variants remain unchanged',()=>{
  const real=currentRegistry;
  const inspection=inspectRegistry(real);const taxa=['taxon:malpighia-emarginata','taxon:phoenix-dactylifera','taxon:monstera-deliciosa','taxon:strelitzia-reginae','taxon:hibiscus-rosa-sinensis','taxon:cyclamen-persicum'];
  for(const id of taxa)assert.equal(inspection.errors.some(e=>e.taxon===id),false,id);
  assert.deepEqual([...new Set(real.records.filter(r=>r.runtimeAuthority===P+'PARTIAL').map(r=>r.partialAnchor))].sort(),['HEIGHT_ANCHORED_ESTIMATE','HEIGHT_ANCHORED_SPREAD_MAX_ONLY','HEIGHT_AND_SPREAD_SOURCE_SUPPORTED'].sort());
  const a=real.records.find(r=>r.botanicalTaxonId===taxa[0]);assert.equal(a.normalizedRange.spreadM.min,null);assert.equal(a.SPREAD_SCALE_READY,false);
  for(const id of taxa.slice(1,3))assert.equal(typeof real.records.find(r=>r.botanicalTaxonId===id).selectedSource,'string');
  for(const id of taxa.slice(3))assert.ok(inspection.inheritedProvenance.some(p=>p.taxon===id&&p.status==='FROZEN_NOT_REAUTHENTICATED'));
});
test('structural state, duplicate identity, lookup and accounting checks fail closed',()=>{
  for(const edit of [r=>r.records[1].botanicalTaxonId=r.records[0].botanicalTaxonId,r=>r.records[0].runtimeAuthority='NEW_STATE',r=>r.slugToBotanicalTaxonId.alpha='absent',r=>r.expectedAccounting.TOTAL++,r=>r.runtimeWired=true,r=>r.records[0].runtimeWired=true]){const f=fixture({invalid:false});edit(f.registry);assert.equal(inspectRegistry(f.registry).ok,false);}
});

for(const [name,edit,pattern] of [
  ['lookup',(r)=>r.slugToBotanicalTaxonId.alpha='synthetic:beta',/LOOKUP_DRIFT/],
  ['lookup order',r=>r.slugToBotanicalTaxonId=Object.fromEntries(Object.entries(r.slugToBotanicalTaxonId).reverse()),/LOOKUP_DRIFT/],
  ['alias',r=>r.records[0].canonicalSlugAliases.push('hidden'),/UNDECLARED_RECORD_DRIFT/],
  ['record order',r=>r.records.reverse(),/RECORD_ORDER_DRIFT/],
  ['unrelated taxon',r=>r.records[1].scientificName='hidden',/UNRELATED_TAXON_DRIFT/],
  ['top-level metadata',r=>r.runtimeWired=true,/METADATA_DRIFT/],
  ['top-level property order',r=>{const v=r.contract;delete r.contract;r.contract=v;},/TOP_LEVEL_ORDER_DRIFT/],
  ['record property order',r=>{const a=r.records[0],v=a.scientificName;delete a.scientificName;a.scientificName=v;},/RECORD_SERIALIZATION_DRIFT/]
])test('independent diff detects '+name+' drift',()=>{const f=fixture(),m=draft(f),after=parseProfile(prepare(f,m).outputBytes);edit(after);assert.throws(()=>verifyIsolation(f.registry,after,m),pattern);});

test('scratch path checks reject live/tracked paths, escape, aliases and existing outputs',()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-delta-test-'));const manifestPath=path.join(scratch,'input-manifest.json');fs.writeFileSync(manifestPath,'{}\n');
  const options={inputPath:canonicalPath,manifestPath,scratchRoot:scratch,outputPath:path.join(scratch,'new.json')};
  assert.equal(validateScratchPaths(options).outputPath,options.outputPath);
  for(const outputPath of [canonicalPath,path.join(root,'data/catalog/canonical-size-authority-freeze-v1/new.json'),manifestPath,path.join(path.dirname(scratch),'escape.json')])assert.throws(()=>validateScratchPaths({...options,outputPath}));
  fs.writeFileSync(options.outputPath,'existing');assert.throws(()=>validateScratchPaths(options),/OUTPUT_EXISTS/);assert.equal(fs.readFileSync(options.outputPath,'utf8'),'existing');
  assert.throws(()=>validateScratchPaths({...options,scratchRoot:root}),/SCRATCH_OUTSIDE_CHECKOUT/);
  const link=path.join(scratch,'checkout-alias');fs.symlinkSync(root,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>validateScratchPaths({...options,outputPath:path.join(link,'data/catalog/botanical-size-authority-v1.json')}),/SYMLINK_OR_REPARSE_PATH/);
  fs.rmSync(link);fs.rmSync(scratch,{recursive:true,force:true});
});
test('CLI has no live/promote/fixture bypass and no implicit input/output',()=>{
  for(const args of [[],['promote'],['prepare','--live','true'],['prepare','--synthetic','true']]){const r=cp.spawnSync(process.execPath,[tool,...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/CANONICAL_DELTA_REFUSED/);}
});
test('synthetic scratch writes succeed twice per mode with identical bytes and no overwrite',()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-delta-success-')),f=fixture();
  const inputPath=path.join(scratch,'parent.json'),manifestPath=path.join(scratch,'draft.json');fs.writeFileSync(inputPath,f.bytes);fs.writeFileSync(manifestPath,canonicalBytes(draft(f)));
  const before=fs.readFileSync(manifestPath),outputs=[];
  for(let i=0;i<2;i++){
    const outputPath=path.join(scratch,'draft-'+i+'.json');const receipt=f.harness.runScratch({mode:'prepare',inputPath,manifestPath,outputPath,scratchRoot:scratch});
    assert.equal(receipt.status,'DRAFT_NOT_AUTHORIZED');assert.equal(receipt.synthetic,true);outputs.push(outputPath);
  }
  assert.deepEqual(fs.readFileSync(outputs[0]),fs.readFileSync(outputs[1]));assert.deepEqual(fs.readFileSync(outputs[0]+'.qualification.json'),fs.readFileSync(outputs[1]+'.qualification.json'));
  assert.deepEqual(fs.readFileSync(manifestPath),before);assert.deepEqual(fs.readFileSync(inputPath),f.bytes);
  const reviewed=sealed(f,draft(f));fs.writeFileSync(manifestPath,reviewed.manifestBytes);
  const verified=[];
  for(let i=0;i<2;i++){
    const outputPath=path.join(scratch,'sealed-'+i+'.json');const receipt=f.harness.runScratch({mode:'verify',inputPath,manifestPath,outputPath,scratchRoot:scratch,expectedManifestSha256:sha256(reviewed.manifestBytes)});
    assert.equal(receipt.status,'SEALED_SCRATCH_VERIFIED');verified.push(outputPath);
  }
  assert.deepEqual(fs.readFileSync(verified[0]),fs.readFileSync(verified[1]));assert.deepEqual(fs.readFileSync(verified[0]+'.qualification.json'),fs.readFileSync(verified[1]+'.qualification.json'));
  assert.throws(()=>f.harness.runScratch({mode:'prepare',inputPath,manifestPath,outputPath:verified[0],scratchRoot:scratch}),/OUTPUT_EXISTS/);
  assert.deepEqual(fs.readFileSync(verified[0]),reviewed.outputBytes);
  fs.mkdirSync(path.join(scratch,'nested'));fs.mkdirSync(path.join(scratch,'nested','.git'));assert.throws(()=>validateScratchPaths({inputPath,manifestPath,scratchRoot:scratch,outputPath:path.join(scratch,'nested','out.json')}),/OUTPUT_IN_GIT_CHECKOUT/);
  for(const name of ['NUL.json','con','file:stream','bad.'])assert.throws(()=>validateScratchPaths({inputPath,manifestPath,scratchRoot:scratch,outputPath:path.join(scratch,name)}),/UNSAFE_PATH_COMPONENT/);
  fs.rmSync(scratch,{recursive:true,force:true});
});
test('failed real scratch attempt with pinned genesis A creates neither output nor qualification receipt',()=>{
  const tempRoot=fs.realpathSync(os.tmpdir()),scratch=fs.mkdtempSync(path.join(tempRoot,'canonical-delta-refusal-A-'));
  try{
    const inputPath=path.join(scratch,'genesis-A.json'),manifestPath=path.join(scratch,'manifest.json'),outputPath=path.join(scratch,'out.json');
    assert.equal(sha256(realBytes),'86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b');
    fs.writeFileSync(inputPath,realBytes);fs.writeFileSync(manifestPath,canonicalBytes(draft(fixture())));
    assert.ok(fs.readFileSync(inputPath).equals(realBytes));
    // Real context accepts A as its parent, then rejects the synthetic manifest.
    assert.throws(()=>runScratch({mode:'prepare',inputPath,manifestPath,outputPath,scratchRoot:scratch,chain:[],acceptedTipReceiptSha256:null}),{name:'Error',message:'GENESIS_IDENTITY'});
    assert.equal(fs.existsSync(outputPath),false);assert.equal(fs.existsSync(outputPath+'.qualification.json'),false);
    assert.ok(fs.readFileSync(inputPath).equals(realBytes));assert.ok(fs.readFileSync(canonicalPath).equals(currentCanonicalBefore));
  }finally{
    assert.equal(path.dirname(fs.realpathSync(scratch)),tempRoot);fs.rmSync(scratch,{recursive:true,force:true});
  }
});
test('failed real scratch attempt with qualified B and no accepted chain creates neither output nor qualification receipt',()=>{
  const manifestBytes=fs.readFileSync(path.join(root,'config/size-authority/canonical-deltas/000001-jaboticaba-context-state-v1.json'));
  const manifestSha256='3e7e109af3758db5e0dcd14635a3141f557c63b97fa8f446496b767af0725810';
  assert.equal(sha256(manifestBytes),manifestSha256);
  const qualified=verifyDelta({inputBytes:realBytes,manifestBytes,expectedManifestSha256:manifestSha256});
  assert.equal(sha256(qualified.receiptBytes),'10e969fbcc1cfde3b920b45bf3249f9d0104367247c74bf0a4e42e9e3ecb0d27');
  assert.equal(sha256(qualified.outputBytes),'e59a63abad28a269e2ac9e1c12e72a0eb12b680cd89222c586bdf9f63c5864b6');
  const tempRoot=fs.realpathSync(os.tmpdir()),scratch=fs.mkdtempSync(path.join(tempRoot,'canonical-delta-refusal-B-'));
  try{
    const inputPath=path.join(scratch,'qualified-B.json'),manifestPath=path.join(scratch,'manifest.json'),outputPath=path.join(scratch,'out.json');
    fs.writeFileSync(inputPath,qualified.outputBytes);fs.writeFileSync(manifestPath,canonicalBytes(draft(fixture())));
    assert.ok(fs.readFileSync(inputPath).equals(qualified.outputBytes));
    // Without its accepted chain, exact B must fail before manifest validation.
    assert.throws(()=>runScratch({mode:'prepare',inputPath,manifestPath,outputPath,scratchRoot:scratch,chain:[],acceptedTipReceiptSha256:null}),{name:'Error',message:'INPUT_NOT_ACCEPTED_CHAIN_TIP'});
    assert.equal(fs.existsSync(outputPath),false);assert.equal(fs.existsSync(outputPath+'.qualification.json'),false);
    assert.ok(fs.readFileSync(inputPath).equals(qualified.outputBytes));assert.ok(fs.readFileSync(canonicalPath).equals(currentCanonicalBefore));
  }finally{
    assert.equal(path.dirname(fs.realpathSync(scratch)),tempRoot);fs.rmSync(scratch,{recursive:true,force:true});
  }
});
test('complete native ESM import graph has no historical writer, network or provider dependency',async()=>{
  const context=createContext({}),cache=new Map(),builtins=new Set();
  function moduleAt(p){if(cache.has(p))return cache.get(p);const source=fs.readFileSync(p,'utf8');assert.doesNotMatch(source,/import\s*\(|\brequire\s*\(/);assert.doesNotMatch(p,/botanical-size-authority-v1-build\.js/);const m=new SourceTextModule(source,{context,identifier:p});cache.set(p,m);return m;}
  const entry=moduleAt(tool);
  await entry.link((specifier,parent)=>{
    if(specifier.startsWith('node:')){builtins.add(specifier); // inspect imports without evaluating any module
      const exports={'node:fs':['default'],'node:path':['default'],'node:crypto':['default'],'node:child_process':['default'],'node:url':['fileURLToPath','pathToFileURL']};assert.ok(exports[specifier],specifier);
      return new SourceTextModule(exports[specifier].map(x=>x==='default'?'export default {};':'export const '+x+'=()=>{};').join('\n'),{context,identifier:specifier});
    }
    assert.ok(specifier.startsWith('.'));return moduleAt(path.resolve(path.dirname(parent.identifier),specifier));
  });
  assert.equal(entry.status,'linked');assert.ok(cache.size>=4);assert.equal([...cache.keys()].some(p=>p.includes('botanical-size-authority-v1-build')),false);assert.equal([...builtins].some(s=>/https?|net|dns/.test(s)),false);
});
test('current canonical bytes remain unchanged after all read-only references',()=>assert.ok(fs.readFileSync(canonicalPath).equals(currentCanonicalBefore)));
