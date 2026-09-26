import fs from 'node:fs';
import path from 'node:path';

const resultsDir='data/catalog/full-catalog/morphology-size-64';
const registryPath='data/catalog/botanical-size-authority-v1.json';
const manifestPath='data/catalog/full-catalog/size-authority-promotion-2026-09-26.json';
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
registry.slugToBotanicalTaxonId=registry.slugToBotanicalTaxonId||{};
registry.records=Array.isArray(registry.records)?registry.records:[];

function taxonId(scientific){
  return 'taxon:'+String(scientific||'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/×/g,'x').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function sameRange(a,b){ return JSON.stringify(a||null)===JSON.stringify(b||null); }

const promoted=[];
const skipped=[];
for(const name of fs.readdirSync(resultsDir).filter(x=>x.endsWith('.json')).sort()){
  const row=JSON.parse(fs.readFileSync(path.join(resultsDir,name),'utf8'));
  const size=row?.result?.matureSize;
  if(size?.ready!==true || size?.evidenceClass!=='SOURCE_SUPPORTED') continue;
  if(!row?.canonicalSlug || !row?.scientific || !row?.selectedSource?.sourceId) continue;
  const taxon=taxonId(row.scientific);
  const existing=registry.records.find(x=>x.botanicalTaxonId===taxon);
  if(existing){
    if(existing.runtimeAuthority==='RUNTIME_AUTHORITY_CONFLICT_HOLD'){
      skipped.push({slug:row.canonicalSlug,reason:'CONFLICT_HOLD'}); continue;
    }
    if(existing.runtimeAuthority==='RUNTIME_AUTHORITY_READY' && sameRange(existing.normalizedRange,{heightM:size.heightM,spreadM:size.spreadM})){
      skipped.push({slug:row.canonicalSlug,reason:'ALREADY_READY'}); continue;
    }
    throw new Error('EXISTING_SIZE_AUTHORITY_REVIEW_REQUIRED:'+row.canonicalSlug);
  }
  const evidenceId=row.canonicalSlug+'__'+row.selectedSource.sourceId+'__mature-size-full-catalog-v1';
  registry.slugToBotanicalTaxonId[row.canonicalSlug]=taxon;
  registry.records.push({
    botanicalTaxonId:taxon,canonicalSlugAliases:[row.canonicalSlug],scientificName:row.scientific,
    architectureMode:Array.isArray(row.result?.architectureModes)&&row.result.architectureModes.length===1?row.result.architectureModes[0]:'default',
    growthStage:'mature',runtimeAuthority:'RUNTIME_AUTHORITY_READY',defaultPreviewScenario:'LANDSCAPE_MATURE',
    selectedHeightEvidenceRef:evidenceId,selectedSpreadEvidenceRef:evidenceId,selectedSource:evidenceId,
    normalizedRange:{heightM:size.heightM,spreadM:size.spreadM},provenanceEvidenceIds:[evidenceId],
    conflictingEvidenceIds:null,partialAnchor:null,spreadSourceSupported:true,HEIGHT_SCALE_READY:true,SPREAD_SCALE_READY:true,
    unknownFields:[],sensitivity:{cultivarSensitive:false,rootstockSensitive:false,cultivarVariable:false,maintainedForm:false,notFinalPersonalGardenSize:false,reasons:[]},
    gardenDesignFallback:null,authorityVersion:'botanical-size-authority-v1',runtimeWired:false
  });
  promoted.push({canonicalSlug:row.canonicalSlug,scientificName:row.scientific,sourceId:row.selectedSource.sourceId,sourceUrl:row.selectedSource.url||null,normalizedRange:{heightM:size.heightM,spreadM:size.spreadM}});
}
registry.records.sort((a,b)=>String(a.botanicalTaxonId).localeCompare(String(b.botanicalTaxonId)));
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
fs.writeFileSync(manifestPath,JSON.stringify({contract:'full-catalog-source-backed-size-promotion-v1',createdAt:'2026-09-26',promotedCount:promoted.length,promoted,skipped},null,2)+'\n');
console.log(JSON.stringify({promotedCount:promoted.length,promoted:promoted.map(x=>x.canonicalSlug),skipped},null,2));
