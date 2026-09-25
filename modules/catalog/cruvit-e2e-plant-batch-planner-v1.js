/**
 * CRUVIT End-to-End Plant Batch Planner V1
 * Consumes Full CRUVIT approval evaluations and creates deterministic work lanes.
 * Pure/local. No network, paid calls, or writes.
 */
export const E2E_BATCH_PLANNER_VERSION='cruvit-e2e-plant-batch-planner-v1';

const OWNER='OWNER_REVIEW_REQUIRED';
const ENRICH='ENRICHMENT_REQUIRED';
const APPROVED='FULL_CRUVIT_APPROVED';

function unique(xs){return [...new Set((xs||[]).filter(Boolean))];}

function workItems(row={}){
  const b=new Set(row.blockingReasons||[]);
  const items=[];
  if(b.has('CANONICAL_IDENTITY_NOT_READY')) items.push('IDENTITY_RECONCILIATION');
  if(b.has('REAL_SUITABILITY_ENRICHMENT_REQUIRED')) items.push('CLIMATE_AND_OUTCOME_ENRICHMENT');
  if(b.has('SEASONALITY_RESEARCH_REQUIRED')) items.push('SEASONALITY_RESEARCH');
  if(b.has('SIZE_AUTHORITY_ENRICHMENT_REQUIRED')) items.push('SIZE_AUTHORITY_RESEARCH');
  if(b.has('REQUIRED_VISUAL_VARIANTS_MISSING')) items.push('VISUAL_VARIANT_COMPLETION');
  if(b.has('PLANT_DOCTOR_CONTEXT_NOT_READY')) items.push('PLANT_DOCTOR_IDENTITY_CONTEXT_REPAIR');
  if(b.has('CATALOG_DISPLAY_MEDIA_NOT_READY')) items.push('CATALOG_MEDIA_COMPLETION');
  return items;
}

function lane(row={}){
  if(row.approved===true || row.status===APPROVED) return 'APPROVED';
  if(row.status===OWNER || (row.blockingReasons||[]).includes('CANONICAL_IDENTITY_NOT_READY')) return 'OWNER_REVIEW_LANE';
  const items=workItems(row);
  const researchCount=items.filter(x=>[
    'CLIMATE_AND_OUTCOME_ENRICHMENT',
    'SEASONALITY_RESEARCH',
    'SIZE_AUTHORITY_RESEARCH'
  ].includes(x)).length;
  if(researchCount<=1 && items.includes('VISUAL_VARIANT_COMPLETION')) return 'FAST_LANE';
  return 'RESEARCH_LANE';
}

export function planEndToEndPlantBatch(evaluations=[]){
  const rows=(evaluations||[]).map(row=>{
    const items=workItems(row);
    return {
      canonicalSlug:row.canonicalSlug,
      scientific:row.scientific,
      currentStatus:row.status,
      lane:lane(row),
      workItems:items,
      blockingReasons:row.blockingReasons||[],
      climateClass:row.modules?.climateAndSuitability?.readinessClass||null,
      mediaReady:row.modules?.myGarden?.catalogMedia?.ready===true,
      identityReady:row.modules?.canonicalIdentity?.ready===true,
      doctorReady:row.modules?.plantDoctor?.ready===true,
      missingVisualVariants:row.modules?.gardenDesign?.missingRequiredCount??null,
      sizeStates:row.modules?.gardenDesign?.sizeAuthority?.states||[],
      exitCriteria:[
        'CANONICAL_IDENTITY_READY',
        'CLASS_A_REAL_SUITABILITY_READY',
        'PLANT_KNOWLEDGE_READY',
        'CATALOG_MEDIA_READY',
        'REQUIRED_VISUAL_VARIANTS_PRODUCTION_APPROVED',
        'SIZE_AUTHORITY_READY_PARTIAL_OR_CONTEXT_EXPLICIT',
        'PLANT_DOCTOR_CONTEXT_READY',
        'FULL_CRUVIT_APPROVED'
      ]
    };
  });
  const byLane={};
  const workItemCounts={};
  for(const r of rows){
    byLane[r.lane]=(byLane[r.lane]||0)+1;
    for(const w of r.workItems) workItemCounts[w]=(workItemCounts[w]||0)+1;
  }
  return Object.freeze({
    version:E2E_BATCH_PLANNER_VERSION,
    total:rows.length,
    byLane,
    workItemCounts,
    rows,
    governance:{
      endToEndOnly:true,
      partialModuleApprovalNotFinal:true,
      visualFactoryReadyNotFinal:true,
      unknownNeverGuessed:true,
      ownerReviewOnlyForTrueExceptions:true
    }
  });
}
