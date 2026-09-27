import fs from 'node:fs';

const registryPath='data/catalog/botanical-size-authority-v1.json';
const evidencePath='data/garden-design/tree-size-evidence-wave-v1/evidence-records.json';
const conflictPath='data/garden-design/tree-size-evidence-wave-v1/conflicts.json';
const auditPath='data/catalog/full-catalog/structured-size-conflict-resolution-2026-09-27.json';

const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const evidenceDoc=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const conflictDoc=JSON.parse(fs.readFileSync(conflictPath,'utf8'));
const evidence=new Map((evidenceDoc.records||[]).map(r=>[r.recordId,r]));

function structured(row){
  return /^Dimensions:/i.test(String(row?.originalSourceWording||'').trim())
    || /structured dimensions/i.test(String(row?.conditions||''));
}
function sameSource(a,b){
  return Boolean(a&&b)
    && a.botanicalTaxonId===b.botanicalTaxonId
    && a.sizeScenario===b.sizeScenario
    && a.sourceIdentifier===b.sourceIdentifier
    && a.sourceUrl===b.sourceUrl;
}
function complete(row){
  return [row?.heightMinM,row?.heightMaxM,row?.spreadMinM,row?.spreadMaxM].every(Number.isFinite);
}

const resolved=[];
for(const rec of registry.records||[]){
  if(rec.runtimeAuthority!=='RUNTIME_AUTHORITY_CONFLICT_HOLD') continue;
  const candidates=(conflictDoc.conflicts||[]).filter(c=>c.botanicalTaxonId===rec.botanicalTaxonId);
  for(const conflict of candidates){
    const a=evidence.get(conflict.sourceA);
    const b=evidence.get(conflict.sourceB);
    if(!sameSource(a,b) || !complete(a) || !complete(b)) continue;
    const structuredRows=[a,b].filter(structured);
    if(structuredRows.length!==1) continue;
    const pick=structuredRows[0];
    rec.runtimeAuthority='RUNTIME_AUTHORITY_READY';
    rec.defaultPreviewScenario=pick.sizeScenario;
    rec.selectedHeightEvidenceRef=pick.recordId;
    rec.selectedSpreadEvidenceRef=pick.recordId;
    rec.selectedSource=pick.recordId;
    rec.normalizedRange={
      heightM:{min:pick.heightMinM,max:pick.heightMaxM},
      spreadM:{min:pick.spreadMinM,max:pick.spreadMaxM}
    };
    rec.conflictingEvidenceIds=null;
    rec.spreadSourceSupported=true;
    rec.HEIGHT_SCALE_READY=true;
    rec.SPREAD_SCALE_READY=true;
    rec.unknownFields=[];
    rec.gardenDesignFallback=null;
    rec.resolvedConflictEvidenceIds=[conflict.sourceA,conflict.sourceB];
    rec.conflictResolution='SAME_SOURCE_STRUCTURED_FIELD_PRECEDENCE';
    resolved.push({canonicalSlug:(rec.canonicalSlugAliases||[])[0],botanicalTaxonId:rec.botanicalTaxonId,selectedEvidenceRef:pick.recordId,sourceIdentifier:pick.sourceIdentifier,sourceUrl:pick.sourceUrl});
    break;
  }
}
if(!resolved.length) throw new Error('NO_ELIGIBLE_SAME_SOURCE_STRUCTURED_CONFLICTS');
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
fs.writeFileSync(auditPath,JSON.stringify({contract:'same-source-structured-size-conflict-resolution-v1',createdAt:'2026-09-27',rule:'same authoritative source + same taxon + same scenario + complete conflicting ranges + exactly one explicit structured Dimensions record => structured field precedence; no averaging',resolvedCount:resolved.length,resolved},null,2)+'\n');
console.log(JSON.stringify({records:registry.records.length,resolvedCount:resolved.length,resolved},null,2));
