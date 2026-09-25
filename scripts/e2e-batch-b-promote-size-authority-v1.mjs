import fs from 'node:fs';

const summary=JSON.parse(fs.readFileSync(
  'data/catalog/end-to-end-batch-b/morphology-size/live/summary.json','utf8'
));
const registryPath='data/catalog/botanical-size-authority-v1.json';
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
registry.slugToBotanicalTaxonId=registry.slugToBotanicalTaxonId||{};
registry.records=Array.isArray(registry.records)?registry.records:[];

function taxonId(scientific){
  return 'taxon:'+String(scientific||'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/×/g,'x').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

const evidence=[];
for(const row of summary.rows||[]){
  if(row?.matureSize?.ready!==true) continue;
  const taxon=taxonId(row.scientific);
  const evidenceId=row.canonicalSlug+'__ncsu__mature-size-batch-b-v1';

  registry.slugToBotanicalTaxonId[row.canonicalSlug]=taxon;

  const rec={
    botanicalTaxonId:taxon,
    canonicalSlugAliases:[row.canonicalSlug],
    scientificName:row.scientific,
    architectureMode:
      Array.isArray(row.architectureModes)&&row.architectureModes.length===1
        ? row.architectureModes[0]
        : 'default',
    growthStage:'mature',
    runtimeAuthority:'RUNTIME_AUTHORITY_READY',
    defaultPreviewScenario:'LANDSCAPE_MATURE',
    selectedHeightEvidenceRef:evidenceId,
    selectedSpreadEvidenceRef:evidenceId,
    selectedSource:evidenceId,
    normalizedRange:{
      heightM:{min:row.matureSize.heightM.min,max:row.matureSize.heightM.max},
      spreadM:{min:row.matureSize.spreadM.min,max:row.matureSize.spreadM.max}
    },
    provenanceEvidenceIds:[evidenceId],
    conflictingEvidenceIds:null,
    partialAnchor:null,
    spreadSourceSupported:true,
    HEIGHT_SCALE_READY:true,
    SPREAD_SCALE_READY:true,
    unknownFields:[],
    sensitivity:{
      cultivarSensitive:false,
      rootstockSensitive:false,
      cultivarVariable:false,
      maintainedForm:false,
      notFinalPersonalGardenSize:false,
      reasons:[]
    },
    gardenDesignFallback:null,
    authorityVersion:'botanical-size-authority-v1',
    runtimeWired:false
  };

  const idx=registry.records.findIndex(x=>x.botanicalTaxonId===taxon);
  if(idx>=0){
    const existing=registry.records[idx];
    const same=JSON.stringify(existing.normalizedRange)===JSON.stringify(rec.normalizedRange);
    if(!same) throw new Error('EXISTING_SIZE_AUTHORITY_CONFLICT:'+row.canonicalSlug);
  }else{
    registry.records.push(rec);
  }

  evidence.push({
    contract:'botanical-size-evidence-pilot-v1',
    recordId:evidenceId,
    canonicalSlug:row.canonicalSlug,
    scientificName:row.scientific,
    sourceScientificName:row.scientific,
    botanicalTaxonId:taxon,
    canonicalAliases:[row.canonicalSlug],
    architectureMode:rec.architectureMode,
    growthStage:'mature',
    sizeScenario:'LANDSCAPE_MATURE',
    heightMinM:row.matureSize.heightM.min,
    heightMaxM:row.matureSize.heightM.max,
    spreadMinM:row.matureSize.spreadM.min,
    spreadMaxM:row.matureSize.spreadM.max,
    normalizedSi:rec.normalizedRange,
    sourceIdentifier:row.sourceId,
    sourceUrl:row.sourceUrl,
    sourceProvider:'North Carolina State University Extension Gardener',
    sourceTitle:null,
    identityScope:'SPECIES',
    evidenceClass:'SOURCE_SUPPORTED_RANGE',
    sourceQualityTier:'UNIVERSITY_EXTENSION',
    originalSourceWording:'Structured NCSU Dimensions: Height and Width ranges.',
    provenanceVersion:'botanical-size-evidence-pilot-v1',
    provenanceTimestamp:'2026-09-25',
    mayDrivePhysicalMeterPreview:true,
    productionCatalogWritten:false,
    approximate:false,
    inferredDimension:false,
    waveStatus:'COMPLETE'
  });
}

registry.records.sort((a,b)=>String(a.botanicalTaxonId).localeCompare(String(b.botanicalTaxonId)));
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
fs.mkdirSync('data/catalog/end-to-end-batch-b/size-authority',{recursive:true});
fs.writeFileSync(
  'data/catalog/end-to-end-batch-b/size-authority/evidence.json',
  JSON.stringify({
    contract:'cruvit-e2e-batch-b-size-authority-evidence-v1',
    createdAt:'2026-09-25',
    count:evidence.length,
    records:evidence
  },null,2)+'\n'
);
console.log(JSON.stringify({promotedSizeAuthorities:evidence.length,slugs:evidence.map(x=>x.canonicalSlug)}));
