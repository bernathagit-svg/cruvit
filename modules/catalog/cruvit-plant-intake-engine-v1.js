/**
 * CRUVIT Plant Intake Engine V1
 *
 * One state machine for every plant entering CRUVIT.
 * It does not duplicate domain engines; it orchestrates their authoritative outputs.
 *
 * FINAL RULE:
 * A plant may be called APPROVED only when Full CRUVIT Approval says so.
 * Garden Design readiness, catalog ingest, image readiness, or Class A alone
 * are intermediate states and never final approval.
 */
export const CRUVIT_PLANT_INTAKE_ENGINE_VERSION='cruvit-plant-intake-engine-v1';

export const INTAKE_STAGE=Object.freeze({
  REQUESTED:'REQUESTED',
  EVIDENCE_PACKET_REQUIRED:'EVIDENCE_PACKET_REQUIRED',
  PACKET_REVIEW_REQUIRED:'PACKET_REVIEW_REQUIRED',
  CATALOG_INGEST_REQUIRED:'CATALOG_INGEST_REQUIRED',
  IDENTITY_RECONCILIATION_REQUIRED:'IDENTITY_RECONCILIATION_REQUIRED',
  DATA_ENRICHMENT_REQUIRED:'DATA_ENRICHMENT_REQUIRED',
  MEDIA_COMPLETION_REQUIRED:'MEDIA_COMPLETION_REQUIRED',
  VISUAL_PLANNING_REQUIRED:'VISUAL_PLANNING_REQUIRED',
  VISUAL_GENERATION_REQUIRED:'VISUAL_GENERATION_REQUIRED',
  VISUAL_QA_REQUIRED:'VISUAL_QA_REQUIRED',
  PRODUCTION_PROMOTION_REQUIRED:'PRODUCTION_PROMOTION_REQUIRED',
  FULL_CRUVIT_APPROVED:'FULL_CRUVIT_APPROVED',
  BLOCKED:'BLOCKED'
});

function unique(xs){return [...new Set((xs||[]).filter(Boolean))];}

function ownerAction(code,reason){
  return {actor:'OWNER',code,reason};
}
function autoAction(code,reason){
  return {actor:'SYSTEM',code,reason};
}
function paidAction(code,reason){
  return {actor:'SYSTEM_AFTER_OWNER_SPEND_APPROVAL',code,reason};
}

export function resolveCruvitPlantIntakeStage({
  request=null,
  packet=null,
  catalogExists=false,
  fullApproval=null,
  visualTransient=null
}={}){
  const slug=String(
    request?.canonicalSlug
    || packet?.canonicalSlug
    || fullApproval?.canonicalSlug
    || ''
  ).trim().toLowerCase()||null;

  const base={
    version:CRUVIT_PLANT_INTAKE_ENGINE_VERSION,
    canonicalSlug:slug,
    stage:INTAKE_STAGE.REQUESTED,
    finalApproved:false,
    blockingReasons:[],
    nextActions:[],
    ownerActions:[],
    paidActions:[],
    systemActions:[],
    invariants:{
      oneCanonicalPlantRecord:true,
      endToEndRequired:true,
      finalApprovalAuthority:'full-cruvit-plant-approval-v1',
      noSilentGuessing:true,
      paidActionsRequireExplicitOwnerSpendApproval:true,
      productionPromotionRequiresExplicitOwnerApproval:true,
      ownerReviewReservedForExceptions:true
    }
  };

  if(!slug){
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.BLOCKED,
      blockingReasons:['CANONICAL_SLUG_REQUIRED'],
      nextActions:[autoAction('RESOLVE_CANONICAL_IDENTITY','A stable canonical slug is required before intake can proceed.')],
      systemActions:[autoAction('RESOLVE_CANONICAL_IDENTITY','A stable canonical slug is required before intake can proceed.')]
    });
  }

  if(!catalogExists){
    if(!packet){
      const a=autoAction('CREATE_EVIDENCE_FIRST_PACKET','Research authoritative sources and build a validated evidence-first catalog packet.');
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.EVIDENCE_PACKET_REQUIRED,
        blockingReasons:['CANONICAL_CATALOG_RECORD_MISSING','EVIDENCE_PACKET_MISSING'],
        nextActions:[a],
        systemActions:[a]
      });
    }
    if(packet.validationOk!==true){
      const a=autoAction('REPAIR_PACKET_VALIDATION','Repair packet schema/evidence/provenance errors before ingest.');
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.PACKET_REVIEW_REQUIRED,
        blockingReasons:unique(['PACKET_VALIDATION_FAILED',...(packet.errors||[])]),
        nextActions:[a],
        systemActions:[a]
      });
    }
    if(packet.approvedForIngest!==true){
      const a=ownerAction('APPROVE_EVIDENCE_PACKET_FOR_INGEST','Validated botanical packet requires explicit Owner approval before canonical catalog write.');
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.PACKET_REVIEW_REQUIRED,
        blockingReasons:['OWNER_PACKET_INGEST_APPROVAL_REQUIRED'],
        nextActions:[a],
        ownerActions:[a]
      });
    }
    const a=autoAction('INGEST_APPROVED_PACKET','Materialize and upsert only the approved canonical plant row, then re-run intake.');
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.CATALOG_INGEST_REQUIRED,
      blockingReasons:['CANONICAL_CATALOG_WRITE_REQUIRED'],
      nextActions:[a],
      systemActions:[a]
    });
  }

  if(!fullApproval){
    const a=autoAction('RUN_FULL_CRUVIT_APPROVAL','Run the fail-closed all-modules approval gate.');
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.BLOCKED,
      blockingReasons:['FULL_CRUVIT_APPROVAL_RESULT_REQUIRED'],
      nextActions:[a],
      systemActions:[a]
    });
  }

  if(fullApproval.approved===true && fullApproval.status==='FULL_CRUVIT_APPROVED'){
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.FULL_CRUVIT_APPROVED,
      finalApproved:true,
      blockingReasons:[],
      nextActions:[],
      completion:{
        canonicalIdentity:true,
        climateAndSuitability:true,
        myGarden:true,
        smartRecommendations:true,
        plantIdentification:true,
        plantDoctor:true,
        gardenDesign:true
      }
    });
  }

  const blockers=new Set(fullApproval.blockingReasons||[]);
  const ownerReview =
    fullApproval.status==='OWNER_REVIEW_REQUIRED'
    || blockers.has('CANONICAL_IDENTITY_NOT_READY');

  if(ownerReview){
    const actions=[];
    if(blockers.has('CANONICAL_IDENTITY_NOT_READY')){
      actions.push(ownerAction('RECONCILE_CANONICAL_IDENTITY','Resolve species/alias/broad-identity conflict before any downstream approval.'));
    }
    if(blockers.has('PLANT_DOCTOR_CONTEXT_NOT_READY')){
      actions.push(autoAction('REBUILD_PLANT_DOCTOR_CANONICAL_CONTEXT','Plant Doctor must use the resolved canonical identity.'));
    }
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.IDENTITY_RECONCILIATION_REQUIRED,
      blockingReasons:[...blockers],
      nextActions:actions,
      ownerActions:actions.filter(x=>x.actor==='OWNER'),
      systemActions:actions.filter(x=>x.actor==='SYSTEM')
    });
  }

  const enrichmentBlockers=[
    'REAL_SUITABILITY_ENRICHMENT_REQUIRED',
    'PLANT_KNOWLEDGE_NOT_READY',
    'SEASONALITY_RESEARCH_REQUIRED',
    'SIZE_AUTHORITY_ENRICHMENT_REQUIRED'
  ].filter(x=>blockers.has(x));

  if(enrichmentBlockers.length){
    const actions=[];
    if(blockers.has('REAL_SUITABILITY_ENRICHMENT_REQUIRED')){
      actions.push(autoAction('ENRICH_CLASS_A_SUITABILITY','Complete authoritative climate/outcome evidence until plant-data-contract-v1 reaches Class A.'));
    }
    if(blockers.has('PLANT_KNOWLEDGE_NOT_READY')){
      actions.push(autoAction('ENRICH_PLANT_KNOWLEDGE','Complete provenanced care/warnings/knowledge without inventing unknown facts.'));
    }
    if(blockers.has('SEASONALITY_RESEARCH_REQUIRED')){
      actions.push(autoAction('RESEARCH_SEASONALITY','Resolve evergreen/deciduous/lifecycle evidence for correct variant planning.'));
    }
    if(blockers.has('SIZE_AUTHORITY_ENRICHMENT_REQUIRED')){
      actions.push(autoAction('RESEARCH_SIZE_AUTHORITY','Build explicit size authority; cultivar/rootstock context may remain context-required but must be explicit.'));
    }
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.DATA_ENRICHMENT_REQUIRED,
      blockingReasons:[...blockers],
      nextActions:actions,
      systemActions:actions
    });
  }

  if(blockers.has('CATALOG_DISPLAY_MEDIA_NOT_READY')){
    const a=autoAction('COMPLETE_LICENSED_CATALOG_MEDIA','Acquire/validate approved catalog display media; user scans never become catalog media.');
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.MEDIA_COMPLETION_REQUIRED,
      blockingReasons:[...blockers],
      nextActions:[a],
      systemActions:[a]
    });
  }

  if(blockers.has('REQUIRED_VISUAL_VARIANTS_MISSING')){
    const t=visualTransient||{};
    if(t.requiredPlanReady!==true){
      const a=autoAction('PLAN_REQUIRED_VISUAL_VARIANTS','Plan only biologically justified required variants and reuse existing candidates/production assets.');
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.VISUAL_PLANNING_REQUIRED,
        blockingReasons:[...blockers],
        nextActions:[a],
        systemActions:[a]
      });
    }

    if(Number(t.missingGenerationCount||0)>0){
      const actions=[];
      if(Number(t.existingCandidateReuseCount||0)>0){
        actions.push(autoAction('REUSE_EXISTING_CANDIDATES','Continue QA on existing exact candidate bytes; duplicate generation forbidden.'));
      }
      const paid=paidAction('GENERATE_MISSING_VISUAL_VARIANTS','Generate only missing required variants under a bounded spend approval, zero retries unless separately approved.');
      actions.push(paid);
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.VISUAL_GENERATION_REQUIRED,
        blockingReasons:[...blockers],
        nextActions:actions,
        paidActions:[paid],
        systemActions:actions.filter(x=>x.actor==='SYSTEM')
      });
    }

    if(Number(t.qaPendingCount||0)>0 || Number(t.ownerVisualReviewCount||0)>0){
      const actions=[];
      if(Number(t.qaPendingCount||0)>0){
        actions.push(autoAction('COMPLETE_VISUAL_QA_PIPELINE','Technical, framing, botanical/state, in-garden QA must all complete on exact bytes.'));
      }
      if(Number(t.ownerVisualReviewCount||0)>0){
        actions.push(ownerAction('REVIEW_VISUAL_EXCEPTIONS','Owner reviews only candidates routed UNCERTAIN/exception; routine PASS candidates bypass owner review.'));
      }
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.VISUAL_QA_REQUIRED,
        blockingReasons:[...blockers],
        nextActions:actions,
        ownerActions:actions.filter(x=>x.actor==='OWNER'),
        systemActions:actions.filter(x=>x.actor==='SYSTEM')
      });
    }

    if(Number(t.promotionReadyCount||0)>0){
      const a=ownerAction('APPROVE_PRODUCTION_PROMOTION','Promote only QA-complete immutable assets after checksum/readback verification, then activate registry.');
      return Object.freeze({
        ...base,
        stage:INTAKE_STAGE.PRODUCTION_PROMOTION_REQUIRED,
        blockingReasons:[...blockers],
        nextActions:[a],
        ownerActions:[a]
      });
    }

    const a=autoAction('RESOLVE_VISUAL_PIPELINE_STATE','Required variants are missing but no valid visual execution state was provided.');
    return Object.freeze({
      ...base,
      stage:INTAKE_STAGE.VISUAL_PLANNING_REQUIRED,
      blockingReasons:[...blockers,'VISUAL_TRANSIENT_STATE_INCOMPLETE'],
      nextActions:[a],
      systemActions:[a]
    });
  }

  return Object.freeze({
    ...base,
    stage:INTAKE_STAGE.BLOCKED,
    blockingReasons:[...blockers],
    nextActions:[autoAction('RESOLVE_UNCLASSIFIED_BLOCKERS','Inspect fail-closed blockers; no module may bypass them.')],
    systemActions:[autoAction('RESOLVE_UNCLASSIFIED_BLOCKERS','Inspect fail-closed blockers; no module may bypass them.')]
  });
}

export function summarizeCruvitPlantIntake(rows=[]){
  const list=Array.isArray(rows)?rows:[];
  const byStage={};
  for(const row of list) byStage[row.stage]=(byStage[row.stage]||0)+1;
  return Object.freeze({
    version:CRUVIT_PLANT_INTAKE_ENGINE_VERSION,
    total:list.length,
    fullCruvitApproved:list.filter(x=>x.finalApproved).length,
    pending:list.filter(x=>!x.finalApproved).length,
    byStage,
    ownerActionCount:list.reduce((n,x)=>n+(x.ownerActions?.length||0),0),
    paidActionCount:list.reduce((n,x)=>n+(x.paidActions?.length||0),0),
    paidGenerationCallsRequired:list.reduce(
      (n,x)=>n+Number(x.visualTransient?.missingGenerationCount||0),
      0
    ),
    reusableCandidateCount:list.reduce(
      (n,x)=>n+Number(x.visualTransient?.existingCandidateReuseCount||0),
      0
    ),
    ownerVisualExceptionCount:list.reduce(
      (n,x)=>n+Number(x.visualTransient?.ownerVisualReviewCount||0),
      0
    ),
    rows:list
  });
}
