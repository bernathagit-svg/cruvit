#!/usr/bin/env node
// Read-only verifier of the fixed historical baseline. Never generates a freeze
// from live data, invokes a registry writer, or grants botanical/runtime approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIRECTORY='data/catalog/canonical-size-authority-freeze-v1/';
const CANONICAL='data/catalog/botanical-size-authority-v1.json';
const ACCEPTED_SHA='86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b';
const BASELINE='a7318e741e8de07fda76bc8b2e456cd1fb4d6e28';
const ACCOUNTING={RUNTIME_AUTHORITY_READY:79,RUNTIME_AUTHORITY_PARTIAL:16,RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED:16,RUNTIME_AUTHORITY_CONFLICT_HOLD:2,RUNTIME_AUTHORITY_EVIDENCE_GAP:4,TOTAL:117};
const FILES=['record-fingerprints.json','lookup-fingerprints.json','historical-provenance-index.json','composition-stages.json','unreproducible-stages.json'];
const MISSING_STAGES=[2,4,11,12,13,15,16];
const UNRECONSTRUCTABLE='HISTORICAL_TRANSFORM_NOT_RECONSTRUCTABLE_FROM_CHECKED_IN_INPUTS';
const BLOCKERS={
  'GD-SIZE-CANONICAL-REGISTRY-COMPOSITION-REPRODUCIBILITY':'OPEN',
  'GD-SIZE-JABOTICABA-CONTEXT-STATE':'OPEN',
  'GD-SIZE-NULL-RANGE-FAIL-CLOSED':'OPEN',
  'GD-SIZE-R1.3':'HOLD',
  'GD-SIZE-TRUTH-METADATA-PROPAGATION':'OPEN',
  'GD-SIZE-HEURISTIC-RESIZE':'OPEN',
  'GD-SIZE-UNKNOWN-STAGE-PRESERVATION':'OPEN'
};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// sorted-json-v1: UTF-8, recursively sorted object keys (JS UTF-16 ordering),
// original array order, JSON scalar encoding, no whitespace or trailing newline.
function sortedJson(value){
  if(Array.isArray(value)) return '['+value.map(sortedJson).join(',')+']';
  if(value!==null && typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+sortedJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const fingerprint=value=>digest(Buffer.from(sortedJson(value),'utf8'));
const equal=(actual,expected,label)=>assert.deepStrictEqual(actual,expected,label);
function unique(rows,key,count,label){
  assert.ok(Array.isArray(rows),label+': array required');
  equal(rows.length,count,label+': count');
  assert.ok(rows.every(row=>typeof row[key]==='string' && row[key].length>0),label+': invalid key');
  equal(new Set(rows.map(row=>row[key])).size,count,label+': duplicates');
}
function projection(record,ordinal){
  const refs={};
  for(const key of ['selectedHeightEvidenceRef','selectedSpreadEvidenceRef','selectedSource']) refs[key]={present:Object.hasOwn(record,key),value:record[key]??null};
  const flags={};
  for(const key of Object.keys(record).filter(key=>key.endsWith('_READY')||key==='spreadSourceSupported').sort()) flags[key]=record[key];
  return {
    ordinal,botanicalTaxonId:record.botanicalTaxonId,canonicalSlugAliases:record.canonicalSlugAliases,
    scientificName:record.scientificName,runtimeAuthority:record.runtimeAuthority,
    normalizedRange:record.normalizedRange??null,normalizedRangePresent:Object.hasOwn(record,'normalizedRange'),
    selectedEvidenceRefs:refs,partialAnchor:record.partialAnchor??null,partialAnchorPresent:Object.hasOwn(record,'partialAnchor'),
    readinessFlags:flags,recordSha256:fingerprint(record)
  };
}

export function verifyFreeze({root=DEFAULT_ROOT}={}){
  const read=rel=>fs.readFileSync(path.join(root,rel));
  const canonicalBefore=read(CANONICAL);
  equal(digest(canonicalBefore),ACCEPTED_SHA,'CANONICAL_SHA_MISMATCH');
  const canonical=JSON.parse(canonicalBefore);
  const manifestBytes=read(DIRECTORY+'freeze-manifest.json');
  const manifest=JSON.parse(manifestBytes);
  equal(manifest.contract,'canonical-size-authority-freeze-v1','freeze contract');
  equal(manifest.schemaVersion,1,'freeze version');
  equal(manifest.acceptedBaselineCommit,BASELINE,'accepted baseline');
  equal(manifest.canonicalPath,CANONICAL,'canonical path');
  equal(manifest.canonicalSha256,ACCEPTED_SHA,'manifest canonical SHA');
  equal(manifest.canonicalByteLength,canonicalBefore.length,'canonical byte length');
  equal(manifest.canonicalAuthorityVersion,canonical.authorityVersion,'authority version');
  equal(manifest.recordCount,117,'manifest record count');
  equal(manifest.lookupCount,119,'manifest lookup count');
  equal(manifest.accounting,ACCOUNTING,'manifest accounting');
  equal(manifest.botanicalApproval,false,'freeze is NOT botanical approval');
  equal(manifest.preservesKnownDefects,true,'known defects preserved');
  equal(manifest.futureCanonicalMutationsRequireVersionedDeltaProvenance,true,'future delta provenance');
  equal(manifest.blockerStatus,BLOCKERS,'blocker status');
  equal(manifest.productionStatus,'HOLD','Production hold');
  equal(manifest.fingerprintEncoding,'sorted-json-v1','fingerprint encoding');
  equal(manifest.frozenAt,'2026-10-10T00:00:00+03:00','controlled freeze date');
  assert.ok(manifest.frozenAtPolicy.includes('fixed'),'controlled date policy');
  equal(manifest.historicalBuilder.status,'HISTORICAL_SEED_BUILDER_ONLY','historical builder status');
  equal(manifest.historicalBuilder.authorization,'NOT_AUTHORIZED_TO_OVERWRITE_CURRENT_CANONICAL_REGISTRY','historical writer restriction');
  equal(manifest.historicalBuilder.path,'modules/garden-design/asset-factory-v1/botanical-size-authority-v1-build.js','builder path');
  equal(manifest.unsafeHistoricalWriterTest.path,'tests/botanical-size-authority-v1.test.mjs','unsafe test path');
  equal(manifest.unsafeHistoricalWriterTest.safeReadOnlyValidation,false,'unsafe writer test restriction');
  const jaboticaba=manifest.knownDefects.find(item=>item.id==='GD-SIZE-JABOTICABA-CONTEXT-STATE');
  equal(jaboticaba.truth,'CONTEXT_SEPARABLE','Jaboticaba context');
  equal(jaboticaba.selectedRuntimeRange,null,'Jaboticaba universal range');
  equal(jaboticaba.averagingAllowed,false,'no averaging');
  equal(jaboticaba.currentCanonicalHeightReadyStateKnownInvalid,true,'invalid flag recorded');
  for(const id of Object.keys(BLOCKERS).slice(0,3)) assert.ok(manifest.knownDefects.some(item=>item.id===id&&item.status==='OPEN'),'missing defect '+id);

  unique(manifest.artifacts,'path',5,'artifact hashes');
  equal(manifest.artifacts.map(item=>item.path),FILES,'exact artifact list');
  const documents={};
  const artifactHashes=[{path:DIRECTORY+'freeze-manifest.json',sha256:digest(manifestBytes)}];
  for(const row of manifest.artifacts){
    const bytes=read(DIRECTORY+row.path);
    equal(digest(bytes),row.sha256,'FREEZE_ARTIFACT_HASH_MISMATCH:'+row.path);
    documents[row.path]=JSON.parse(bytes);
    artifactHashes.push({path:DIRECTORY+row.path,sha256:digest(bytes)});
  }
  const records=documents['record-fingerprints.json'];
  const lookups=documents['lookup-fingerprints.json'];
  const provenance=documents['historical-provenance-index.json'];
  const composition=documents['composition-stages.json'];
  const unreproducible=documents['unreproducible-stages.json'];
  unique(canonical.records,'botanicalTaxonId',117,'canonical records');
  unique(records.records,'botanicalTaxonId',117,'frozen records');
  equal(records.recordCount,117,'record manifest count');
  equal(records.fingerprintEncoding,'sorted-json-v1','record encoding');
  equal(records.fingerprintScope,'complete canonical record, all fields','record fingerprint scope');
  for(const [i,record] of canonical.records.entries()) equal(records.records[i],projection(record,i),'RECORD_MISMATCH:'+i);
  const order=canonical.records.map(record=>record.botanicalTaxonId);
  equal(manifest.recordOrderSha256,fingerprint(order),'record order fingerprint');
  const accounting=Object.fromEntries(Object.keys(ACCOUNTING).map(key=>[key,0]));
  for(const record of canonical.records){
    assert.ok(Object.hasOwn(accounting,record.runtimeAuthority)&&record.runtimeAuthority!=='TOTAL','unknown authority state');
    accounting[record.runtimeAuthority]++;
    accounting.TOTAL++;
  }
  equal(accounting,ACCOUNTING,'computed accounting');
  equal(canonical.expectedAccounting,ACCOUNTING,'canonical expected accounting');

  const entries=Object.entries(canonical.slugToBotanicalTaxonId);
  equal(entries.length,119,'canonical lookups');
  unique(lookups.mappings,'slug',119,'frozen lookups');
  equal(lookups.lookupCount,119,'lookup manifest count');
  equal(lookups.fingerprintEncoding,'sorted-json-v1','lookup encoding');
  const ids=new Set(order);
  for(const [ordinal,[slug,botanicalTaxonId]] of entries.entries()){
    assert.ok(ids.has(botanicalTaxonId),'lookup missing target');
    equal(lookups.mappings[ordinal],{ordinal,slug,botanicalTaxonId,mappingSha256:fingerprint({slug,botanicalTaxonId})},'LOOKUP_MISMATCH:'+slug);
  }
  for(const [slug,taxon] of [['orange','taxon:citrus-sinensis'],['sweet-orange','taxon:citrus-sinensis'],['english-lavender','taxon:lavandula-angustifolia']]) equal(canonical.slugToBotanicalTaxonId[slug],taxon,'preserved alias '+slug);

  unique(provenance.records,'botanicalTaxonId',117,'record provenance');
  unique(provenance.lookups,'slug',119,'lookup provenance');
  equal(provenance.records.map(row=>row.botanicalTaxonId),order,'provenance record order');
  equal(provenance.lookups.map(row=>row.slug),entries.map(([slug])=>slug),'provenance lookup order');
  equal(composition.stages.length,16,'composition stage count');
  equal(composition.stages.map(stage=>stage.stage),Array.from({length:16},(_,i)=>i+1),'ordered stages');
  equal(unreproducible.stages.map(stage=>stage.stage),MISSING_STAGES,'seven unreproducible stages');
  equal(unreproducible.reproducibilityDecision,'CURRENT_117_REGISTRY_NOT_REPRODUCIBLE','composition still unresolved');
  for(const stage of composition.stages){
    equal(stage.outputHistoryStatus,'KNOWN_OUTPUT_HISTORY','output history distinct from replay');
    const missing=MISSING_STAGES.includes(stage.stage);
    equal(stage.transformation.status,missing?UNRECONSTRUCTABLE:'TRANSFORMATION_REPLAY_AVAILABLE','stage transformation status');
    equal(stage.transformation.replayExecuted,false,'no historical replay claimed');
    if(missing){
      const row=unreproducible.stages.find(row=>row.stage===stage.stage);
      equal(row.status,UNRECONSTRUCTABLE,'missing transform marker');
      equal(row.missingInputs,stage.transformation.missingInputs,'missing inputs consistency');
      assert.ok(typeof row.missingInputs==='string'&&row.missingInputs.length>0,'missing inputs required');
    }
    if(stage.stage>1){
      const previous=composition.stages[stage.stage-2];
      equal(stage.beforeRecordCount,previous.afterRecordCount,'record count continuity');
      equal(stage.beforeLookupCount,previous.afterLookupCount,'lookup count continuity');
    }
  }
  equal(composition.stages[15].sourceCommit,null,'do not invent October 7 commit');
  equal(composition.stages[15].afterRecordCount,117,'history final records');
  equal(composition.stages[15].afterLookupCount,119,'history final lookups');
  const origins={};
  for(const record of provenance.records){
    equal(record.creationProvenanceStatus,'CREATION_PROVENANCE_KNOWN','record origin status');
    const stage=composition.stages[record.creationStage-1];
    assert.ok(stage?.addedTaxa.some(row=>row.taxon===record.botanicalTaxonId),'record creation not in stage');
    equal(record.sourceCommit,stage.sourceCommit,'record source commit');
    equal(record.transformationStatus,stage.transformation.status,'record replay distinction');
    if(record.sourceCommit===null) assert.ok(record.sourceArtifacts.length>0,'missing commit requires known artifact');
    const modifications=composition.stages.filter(s=>s.modifiedTaxa.some(row=>row.taxon===record.botanicalTaxonId)).map(s=>s.stage);
    equal(record.laterModificationStages.map(row=>row.stage),modifications,'later modifications');
    origins[record.creationOriginClass]=(origins[record.creationOriginClass]||0)+1;
  }
  equal(origins,provenance.creationOriginAccounting,'creation accounting');
  for(const [i,row] of provenance.lookups.entries()){
    equal(row.botanicalTaxonId,entries[i][1],'lookup provenance target');
    equal(row.creationProvenanceStatus,'CREATION_PROVENANCE_KNOWN','lookup origin status');
    const stage=composition.stages[row.creationStage-1];
    assert.ok(stage?.lookupChanges.some(change=>change.field===row.slug&&change.after===row.botanicalTaxonId&&!change.beforePresent),'lookup creation stage');
    equal(row.sourceCommit,stage.sourceCommit,'lookup source commit');
    equal(row.transformationStatus,stage.transformation.status,'lookup replay distinction');
  }
  // SHA pinned independently in this script and manifest, checked again after
  // all comparisons; the verifier has no filesystem-write or network calls.
  equal(read(CANONICAL),canonicalBefore,'canonical bytes changed during verification');
  return {
    contract:'canonical-size-authority-freeze-verification-v1',ok:true,acceptedBaselineCommit:BASELINE,
    canonicalSha256:ACCEPTED_SHA,canonicalBytesUnchanged:true,
    records:{verified:117,unique:117,missing:0,extra:0,orderPreserved:true},
    lookups:{verified:119,unique:119,missing:0,extra:0,conflicts:0,orderPreserved:true},
    accounting,provenance:{records:117,lookups:119,stages:16,unreproducibleStages:MISSING_STAGES},
    botanicalApproval:false,blockerStatus:BLOCKERS,productionStatus:'HOLD',freezeArtifacts:artifactHashes,
    verifierSha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    operations:{canonicalWrites:0,databaseReads:0,databaseWrites:0,networkCalls:0,providerCalls:0}
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    assert.equal(process.argv.length,2,'No CLI arguments accepted; verify the repository containing this script.');
    process.stdout.write(JSON.stringify(verifyFreeze(),null,2)+'\n');
  }catch(error){
    process.stderr.write('CANONICAL_FREEZE_VERIFY_FAILED: '+error.message+'\n');
    process.exitCode=1;
  }
}
