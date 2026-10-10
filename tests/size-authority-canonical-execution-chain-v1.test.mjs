import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SourceTextModule,createContext} from 'node:vm';
import {GENESIS,sha256,canonicalBytes,fingerprint,toolIdentity,syntheticHarness,verifyDelta} from '../tools/size-authority/canonical-delta-v1.mjs';
import * as execution from '../tools/size-authority/canonical-execution-chain-v1.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tool=path.join(root,'tools/size-authority/canonical-execution-chain-v1.mjs');
const manifestPath='config/size-authority/canonical-deltas/000001-jaboticaba-context-state-v1.json';
const M1='3e7e109af3758db5e0dcd14635a3141f557c63b97fa8f446496b767af0725810';
const Q1='10e969fbcc1cfde3b920b45bf3249f9d0104367247c74bf0a4e42e9e3ecb0d27';
const B='e59a63abad28a269e2ac9e1c12e72a0eb12b680cd89222c586bdf9f63c5864b6';
const realA=fs.readFileSync(path.join(root,'data/catalog/botanical-size-authority-v1.json'));
const realManifest=fs.readFileSync(path.join(root,manifestPath));
const hashObject=x=>sha256(canonicalBytes(x));
const clone=structuredClone;
const P='RUNTIME_AUTHORITY_';
const states=['READY','PARTIAL','USER_CONTEXT_REQUIRED','CONFLICT_HOLD','EVIDENCE_GAP'].map(s=>P+s);
const revision='1'.repeat(40),evidencePath='data/synthetic-evidence.json';
const account=records=>Object.fromEntries([...states.map(s=>[s,records.filter(r=>r.runtimeAuthority===s).length]),['TOTAL',records.length]]);

function fixture(){
  const records=['alpha','beta','gamma'].map(name=>({botanicalTaxonId:'synthetic:'+name,canonicalSlugAliases:[name],scientificName:'Synthetic '+name,growthStage:'mature',runtimeAuthority:P+'PARTIAL',defaultPreviewScenario:'LANDSCAPE_MATURE',selectedHeightEvidenceRef:'evidence-'+name,selectedSpreadEvidenceRef:null,selectedSource:null,normalizedRange:{heightM:{min:2,max:4},spreadM:null},partialAnchor:'HEIGHT_ANCHORED_ESTIMATE',HEIGHT_SCALE_READY:true,SPREAD_SCALE_READY:false,spreadSourceSupported:false,provenanceEvidenceIds:['evidence-'+name],sensitivity:{notFinalPersonalGardenSize:false},runtimeWired:false}));
  const registry={contract:'botanical-size-authority-v1',authorityVersion:'botanical-size-authority-v1',runtimeWired:false,immutableFromUserActions:true,universalDefaultPreviewScenario:null,mergeCanonicalSlugsNow:false,records,slugToBotanicalTaxonId:Object.fromEntries(records.map(r=>[r.canonicalSlugAliases[0],r.botanicalTaxonId])),expectedAccounting:account(records)};
  const evidence={records:records.map(r=>({recordId:r.selectedHeightEvidenceRef,botanicalTaxonId:r.botanicalTaxonId,growthStage:'mature',conditions:'separate synthetic mature contexts',heightMinM:2,heightMaxM:4,sourceUrl:'https://evidence.invalid/'+r.canonicalSlugAliases[0]}))};
  const bytes=canonicalBytes(registry),sourceBytes=canonicalBytes(evidence),sources=new Map([[revision+':'+evidencePath,sourceBytes]]);
  return {bytes,evidence,sourceBytes,v1:syntheticHarness(bytes,sources),authority:execution.syntheticExecutionHarness(bytes,sources)};
}
function qualify(f,{prior=null,target='synthetic:alpha',id='synthetic-001'}={}){
  const input=prior?.outputBytes??f.bytes,registry=JSON.parse(input),r=registry.records.find(r=>r.botanicalTaxonId===target),index=f.evidence.records.findIndex(e=>e.botanicalTaxonId===target);
  const values={'/runtimeAuthority':P+'USER_CONTEXT_REQUIRED','/defaultPreviewScenario':null,'/selectedHeightEvidenceRef':null,'/normalizedRange':null,'/partialAnchor':null,'/HEIGHT_SCALE_READY':false,'/sensitivity/notFinalPersonalGardenSize':true};
  const at=(v,p)=>p.slice(1).split('/').reduce((x,k)=>x[k],v);
  const replacements=Object.entries(values).map(([p,v])=>({path:p,before:{present:true,value:at(r,p)},after:{present:true,value:v}}));
  const metadata=[r.runtimeAuthority,P+'USER_CONTEXT_REQUIRED'].map((s,i)=>({path:'/expectedAccounting/'+s,before:{present:true,value:registry.expectedAccounting[s]},after:{present:true,value:registry.expectedAccounting[s]+(i===0?-1:1)}}));
  const preparationText='Synthetic preparation qualification only. No actual canonical write authorization.';
  const manifest={contract:'size-authority-canonical-delta-v1',schemaVersion:1,deltaId:id,genesis:f.v1.genesis,parent:{canonicalSha256:sha256(input),acceptedDelta:prior?.qLink??null},profile:{recordFingerprint:'sorted-json-v1',canonicalBytes:'json-pretty-2-lf-preserve-order-v1'},scope:{taxa:[target],recordFields:{[target]:replacements.map(o=>o.path)},lookupKeys:[],metadataFields:metadata.map(o=>o.path),recordOrderChange:false},records:[{botanicalTaxonId:target,beforeRecordSha256:fingerprint(r),afterRecordSha256:null,replacements}],lookups:[],metadata,result:{canonicalSha256:null,recordCount:3,lookupCount:3},provenance:{sourceEvidence:[{refId:f.evidence.records[index].recordId,artifact:{repoPath:evidencePath,revision,sha256:sha256(f.sourceBytes)},entryPointer:'/records/'+index,entrySha256:fingerprint(f.evidence.records[index]),taxon:target,dimension:'height',context:f.evidence.records[index].conditions}],decision:{gateId:'synthetic-preparation',ownerApprovalId:'synthetic:preparation:owner',supervisorApprovalId:'synthetic:preparation:supervisor',record:{reference:'synthetic:preparation-record',text:preparationText,sha256:sha256(preparationText)}},rule:toolIdentity(),reason:'Synthetic context demotion; no real record.',valueStatus:{height:'context-required',spread:'unknown'}}};
  const qChain=prior?.qChain??[],tip=prior?.qLink.receiptSha256??null;
  const prepared=f.v1.prepare({inputBytes:input,manifestBytes:canonicalBytes(manifest),chain:qChain,acceptedTipReceiptSha256:tip});
  manifest.result.canonicalSha256=prepared.receipt.afterCanonicalSha256;manifest.records[0].afterRecordSha256=prepared.receipt.records[0].afterRecordSha256;
  const manifestBytes=canonicalBytes(manifest);
  const q=f.v1.verify({inputBytes:input,manifestBytes,chain:qChain,acceptedTipReceiptSha256:tip,expectedManifestSha256:sha256(manifestBytes)});
  return {manifest,manifestBytes,...q,qChain:[...qChain,{manifestBytes,receiptBytes:q.receiptBytes}],qLink:{id,manifestSha256:sha256(manifestBytes),receiptSha256:sha256(q.receiptBytes)}};
}
// Only test fixtures construct E. No real E, receipt output or writer is involved.
function accepted(f,options={}){
  const q=qualify(f,options),prior=options.prior??null;
  const decisionText='Synthetic Owner and Supervisor authorize this exact synthetic transition; no real canonical authority.';
  const approval={gateId:'synthetic-execution:'+q.manifest.deltaId,ownerApprovalRef:'synthetic:owner:'+q.manifest.deltaId,supervisorApprovalRef:'synthetic:supervisor:'+q.manifest.deltaId,decision:{text:decisionText,sha256:sha256(decisionText)},authorization:{action:'CANONICAL_TRANSITION_EXECUTION',deltaId:q.manifest.deltaId,manifestSha256:sha256(q.manifestBytes),qualificationReceiptSha256:sha256(q.receiptBytes),beforeCanonicalSha256:q.receipt.beforeCanonicalSha256,afterCanonicalSha256:q.receipt.afterCanonicalSha256,parentExecutionReceiptSha256:prior?.eLink.executionReceiptSha256??null}};
  // Simulated external gate input is separate from receipt-controlled state.
  const acceptedApproval={deltaId:q.manifest.deltaId,gateId:approval.gateId,ownerApprovalRef:approval.ownerApprovalRef,supervisorApprovalRef:approval.supervisorApprovalRef,approvalSha256:hashObject(approval)};
  const e={contract:execution.EXECUTION_CONTRACT,schemaVersion:1,synthetic:true,status:'ACCEPTED_EXECUTION',genesis:f.v1.genesis,deltaId:q.manifest.deltaId,manifest:{repoPath:'config/size-authority/canonical-deltas/'+q.manifest.deltaId+'.json',sha256:sha256(q.manifestBytes)},qualification:{encoding:'base64',byteLength:q.receiptBytes.length,sha256:sha256(q.receiptBytes),bytes:q.receiptBytes.toString('base64')},beforeCanonicalSha256:q.receipt.beforeCanonicalSha256,afterCanonicalSha256:q.receipt.afterCanonicalSha256,records:clone(q.receipt.records),diffSha256:hashObject(q.receipt.diff),semanticSha256:hashObject(q.receipt.semantic),rule:toolIdentity(),executionApproval:clone(approval),canonicalWritePerformed:true,readback:{canonicalSha256:q.receipt.afterCanonicalSha256},parent:prior?.eLink??null};
  const eBytes=canonicalBytes(e),row={manifestRepoPath:e.manifest.repoPath,manifestBytes:q.manifestBytes,executionReceiptBytes:eBytes};
  const eLink={canonicalSha256:e.afterCanonicalSha256,id:e.deltaId,manifestSha256:e.manifest.sha256,qualificationReceiptSha256:e.qualification.sha256,executionReceiptSha256:sha256(eBytes)};
  return {...q,e,eBytes,row,eLink,chain:[...(prior?.chain??[]),row],approvals:[...(prior?.approvals??[]),acceptedApproval]};
}
const request=a=>({chain:a.chain,acceptedExecutionTipSha256:a.eLink.executionReceiptSha256,acceptedApprovals:a.approvals,currentCanonicalBytes:a.outputBytes});
function changedReceipt(a,edit){
  const e=clone(a.e);edit(e);const executionReceiptBytes=canonicalBytes(e);
  return {...request(a),chain:[...a.chain.slice(0,-1),{...a.row,executionReceiptBytes}],acceptedExecutionTipSha256:sha256(executionReceiptBytes)};
}

test('real accepted B4A M1/Q1 qualifies byte-exactly under frozen v1; M1 + Q1 alone lacks execution authority',()=>{
  assert.equal(sha256(realA),GENESIS.canonicalSha256);assert.equal(sha256(realManifest),M1);assert.deepEqual(toolIdentity(),execution.QUALIFICATION_IDENTITY);
  const q=verifyDelta({inputBytes:realA,manifestBytes:realManifest,expectedManifestSha256:M1});
  assert.equal(sha256(q.receiptBytes),Q1);assert.equal(q.receipt.afterCanonicalSha256,B);
  assert.equal(q.receipt.canonicalWritePerformed,false);assert.equal(q.receipt.executionAuthorization,'EXTERNAL_OWNER_SUPERVISOR_REQUIRED');assert.equal(q.receipt.decision.gateId,'GD-SIZE-R1.4B4A');
  assert.throws(()=>execution.verifyExecutionChain({chain:[{manifestRepoPath:manifestPath,manifestBytes:realManifest,qualificationReceiptBytes:q.receiptBytes}],acceptedExecutionTipSha256:Q1,acceptedApprovals:[],currentCanonicalBytes:realA}),/EXECUTION_RECEIPT_REQUIRED/);
  assert.throws(()=>execution.verifyExecutionChain({chain:[{manifestRepoPath:manifestPath,manifestBytes:realManifest,executionReceiptBytes:q.receiptBytes}],acceptedExecutionTipSha256:Q1,acceptedApprovals:[],currentCanonicalBytes:realA}),/ACCEPTED_EXECUTION_APPROVALS_REQUIRED/);
  assert.throws(()=>execution.verifyExecutionChain({chain:[{manifestRepoPath:manifestPath,manifestBytes:realManifest,executionReceiptBytes:q.receiptBytes}],acceptedExecutionTipSha256:Q1,acceptedApprovals:[{}],currentCanonicalBytes:realA}),/EXECUTION_RECEIPT_SCHEMA/);
});
test('exact genesis requires no execution receipt and cannot stand in for a post-genesis tip',()=>{
  const input={chain:[],acceptedExecutionTipSha256:null,acceptedApprovals:[],currentCanonicalBytes:realA};
  assert.equal(execution.verifyExecutionChain(input).status,'EXACT_GENESIS_EXECUTION_STATE');
  assert.throws(()=>execution.verifyExecutionChain({...input,currentCanonicalBytes:Buffer.from('different')}),/CURRENT_CANONICAL_READBACK_MISMATCH/);
  assert.throws(()=>execution.verifyExecutionChain({...input,acceptedExecutionTipSha256:Q1}),/GENESIS_EXECUTION_TIP_MUST_BE_NULL/);
});
test('valid synthetic E1 passes with independent approval, exact Q bytes and simulated readback',()=>{
  const f=fixture(),a=accepted(f),r=f.authority.verifyExecutionChain(request(a));
  assert.equal(r.status,'ACCEPTED_EXECUTION_CHAIN_VERIFIED');assert.equal(r.synthetic,true);assert.equal(r.deltaCount,1);assert.deepEqual(r.acceptedDelta,a.eLink);assert.equal(r.canonicalWritePerformed,false);
  const one=f.authority.verifyExecutionReceipt({priorChain:[],receipt:a.row,acceptedExecutionTipSha256:a.eLink.executionReceiptSha256,acceptedApprovals:a.approvals,currentCanonicalBytes:a.outputBytes});assert.deepEqual(one,r);
  assert.ok(Buffer.from(a.e.qualification.bytes,'base64').equals(a.receiptBytes));assert.equal(a.receipt.canonicalWritePerformed,false);
});

const tamperCases=[
  ['wrong manifest SHA',e=>e.manifest.sha256=sha256('other'),/EXECUTION_MANIFEST_SHA_MISMATCH/],
  ['wrong Q SHA',e=>e.qualification.sha256=sha256('other'),/QUALIFICATION_BYTES_SHA_MISMATCH/],
  ['wrong embedded Q bytes',e=>e.qualification.bytes=Buffer.from('changed').toString('base64'),/QUALIFICATION_BYTE_LENGTH_MISMATCH/],
  ['wrong embedded byte length',e=>e.qualification.byteLength++,/QUALIFICATION_BYTE_LENGTH_MISMATCH/],
  ['noncanonical base64',e=>e.qualification.bytes+='\n',/NONCANONICAL_BASE64/],
  ['wrong encoding',e=>e.qualification.encoding='utf8',/QUALIFICATION_ENCODING/],
  ['wrong before canonical',e=>e.beforeCanonicalSha256=sha256('other'),/EXECUTION_CANONICAL_CONTINUITY/],
  ['wrong after canonical',e=>{e.afterCanonicalSha256=sha256('other');e.readback.canonicalSha256=e.afterCanonicalSha256;},/EXECUTION_AFTER_MISMATCH/],
  ['wrong before fingerprint',e=>e.records[0].beforeRecordSha256=sha256('other'),/EXECUTION_RECORD_FINGERPRINT_MISMATCH/],
  ['wrong after fingerprint',e=>e.records[0].afterRecordSha256=sha256('other'),/EXECUTION_RECORD_FINGERPRINT_MISMATCH/],
  ['wrong computed diff',e=>e.diffSha256=sha256('other'),/EXECUTION_DIFF_MISMATCH/],
  ['wrong semantic identity',e=>e.semanticSha256=sha256('other'),/EXECUTION_SEMANTIC_MISMATCH/],
  ['missing execution approval',e=>delete e.executionApproval,/EXECUTION_RECEIPT_SCHEMA/],
  ['wrong Owner reference',e=>e.executionApproval.ownerApprovalRef='changed-owner',/ACCEPTED_APPROVAL_REFERENCE_MISMATCH/],
  ['wrong Supervisor reference',e=>e.executionApproval.supervisorApprovalRef='changed-supervisor',/ACCEPTED_APPROVAL_REFERENCE_MISMATCH/],
  ['wrong execution gate',e=>e.executionApproval.gateId='preparation-gate',/ACCEPTED_APPROVAL_REFERENCE_MISMATCH/],
  ['altered decision text',e=>e.executionApproval.decision.text+=' changed',/EXECUTION_DECISION_HASH_MISMATCH/],
  ['altered decision SHA',e=>e.executionApproval.decision.sha256=sha256('other'),/EXECUTION_DECISION_HASH_MISMATCH/],
  ['changed text and recomputed decision SHA still lacks accepted authority',e=>{e.executionApproval.decision.text+=' changed';e.executionApproval.decision.sha256=sha256(e.executionApproval.decision.text);},/ACCEPTED_APPROVAL_DIGEST_MISMATCH/],
  ['canonicalWritePerformed false',e=>e.canonicalWritePerformed=false,/EXECUTION_NOT_COMPLETED/],
  ['readback result mismatch',e=>e.readback.canonicalSha256=sha256('other'),/EXECUTION_READBACK_MISMATCH/],
  ['draft is not accepted execution',e=>e.status='DRAFT_NOT_AUTHORIZED',/EXECUTION_STATUS/],
  ['wrong engine identity',e=>e.rule.engineSha256=sha256('other'),/EXECUTION_RULE_MISMATCH/],
  ['wrong validator identity',e=>e.rule.rangeValidatorSourceSha256=sha256('other'),/EXECUTION_RULE_MISMATCH/],
  ['wrong explicit authorized M',e=>e.executionApproval.authorization.manifestSha256=sha256('other'),/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/],
  ['wrong explicit authorized Q',e=>e.executionApproval.authorization.qualificationReceiptSha256=sha256('other'),/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/],
  ['wrong explicit authorized A',e=>e.executionApproval.authorization.beforeCanonicalSha256=sha256('other'),/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/],
  ['wrong explicit authorized B',e=>e.executionApproval.authorization.afterCanonicalSha256=sha256('other'),/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/],
  ['preparation-only action',e=>e.executionApproval.authorization.action='PREPARATION_ONLY',/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/],
  ['unknown receipt member',e=>e.approved=true,/EXECUTION_RECEIPT_SCHEMA/],
  ['unknown approval member',e=>e.executionApproval.approved=true,/EXECUTION_APPROVAL_SCHEMA/],
  ['unknown authorization member',e=>e.executionApproval.authorization.approved=true,/EXECUTION_AUTHORIZATION_SCHEMA/],
  ['unknown qualification member',e=>e.qualification.normalized=true,/QUALIFICATION_ENCODING_SCHEMA/],
  ['wrong contract version',e=>e.schemaVersion=2,/EXECUTION_CONTRACT_VERSION/],
  ['wrong manifest repo path',e=>e.manifest.repoPath='../other.json',/EXECUTION_MANIFEST_PATH/],
  ['empty approval text',e=>e.executionApproval.decision.text='',/EXECUTION_DECISION_TEXT/],
  ['missing before binding',e=>delete e.beforeCanonicalSha256,/EXECUTION_RECEIPT_SCHEMA/]
];
for(const [name,edit,error] of tamperCases)test('execution receipt refuses '+name,()=>{
  const f=fixture(),a=accepted(f);assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(a,edit)),error);
});
test('parse-equivalent but byte-different Q is refused, even with updated encoding length/hash',()=>{
  const f=fixture(),a=accepted(f);
  const altered=changedReceipt(a,e=>{const b=Buffer.from(a.receiptBytes.toString('utf8').replaceAll('\n','\r\n'));assert.deepEqual(JSON.parse(b),JSON.parse(a.receiptBytes));e.qualification={encoding:'base64',byteLength:b.length,sha256:sha256(b),bytes:b.toString('base64')};});
  assert.throws(()=>f.authority.verifyExecutionChain(altered),/JSON_PROFILE_MISMATCH/);
});
test('well-formed Q with recomputed digests cannot evade pinned v1 regeneration',()=>{
  const f=fixture(),a=accepted(f);
  const altered=changedReceipt(a,e=>{const q=JSON.parse(a.receiptBytes);q.evidence[0].entrySha256=sha256('forged');const b=canonicalBytes(q);e.qualification={encoding:'base64',byteLength:b.length,sha256:sha256(b),bytes:b.toString('base64')};});
  assert.throws(()=>f.authority.verifyExecutionChain(altered),/PRIOR_RECEIPT_MISMATCH/);
});
test('external approval and accepted tip cannot be omitted or replaced by embedded assertions',()=>{
  const f=fixture(),a=accepted(f),r=request(a);
  assert.throws(()=>f.authority.verifyExecutionChain({...r,acceptedApprovals:[]}),/ACCEPTED_EXECUTION_APPROVALS_REQUIRED/);
  assert.throws(()=>f.authority.verifyExecutionChain({...r,acceptedApprovals:[null]}),/ACCEPTED_EXECUTION_APPROVAL_REQUIRED/);
  const approvals=clone(a.approvals);approvals[0].approvalSha256=sha256('wrong');assert.throws(()=>f.authority.verifyExecutionChain({...r,acceptedApprovals:approvals}),/ACCEPTED_APPROVAL_DIGEST_MISMATCH/);
  for(const tip of [null,undefined,'',sha256('wrong')])assert.throws(()=>f.authority.verifyExecutionChain({...r,acceptedExecutionTipSha256:tip}),/ACCEPTED_EXECUTION_TIP/);
  assert.throws(()=>f.authority.verifyExecutionChain({...r,currentCanonicalBytes:f.bytes}),/CURRENT_CANONICAL_READBACK_MISMATCH/);
});
test('missing E and E without manifest cannot establish execution acceptance',()=>{
  const f=fixture(),a=accepted(f),r=request(a);
  assert.throws(()=>f.authority.verifyExecutionChain({...r,chain:[{manifestRepoPath:a.row.manifestRepoPath,manifestBytes:a.manifestBytes}]}),/EXECUTION_RECEIPT_REQUIRED/);
  assert.throws(()=>f.authority.verifyExecutionChain({...r,chain:[{...a.row,manifestBytes:null}]}),/MANIFEST_BYTES_REQUIRED/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(a,e=>delete e.qualification)),/EXECUTION_RECEIPT_SCHEMA/);
});
test('modified manifest or E is refused even when it remains parseable',()=>{
  const f=fixture(),a=accepted(f),m=clone(a.manifest);m.provenance.reason+=' changed';
  assert.throws(()=>f.authority.verifyExecutionChain({...request(a),chain:[{...a.row,manifestBytes:canonicalBytes(m)}]}),/EXECUTION_MANIFEST_SHA_MISMATCH/);
  const e=clone(a.e);e.executionApproval.decision.text+=' changed';
  assert.throws(()=>f.authority.verifyExecutionChain({...request(a),chain:[{...a.row,executionReceiptBytes:canonicalBytes(e)}]}),/EXECUTION_DECISION_HASH_MISMATCH/);
});
test('two completed synthetic transitions bind both qualification and execution parents',()=>{
  const f=fixture(),first=accepted(f),second=accepted(f,{prior:first,target:'synthetic:beta',id:'synthetic-002'});
  const r=f.authority.verifyExecutionChain(request(second));assert.equal(r.deltaCount,2);assert.equal(r.canonicalSha256,sha256(second.outputBytes));
  assert.equal(second.manifest.parent.acceptedDelta.receiptSha256,first.qLink.receiptSha256);assert.equal(second.e.parent.executionReceiptSha256,first.eLink.executionReceiptSha256);
  assert.notEqual(first.eLink.executionReceiptSha256,first.qLink.receiptSha256);
  assert.deepEqual(f.authority.verifyExecutionReceipt({priorChain:first.chain,receipt:second.row,acceptedExecutionTipSha256:second.eLink.executionReceiptSha256,acceptedApprovals:second.approvals,currentCanonicalBytes:second.outputBytes}),r);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.parent.executionReceiptSha256=sha256('wrong'))),/EXECUTION_PARENT_LINK_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.parent.qualificationReceiptSha256=sha256('wrong'))),/EXECUTION_PARENT_LINK_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.parent=null)),/EXECUTION_PARENT_LINK_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.executionApproval.authorization.parentExecutionReceiptSha256=sha256('wrong'))),/EXECUTION_AUTHORIZATION_BINDING_MISMATCH/);
});
test('duplicate delta, chain gap, cycle, reversed order and stale parent all fail',()=>{
  const f=fixture(),first=accepted(f),second=accepted(f,{prior:first,target:'synthetic:beta',id:'synthetic-002'});
  assert.throws(()=>f.authority.verifyExecutionChain({...request(first),chain:[first.row,first.row],acceptedApprovals:[...first.approvals,...first.approvals]}),/EXECUTION_DUPLICATE_DELTA_ID/);
  assert.throws(()=>f.authority.verifyExecutionChain({...request(second),chain:[second.row],acceptedApprovals:[second.approvals[1]]}),/EXECUTION_PARENT_LINK_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain({...request(second),chain:[second.row,first.row]}),/EXECUTION_PARENT_LINK_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>{e.afterCanonicalSha256=f.v1.genesis.canonicalSha256;e.readback.canonicalSha256=e.afterCanonicalSha256;})),/EXECUTION_CHAIN_CYCLE/);
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.beforeCanonicalSha256=f.v1.genesis.canonicalSha256)),/EXECUTION_CANONICAL_CONTINUITY/);
});
test('every field of the execution parent is mandatory and content-bound',()=>{
  const f=fixture(),first=accepted(f),second=accepted(f,{prior:first,target:'synthetic:beta',id:'synthetic-002'});
  for(const field of ['canonicalSha256','id','manifestSha256','qualificationReceiptSha256','executionReceiptSha256']){
    assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>delete e.parent[field])),/EXECUTION_PARENT_SCHEMA/);
    assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.parent[field]=field==='id'?'wrong-parent':sha256('wrong-parent'))),/EXECUTION_PARENT_LINK_MISMATCH/);
  }
  assert.throws(()=>f.authority.verifyExecutionChain(changedReceipt(second,e=>e.parent.timestamp='2099-01-01')),/EXECUTION_PARENT_SCHEMA/);
});
test('forked B children cannot share one accepted execution tip or be concatenated',()=>{
  const f=fixture(),first=accepted(f),c1=accepted(f,{prior:first,target:'synthetic:beta',id:'synthetic-002-a'}),c2=accepted(f,{prior:first,target:'synthetic:gamma',id:'synthetic-999-newer'});
  assert.equal(f.authority.verifyExecutionChain(request(c1)).status,'ACCEPTED_EXECUTION_CHAIN_VERIFIED');
  assert.throws(()=>f.authority.verifyExecutionChain({...request(c2),acceptedExecutionTipSha256:c1.eLink.executionReceiptSha256}),/ACCEPTED_EXECUTION_TIP_MISMATCH/);
  assert.throws(()=>f.authority.verifyExecutionChain({...request(c2),chain:[...c1.chain,c2.row],acceptedApprovals:[...c1.approvals,c2.approvals[1]]}),/EXECUTION_PARENT_LINK_MISMATCH/);
});
test('chronology, filename and extra authority selectors cannot replace accepted hashes',()=>{
  const f=fixture(),a=accepted(f);
  for(const extra of [{latest:true},{branch:'main'},{timestamp:'2099-01-01'},{filename:'999999-approved.json'}])assert.throws(()=>f.authority.verifyExecutionChain({...request(a),...extra}),/EXECUTION_OPTIONS_SCHEMA/);
  assert.throws(()=>f.authority.verifyExecutionChain({...request(a),chain:[{...a.row,manifestRepoPath:'config/size-authority/canonical-deltas/999999-approved.json'}]}),/EXECUTION_MANIFEST_PATH_MISMATCH/);
});
test('synthetic domain cannot enter real execution authority or accept real taxon genesis',()=>{
  const f=fixture(),a=accepted(f);
  assert.throws(()=>execution.verifyExecutionChain(request(a)),/EXECUTION_DOMAIN_MISMATCH/);
  assert.throws(()=>execution.syntheticExecutionHarness(realA,new Map()),/SYNTHETIC_TAXA_ONLY/);
  assert.throws(()=>execution.verifyExecutionChain(changedReceipt(a,e=>e.synthetic=false)),/EXECUTION_GENESIS_MISMATCH/);
});
test('deterministic double construction and double verification, with no input mutation',()=>{
  const f=fixture(),a=accepted(f),b=accepted(f);assert.ok(a.eBytes.equals(b.eBytes));assert.ok(a.receiptBytes.equals(b.receiptBytes));
  const input=request(a),before=canonicalBytes({...input,currentCanonicalBytes:input.currentCanonicalBytes.toString('base64'),chain:input.chain.map(r=>({...r,manifestBytes:r.manifestBytes.toString('base64'),executionReceiptBytes:r.executionReceiptBytes.toString('base64')}))});
  const r1=f.authority.verifyExecutionChain(input),r2=f.authority.verifyExecutionChain(input);assert.deepEqual(r1,r2);
  const after=canonicalBytes({...input,currentCanonicalBytes:input.currentCanonicalBytes.toString('base64'),chain:input.chain.map(r=>({...r,manifestBytes:r.manifestBytes.toString('base64'),executionReceiptBytes:r.executionReceiptBytes.toString('base64')}))});assert.ok(before.equals(after));
});
test('only authority-verification exports exist; no CLI can execute or create a receipt',()=>{
  assert.deepEqual(Object.keys(execution).sort(),['EXECUTION_CONTRACT','QUALIFICATION_IDENTITY','syntheticExecutionHarness','verifyExecutionChain','verifyExecutionReceipt'].sort());
  for(const mode of ['execute','promote','apply-live','canonical-write','deploy','verify']){
    const r=cp.spawnSync(process.execPath,[tool,mode],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/EXECUTION_CHAIN_API_ONLY_NO_WRITE_COMMAND/);
  }
});
test('verification performs no writes and invokes only offline read-only Git commands',()=>{
  const writeNames=['writeFileSync','writeSync','appendFileSync','renameSync','copyFileSync','mkdirSync','rmSync','unlinkSync'];
  const originals=Object.fromEntries(writeNames.map(n=>[n,fs[n]]));const originalExec=cp.execFileSync;
  let writes=0,gitReads=0;
  try{
    for(const n of writeNames)fs[n]=()=>{writes++;throw new Error('FORBIDDEN_WRITE');};
    cp.execFileSync=(command,args,options)=>{assert.equal(command,'git');assert.ok(['ls-tree','cat-file'].includes(args[0]));assert.equal(options.env.GIT_NO_LAZY_FETCH,'1');gitReads++;return originalExec(command,args,options);};
    const q=verifyDelta({inputBytes:realA,manifestBytes:realManifest,expectedManifestSha256:M1});assert.equal(sha256(q.receiptBytes),Q1);
    const f=fixture(),a=accepted(f);f.authority.verifyExecutionChain(request(a));assert.equal(writes,0);assert.ok(gitReads>0);
  }finally{Object.assign(fs,originals);cp.execFileSync=originalExec;}
});
test('complete import graph has no network, provider, DB or historical writer dependency',async()=>{
  const context=createContext({}),cache=new Map();
  function moduleAt(p){if(cache.has(p))return cache.get(p);assert.doesNotMatch(p,/botanical-size-authority-v1-build\.js/);const source=fs.readFileSync(p,'utf8');assert.doesNotMatch(source,/import\s*\(|\brequire\s*\(/);const m=new SourceTextModule(source,{context,identifier:p});cache.set(p,m);return m;}
  const allowed={'node:fs':['default'],'node:path':['default'],'node:crypto':['default'],'node:child_process':['default'],'node:url':['fileURLToPath','pathToFileURL']};
  const entry=moduleAt(tool);
  await entry.link((specifier,parent)=>{
    if(specifier.startsWith('node:')){assert.ok(allowed[specifier],specifier);return new SourceTextModule(allowed[specifier].map(n=>n==='default'?'export default {};':'export const '+n+'=()=>{};').join('\n'),{context,identifier:specifier});}
    assert.ok(specifier.startsWith('.'));return moduleAt(path.resolve(path.dirname(parent.identifier),specifier));
  });assert.equal(entry.status,'linked');
  const source=fs.readFileSync(tool,'utf8');assert.doesNotMatch(source,/\b(?:runScratch|prepareDelta|writeFile|writeSync|openSync|execFile|spawn|fetch)\s*\(/);assert.doesNotMatch(source,/from ['"]node:(?:fs|child_process|http|https|net|dns)/);
});
test('real canonical, M1 and frozen engine remain byte-identical after qualification',()=>{
  assert.ok(fs.readFileSync(path.join(root,'data/catalog/botanical-size-authority-v1.json')).equals(realA));assert.ok(fs.readFileSync(path.join(root,manifestPath)).equals(realManifest));assert.deepEqual(toolIdentity(),execution.QUALIFICATION_IDENTITY);
});
