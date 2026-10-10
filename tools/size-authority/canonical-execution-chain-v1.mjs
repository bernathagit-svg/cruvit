// Read-only authority verification. No receipt generator, writer, or CLI.
// Trusted gate inputs MUST be supplied separately from receipt-controlled bytes.
// Hashes preserve accepted evidence; they do not authenticate a human by themselves.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  GENESIS, sha256, canonicalBytes, parseProfile, sortedJson, toolIdentity,
  verifyChain, syntheticHarness
} from './canonical-delta-v1.mjs';

export const EXECUTION_CONTRACT = 'size-authority-canonical-execution-receipt-v1';
export const QUALIFICATION_IDENTITY = Object.freeze({
  id:'context-required-demotion-v1',version:1,
  engineSha256:'271b47482c5e12b37fa1de509a97aff92d81fa711f138fce69f8d43ec6e3299d',
  rangeValidatorSourceSha256:'974f86687c4606782dd50a41bdccd193ef015cf468747c1d842722397dad0b04'
});
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b,code)=>need(sortedJson(a)===sortedJson(b),code);
function keys(x,names,code){need(object(x),code);equal(Object.keys(x).sort(),names.slice().sort(),code);}
const digest=(x,code)=>need(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),code);
const text=(x,code)=>need(typeof x==='string'&&x.trim().length>0&&x.length<=16384&&!/[\u0000-\u0008]/.test(x),code);
const identity=x=>sha256(canonicalBytes(x));
function bytes(x,code){need(Buffer.isBuffer(x),code);return Buffer.from(x);}
function pinnedEngine(){equal(toolIdentity(),QUALIFICATION_IDENTITY,'QUALIFICATION_ENGINE_PIN_MISMATCH');}

function decodeQualification(q){
  keys(q,['encoding','byteLength','sha256','bytes'],'QUALIFICATION_ENCODING_SCHEMA');
  need(q.encoding==='base64','QUALIFICATION_ENCODING');
  need(Number.isSafeInteger(q.byteLength)&&q.byteLength>0&&q.byteLength<=4_000_000,'QUALIFICATION_BYTE_LENGTH');
  digest(q.sha256,'QUALIFICATION_SHA_REQUIRED');
  need(typeof q.bytes==='string'&&q.bytes.length<=5_333_336,'QUALIFICATION_BYTES_REQUIRED');
  const decoded=Buffer.from(q.bytes,'base64');
  need(decoded.toString('base64')===q.bytes,'NONCANONICAL_BASE64');
  need(decoded.length===q.byteLength,'QUALIFICATION_BYTE_LENGTH_MISMATCH');
  need(sha256(decoded)===q.sha256,'QUALIFICATION_BYTES_SHA_MISMATCH');
  return decoded;
}
function approvalSchema(a){
  keys(a,['gateId','ownerApprovalRef','supervisorApprovalRef','decision','authorization'],'EXECUTION_APPROVAL_SCHEMA');
  for(const key of ['gateId','ownerApprovalRef','supervisorApprovalRef'])text(a[key],'EXECUTION_APPROVAL_REFERENCE');
  keys(a.decision,['text','sha256'],'EXECUTION_DECISION_SCHEMA');text(a.decision.text,'EXECUTION_DECISION_TEXT');
  digest(a.decision.sha256,'EXECUTION_DECISION_SHA');
  need(sha256(Buffer.from(a.decision.text,'utf8'))===a.decision.sha256,'EXECUTION_DECISION_HASH_MISMATCH');
  keys(a.authorization,['action','deltaId','manifestSha256','qualificationReceiptSha256','beforeCanonicalSha256','afterCanonicalSha256','parentExecutionReceiptSha256'],'EXECUTION_AUTHORIZATION_SCHEMA');
}
function receiptSchema(e,ctx){
  keys(e,['contract','schemaVersion','synthetic','status','genesis','deltaId','manifest','qualification','beforeCanonicalSha256','afterCanonicalSha256','records','diffSha256','semanticSha256','rule','executionApproval','canonicalWritePerformed','readback','parent'],'EXECUTION_RECEIPT_SCHEMA');
  need(e.contract===EXECUTION_CONTRACT&&e.schemaVersion===1,'EXECUTION_CONTRACT_VERSION');
  need(e.synthetic===ctx.synthetic,'EXECUTION_DOMAIN_MISMATCH');
  need(e.status==='ACCEPTED_EXECUTION','EXECUTION_STATUS');equal(e.genesis,ctx.genesis,'EXECUTION_GENESIS_MISMATCH');
  need(typeof e.deltaId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(e.deltaId),'EXECUTION_DELTA_ID');
  keys(e.manifest,['repoPath','sha256'],'EXECUTION_MANIFEST_SCHEMA');digest(e.manifest.sha256,'EXECUTION_MANIFEST_SHA');
  need(e.manifest.repoPath==='config/size-authority/canonical-deltas/'+e.deltaId+'.json','EXECUTION_MANIFEST_PATH');
  for(const key of ['beforeCanonicalSha256','afterCanonicalSha256','diffSha256','semanticSha256'])digest(e[key],'EXECUTION_DIGEST_REQUIRED');
  need(Array.isArray(e.records)&&e.records.length>0,'EXECUTION_RECORDS_REQUIRED');
  for(const r of e.records){keys(r,['botanicalTaxonId','beforeRecordSha256','afterRecordSha256'],'EXECUTION_RECORD_SCHEMA');text(r.botanicalTaxonId,'EXECUTION_TAXON');digest(r.beforeRecordSha256,'EXECUTION_RECORD_SHA');digest(r.afterRecordSha256,'EXECUTION_RECORD_SHA');}
  need(new Set(e.records.map(r=>r.botanicalTaxonId)).size===e.records.length,'EXECUTION_DUPLICATE_TAXON');
  equal(e.rule,QUALIFICATION_IDENTITY,'EXECUTION_RULE_MISMATCH');approvalSchema(e.executionApproval);
  need(e.canonicalWritePerformed===true,'EXECUTION_NOT_COMPLETED');
  keys(e.readback,['canonicalSha256'],'EXECUTION_READBACK_SCHEMA');digest(e.readback.canonicalSha256,'EXECUTION_READBACK_SHA');
  need(e.readback.canonicalSha256===e.afterCanonicalSha256,'EXECUTION_READBACK_MISMATCH');
  if(e.parent!==null){
    keys(e.parent,['canonicalSha256','id','manifestSha256','qualificationReceiptSha256','executionReceiptSha256'],'EXECUTION_PARENT_SCHEMA');
    text(e.parent.id,'EXECUTION_PARENT_ID');
    for(const k of ['canonicalSha256','manifestSha256','qualificationReceiptSha256','executionReceiptSha256'])digest(e.parent[k],'EXECUTION_PARENT_DIGEST');
  }
}
function acceptedApproval(a,e){
  need(a!==undefined&&a!==null,'ACCEPTED_EXECUTION_APPROVAL_REQUIRED');
  keys(a,['deltaId','gateId','ownerApprovalRef','supervisorApprovalRef','approvalSha256'],'ACCEPTED_APPROVAL_SCHEMA');
  digest(a.approvalSha256,'ACCEPTED_APPROVAL_DIGEST_REQUIRED');
  for(const k of ['deltaId','gateId','ownerApprovalRef','supervisorApprovalRef'])text(a[k],'ACCEPTED_APPROVAL_REFERENCE');
  need(a.deltaId===e.deltaId,'ACCEPTED_APPROVAL_DELTA_MISMATCH');
  for(const k of ['gateId','ownerApprovalRef','supervisorApprovalRef'])need(a[k]===e.executionApproval[k],'ACCEPTED_APPROVAL_REFERENCE_MISMATCH');
  // Digest the entire structured approval, not merely its free-form decision text.
  // This binds identity, roles, gate, exact transition and previous execution tip.
  need(a.approvalSha256===identity(e.executionApproval),'ACCEPTED_APPROVAL_DIGEST_MISMATCH');
}
function replayExecution(ctx,options){
  pinnedEngine();
  keys(options,['chain','acceptedExecutionTipSha256','acceptedApprovals','currentCanonicalBytes'],'EXECUTION_OPTIONS_SCHEMA');
  const {chain,acceptedExecutionTipSha256,acceptedApprovals}=options;
  need(Array.isArray(chain),'EXECUTION_CHAIN_REQUIRED');
  for(const row of chain){
    need(object(row)&&Buffer.isBuffer(row.executionReceiptBytes),'EXECUTION_RECEIPT_REQUIRED');
    keys(row,['manifestRepoPath','manifestBytes','executionReceiptBytes'],'EXECUTION_CHAIN_ROW_SCHEMA');
  }
  need(Array.isArray(acceptedApprovals)&&acceptedApprovals.length===chain.length,'ACCEPTED_EXECUTION_APPROVALS_REQUIRED');
  const current=bytes(options.currentCanonicalBytes,'CURRENT_CANONICAL_BYTES_REQUIRED');
  if(chain.length)digest(acceptedExecutionTipSha256,'ACCEPTED_EXECUTION_TIP_REQUIRED');
  else need(acceptedExecutionTipSha256===null,'GENESIS_EXECUTION_TIP_MUST_BE_NULL');
  let link=null,beforeSha=ctx.genesis.canonicalSha256;
  const ids=new Set(),states=new Set([beforeSha]),qualificationChain=[];
  for(let i=0;i<chain.length;i++){
    const row=chain[i],manifestBytes=bytes(row.manifestBytes,'MANIFEST_BYTES_REQUIRED');
    const executionBytes=bytes(row.executionReceiptBytes,'EXECUTION_RECEIPT_REQUIRED');
    const e=parseProfile(executionBytes);receiptSchema(e,ctx);
    need(!ids.has(e.deltaId),'EXECUTION_DUPLICATE_DELTA_ID');
    need(!states.has(e.afterCanonicalSha256),'EXECUTION_CHAIN_CYCLE');
    equal(e.parent,link,'EXECUTION_PARENT_LINK_MISMATCH');
    need(e.beforeCanonicalSha256===beforeSha,'EXECUTION_CANONICAL_CONTINUITY');
    if(e.parent===null)need(e.beforeCanonicalSha256===ctx.genesis.canonicalSha256,'EXECUTION_NULL_PARENT_ONLY_GENESIS');
    need(row.manifestRepoPath===e.manifest.repoPath,'EXECUTION_MANIFEST_PATH_MISMATCH');
    need(sha256(manifestBytes)===e.manifest.sha256,'EXECUTION_MANIFEST_SHA_MISMATCH');
    const m=parseProfile(manifestBytes),qBytes=decodeQualification(e.qualification),q=parseProfile(qBytes);
    need(q.contract==='size-authority-scratch-qualification-v1'&&q.schemaVersion===1&&q.status==='SEALED_SCRATCH_VERIFIED'&&q.synthetic===ctx.synthetic,'SCRATCH_QUALIFICATION_KIND');
    need(q.canonicalWritePerformed===false&&q.executionAuthorization==='EXTERNAL_OWNER_SUPERVISOR_REQUIRED','SCRATCH_QUALIFICATION_AUTHORITY');
    need(m.deltaId===e.deltaId&&q.deltaId===e.deltaId,'EXECUTION_DELTA_MISMATCH');
    need(q.manifestSha256===e.manifest.sha256,'QUALIFICATION_MANIFEST_MISMATCH');
    need(m.parent.canonicalSha256===e.beforeCanonicalSha256&&q.beforeCanonicalSha256===e.beforeCanonicalSha256,'EXECUTION_BEFORE_MISMATCH');
    need(m.result.canonicalSha256===e.afterCanonicalSha256&&q.afterCanonicalSha256===e.afterCanonicalSha256,'EXECUTION_AFTER_MISMATCH');
    equal(e.records,q.records,'EXECUTION_RECORD_FINGERPRINT_MISMATCH');
    need(e.diffSha256===identity(q.diff),'EXECUTION_DIFF_MISMATCH');
    need(q.semantic.ok===true&&e.semanticSha256===identity(q.semantic),'EXECUTION_SEMANTIC_MISMATCH');
    equal(q.rule,QUALIFICATION_IDENTITY,'QUALIFICATION_RULE_MISMATCH');
    qualificationChain.push({manifestBytes,receiptBytes:qBytes});
    // v1 independently regenerates Q and demands exact bytes for every replayed row.
    const qualified=ctx.verifyQualification(qualificationChain,e.qualification.sha256);
    need(qualified.canonicalSha256===e.afterCanonicalSha256,'QUALIFIED_RESULT_MISMATCH');
    equal(qualified.acceptedDelta,{id:e.deltaId,manifestSha256:e.manifest.sha256,receiptSha256:e.qualification.sha256},'QUALIFICATION_PARENT_LINK_MISMATCH');
    equal(e.executionApproval.authorization,{
      action:'CANONICAL_TRANSITION_EXECUTION',deltaId:e.deltaId,manifestSha256:e.manifest.sha256,
      qualificationReceiptSha256:e.qualification.sha256,beforeCanonicalSha256:e.beforeCanonicalSha256,
      afterCanonicalSha256:e.afterCanonicalSha256,parentExecutionReceiptSha256:link?.executionReceiptSha256??null
    },'EXECUTION_AUTHORIZATION_BINDING_MISMATCH');
    acceptedApproval(acceptedApprovals[i],e);
    // Advance only after qualification, scope, authority and readback assertions pass.
    link={canonicalSha256:e.afterCanonicalSha256,id:e.deltaId,manifestSha256:e.manifest.sha256,
      qualificationReceiptSha256:e.qualification.sha256,executionReceiptSha256:sha256(executionBytes)};
    beforeSha=e.afterCanonicalSha256;ids.add(e.deltaId);states.add(beforeSha);
  }
  need((link?.executionReceiptSha256??null)===acceptedExecutionTipSha256,'ACCEPTED_EXECUTION_TIP_MISMATCH');
  need(sha256(current)===beforeSha,'CURRENT_CANONICAL_READBACK_MISMATCH');
  return {contract:'size-authority-canonical-execution-chain-verification-v1',schemaVersion:1,synthetic:ctx.synthetic,
    status:chain.length?'ACCEPTED_EXECUTION_CHAIN_VERIFIED':'EXACT_GENESIS_EXECUTION_STATE',canonicalSha256:beforeSha,
    acceptedDelta:link,acceptedExecutionTipSha256,deltaCount:ids.size,canonicalWritePerformed:false};
}
const realContext=()=>({genesis:GENESIS,synthetic:false,
  verifyQualification:(chain,tip)=>verifyChain({chain,acceptedTipReceiptSha256:tip})});

// currentCanonicalBytes is an independent readback supplied by the calling gate.
// For historical transitions, the accepted E records bind their readback assertion;
// only the final tip can be compared to the currently stored canonical bytes.
export function verifyExecutionChain(options){return replayExecution(realContext(),options);}
function one(ctx,options){
  keys(options,['priorChain','receipt','acceptedExecutionTipSha256','acceptedApprovals','currentCanonicalBytes'],'EXECUTION_RECEIPT_OPTIONS_SCHEMA');
  need(Array.isArray(options.priorChain),'EXECUTION_PRIOR_CHAIN_REQUIRED');
  return replayExecution(ctx,{chain:[...options.priorChain,options.receipt],acceptedExecutionTipSha256:options.acceptedExecutionTipSha256,
    acceptedApprovals:options.acceptedApprovals,currentCanonicalBytes:options.currentCanonicalBytes});
}
export function verifyExecutionReceipt(options){return one(realContext(),options);}

// Fixtures cannot accept real taxon identities, real genesis, or real receipts.
// There is no injectable qualification-verifier callback on the public real API.
export function syntheticExecutionHarness(genesisBytes,evidence){
  pinnedEngine();const v1=syntheticHarness(genesisBytes,evidence);
  const ctx={genesis:v1.genesis,synthetic:true,verifyQualification:(chain,tip)=>{
    const r=v1.replay(chain,tip);return {canonicalSha256:sha256(r.bytes),acceptedDelta:r.link};
  }};
  return Object.freeze({verifyExecutionChain:options=>replayExecution(ctx,options),verifyExecutionReceipt:options=>one(ctx,options)});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  throw new Error('EXECUTION_CHAIN_API_ONLY_NO_WRITE_COMMAND');
}
