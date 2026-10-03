export const PLANT_MORPHOLOGY_AUTHORITY_VERSION='plant-morphology-authority-v1';

function clone(v){try{return JSON.parse(JSON.stringify(v));}catch{return v;}}

export function applyPlantMorphologyAuthority(plants,payload){
  const rows=payload&&payload.schemaVersion===1&&payload.plants&&typeof payload.plants==='object'
    ?payload.plants:{};
  const applied=[],skipped=[];
  for(const plant of Array.isArray(plants)?plants:[]){
    const slug=String(plant?.slug||plant?.canonicalSlug||'').trim().toLowerCase();
    if(!slug) continue;
    const row=rows[slug];
    if(!row){skipped.push({slug,reason:'no-morphology-authority'});continue;}
    const scientific=String(plant.scientific||plant.acceptedScientificName||'').trim();
    if(scientific&&row.scientific&&scientific.toLowerCase()!==String(row.scientific).trim().toLowerCase()){
      skipped.push({slug,reason:'scientific-mismatch'});continue;
    }
    plant.growthHabit=row.growthHabit;
    plant.morphologyAuthority={
      source:'plant-morphology-authority-v1',
      authorityVersion:payload.authorityVersion||PLANT_MORPHOLOGY_AUTHORITY_VERSION,
      evidenceClass:row.evidenceClass||'UNKNOWN',
      sourceIds:Array.isArray(row.sourceIds)?[...row.sourceIds]:[],
      sourceUrl:row.sourceUrl||null,
      evidence:row.evidence||null
    };
    const traits=plant.climateTraits&&typeof plant.climateTraits==='object'?plant.climateTraits:{};
    const classes=traits.traitEvidenceClasses&&typeof traits.traitEvidenceClasses==='object'
      ?traits.traitEvidenceClasses:{};
    plant.climateTraits={
      ...traits,
      growthHabit:row.growthHabit,
      traitEvidenceClasses:{...classes,growthHabit:row.evidenceClass||'UNKNOWN'}
    };
    applied.push(slug);
  }
  return {applied,skipped};
}
