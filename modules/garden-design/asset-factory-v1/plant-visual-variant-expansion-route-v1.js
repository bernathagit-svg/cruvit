import {
  resolvePlantSizeAuthorityReadiness,
  SIZE_AUTHORITY_STATE
} from './plant-size-authority-readiness-v1.js';

export const VARIANT_EXPANSION_ROUTE_VERSION = 'plant-visual-variant-expansion-route-v1';

export const VARIANT_EXPANSION_ACTION = Object.freeze({
  GENERATE_READY:'GENERATE_READY',
  QA_REPAIR:'QA_REPAIR',
  SIZE_CONTEXT_REQUIRED:'SIZE_CONTEXT_REQUIRED',
  SIZE_RESEARCH_REQUIRED:'SIZE_RESEARCH_REQUIRED',
  SIZE_CONFLICT_HOLD:'SIZE_CONFLICT_HOLD',
  VARIANT_PLAN_BLOCKED:'VARIANT_PLAN_BLOCKED'
});

function roleKey(row={}){
  return [
    String(row.growthStage||'').toLowerCase(),
    String(row.architectureMode||row.visualForm||'').toLowerCase(),
    String(row.phenology||row.phenologyState||'').toLowerCase()
  ].join('|');
}

function findCandidate(candidateRows=[],role={}){
  const key=roleKey(role);
  return (candidateRows||[]).find(row=>
    roleKey(row)===key
    && row.objectKey
    && row.technicalQA==='PASS'
    && row.framingQA==='PASS'
  )||null;
}

export function routeVariantExpansion({
  gapPlan=null,
  sizeAuthorityRegistry=null,
  candidateRows=[]
}={}) {
  const rows=[];
  for(const role of gapPlan?.missingRequired||[]){
    const candidate=findCandidate(candidateRows,role);
    const size=resolvePlantSizeAuthorityReadiness(sizeAuthorityRegistry,{
      canonicalSlug:gapPlan?.canonicalSlug,
      growthStage:role.growthStage,
      visualForm:role.visualForm
    });

    let action=VARIANT_EXPANSION_ACTION.GENERATE_READY;
    let reason='SIZE_AUTHORITY_READY_FOR_GENERATION';

    if(candidate){
      action=VARIANT_EXPANSION_ACTION.QA_REPAIR;
      reason='EXISTING_TECHNICAL_AND_FRAMING_PASS_CANDIDATE';
    } else if(size.state===SIZE_AUTHORITY_STATE.CONTEXT_REQUIRED){
      action=VARIANT_EXPANSION_ACTION.SIZE_CONTEXT_REQUIRED;
      reason='CULTIVAR_ROOTSTOCK_OR_MAINTAINED_CONTEXT_REQUIRED';
    } else if(size.state===SIZE_AUTHORITY_STATE.EVIDENCE_GAP || size.state===SIZE_AUTHORITY_STATE.NOT_EVALUATED){
      action=VARIANT_EXPANSION_ACTION.SIZE_RESEARCH_REQUIRED;
      reason='SIZE_EVIDENCE_REQUIRED_BEFORE_GENERATION';
    } else if(size.state===SIZE_AUTHORITY_STATE.CONFLICT_HOLD){
      action=VARIANT_EXPANSION_ACTION.SIZE_CONFLICT_HOLD;
      reason='CONFLICTING_SIZE_EVIDENCE';
    } else if(![SIZE_AUTHORITY_STATE.READY,SIZE_AUTHORITY_STATE.PARTIAL].includes(size.state)){
      action=VARIANT_EXPANSION_ACTION.SIZE_RESEARCH_REQUIRED;
      reason='SIZE_AUTHORITY_NOT_READY';
    }

    rows.push({
      canonicalSlug:gapPlan?.canonicalSlug||null,
      variantKey:role.variantKey||null,
      growthStage:role.growthStage||null,
      architectureMode:role.architectureMode||role.visualForm||null,
      visualForm:role.visualForm||null,
      phenology:role.phenology||role.phenologyState||null,
      reasonCodes:role.reasonCodes||[],
      action,
      actionReason:reason,
      sizeAuthority:size,
      existingCandidate:candidate?{
        jobId:candidate.jobId||null,
        objectKey:candidate.objectKey,
        sha256:candidate.sha256||null,
        technicalQA:candidate.technicalQA,
        framingQA:candidate.framingQA,
        ownerDecision:candidate.ownerDecision||null
      }:null
    });
  }

  const counts={};
  for(const row of rows) counts[row.action]=(counts[row.action]||0)+1;

  return Object.freeze({
    version:VARIANT_EXPANSION_ROUTE_VERSION,
    canonicalSlug:gapPlan?.canonicalSlug||null,
    rows,
    counts,
    paidGenerationReady:rows.filter(r=>r.action===VARIANT_EXPANSION_ACTION.GENERATE_READY).length,
    qaRepairReady:rows.filter(r=>r.action===VARIANT_EXPANSION_ACTION.QA_REPAIR).length,
    blockedBeforeGeneration:rows.filter(r=>[
      VARIANT_EXPANSION_ACTION.SIZE_CONTEXT_REQUIRED,
      VARIANT_EXPANSION_ACTION.SIZE_RESEARCH_REQUIRED,
      VARIANT_EXPANSION_ACTION.SIZE_CONFLICT_HOLD
    ].includes(r.action)).length
  });
}
