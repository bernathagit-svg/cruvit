#!/usr/bin/env node
// Offline qualification only. There is deliberately no promotion or live writer.
// CLI: prepare|verify --input ABS --manifest ABS --out ABS --scratch-root ABS
//      [--chain ABS --tip SHA256] [--manifest-sha256 SHA256 (required for verify)]
// Chain file: [{manifestPath: ABS, receiptPath: ABS}], explicitly ordered and pinned.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateBotanicalRange, PHYSICAL_SCALE_MODEL_VERSION} from '../../modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = fileURLToPath(import.meta.url);
const VALIDATOR = 'modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';
const CANONICAL = 'data/catalog/botanical-size-authority-v1.json';
export const GENESIS = Object.freeze({freezeCommit:'92cb4282970a6aac75e0ab88d13b2a110bbd393d',canonicalSha256:'86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b'});
export const CONTRACT = 'size-authority-canonical-delta-v1';
const PREFIX = 'RUNTIME_AUTHORITY_';
const STATES = ['READY','PARTIAL','USER_CONTEXT_REQUIRED','CONFLICT_HOLD','EVIDENCE_GAP'].map(s=>PREFIX+s);
const READY = STATES[0], PARTIAL = STATES[1], CONTEXT = STATES[2];
const FIELDS = new Set(['/runtimeAuthority','/defaultPreviewScenario','/selectedHeightEvidenceRef','/selectedSpreadEvidenceRef','/selectedSource','/normalizedRange','/partialAnchor','/HEIGHT_SCALE_READY','/SPREAD_SCALE_READY','/spreadSourceSupported','/sensitivity/notFinalPersonalGardenSize']);
const STATUSES = ['known','unknown','context-required','held'];
const PROFILE = {recordFingerprint:'sorted-json-v1',canonicalBytes:'json-pretty-2-lf-preserve-order-v1'};
const fail = (code, detail='') => {throw new Error(code+(detail?': '+detail:''));};
const need = (yes, code, detail) => {if(!yes) fail(code,detail);};
const object = x => x!==null && typeof x==='object' && !Array.isArray(x);
const same = (a,b) => sortedJson(a)===sortedJson(b);
const exact = (a,b,code) => need(same(a,b),code);
const text = (x,code) => need(typeof x==='string' && x.length>0 && x.length<=16384 && !/<[^>]+>|\$\{|\b(?:TODO|TBD|PLACEHOLDER)\b/.test(x),code);
const digest = (x,code) => need(typeof x==='string' && /^[a-f0-9]{64}$/.test(x),code);
const unique = (xs,code) => need(Array.isArray(xs) && new Set(xs).size===xs.length,code);
function keys(x, names, code){need(object(x),code); exact(Object.keys(x).sort(),names.slice().sort(),code);}
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function jsonValue(x){
  if(x===null || typeof x==='string' || typeof x==='boolean') return;
  if(typeof x==='number'){need(Number.isFinite(x)&&!Object.is(x,-0),'NON_JSON_NUMBER');return;}
  need(Array.isArray(x)||object(x),'NON_JSON_VALUE');
  need(Array.isArray(x)||Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null,'NON_JSON_OBJECT');
  if(Array.isArray(x)) need(Object.keys(x).length===x.length,'SPARSE_ARRAY');
  for(const [key, value] of Object.entries(x)){
    need(!['__proto__','prototype','constructor'].includes(key),'DANGEROUS_PROPERTY'); jsonValue(value);
  }
}
// Exact freeze profile, including lexicographic numeric object keys.
export function sortedJson(x){
  jsonValue(x);
  if(Array.isArray(x)) return '['+x.map(sortedJson).join(',')+']';
  if(object(x)) return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+sortedJson(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
export const fingerprint = x => sha256(Buffer.from(sortedJson(x),'utf8'));
export function canonicalBytes(x){jsonValue(x);return Buffer.from(JSON.stringify(x,null,2)+'\n','utf8');}
export function parseProfile(bytes){
  need(Buffer.isBuffer(bytes)||typeof bytes==='string','BYTES_REQUIRED');
  const raw=Buffer.from(bytes), s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
  let value; try{value=JSON.parse(s);}catch{fail('MALFORMED_JSON');}
  // Duplicate keys and lossy number encodings cannot survive an exact round trip.
  need(canonicalBytes(value).equals(raw),'JSON_PROFILE_MISMATCH'); return value;
}
export function toolIdentity(){return {id:'context-required-demotion-v1',version:1,engineSha256:sha256(fs.readFileSync(SELF)),rangeValidatorSourceSha256:sha256(fs.readFileSync(path.join(ROOT,VALIDATOR)))};}

function pointer(p){
  text(p,'POINTER_REQUIRED'); need(p.startsWith('/')&&!p.includes('\\')&&!/~(?![01])/.test(p),'INVALID_POINTER');
  const parts=p.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
  need(parts.every(s=>s && !['.','..','__proto__','prototype','constructor'].includes(s) && !/[*\/]/.test(s)),'UNSAFE_POINTER');
  return parts;
}
function at(value,p){
  for(const key of pointer(p)){need((object(value)||Array.isArray(value))&&Object.hasOwn(value,key),'FIELD_ABSENT',p);value=value[key];}
  return value;
}
function replace(value,op){
  const parts=pointer(op.path), key=parts.pop(); let parent=value;
  for(const part of parts){need(object(parent)&&Object.hasOwn(parent,part),'FIELD_ABSENT',op.path);parent=parent[part];}
  need(object(parent)&&Object.hasOwn(parent,key),'FIELD_ABSENT',op.path);
  exact(parent[key],op.before.value,'BEFORE_VALUE_MISMATCH'); parent[key]=structuredClone(op.after.value);
}
function operations(ops, eligible){
  need(Array.isArray(ops)&&ops.length>0,'OPERATIONS_REQUIRED');
  const paths=[];
  for(const op of ops){
    keys(op,['path','before','after'],'OP_SCHEMA');pointer(op.path);
    for(const side of ['before','after']){keys(op[side],['present','value'],'PRESENCE_SCHEMA');need(op[side].present===true,'EXISTING_FIELDS_ONLY');}
    need(eligible.has(op.path),'UNAUTHORIZED_PATH',op.path);need(!same(op.before.value,op.after.value),'NO_OP');paths.push(op.path);
  }
  unique(paths,'DUPLICATE_PATH');
  for(const a of paths)for(const b of paths)if(a!==b)need(!a.startsWith(b+'/'),'OVERLAPPING_PATHS');
  return paths.sort();
}
function manifestSchema(m, mode, ctx){
  keys(m,['contract','schemaVersion','deltaId','genesis','parent','profile','scope','records','lookups','metadata','result','provenance'],'MANIFEST_SCHEMA');
  need(m.contract===CONTRACT&&m.schemaVersion===1,'CONTRACT_VERSION');text(m.deltaId,'DELTA_ID');
  need(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(m.deltaId),'DELTA_ID');exact(m.genesis,ctx.genesis,'GENESIS_IDENTITY');exact(m.profile,PROFILE,'PROFILE');
  keys(m.parent,['canonicalSha256','acceptedDelta'],'PARENT_SCHEMA');digest(m.parent.canonicalSha256,'PARENT_SHA');
  if(m.parent.acceptedDelta===null) need(m.parent.canonicalSha256===ctx.genesis.canonicalSha256,'NULL_PARENT_ONLY_GENESIS');
  else {keys(m.parent.acceptedDelta,['id','manifestSha256','receiptSha256'],'PARENT_LINK');text(m.parent.acceptedDelta.id,'PARENT_ID');digest(m.parent.acceptedDelta.manifestSha256,'PRIOR_MANIFEST_SHA');digest(m.parent.acceptedDelta.receiptSha256,'PRIOR_RECEIPT_SHA');}
  keys(m.scope,['taxa','recordFields','lookupKeys','metadataFields','recordOrderChange'],'SCOPE_SCHEMA');
  unique(m.scope.taxa,'DUPLICATE_TARGET');need(m.scope.taxa.length>0,'TARGET_REQUIRED');m.scope.taxa.forEach(t=>text(t,'TARGET_ID'));
  need(object(m.scope.recordFields),'FIELD_SCOPE');exact(Object.keys(m.scope.recordFields).sort(),m.scope.taxa.slice().sort(),'FIELD_SCOPE');
  exact(m.scope.lookupKeys,[],'LOOKUP_FORBIDDEN');exact(m.lookups,[],'LOOKUP_FORBIDDEN');need(m.scope.recordOrderChange===false,'ORDER_FORBIDDEN');
  need(Array.isArray(m.records),'RECORDS_REQUIRED');unique(m.records.map(r=>r.botanicalTaxonId),'DUPLICATE_TARGET');
  exact(m.records.map(r=>r.botanicalTaxonId).sort(),m.scope.taxa.slice().sort(),'TARGET_SCOPE');
  for(const r of m.records){
    keys(r,['botanicalTaxonId','beforeRecordSha256','afterRecordSha256','replacements'],'RECORD_SCHEMA');digest(r.beforeRecordSha256,'BEFORE_FINGERPRINT');
    if(mode==='verify'||r.afterRecordSha256!==null)digest(r.afterRecordSha256,'AFTER_FINGERPRINT');
    const paths=operations(r.replacements,FIELDS);unique(m.scope.recordFields[r.botanicalTaxonId],'DUPLICATE_PATH');exact(paths,m.scope.recordFields[r.botanicalTaxonId].slice().sort(),'RECORD_PATH_SCOPE');
  }
  unique(m.scope.metadataFields,'DUPLICATE_METADATA');
  const metaPaths=operations(m.metadata,new Set(STATES.map(s=>'/expectedAccounting/'+s)));
  exact(metaPaths,m.scope.metadataFields.slice().sort(),'METADATA_SCOPE');
  keys(m.result,['canonicalSha256','recordCount','lookupCount'],'RESULT_SCHEMA');
  if(mode==='verify'||m.result.canonicalSha256!==null)digest(m.result.canonicalSha256,'RESULT_SHA');
  need(m.result.recordCount===ctx.recordCount&&m.result.lookupCount===ctx.lookupCount,'RESULT_COUNTS');
  keys(m.provenance,['sourceEvidence','decision','rule','reason','valueStatus'],'PROVENANCE_SCHEMA');exact(m.provenance.rule,toolIdentity(),'TOOL_RULE_VALIDATOR_IDENTITY');
  text(m.provenance.reason,'REASON');keys(m.provenance.valueStatus,['height','spread'],'VALUE_STATUS');
  for(const s of Object.values(m.provenance.valueStatus))need(STATUSES.includes(s),'VALUE_STATUS');
  const d=m.provenance.decision;keys(d,['gateId','ownerApprovalId','supervisorApprovalId','record'],'DECISION_SCHEMA');
  for(const k of ['gateId','ownerApprovalId','supervisorApprovalId'])text(d[k],'DECISION_REFERENCE');
  keys(d.record,['reference','text','sha256'],'DECISION_RECORD');text(d.record.reference,'DECISION_RECORD_REFERENCE');text(d.record.text,'DECISION_RECORD_TEXT');
  digest(d.record.sha256,'DECISION_SHA');need(sha256(Buffer.from(d.record.text,'utf8'))===d.record.sha256,'DECISION_HASH_MISMATCH');
  need(Array.isArray(m.provenance.sourceEvidence)&&m.provenance.sourceEvidence.length>0,'EVIDENCE_REQUIRED');
  for(const e of m.provenance.sourceEvidence){
    keys(e,['refId','artifact','entryPointer','entrySha256','taxon','dimension','context'],'EVIDENCE_SCHEMA');
    keys(e.artifact,['repoPath','revision','sha256'],'ARTIFACT_SCHEMA');
    for(const k of ['refId','taxon','context'])text(e[k],'EVIDENCE_BINDING');
    need(m.scope.taxa.includes(e.taxon),'EVIDENCE_TAXON');need(['height','spread','context'].includes(e.dimension),'EVIDENCE_DIMENSION');
    repoPath(e.artifact.repoPath);need(/^[a-f0-9]{40}$/.test(e.artifact.revision),'EVIDENCE_REVISION');digest(e.artifact.sha256,'EVIDENCE_SHA');digest(e.entrySha256,'ENTRY_SHA');pointer(e.entryPointer);
  }
  unique(m.provenance.sourceEvidence.map(e=>e.taxon+'|'+e.refId+'|'+e.dimension),'DUPLICATE_EVIDENCE');
}

function runtimeClaims(r){
  const anchor=r.partialAnchor;
  return {
    height:r.runtimeAuthority===READY||r.HEIGHT_SCALE_READY===true||Boolean(r.selectedHeightEvidenceRef)||['HEIGHT_ANCHORED_ESTIMATE','HEIGHT_ANCHORED_SPREAD_MAX_ONLY','HEIGHT_AND_SPREAD_SOURCE_SUPPORTED'].includes(anchor),
    spread:r.runtimeAuthority===READY||r.SPREAD_SCALE_READY===true||r.spreadSourceSupported===true||Boolean(r.selectedSpreadEvidenceRef)||anchor==='HEIGHT_AND_SPREAD_SOURCE_SUPPORTED'
  };
}
export function inspectRegistry(registry){
  const errors=[], inherited=[];const error=(code,taxon=null)=>errors.push({code,taxon});
  if(!object(registry)||!Array.isArray(registry.records)||!object(registry.slugToBotanicalTaxonId)){return {ok:false,errors:[{code:'REGISTRY_SHAPE',taxon:null}],inheritedProvenance:[]};}
  const ids=new Set(), accounting=Object.fromEntries([...STATES,'TOTAL'].map(s=>[s,0]));
  for(const r of registry.records){
    if(!object(r)||typeof r.botanicalTaxonId!=='string'||!r.botanicalTaxonId||ids.has(r.botanicalTaxonId)){error('UNIQUE_TAXON',r?.botanicalTaxonId??null);continue;}
    const id=r.botanicalTaxonId;ids.add(id);accounting.TOTAL++;
    if(!STATES.includes(r.runtimeAuthority)){error('AUTHORITY_ENUM',id);continue;}accounting[r.runtimeAuthority]++;
    if(r.runtimeWired!==undefined&&r.runtimeWired!==false)error('RUNTIME_SEPARATION',id);
    if(!Array.isArray(r.canonicalSlugAliases)||new Set(r.canonicalSlugAliases).size!==r.canonicalSlugAliases.length)error('ALIASES',id);
    else for(const slug of r.canonicalSlugAliases)if(registry.slugToBotanicalTaxonId[slug]!==id)error('ALIAS_LOOKUP',id);
    if(r.runtimeAuthority===READY||r.runtimeAuthority===PARTIAL){
      if(r.runtimeAuthority===PARTIAL&&!['HEIGHT_ANCHORED_ESTIMATE','HEIGHT_ANCHORED_SPREAD_MAX_ONLY','HEIGHT_AND_SPREAD_SOURCE_SUPPORTED'].includes(r.partialAnchor))error('PARTIAL_ANCHOR',id);
      for(const [dim,claimed] of Object.entries(runtimeClaims(r)))if(claimed&&!validateBotanicalRange(r.normalizedRange?.[dim+'M']).valid)error('INVALID_RUNTIME_'+dim.toUpperCase(),id);
    }else{
      if(r.defaultPreviewScenario!=null||r.selectedHeightEvidenceRef!=null||r.selectedSpreadEvidenceRef!=null||r.partialAnchor!=null)error('HELD_SELECTION',id);
      if(r.normalizedRange!=null && (!object(r.normalizedRange)||Object.values(r.normalizedRange).some(v=>v!==null)))error('HELD_RANGE',id);
      if(r.runtimeAuthority===STATES[3]&&(!Array.isArray(r.conflictingEvidenceIds)||r.conflictingEvidenceIds.length<2))error('CONFLICT_EVIDENCE',id);
    }
    for(const ref of [r.selectedHeightEvidenceRef,r.selectedSpreadEvidenceRef])if(ref&&!r.provenanceEvidenceIds?.includes(ref)){inherited.push({taxon:id,ref,status:'FROZEN_NOT_REAUTHENTICATED'});}
  }
  for(const [slug,id] of Object.entries(registry.slugToBotanicalTaxonId))if(!slug||!ids.has(id))error('LOOKUP_TARGET',id);
  if(!same(accounting,registry.expectedAccounting??null))error('ACCOUNTING');
  if(registry.contract!=='botanical-size-authority-v1'||registry.authorityVersion!=='botanical-size-authority-v1'||registry.runtimeWired!==false||registry.immutableFromUserActions!==true||registry.universalDefaultPreviewScenario!==null||registry.mergeCanonicalSlugsNow!==false)error('RUNTIME_DESIGN_SEPARATION');
  return {ok:errors.length===0,errors,inheritedProvenance:inherited,accounting,recordCount:registry.records.length,lookupCount:Object.keys(registry.slugToBotanicalTaxonId).length,validatorVersion:PHYSICAL_SCALE_MODEL_VERSION};
}
export function inspectGenesis(bytes){
  need(sha256(bytes)===GENESIS.canonicalSha256,'GENESIS_SHA');const registry=parseProfile(bytes), semantic=inspectRegistry(registry);
  need(registry.records.length===117&&Object.keys(registry.slugToBotanicalTaxonId).length===119,'GENESIS_COUNTS');
  exact(semantic.errors,[{code:'INVALID_RUNTIME_HEIGHT',taxon:'taxon:plinia-cauliflora'}],'UNEXPECTED_GENESIS_DEFECT');
  return {status:'GENESIS_INTEGRITY_ACCEPTED_WITH_KNOWN_DEFECT',canonicalSha256:sha256(bytes),semantic};
}

function leafDiff(a,b,base=''){
  if(same(a,b))return [];
  if(object(a)&&object(b)&&same(Object.keys(a).sort(),Object.keys(b).sort()))return Object.keys(a).flatMap(k=>leafDiff(a[k],b[k],base+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1')));
  return [base];
}
export function verifyIsolation(before,after,m){
  exact(before.records.map(r=>r.botanicalTaxonId),after.records.map(r=>r.botanicalTaxonId),'RECORD_ORDER_DRIFT');
  need(canonicalBytes(before.slugToBotanicalTaxonId).equals(canonicalBytes(after.slugToBotanicalTaxonId)),'LOOKUP_DRIFT');
  need(Object.keys(before).join('\0')===Object.keys(after).join('\0'),'TOP_LEVEL_ORDER_DRIFT');
  const changedTaxa=[],changedRecordFields={};
  for(let i=0;i<before.records.length;i++){
    const a=before.records[i],b=after.records[i],id=a.botanicalTaxonId;
    if(canonicalBytes(a).equals(canonicalBytes(b)))continue;
    changedTaxa.push(id);need(m.scope.taxa.includes(id),'UNRELATED_TAXON_DRIFT',id);
    const paths=m.scope.recordFields[id], actual=leafDiff(a,b);
    for(const p of actual)need(paths.some(q=>p===q||p.startsWith(q+'/')),'UNDECLARED_RECORD_DRIFT',p);
    for(const p of paths)need(!same(at(a,p),at(b,p)),'DECLARED_UNCHANGED_PATH',p);
    // Undo just authorized replacements and require exact serialization, including key order.
    const restored=structuredClone(b);for(const p of paths)replace(restored,{path:p,before:{value:at(b,p)},after:{value:at(a,p)}});
    need(canonicalBytes(restored).equals(canonicalBytes(a)),'RECORD_SERIALIZATION_DRIFT');changedRecordFields[id]=paths.slice().sort();
  }
  exact(changedTaxa.slice().sort(),m.scope.taxa.slice().sort(),'CHANGED_TAXON_SCOPE');
  const aMeta=Object.fromEntries(Object.entries(before).filter(([k])=>!['records','slugToBotanicalTaxonId'].includes(k)));
  const bMeta=Object.fromEntries(Object.entries(after).filter(([k])=>!['records','slugToBotanicalTaxonId'].includes(k)));
  const metadataPaths=leafDiff(aMeta,bMeta).sort();exact(metadataPaths,m.scope.metadataFields.slice().sort(),'METADATA_DRIFT');
  const restored=structuredClone(bMeta);for(const p of metadataPaths)replace(restored,{path:p,before:{value:at(bMeta,p)},after:{value:at(aMeta,p)}});
  need(canonicalBytes(restored).equals(canonicalBytes(aMeta)),'METADATA_SERIALIZATION_DRIFT');
  return {changedTaxa,changedRecordFields,lookupDelta:[],metadataDelta:metadataPaths.map(p=>({path:p,before:at(before,p),after:at(after,p)})),recordOrderChanged:false,unexpectedDeltaCount:0,unchangedRecords:before.records.length-changedTaxa.length};
}
function repoPath(p){text(p,'EVIDENCE_PATH');need(!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes(':')&&p.split('/').every(s=>s&&!['.','..','.git'].includes(s)),'UNSAFE_REPO_PATH');}
function git(args){return cp.execFileSync('git',args,{cwd:ROOT,maxBuffer:32_000_000,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});}
function gitArtifact(revision,p){
  repoPath(p);need(/^[a-f0-9]{40}$/.test(revision),'REVISION');
  const tree=git(['ls-tree','-z',revision,'--',p]).toString('utf8');
  need(new RegExp('^100(?:644|755) blob [a-f0-9]{40}\\t').test(tree)&&tree.slice(tree.indexOf('\t')+1,-1)===p,'TRACKED_EVIDENCE_REQUIRED');
  return git(['cat-file','blob',revision+':'+p]);
}
function sourceEntries(m,ctx,records){
  const entries=[];
  for(const e of m.provenance.sourceEvidence){
    const bytes=ctx.readEvidence(e.artifact.revision,e.artifact.repoPath);need(sha256(bytes)===e.artifact.sha256,'EVIDENCE_HASH_MISMATCH');
    // Evidence bytes are pinned, but historical evidence need not use canonical formatting.
    const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)), row=at(doc,e.entryPointer);
    need(fingerprint(row)===e.entrySha256,'ENTRY_HASH_MISMATCH');
    need(row.botanicalTaxonId===e.taxon,'EVIDENCE_TAXON_MISMATCH');
    need((row.recordId??row.sourceId)===e.refId,'EVIDENCE_REF_MISMATCH');
    need((row.conditions??row.context??row.sizeScenario)===e.context,'EVIDENCE_CONTEXT_MISMATCH');
    need(row.growthStage===records.get(e.taxon).growthStage,'EVIDENCE_STAGE_MISMATCH');
    const dimension=e.dimension;
    if(dimension!=='context')need(Object.hasOwn(row,dimension+'MinM')||Object.hasOwn(row,dimension+'M')||Object.hasOwn(row.normalizedSi??{},dimension+'M')||row.dimension===dimension,'EVIDENCE_DIMENSION_MISMATCH');
    entries.push({binding:e,row});
  }
  for(const id of m.scope.taxa){
    const r=records.get(id), bound=entries.filter(e=>e.binding.taxon===id);need(bound.length>0,'TAXON_EVIDENCE_REQUIRED');
    for(const ref of r.provenanceEvidenceIds??[])need(bound.some(e=>e.binding.refId===ref||e.row.sourceUrl===ref),'UNRESOLVED_CHANGED_PROVENANCE',ref);
    for(const dim of ['height','spread']){
      const ref=r['selected'+dim[0].toUpperCase()+dim.slice(1)+'EvidenceRef'];
      if(ref!=null)need(bound.some(e=>e.binding.refId===ref&&e.binding.dimension===dim),'UNRESOLVED_CHANGED_SELECTION',ref);
    }
  }
  return entries.map(e=>({taxon:e.binding.taxon,refId:e.binding.refId,dimension:e.binding.dimension,entrySha256:e.binding.entrySha256}));
}
function applyOne(ctx,inputBytes,manifestBytes,mode,link,ids){
  const m=parseProfile(manifestBytes);manifestSchema(m,mode,ctx);
  need(!ids.has(m.deltaId),'DUPLICATE_DELTA_ID');
  need(sha256(inputBytes)===m.parent.canonicalSha256,'PARENT_SHA_MISMATCH');exact(m.parent.acceptedDelta,link,'PARENT_LINK_MISMATCH');
  const before=parseProfile(inputBytes), records=new Map(before.records.map(r=>[r.botanicalTaxonId,r]));
  need(records.size===before.records.length,'DUPLICATE_CANONICAL_TAXON');
  for(const r of m.records){need(records.has(r.botanicalTaxonId),'TARGET_NOT_FOUND');need(fingerprint(records.get(r.botanicalTaxonId))===r.beforeRecordSha256,'BEFORE_FINGERPRINT_MISMATCH');}
  const evidence=sourceEntries(m,ctx,records);
  const after=structuredClone(before), next=new Map(after.records.map(r=>[r.botanicalTaxonId,r]));
  for(const r of m.records){
    const previous=records.get(r.botanicalTaxonId), value=next.get(r.botanicalTaxonId);
    need([READY,PARTIAL].includes(previous.runtimeAuthority),'DEMOTION_SOURCE_STATE');
    for(const op of r.replacements.slice().sort((a,b)=>a.path.localeCompare(b.path)))replace(value,op);
    need(value.runtimeAuthority===CONTEXT,'DEMOTION_TARGET_STATE');
    for(const field of ['defaultPreviewScenario','selectedHeightEvidenceRef','selectedSpreadEvidenceRef','selectedSource','normalizedRange','partialAnchor'])need(value[field]===null,'DEMOTION_MUST_CLEAR_SELECTION',field);
    for(const field of ['HEIGHT_SCALE_READY','SPREAD_SCALE_READY','spreadSourceSupported'])need(value[field]===false,'DEMOTION_FLAGS',field);
    need(value.sensitivity?.notFinalPersonalGardenSize===true,'DEMOTION_SENSITIVITY');
    need(m.provenance.valueStatus.height==='context-required'&&['unknown','context-required','held'].includes(m.provenance.valueStatus.spread),'DEMOTION_VALUE_STATUS');
    if(r.afterRecordSha256!==null)need(fingerprint(value)===r.afterRecordSha256,'AFTER_FINGERPRINT_MISMATCH');
  }
  for(const op of m.metadata)replace(after,op);
  const diff=verifyIsolation(before,after,m), semantic=inspectRegistry(after);
  need(semantic.ok,'POST_GENESIS_SEMANTIC_FAILURE',JSON.stringify(semantic.errors));
  need(semantic.recordCount===ctx.recordCount&&semantic.lookupCount===ctx.lookupCount,'COUNTS');
  const outputBytes=canonicalBytes(after), resultSha=sha256(outputBytes);
  if(m.result.canonicalSha256!==null)need(resultSha===m.result.canonicalSha256,'RESULT_HASH_MISMATCH');
  const receipt={contract:'size-authority-scratch-qualification-v1',schemaVersion:1,synthetic:ctx.synthetic,status:mode==='prepare'?'DRAFT_NOT_AUTHORIZED':'SEALED_SCRATCH_VERIFIED',executionAuthorization:'EXTERNAL_OWNER_SUPERVISOR_REQUIRED',canonicalWritePerformed:false,
    deltaId:m.deltaId,manifestSha256:sha256(manifestBytes),genesis:ctx.genesis,parent:m.parent,beforeCanonicalSha256:sha256(inputBytes),afterCanonicalSha256:resultSha,
    records:m.records.map(r=>({botanicalTaxonId:r.botanicalTaxonId,beforeRecordSha256:r.beforeRecordSha256,afterRecordSha256:fingerprint(next.get(r.botanicalTaxonId))})),diff,semantic,evidence,decision:m.provenance.decision,rule:m.provenance.rule};
  return {outputBytes,receipt,receiptBytes:canonicalBytes(receipt)};
}
function replay(ctx,chain,tip){
  need(Array.isArray(chain),'CHAIN_REQUIRED');let bytes=ctx.bytes,link=null;const ids=new Set(), states=new Set([sha256(bytes)]);
  for(const row of chain){
    keys(row,['manifestBytes','receiptBytes'],'CHAIN_ROW');
    const m=parseProfile(row.manifestBytes), receipt=parseProfile(row.receiptBytes);
    need(!ids.has(m.deltaId),'DUPLICATE_DELTA_ID');
    const result=applyOne(ctx,bytes,row.manifestBytes,'verify',link,ids);
    need(result.receiptBytes.equals(Buffer.from(row.receiptBytes)),'PRIOR_RECEIPT_MISMATCH');
    need(receipt.status==='SEALED_SCRATCH_VERIFIED'&&receipt.synthetic===ctx.synthetic,'RECEIPT_KIND');
    need(!states.has(result.receipt.afterCanonicalSha256),'CHAIN_CYCLE');
    ids.add(m.deltaId);states.add(result.receipt.afterCanonicalSha256);bytes=result.outputBytes;
    link={id:m.deltaId,manifestSha256:sha256(row.manifestBytes),receiptSha256:sha256(row.receiptBytes)};
  }
  if(chain.length){digest(tip,'ACCEPTED_TIP_REQUIRED');need(link.receiptSha256===tip,'ACCEPTED_TIP_MISMATCH');}else need(tip===null,'GENESIS_TIP_MUST_BE_NULL');
  return {bytes,link,ids};
}
function realContext(){
  const bytes=gitArtifact(GENESIS.freezeCommit,CANONICAL);inspectGenesis(bytes);
  return {genesis:GENESIS,bytes,recordCount:117,lookupCount:119,synthetic:false,readEvidence:(revision,p)=>{
    const evidence=gitArtifact(revision,p);
    // V1 demotes authority using existing evidence only; new evidence needs a new rule.
    need(evidence.equals(gitArtifact(GENESIS.freezeCommit,p)),'NEW_EVIDENCE_FORBIDDEN');return evidence;
  }};
}
function qualify(ctx,{inputBytes,manifestBytes,chain=[],acceptedTipReceiptSha256=null,expectedManifestSha256=null},mode){
  if(mode==='verify'){digest(expectedManifestSha256,'REVIEWED_MANIFEST_SHA_REQUIRED');need(sha256(manifestBytes)===expectedManifestSha256,'REVIEWED_MANIFEST_SHA_MISMATCH');}
  const parent=replay(ctx,chain,acceptedTipReceiptSha256);need(Buffer.from(inputBytes).equals(parent.bytes),'INPUT_NOT_ACCEPTED_CHAIN_TIP');
  return applyOne(ctx,Buffer.from(inputBytes),Buffer.from(manifestBytes),mode,parent.link,parent.ids);
}
export const prepareDelta = options => qualify(realContext(),options,'prepare');
export const verifyDelta = options => qualify(realContext(),options,'verify');
export function verifyChain({chain,acceptedTipReceiptSha256}){const r=replay(realContext(),chain,acceptedTipReceiptSha256);return {canonicalSha256:sha256(r.bytes),acceptedDelta:r.link,deltaCount:r.ids.size};}

// Isolated fixture adapter: no CLI option and no real taxon allowed.
// All receipts are permanently marked synthetic and cannot enter the real chain.
export function syntheticHarness(genesisBytes,evidence){
  const bytes=Buffer.from(genesisBytes), registry=parseProfile(bytes);
  need(registry.records.length>0&&registry.records.every(r=>r.botanicalTaxonId.startsWith('synthetic:')),'SYNTHETIC_TAXA_ONLY');
  const ctx={bytes,genesis:{freezeCommit:'0'.repeat(40),canonicalSha256:sha256(bytes)},recordCount:registry.records.length,lookupCount:Object.keys(registry.slugToBotanicalTaxonId).length,synthetic:true,
    readEvidence:(revision,p)=>{const b=evidence.get(revision+':'+p);need(b!==undefined,'SYNTHETIC_EVIDENCE_MISSING');return Buffer.from(b);}};
  return {genesis:structuredClone(ctx.genesis),prepare:options=>qualify(ctx,options,'prepare'),verify:options=>qualify(ctx,options,'verify'),replay:(chain,tip)=>replay(ctx,chain,tip),runScratch:options=>runScratchWith(ctx,options)};
}

function inside(child,parent){const c=child.toLowerCase(),p=parent.toLowerCase();return c===p||c.startsWith(p+path.sep);}
function noAliases(p){
  need(path.isAbsolute(p)&&path.normalize(p)===p&&!p.startsWith('\\\\?\\')&&!p.startsWith('\\\\.\\'),'ABSOLUTE_NORMAL_PATH_REQUIRED');
  let current=path.parse(p).root;
  for(const part of p.slice(current.length).split(path.sep).filter(Boolean)){
    need(!/[<>:"|?*]/.test(part)&&!/[. ]$/.test(part)&&!/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),'UNSAFE_PATH_COMPONENT');current=path.join(current,part);
    if(fs.existsSync(current))need(!fs.lstatSync(current).isSymbolicLink(),'SYMLINK_OR_REPARSE_PATH');
  }
}
export function validateScratchPaths({inputPath,manifestPath,outputPath,scratchRoot}){
  for(const p of [inputPath,manifestPath,outputPath,scratchRoot])noAliases(p);
  const checkout=fs.realpathSync(ROOT), scratch=fs.realpathSync(scratchRoot);
  need(fs.statSync(scratch).isDirectory(),'SCRATCH_ROOT_DIRECTORY');need(!inside(scratch,checkout)&&!inside(checkout,scratch),'SCRATCH_OUTSIDE_CHECKOUT');
  // Refuse other Git checkouts too; callers cannot disguise a live destination as scratch.
  for(let p=scratch;;p=path.dirname(p)){need(!fs.existsSync(path.join(p,'.git')),'SCRATCH_IN_GIT_CHECKOUT');if(path.dirname(p)===p)break;}
  const parent=fs.realpathSync(path.dirname(outputPath));need(inside(parent,scratch),'SCRATCH_PATH_ESCAPE');
  for(let p=parent;;p=path.dirname(p)){need(!fs.existsSync(path.join(p,'.git')),'OUTPUT_IN_GIT_CHECKOUT');if(path.dirname(p)===p)break;}
  const out=path.join(parent,path.basename(outputPath)), receipt=out+'.qualification.json';
  for(const p of [out,receipt]){need(!inside(p,checkout),'CHECKOUT_OUTPUT_FORBIDDEN');need(!fs.existsSync(p),'OUTPUT_EXISTS');need(!['inputPath','manifestPath'].some(k=>p.toLowerCase()===fs.realpathSync(k==='inputPath'?inputPath:manifestPath).toLowerCase()),'INPUT_OUTPUT_ALIAS');}
  return {outputPath:out,receiptPath:receipt};
}
function runScratchWith(ctx,{mode,inputPath,manifestPath,outputPath,scratchRoot,chain=[],acceptedTipReceiptSha256=null,expectedManifestSha256=null}){
  need(['prepare','verify'].includes(mode),'MODE');const paths=validateScratchPaths({inputPath,manifestPath,outputPath,scratchRoot});
  const result=qualify(ctx,{inputBytes:fs.readFileSync(inputPath),manifestBytes:fs.readFileSync(manifestPath),chain,acceptedTipReceiptSha256,expectedManifestSha256},mode);
  // Recheck after qualification. Exclusive creation never overwrites an existing file.
  validateScratchPaths({inputPath,manifestPath,outputPath,scratchRoot});
  let outputFd, receiptFd;
  try{
    outputFd=fs.openSync(paths.outputPath,'wx');receiptFd=fs.openSync(paths.receiptPath,'wx');
    fs.writeFileSync(outputFd,result.outputBytes);fs.fsyncSync(outputFd);
    fs.writeFileSync(receiptFd,result.receiptBytes);fs.fsyncSync(receiptFd);
  }finally{if(outputFd!==undefined)fs.closeSync(outputFd);if(receiptFd!==undefined)fs.closeSync(receiptFd);}
  return result.receipt;
}
export const runScratch = options => runScratchWith(realContext(),options);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [mode,...args]=process.argv.slice(2), names={'--input':'inputPath','--manifest':'manifestPath','--out':'outputPath','--scratch-root':'scratchRoot','--tip':'acceptedTipReceiptSha256','--manifest-sha256':'expectedManifestSha256','--chain':'chainPath'}, options={mode};
    need(args.length%2===0,'CLI_ARGUMENTS');
    for(let i=0;i<args.length;i+=2){need(Object.hasOwn(names,args[i])&&!Object.hasOwn(options,names[args[i]]),'CLI_ARGUMENT');options[names[args[i]]]=args[i+1];}
    for(const k of ['inputPath','manifestPath','outputPath','scratchRoot'])need(typeof options[k]==='string','EXPLICIT_PATH_REQUIRED');
    if(options.chainPath){
      const chain=parseProfile(fs.readFileSync(options.chainPath));need(Array.isArray(chain),'CHAIN_FILE');
      options.chain=chain.map(r=>{keys(r,['manifestPath','receiptPath'],'CHAIN_PATH_SCHEMA');noAliases(r.manifestPath);noAliases(r.receiptPath);return {manifestBytes:fs.readFileSync(r.manifestPath),receiptBytes:fs.readFileSync(r.receiptPath)};});
      delete options.chainPath;
    }
    process.stdout.write(JSON.stringify(runScratch(options),null,2)+'\n');
  }catch(error){process.stderr.write('CANONICAL_DELTA_REFUSED: '+error.message+'\n');process.exitCode=1;}
}
